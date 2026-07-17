"use client";

import { useEffect, useState } from "react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/toast";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import {
  AlertTriangleIcon, BotIcon, CopyIcon, DollarSignIcon, FileTextIcon, IconType,
  ScaleIcon, SendIcon, SparklesIcon, TrendingUpIcon, ZapIcon,
} from "@/components/icons";
import { AI_LANGUAGES, Lead, Paginated, Property, fmtDate } from "@/lib/types";

type ActionKey = "sales-pitch" | "investment-proposal" | "price-predictor" | "agreement-draft";

const ACTIONS: { key: ActionKey; icon: IconType; label: string; hint: string }[] = [
  { key: "sales-pitch", icon: SendIcon, label: "Sales Pitch", hint: "WhatsApp-ready, 120–180 words" },
  { key: "investment-proposal", icon: FileTextIcon, label: "Investment Proposal", hint: "One-page investor summary" },
  { key: "price-predictor", icon: TrendingUpIcon, label: "Price Predictor", hint: "Grounded in comparable listings" },
  { key: "agreement-draft", icon: ScaleIcon, label: "Sale Agreement Draft", hint: "Preliminary — needs legal review" },
];

interface Usage { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number }
interface ConsoleEntry { role: "user" | "assistant"; text: string; usage?: Usage; error?: boolean; leadId?: string; leadName?: string }

function fmtUsd(v: number) {
  if (v === 0) return "$0.00";
  return v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(2)}`;
}

export default function AiAgentPage() {
  const { hasRole } = useAuth();
  const [tab, setTab] = useState<"console" | "usage">("console");
  return (
    <div className="space-y-4">
      <PageHeader
        icon={SparklesIcon}
        title="AI Operating Agent"
        subtitle="Automate pitches, proposals, price predictions, and agreement drafts using real inventory and lead data"
      />
      <div className="flex gap-1 border-b border-slate-200">
        {([["console", "Console", BotIcon], ...(hasRole("SALES_MANAGER") ? [["usage", "Usage & Cost", DollarSignIcon] as const] : [])] as [string, string, IconType][]).map(
          ([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key as "console" | "usage")}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          )
        )}
      </div>
      {tab === "console" ? <ConsoleTab /> : <UsageTab />}
    </div>
  );
}

function ConsoleTab() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [action, setAction] = useState<ActionKey | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [location, setLocation] = useState("");
  const [propertyType, setPropertyType] = useState("APARTMENT");
  const [bedrooms, setBedrooms] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<(typeof AI_LANGUAGES)[number]["value"]>("English");
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sendingIdx, setSendingIdx] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    api.get<Paginated<Property>>("/properties?pageSize=100&status=AVAILABLE").then((r) => setProperties(r.data)).catch(() => {});
    api.get<Paginated<Lead>>("/leads?pageSize=100").then((r) => setLeads(r.data)).catch(() => {});
  }, []);

  function push(entry: ConsoleEntry) {
    setEntries((e) => [...e, entry]);
  }

  async function run(path: string, body: unknown, label: string, leadMeta?: { leadId: string; leadName: string }) {
    setBusy(true);
    push({ role: "user", text: label });
    try {
      const res = await api.post<{ data: { text: string; usage: Usage } }>(`/ai/${path}`, body);
      push({ role: "assistant", text: res.data.text, usage: res.data.usage, ...leadMeta });
    } catch (err) {
      push({ role: "assistant", text: err instanceof Error ? err.message : "AI request failed", error: true });
    } finally {
      setBusy(false);
      setAction(null);
    }
  }

  async function copyEntry(i: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 1500);
  }

  async function sendEntryToWhatsApp(i: number, entry: ConsoleEntry) {
    if (!entry.leadId) return;
    setSendingIdx(i);
    try {
      await api.post(`/leads/${entry.leadId}/send-whatsapp`, { customMessage: entry.text, language });
      toast(`Sent to ${entry.leadName ?? "client"} on WhatsApp`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendingIdx(null);
    }
  }

  function generate() {
    if (action === "sales-pitch") {
      if (!propertyId) return;
      const p = properties.find((x) => x.id === propertyId);
      const l = leads.find((x) => x.id === leadId);
      run(
        "sales-pitch",
        { propertyId, leadId: leadId || undefined, language },
        `Generate a sales pitch for "${p?.title}"${l ? ` for client ${l.fullName}` : ""}`,
        l ? { leadId: l.id, leadName: l.fullName } : undefined
      );
    } else if (action === "investment-proposal") {
      if (!propertyId) return;
      const p = properties.find((x) => x.id === propertyId);
      run("investment-proposal", { propertyId, language }, `Generate an investment proposal for "${p?.title}"`);
    } else if (action === "price-predictor") {
      if (!location || !propertyType) return;
      run(
        "price-predictor",
        { location, propertyType, bedrooms: bedrooms || undefined, areaSqft: areaSqft || undefined, language },
        `Predict price for a ${propertyType} in ${location}${bedrooms ? `, ${bedrooms}BR` : ""}${areaSqft ? `, ${areaSqft} sqft` : ""}`
      );
    } else if (action === "agreement-draft") {
      if (!propertyId || !leadId) return;
      const p = properties.find((x) => x.id === propertyId);
      const l = leads.find((x) => x.id === leadId);
      run("agreement-draft", { propertyId, leadId, language }, `Draft a sale agreement for "${p?.title}" with buyer ${l?.fullName}`);
    }
  }

  function submitQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    const q = query.trim();
    setQuery("");
    run("ask", { query: q, language }, q);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Quick actions */}
      <Card className="h-fit p-3">
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</h3>
        <div className="space-y-1.5">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAction(action === a.key ? null : a.key)}
              className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                action === a.key
                  ? "border-brand-300 bg-brand-50 ring-1 ring-inset ring-brand-200"
                  : "border-transparent hover:bg-slate-50"
              }`}
            >
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${action === a.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                <a.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className={`text-sm font-medium ${action === a.key ? "text-brand-800" : "text-slate-700"}`}>{a.label}</div>
                <div className="truncate text-xs text-slate-400">{a.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Conversation */}
      <Card className="flex flex-col p-4">
        <div className="mb-3 flex items-center justify-end gap-2 text-xs text-slate-500">
          <span>Reply language:</span>
          <Select
            className="w-auto py-1 text-xs"
            value={language}
            onChange={(e) => setLanguage(e.target.value as (typeof AI_LANGUAGES)[number]["value"])}
          >
            {AI_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </div>
        {action && (
          <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {(action === "sales-pitch" || action === "investment-proposal" || action === "agreement-draft") && (
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Select property…</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </Select>
            )}
            {(action === "sales-pitch" || action === "agreement-draft") && (
              <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">{action === "agreement-draft" ? "Select client…" : "Select client (optional)…"}</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
              </Select>
            )}
            {action === "price-predictor" && (
              <div className="grid grid-cols-2 gap-2">
                <Input className="col-span-2" placeholder="Location (e.g. Anna Nagar, Chennai)" value={location} onChange={(e) => setLocation(e.target.value)} />
                <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                  {["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "STUDIO", "PLOT", "OFFICE"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
                <Input placeholder="Bedrooms (optional)" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
                <Input className="col-span-2" placeholder="Area sqft (optional)" value={areaSqft} onChange={(e) => setAreaSqft(e.target.value)} />
              </div>
            )}
            <Button size="sm" disabled={busy} onClick={generate}><ZapIcon className="mr-1.5 inline h-3.5 w-3.5" />{busy ? "Generating…" : "Generate"}</Button>
          </div>
        )}

        <div className="min-h-[360px] flex-1 space-y-4 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          {entries.length === 0 && (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center text-sm text-slate-400">
              <BotIcon className="mb-2 h-8 w-8 text-slate-300" />
              Pick a quick action above, or ask a free-form question below.
            </div>
          )}
          {entries.map((e, i) =>
            e.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm">{e.text}</div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2.5">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${e.error ? "bg-red-100 text-red-600" : "bg-gradient-to-br from-brand-500 to-brand-700 text-white"}`}>
                  {e.error ? <AlertTriangleIcon className="h-4 w-4" /> : <SparklesIcon className="h-3.5 w-3.5" />}
                </div>
                <div className={`max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-sm ${e.error ? "border border-red-200 bg-red-50 text-red-700" : "border border-slate-200 bg-white text-slate-700"}`}>
                  <p className="whitespace-pre-wrap">{e.text}</p>
                  {!e.error && (
                    <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-1.5">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-600"
                        onClick={() => copyEntry(i, e.text)}
                      >
                        <CopyIcon className="h-3 w-3" /> {copiedIdx === i ? "Copied!" : "Copy"}
                      </button>
                      {e.leadId && (
                        <button
                          type="button"
                          disabled={sendingIdx === i}
                          className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-brand-600 disabled:opacity-50"
                          onClick={() => sendEntryToWhatsApp(i, e)}
                        >
                          <SendIcon className="h-3 w-3" /> {sendingIdx === i ? "Sending…" : `Send to ${e.leadName}`}
                        </button>
                      )}
                      {e.usage && (
                        <span className="ml-auto text-[11px] text-slate-400">
                          {e.usage.totalTokens.toLocaleString()} tokens · {fmtUsd(e.usage.estimatedCostUsd)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <SparklesIcon className="h-4 w-4 animate-pulse" /> Thinking…
            </div>
          )}
        </div>

        <form onSubmit={submitQuery} className="mt-3 flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything: e.g. Predict price of land in ECR Chennai in 2028…"
            className="flex-1"
          />
          <Button type="submit" disabled={busy || !query.trim()}>Send</Button>
        </form>
      </Card>
    </div>
  );
}

interface FeatureRow { feature: string; requests: number; costUsd: number; tokens: number }
interface StaffRow { userId: string; name: string; requests: number; costUsd: number; tokens: number }
interface RecentRow { id: string; feature: string; model: string; tokens: number; costUsd: number; user: string; createdAt: string }
interface UsageData { totalRequests: number; totalCostUsd: number; totalTokens: number; byFeature: FeatureRow[]; byStaff: StaffRow[]; recent: RecentRow[] }

const FEATURE_LABELS: Record<string, string> = {
  "sales-pitch": "Sales Pitch",
  "investment-proposal": "Investment Proposal",
  "price-predictor": "Price Predictor",
  "agreement-draft": "Agreement Draft",
  ask: "Free-form Ask",
};

function UsageTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: UsageData }>(`/ai/usage${qs({ from, to })}`).then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, [from, to]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Spinner />;

  const maxFeatureCost = Math.max(...data.byFeature.map((f) => f.costUsd), 0.000001);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        <span className="text-slate-400">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        {(from || to) && <Button variant="secondary" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Estimated cost", value: fmtUsd(data.totalCostUsd), icon: DollarSignIcon },
          { label: "Total requests", value: data.totalRequests.toLocaleString(), icon: ZapIcon },
          { label: "Total tokens", value: data.totalTokens.toLocaleString(), icon: BotIcon },
          { label: "Avg. cost / request", value: fmtUsd(data.totalRequests ? data.totalCostUsd / data.totalRequests : 0), icon: TrendingUpIcon },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 ring-1 ring-inset ring-brand-100">
                <s.icon className="h-5 w-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</div>
                <div className="mt-0.5 truncate text-xl font-semibold tracking-tight text-slate-800">{s.value}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Cost by feature</h3>
          {data.byFeature.length === 0 ? (
            <p className="text-sm text-slate-400">No usage recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.byFeature.map((f) => (
                <div key={f.feature} className="flex items-center gap-2 text-sm">
                  <span className="w-36 shrink-0 truncate text-slate-600">{FEATURE_LABELS[f.feature] ?? f.feature}</span>
                  <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                    <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(f.costUsd / maxFeatureCost) * 100}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-medium">{fmtUsd(f.costUsd)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Cost by staff member</h3>
          {data.byStaff.length === 0 ? (
            <p className="text-sm text-slate-400">No usage recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="pb-2">Staff</th>
                  <th className="pb-2 text-right">Requests</th>
                  <th className="pb-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byStaff.map((s) => (
                  <tr key={s.userId} className="border-t border-slate-100">
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-right text-slate-500">{s.requests}</td>
                    <td className="py-1.5 text-right font-medium">{fmtUsd(s.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card>
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Recent activity</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2.5">Feature</th>
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5 text-right">Tokens</th>
                <th className="px-4 py-2.5 text-right">Cost</th>
                <th className="px-4 py-2.5 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-2.5">{FEATURE_LABELS[r.feature] ?? r.feature}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.user}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.model}</td>
                  <td className="px-4 py-2.5 text-right">{r.tokens.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmtUsd(r.costUsd)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{fmtDate(r.createdAt, true)}</td>
                </tr>
              ))}
              {data.recent.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No AI requests recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
