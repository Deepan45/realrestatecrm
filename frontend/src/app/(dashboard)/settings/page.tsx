"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, downloadFile, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Spinner, Textarea } from "@/components/ui";
import { DownloadIcon, SettingsIcon, UploadCloudIcon } from "@/components/icons";
import IntegrationsPanel from "@/components/IntegrationsPanel";
import { applyBrandColor } from "@/lib/brandColor";

const emptyBranding = { appName: "RealRest", tagline: "Real Estate CRM", logoUrl: "", primaryColor: "" };

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
  const [tab, setTab] = useState<"templates" | "branding" | "integrations">("templates");
  const [branding, setBranding] = useState({ ...emptyBranding });
  const [logoUploading, setLogoUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api.get<{ data: Template[] }>("/whatsapp/templates").then((r) => setTemplates(r.data)).catch((e) => setError(e.message));
    api.get<{ data: Record<string, unknown> }>("/settings").then((r) => {
      const c = r.data.currencies;
      if (Array.isArray(c)) setCurrencies(c.join(", "));
      const b = r.data.branding as Partial<typeof emptyBranding> | undefined;
      if (b && typeof b === "object") setBranding({ ...emptyBranding, ...b });
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

  async function exportTemplates() {
    try {
      await downloadFile("/whatsapp/templates/export", `whatsapp-templates-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
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

  async function saveBranding(next = branding) {
    try {
      await api.put("/settings/branding", { value: next });
      applyBrandColor(next.primaryColor || null);
      setSaved("Branding updated");
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await api.post<{ url: string }>("/settings/branding/logo", fd);
      const next = { ...branding, logoUrl: res.url };
      setBranding(next);
      await saveBranding(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setLogoUploading(false);
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
          {([["templates", "Templates & Currencies"], ["branding", "Branding"], ["integrations", "Integrations"]] as const).map(([key, label]) => (
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
      ) : tab === "branding" && hasRole() ? (
        <Card className="max-w-lg p-4">
          <h3 className="mb-1 text-sm font-semibold">App branding</h3>
          <p className="mb-4 text-xs text-slate-500">Shown in the sidebar and browser tab for every user.</p>
          <div className="space-y-4">
            <Field label="Application name">
              <Input value={branding.appName} onChange={(e) => setBranding((b) => ({ ...b, appName: e.target.value }))} />
            </Field>
            <Field label="Tagline">
              <Input value={branding.tagline} onChange={(e) => setBranding((b) => ({ ...b, tagline: e.target.value }))} />
            </Field>
            <Field label="Logo">
              <div className="flex items-center gap-3">
                {branding.logoUrl ? (
                  <img src={resolveMediaUrl(branding.logoUrl)} alt="Logo" className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white">
                    {branding.appName.charAt(0).toUpperCase()}
                  </div>
                )}
                <input ref={logoRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                <Button variant="secondary" size="sm" disabled={logoUploading} onClick={() => logoRef.current?.click()}>
                  <UploadCloudIcon className="mr-1.5 inline h-3.5 w-3.5" />{logoUploading ? "Uploading…" : "Upload logo"}
                </Button>
                {branding.logoUrl && (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-red-600 hover:underline"
                    onClick={() => { const next = { ...branding, logoUrl: "" }; setBranding(next); saveBranding(next); }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </Field>
            <Field label="Primary color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={branding.primaryColor || "#2f4ce0"}
                  onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-slate-200"
                />
                <Input
                  value={branding.primaryColor}
                  onChange={(e) => setBranding((b) => ({ ...b, primaryColor: e.target.value }))}
                  placeholder="Default blue"
                  className="w-32"
                />
                {branding.primaryColor && (
                  <button type="button" className="text-xs text-slate-500 hover:text-red-600 hover:underline" onClick={() => setBranding((b) => ({ ...b, primaryColor: "" }))}>
                    Reset to default
                  </button>
                )}
              </div>
            </Field>
            <Button onClick={() => saveBranding()}>Save branding</Button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">WhatsApp templates</h3>
                <p className="text-xs text-slate-500">
                  Placeholders: {"{{name}}"}, {"{{agent}}"}, {"{{properties}}"}, {"{{time}}"} (automation templates).
                  Keys <code className="rounded bg-slate-100 px-1">initial_contact_intro</code>, <code className="rounded bg-slate-100 px-1">follow_up</code>, <code className="rounded bg-slate-100 px-1">site_visit_before</code>, <code className="rounded bg-slate-100 px-1">site_visit_feedback</code>, <code className="rounded bg-slate-100 px-1">negotiation_update</code>, <code className="rounded bg-slate-100 px-1">bank_loan_assist</code>, and <code className="rounded bg-slate-100 px-1">registration_testimonial</code> fire automatically on stage changes.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={exportTemplates}><DownloadIcon className="mr-1.5 inline h-3.5 w-3.5" />Export CSV</Button>
                {canEdit && <Button size="sm" onClick={() => openForm()}>+ New template</Button>}
              </div>
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
