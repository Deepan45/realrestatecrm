"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { BriefcaseIcon } from "@/components/icons";
import { PARTNER_SHARE_STATUSES, PartnerCompany, fmtDate, fmtMoney, labelize } from "@/lib/types";

interface Share {
  id: string;
  status: string;
  createdAt: string;
  notesShared?: string | null;
  conversionNote?: string | null;
  sharedBy: { name: string };
  lead: {
    id: string; fullName: string; mobile: string; email?: string | null; city?: string | null;
    budgetMin?: string | null; budgetMax?: string | null; currency: string;
    propertyType?: string | null; bedrooms?: number | null; visaType?: string | null; status: string;
  };
}

const emptyForm = { name: "", contactPerson: "", phone: "", whatsapp: "", email: "", city: "", country: "", status: "ACTIVE" as const, notes: "" };

export default function PartnersPage() {
  const { user, hasRole } = useAuth();
  const isPartner = user?.role === "PARTNER_USER";
  const canManage = hasRole("SALES_MANAGER");
  const [partners, setPartners] = useState<PartnerCompany[] | null>(null);
  const [selected, setSelected] = useState<PartnerCompany | null>(null);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PartnerCompany | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const loadPartners = useCallback(() => {
    api.get<{ data: PartnerCompany[] }>("/partners").then((r) => {
      setPartners(r.data);
      // Partner users land directly on their own company's shared leads
      if (r.data.length === 1 && isPartner) selectPartner(r.data[0]);
    }).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPartner]);

  useEffect(loadPartners, [loadPartners]);

  function selectPartner(p: PartnerCompany) {
    setSelected(p);
    setShares(null);
    api.get<{ data: Share[] }>(`/partners/${p.id}/leads`).then((r) => setShares(r.data)).catch((e) => setError(e.message));
  }

  function openForm(partner?: PartnerCompany) {
    setEditing(partner ?? null);
    setForm(partner ? {
      name: partner.name,
      contactPerson: partner.contactPerson ?? "",
      phone: partner.phone ?? "",
      whatsapp: partner.whatsapp ?? "",
      email: partner.email ?? "",
      city: partner.city ?? "",
      country: partner.country ?? "",
      status: partner.status as "ACTIVE",
      notes: partner.notes ?? "",
    } : { ...emptyForm });
    setShowForm(true);
  }

  async function saveForm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) await api.put(`/partners/${editing.id}`, form);
      else await api.post("/partners", form);
      setShowForm(false);
      loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateShareStatus(share: Share, status: string) {
    try {
      await api.put(`/partners/shares/${share.id}`, { status });
      setShares((s) => s?.map((x) => (x.id === share.id ? { ...x, status } : x)) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (!partners) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BriefcaseIcon}
        title={isPartner ? "Shared Leads" : "Vendor Network"}
        subtitle={isPartner ? "Leads referred to your company" : "Manage partner companies and track shared referrals"}
        actions={canManage && <Button onClick={() => openForm()}>+ Add partner</Button>}
      />
      <ErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        {!isPartner && (
          <Card>
            {partners.length === 0 && <EmptyState message="No partner companies yet." />}
            <div className="divide-y divide-slate-100">
              {partners.map((p) => (
                <button
                  key={p.id}
                  className={`block w-full px-4 py-3 text-left transition hover:bg-slate-50 ${selected?.id === p.id ? "bg-brand-50" : ""}`}
                  onClick={() => selectPartner(p)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.name}</span>
                    <Badge value={p.status} />
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.contactPerson ?? "—"} · {p.city ?? "—"} · {p._count?.shares ?? 0} leads
                  </div>
                  {canManage && (
                    <span className="mt-1 inline-block text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openForm(p); }}>
                      Edit
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className={isPartner ? "lg:col-span-3" : "lg:col-span-2"}>
          {!selected ? (
            <Card><EmptyState message="Select a partner company to see shared leads." /></Card>
          ) : (
            <Card>
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold">{selected.name} — shared leads</h3>
              </div>
              {shares === null ? (
                <Spinner />
              ) : shares.length === 0 ? (
                <EmptyState message="No leads shared with this partner yet." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {shares.map((s) => (
                    <div key={s.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          {isPartner ? (
                            <span className="text-sm font-medium">{s.lead.fullName}</span>
                          ) : (
                            <Link href={`/leads/${s.lead.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                              {s.lead.fullName}
                            </Link>
                          )}
                          <div className="text-xs text-slate-500">
                            {s.lead.mobile} · {s.lead.city ?? "—"} · {labelize(s.lead.propertyType)}
                            {s.lead.budgetMax && ` · up to ${fmtMoney(s.lead.budgetMax, s.lead.currency)}`}
                          </div>
                          <div className="text-xs text-slate-400">Shared by {s.sharedBy.name} · {fmtDate(s.createdAt, true)}</div>
                          {s.notesShared && <p className="mt-1 text-xs text-slate-600">{s.notesShared}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge value={s.status} />
                          <Select className="w-auto" value={s.status} onChange={(e) => updateShareStatus(s, e.target.value)}>
                            {PARTNER_SHARE_STATUSES.map((st) => <option key={st} value={st}>{labelize(st)}</option>)}
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit partner" : "Add partner company"} wide>
        <form onSubmit={saveForm} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company name *">
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Contact person">
              <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            <Field label="WhatsApp">
              <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </Field>
            <Field label="Country">
              <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" }))}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
