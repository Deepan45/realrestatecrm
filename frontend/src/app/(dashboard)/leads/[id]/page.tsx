"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import LeadForm from "@/components/LeadForm";
import {
  Badge, Button, Card, ErrorBanner, Field, Input, Modal, Select, Spinner, Textarea,
} from "@/components/ui";
import {
  Lead, PIPELINE_STAGES, PartnerCompany, Property, User,
  fmtDate, fmtMoney, labelize,
} from "@/lib/types";
import { BuildingIcon, SearchIcon, SendIcon } from "@/components/icons";

interface LeadDetail extends Lead {
  notes: { id: string; body: string; createdAt: string; author: { name: string } }[];
  activities: { id: string; type: string; message: string; createdAt: string; actor?: { name: string } | null }[];
  pipelineHistory: { id: string; fromStage?: string | null; toStage: string; createdAt: string; changedBy?: { name: string } | null }[];
  whatsappLogs: { id: string; body: string; status: string; toNumber: string; createdAt: string; sentBy: { name: string }; template?: { name: string } | null; propertyIds: string[] }[];
  partnerShares: { id: string; status: string; createdAt: string; notesShared?: string | null; partner: { id: string; name: string }; sharedBy: { name: string } }[];
  shortlist: { id: string; score: number; sharedViaWhatsApp: boolean; property: Property }[];
}

interface Match {
  property: Property;
  score: number;
  reasons: string[];
}

interface Template { id: string; key: string; name: string; body: string; isActive: boolean }

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Match[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateKey, setTemplateKey] = useState("property_shortlist");
  const [partners, setPartners] = useState<PartnerCompany[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareForm, setShareForm] = useState({ partnerId: "", notesShared: "" });
  const [sending, setSending] = useState(false);
  const isPartner = user?.role === "PARTNER_USER";
  // Partners only get the partner-share history; internal tabs would always be empty for them
  const [tab, setTab] = useState<"timeline" | "whatsapp" | "partners" | "pipeline">(isPartner ? "partners" : "timeline");

  const load = useCallback(() => {
    api.get<{ data: LeadDetail }>(`/leads/${id}`).then((res) => setLead(res.data)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    if (!isPartner) {
      api.get<{ data: Template[] }>("/whatsapp/templates").then((r) => {
        const active = r.data.filter((t) => t.isActive);
        setTemplates(active);
        // Keep the default only if that template actually exists and is active
        setTemplateKey((k) => (active.some((t) => t.key === k) ? k : ""));
      }).catch(() => {});
      api.get<{ data: PartnerCompany[] }>("/partners").then((r) => setPartners(r.data.filter((p) => p.status === "ACTIVE"))).catch(() => {});
    }
    if (hasRole("SALES_MANAGER")) {
      api.get<{ data: User[] }>("/users?active=true").then((r) =>
        setStaff(r.data.filter((u) => ["SALES_EXECUTIVE", "SALES_MANAGER"].includes(u.role)))
      ).catch(() => {});
    }
  }, [load, isPartner, hasRole]);

  async function runMatching() {
    setMatching(true);
    setActionError(null);
    try {
      const res = await api.post<{ data: Match[] }>(`/leads/${id}/match-properties`);
      setMatches(res.data);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Matching failed");
    } finally {
      setMatching(false);
    }
  }

  async function runSearch() {
    if (!searchQ.trim()) return setSearchResults(null);
    setSearching(true);
    setActionError(null);
    try {
      const res = await api.get<{ data: Property[] }>(`/properties?q=${encodeURIComponent(searchQ.trim())}&status=AVAILABLE&pageSize=20`);
      setSearchResults(res.data.map((property) => ({ property, score: 0, reasons: ["Manual search"] })));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function toggleSelect(propertyId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  }

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setActionError(null);
    try {
      await fn();
      load();
      after?.();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function sendWhatsApp() {
    if (selected.size === 0) return setActionError("Select at least one property to send");
    setSending(true);
    await act(
      () => api.post(`/leads/${id}/send-whatsapp`, { propertyIds: [...selected], templateKey: templateKey || undefined }),
      () => { setSelected(new Set()); setTab("whatsapp"); }
    );
    setSending(false);
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!lead) return <Spinner />;

  const autoMatches: Match[] =
    matches ??
    lead.shortlist.map((s) => ({
      property: s.property,
      score: s.score,
      reasons: s.sharedViaWhatsApp ? ["Already shared via WhatsApp"] : ["Saved shortlist"],
    }));
  const manualResults = (searchResults ?? []).filter((m) => !autoMatches.some((x) => x.property.id === m.property.id));
  const propertyList = [...manualResults, ...autoMatches];

  const info: [string, React.ReactNode][] = [
    ["Mobile", lead.mobile],
    ["WhatsApp", lead.whatsappNumber || lead.mobile],
    ["Email", lead.email || "—"],
    ["Country", lead.country || "—"],
    ["City / area", `${lead.city || "—"}${lead.preferredArea ? ` · ${lead.preferredArea}` : ""}`],
    ["Budget", lead.budgetMin || lead.budgetMax ? `${fmtMoney(lead.budgetMin, lead.currency)} – ${fmtMoney(lead.budgetMax, lead.currency)}` : "—"],
    ["Property type", `${labelize(lead.propertyType)}${lead.bedrooms != null ? ` · ${lead.bedrooms}BR` : ""}`],
    ["Visa", lead.visaRequired ? lead.visaType || "Required" : "Not required"],
    ["Source", <Badge key="src" value={lead.source} />],
    ["Priority", <Badge key="pri" value={lead.priority} />],
    ["Assigned to", lead.assignedTo?.name ?? "Unassigned"],
    ["Created", fmtDate(lead.createdAt, true)],
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{lead.fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge value={lead.status} />
            <span className="text-xs text-slate-500">Stage: {labelize(lead.stage)}</span>
            {lead.followUpAt && <span className="text-xs text-amber-600">Follow-up {fmtDate(lead.followUpAt, true)}</span>}
          </div>
        </div>
        {!isPartner && (
          <div className="flex flex-wrap gap-2">
            <Select
              className="w-auto"
              value={lead.stage}
              onChange={(e) => act(() => api.post(`/leads/${id}/change-stage`, { stage: e.target.value }))}
            >
              {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
            </Select>
            {staff.length > 0 && (
              <Select
                className="w-auto"
                value={lead.assignedToId ?? ""}
                onChange={(e) => e.target.value && act(() => api.post(`/leads/${id}/assign`, { assignedToId: e.target.value }))}
              >
                <option value="">Assign to…</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            <Button variant="secondary" onClick={() => setShowEdit(true)}>Edit</Button>
            <Button variant="secondary" onClick={() => setShowShare(true)}>Share to partner</Button>
          </div>
        )}
      </div>

      <ErrorBanner message={actionError} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: info + notes */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Lead details</h3>
            <dl className="space-y-2 text-sm">
              {info.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
            {lead.requirementNotes && (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{lead.requirementNotes}</p>
            )}
          </Card>

          {!isPartner && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Set follow-up</h3>
              <div className="flex gap-2">
                <Input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
                <Button
                  size="sm"
                  disabled={!followUpAt}
                  onClick={() => act(() => api.post(`/leads/${id}/follow-up`, { followUpAt }), () => setFollowUpAt(""))}
                >
                  Set
                </Button>
              </div>
            </Card>
          )}

          {!isPartner && <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Notes</h3>
            <div className="mb-3 flex gap-2">
              <Textarea rows={2} placeholder="Add an internal note…" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            </div>
            <Button size="sm" disabled={!noteBody.trim()} onClick={() => act(() => api.post(`/leads/${id}/add-note`, { body: noteBody }), () => setNoteBody(""))}>
              Add note
            </Button>
            <div className="mt-3 space-y-2">
              {lead.notes.map((n) => (
                <div key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="text-slate-700">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{n.author.name} · {fmtDate(n.createdAt, true)}</p>
                </div>
              ))}
              {lead.notes.length === 0 && <p className="text-xs text-slate-400">No notes yet.</p>}
            </div>
          </Card>}
        </div>

        {/* Middle+right: matching + history */}
        <div className="space-y-4 lg:col-span-2">
          {!isPartner && (
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Matching properties</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Select className="w-auto" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                    <option value="">No template (auto message)</option>
                    {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                  </Select>
                  <Button variant="secondary" size="sm" onClick={runMatching} disabled={matching}>
                    {matching ? "Matching…" : <><SearchIcon className="mr-1.5 inline h-3.5 w-3.5" />Find matches</>}
                  </Button>
                  {selected.size > 0 && (
                    <>
                      <Button size="sm" onClick={sendWhatsApp} disabled={sending}>
                        {sending ? "Sending…" : <><SendIcon className="mr-1.5 inline h-3.5 w-3.5" />Send {selected.size} via WhatsApp</>}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => act(() => api.post(`/leads/${id}/shortlist`, { propertyIds: [...selected] }))}>
                        Save shortlist
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Manual property search */}
              <div className="mb-3 flex gap-2">
                <Input
                  placeholder="Search properties by title, location or description…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
                />
                <Button variant="secondary" size="sm" className="shrink-0" onClick={runSearch} disabled={searching}>
                  {searching ? "Searching…" : "Search"}
                </Button>
                {searchResults !== null && (
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setSearchQ(""); setSearchResults(null); }}>
                    Clear
                  </Button>
                )}
              </div>
              {searchResults !== null && searchResults.length === 0 && (
                <p className="mb-2 text-sm text-slate-500">No available properties found for “{searchQ}”.</p>
              )}

              {propertyList.length === 0 && searchResults === null && (
                <p className="text-sm text-slate-500">Click “Find matches” to score current inventory against this lead's requirements, or search properties manually above.</p>
              )}

              {propertyList.map((m) => (
                <label
                  key={m.property.id}
                  className={`mb-2 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${selected.has(m.property.id) ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.property.id)}
                    onChange={() => toggleSelect(m.property.id)}
                  />
                  {m.property.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.property.images[0].url} alt="" className="h-14 w-20 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-20 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><BuildingIcon className="h-6 w-6" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.property.title}</div>
                    <div className="text-xs text-slate-500">
                      {m.property.location} · {fmtMoney(m.property.price, m.property.currency)}
                      {m.property.bedrooms != null && ` · ${m.property.bedrooms}BR`}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-400">{m.reasons.join(" · ")}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-sm font-bold ${m.score >= 70 ? "text-emerald-600" : m.score >= 50 ? "text-amber-600" : "text-slate-500"}`}>
                      {m.score > 0 ? `${m.score}%` : "—"}
                    </div>
                    <div className="text-[10px] uppercase text-slate-400">{m.score > 0 ? "match" : "manual"}</div>
                  </div>
                </label>
              ))}
            </Card>
          )}

          {/* History tabs */}
          <Card>
            <div className="flex border-b border-slate-200">
              {(isPartner
                ? ([["partners", `Partner shares (${lead.partnerShares.length})`]] as const)
                : ([["timeline", "Activity timeline"], ["whatsapp", `WhatsApp (${lead.whatsappLogs.length})`], ["partners", `Partner shares (${lead.partnerShares.length})`], ["pipeline", "Pipeline history"]] as const)
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`px-4 py-2.5 text-sm font-medium ${tab === key ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto p-4">
              {tab === "timeline" && (
                <ol className="space-y-3">
                  {lead.activities.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      <div>
                        <p className="text-slate-700">{a.message}</p>
                        <p className="text-xs text-slate-400">{a.actor?.name ?? "System"} · {fmtDate(a.createdAt, true)}</p>
                      </div>
                    </li>
                  ))}
                  {lead.activities.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
                </ol>
              )}
              {tab === "whatsapp" && (
                <div className="space-y-3">
                  {lead.whatsappLogs.map((w) => (
                    <div key={w.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          To {w.toNumber} · by {w.sentBy.name} · {fmtDate(w.createdAt, true)}
                          {w.template && ` · template: ${w.template.name}`}
                        </span>
                        <Badge value={w.status} />
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{w.body}</p>
                    </div>
                  ))}
                  {lead.whatsappLogs.length === 0 && <p className="text-sm text-slate-400">No WhatsApp messages yet.</p>}
                </div>
              )}
              {tab === "partners" && (
                <div className="space-y-3">
                  {lead.partnerShares.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.partner.name}</span>
                        <Badge value={s.status} />
                      </div>
                      <p className="text-xs text-slate-400">Shared by {s.sharedBy.name} · {fmtDate(s.createdAt, true)}</p>
                      {s.notesShared && <p className="mt-1 text-xs text-slate-600">{s.notesShared}</p>}
                    </div>
                  ))}
                  {lead.partnerShares.length === 0 && <p className="text-sm text-slate-400">Not shared with any partner yet.</p>}
                </div>
              )}
              {tab === "pipeline" && (
                <ol className="space-y-2">
                  {lead.pipelineHistory.map((h) => (
                    <li key={h.id} className="text-sm text-slate-600">
                      {h.fromStage ? `${labelize(h.fromStage)} → ` : ""}<span className="font-medium">{labelize(h.toStage)}</span>
                      <span className="ml-2 text-xs text-slate-400">{h.changedBy?.name ?? "System"} · {fmtDate(h.createdAt, true)}</span>
                    </li>
                  ))}
                  {lead.pipelineHistory.length === 0 && <p className="text-sm text-slate-400">No stage changes yet.</p>}
                </ol>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Edit modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit lead" wide>
        <LeadForm initial={lead} onSaved={() => { setShowEdit(false); load(); }} onCancel={() => setShowEdit(false)} />
      </Modal>

      {/* Share to partner modal */}
      <Modal open={showShare} onClose={() => setShowShare(false)} title="Share lead with partner company">
        <div className="space-y-4">
          <Field label="Partner company">
            <Select value={shareForm.partnerId} onChange={(e) => setShareForm((f) => ({ ...f, partnerId: e.target.value }))}>
              <option value="">Select partner…</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes to share">
            <Textarea rows={3} value={shareForm.notesShared} onChange={(e) => setShareForm((f) => ({ ...f, notesShared: e.target.value }))} placeholder="Context for the partner team…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowShare(false)}>Cancel</Button>
            <Button
              disabled={!shareForm.partnerId}
              onClick={() => act(
                () => api.post(`/leads/${id}/share-partner`, shareForm),
                () => { setShowShare(false); setShareForm({ partnerId: "", notesShared: "" }); setTab("partners"); }
              )}
            >
              Share lead
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
