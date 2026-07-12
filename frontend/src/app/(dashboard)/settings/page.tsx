"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Spinner, Textarea } from "@/components/ui";
import { SettingsIcon } from "@/components/icons";
import IntegrationsPanel from "@/components/IntegrationsPanel";

interface Template {
  id: string;
  key: string;
  name: string;
  body: string;
  isActive: boolean;
}

const emptyTemplate = { key: "", name: "", body: "", isActive: true };

export default function SettingsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("SALES_MANAGER");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [currencies, setCurrencies] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ ...emptyTemplate });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"templates" | "integrations">("templates");

  const load = useCallback(() => {
    api.get<{ data: Template[] }>("/whatsapp/templates").then((r) => setTemplates(r.data)).catch((e) => setError(e.message));
    api.get<{ data: Record<string, unknown> }>("/settings").then((r) => {
      const c = r.data.currencies;
      if (Array.isArray(c)) setCurrencies(c.join(", "));
    }).catch(() => {});
  }, []);

  useEffect(load, [load]);

  function openForm(t?: Template) {
    setEditing(t ?? null);
    setForm(t ? { key: t.key, name: t.name, body: t.body, isActive: t.isActive } : { ...emptyTemplate });
    setShowForm(true);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.put(`/whatsapp/templates/${editing.id}`, form);
      else await api.post("/whatsapp/templates", form);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrencies() {
    try {
      await api.put("/settings/currencies", { value: currencies.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean) });
      setSaved("Currencies updated");
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  if (!templates) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="WhatsApp templates, automations, and workspace preferences"
      />
      <ErrorBanner message={error} />
      {saved && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{saved}</div>}

      {hasRole() && (
        <div className="flex gap-1 border-b border-slate-200">
          {([["templates", "Templates & Currencies"], ["integrations", "Integrations"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === "integrations" && hasRole() ? (
        <IntegrationsPanel />
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">WhatsApp templates</h3>
                <p className="text-xs text-slate-500">
                  Placeholders: {"{{name}}"}, {"{{agent}}"}, {"{{properties}}"}, {"{{time}}"} (automation templates).
                  Keys <code className="rounded bg-slate-100 px-1">site_visit_before</code>, <code className="rounded bg-slate-100 px-1">site_visit_feedback</code>, <code className="rounded bg-slate-100 px-1">registration_testimonial</code> fire automatically on stage changes.
                </p>
              </div>
              {canEdit && <Button size="sm" onClick={() => openForm()}>+ New template</Button>}
            </div>
            <div className="divide-y divide-slate-100">
              {templates.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{t.key}</code>
                      <Badge value={t.isActive ? "ACTIVE" : "INACTIVE"} />
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">{t.body}</p>
                  </div>
                  {canEdit && <Button variant="secondary" size="sm" onClick={() => openForm(t)}>Edit</Button>}
                </div>
              ))}
            </div>
          </Card>

          {hasRole() && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Currencies</h3>
              <div className="flex gap-2">
                <Input value={currencies} onChange={(e) => setCurrencies(e.target.value)} placeholder="INR, USD, AED" />
                <Button onClick={saveCurrencies}>Save</Button>
              </div>
            </Card>
          )}
        </>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit template" : "New WhatsApp template"} wide>
        <form onSubmit={saveTemplate} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Key * (lowercase, - and _ only)">
              <Input required disabled={!!editing} value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="follow_up" />
            </Field>
            <Field label="Name *">
              <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
          </div>
          <Field label="Message body *">
            <Textarea rows={6} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
