"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, PageHeader, Select } from "@/components/ui";
import { AlertTriangleIcon, FileTextIcon, IconType, ScaleIcon, SendIcon, SparklesIcon, TrendingUpIcon } from "@/components/icons";
import { Lead, Paginated, Property } from "@/lib/types";

type ActionKey = "sales-pitch" | "investment-proposal" | "price-predictor" | "agreement-draft";

const ACTIONS: { key: ActionKey; icon: IconType; label: string }[] = [
  { key: "sales-pitch", icon: SendIcon, label: "Generate Sales Pitch" },
  { key: "investment-proposal", icon: FileTextIcon, label: "Generate Investment Proposal" },
  { key: "price-predictor", icon: TrendingUpIcon, label: "AI Property Price Predictor" },
  { key: "agreement-draft", icon: ScaleIcon, label: "Generate Sale Agreement Draft" },
];

interface ConsoleEntry {
  role: "user" | "assistant" | "system";
  text: string;
}

export default function AiAgentPage() {
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
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<ConsoleEntry[]>([
    { role: "system", text: "[SYSTEM AI STATUS: ONLINE]\nSelect one of the AI generator templates on the left or type your customized query in the prompt bar below…" },
  ]);

  useEffect(() => {
    api.get<Paginated<Property>>("/properties?pageSize=100&status=AVAILABLE").then((r) => setProperties(r.data)).catch(() => {});
    api.get<Paginated<Lead>>("/leads?pageSize=100").then((r) => setLeads(r.data)).catch(() => {});
  }, []);

  function push(entry: ConsoleEntry) {
    setEntries((e) => [...e, entry]);
  }

  async function run(path: string, body: unknown, label: string) {
    setBusy(true);
    push({ role: "user", text: label });
    try {
      const res = await api.post<{ data: { text: string } }>(`/ai/${path}`, body);
      push({ role: "assistant", text: res.data.text });
    } catch (err) {
      push({ role: "assistant", text: `Error: ${err instanceof Error ? err.message : "AI request failed"}` });
    } finally {
      setBusy(false);
      setAction(null);
    }
  }

  function generate() {
    if (action === "sales-pitch") {
      if (!propertyId) return;
      const p = properties.find((x) => x.id === propertyId);
      const l = leads.find((x) => x.id === leadId);
      run("sales-pitch", { propertyId, leadId: leadId || undefined }, `Generate a sales pitch for "${p?.title}"${l ? ` for client ${l.fullName}` : ""}`);
    } else if (action === "investment-proposal") {
      if (!propertyId) return;
      const p = properties.find((x) => x.id === propertyId);
      run("investment-proposal", { propertyId }, `Generate an investment proposal for "${p?.title}"`);
    } else if (action === "price-predictor") {
      if (!location || !propertyType) return;
      run(
        "price-predictor",
        { location, propertyType, bedrooms: bedrooms || undefined, areaSqft: areaSqft || undefined },
        `Predict price for a ${propertyType} in ${location}${bedrooms ? `, ${bedrooms}BR` : ""}${areaSqft ? `, ${areaSqft} sqft` : ""}`
      );
    } else if (action === "agreement-draft") {
      if (!propertyId || !leadId) return;
      const p = properties.find((x) => x.id === propertyId);
      const l = leads.find((x) => x.id === leadId);
      run("agreement-draft", { propertyId, leadId }, `Draft a sale agreement for "${p?.title}" with buyer ${l?.fullName}`);
    }
  }

  function submitQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    const q = query.trim();
    setQuery("");
    run("ask", { query: q }, q);
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={SparklesIcon} title="AI Operating Agent" subtitle="Automate pitches, proposals, price predictions, and agreement drafts using real inventory and lead data" />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Prompt generator sidebar */}
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">AI Prompts Generator</h3>
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAction(action === a.key ? null : a.key)}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm font-medium transition ${
                action === a.key
                  ? "border-brand-500/60 bg-brand-500/10 text-white"
                  : "border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-700 hover:bg-slate-800"
              }`}
            >
              <a.icon className="h-4 w-4 shrink-0" />
              {a.label}
            </button>
          ))}
        </div>

        {/* Console */}
        <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">AI Intelligence Playground Console</h3>

          {action && (
            <div className="mb-3 space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
              {(action === "sales-pitch" || action === "investment-proposal" || action === "agreement-draft") && (
                <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="border-slate-700 bg-slate-950 text-slate-200">
                  <option value="">Select property…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </Select>
              )}
              {(action === "sales-pitch" || action === "agreement-draft") && (
                <Select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="border-slate-700 bg-slate-950 text-slate-200">
                  <option value="">{action === "agreement-draft" ? "Select client…" : "Select client (optional)…"}</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
                </Select>
              )}
              {action === "price-predictor" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Location (e.g. Anna Nagar, Chennai)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
                  />
                  <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="border-slate-700 bg-slate-950 text-slate-200">
                    {["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "STUDIO", "PLOT", "OFFICE"].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                  <input
                    placeholder="Bedrooms (optional)"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
                  />
                  <input
                    placeholder="Area sqft (optional)"
                    value={areaSqft}
                    onChange={(e) => setAreaSqft(e.target.value)}
                    className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500"
                  />
                </div>
              )}
              <Button size="sm" disabled={busy} onClick={generate}>{busy ? "Generating…" : "Generate"}</Button>
            </div>
          )}

          <div className="min-h-[320px] flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-black/40 p-4 font-mono text-sm">
            {entries.map((e, i) => {
              const isError = e.role === "assistant" && e.text.startsWith("Error:");
              return (
                <div
                  key={i}
                  className={
                    e.role === "user"
                      ? "text-brand-300"
                      : e.role === "system"
                        ? "text-slate-500"
                        : isError
                          ? "flex items-start gap-1.5 whitespace-pre-wrap text-red-400"
                          : "whitespace-pre-wrap text-slate-200"
                  }
                >
                  {e.role === "user" ? `> ${e.text}` : isError ? (<><AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />{e.text.replace(/^Error:\s*/, "")}</>) : e.text}
                </div>
              );
            })}
            {busy && <div className="text-slate-500">Thinking…</div>}
          </div>

          <form onSubmit={submitQuery} className="mt-3 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask AI: e.g. Predict price of land in ECR Chennai in 2028…"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-brand-500"
            />
            <Button type="submit" disabled={busy}>Submit</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
