"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ErrorBanner, Field, Input, Select } from "@/components/ui";
import { CheckIcon } from "@/components/icons";

interface WhatsAppSettings {
  provider: "mock" | "cloud" | "msg91" | "smartping";
  cloudApiUrl: string;
  phoneNumberId: string;
  accessToken: string;
  msg91AuthKey: string;
  msg91IntegratedNumber: string;
  msg91WhatsappUrl: string;
  smartpingApiKey: string;
  smartpingCampaignName: string;
}
interface OpenAiSettings {
  provider: "openai" | "gemini";
  apiKey: string;
  model: string;
  apiUrl: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  geminiApiKey: string;
  geminiModel: string;
  geminiApiUrl: string;
  geminiInputPricePerMillion: number;
  geminiOutputPricePerMillion: number;
}
interface MetaSettings {
  verifyToken: string;
  appSecret: string;
  pageAccessToken: string;
  graphApiUrl: string;
}
interface WebsiteSyncSettings {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}
interface LeadWebhookSettings {
  secret: string;
}
interface IntegrationSettings {
  whatsapp: WhatsAppSettings;
  openai: OpenAiSettings;
  meta: MetaSettings;
  websiteSync: WebsiteSyncSettings;
  leadWebhook: LeadWebhookSettings;
}

type Section = keyof IntegrationSettings;

/** A section's own local editable state + save/feedback, so one integration's save
 * doesn't touch the others and a mistake in one form can't blank out the rest. */
function useSection<K extends Section>(section: K, initial: IntegrationSettings[K] | undefined) {
  const [form, setForm] = useState<IntegrationSettings[K] | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setForm(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function set<F extends keyof IntegrationSettings[K]>(field: F, value: IntegrationSettings[K][F]) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.put<{ data: IntegrationSettings[K] }>(`/settings/integrations/${section}`, { value: form });
      setForm(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return { form, set, save, busy, saved, error };
}

function SaveBar({ busy, saved, error, onSave }: { busy: boolean; saved: boolean; error: string | null; onSave: () => void }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <Button type="button" size="sm" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save"}</Button>
      {saved && (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
          <CheckIcon className="h-3.5 w-3.5" /> Saved
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export default function IntegrationsPanel() {
  const [data, setData] = useState<IntegrationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ data: IntegrationSettings }>("/settings/integrations").then((r) => setData(r.data)).catch((e) => setLoadError(e.message));
  }, []);

  const whatsapp = useSection("whatsapp", data?.whatsapp);
  const openai = useSection("openai", data?.openai);
  const meta = useSection("meta", data?.meta);
  const websiteSync = useSection("websiteSync", data?.websiteSync);
  const leadWebhook = useSection("leadWebhook", data?.leadWebhook);

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!data || !whatsapp.form || !openai.form || !meta.form || !websiteSync.form || !leadWebhook.form) {
    return <p className="text-sm text-slate-400">Loading integrations…</p>;
  }

  return (
    <div className="space-y-4">
      {/* WhatsApp */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">WhatsApp provider</h3>
        <p className="mt-0.5 text-xs text-slate-500">How outbound WhatsApp messages (property shares, stage automations) are actually sent.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Provider">
            <Select value={whatsapp.form.provider} onChange={(e) => whatsapp.set("provider", e.target.value as WhatsAppSettings["provider"])}>
              <option value="mock">Mock (logs only, dev)</option>
              <option value="cloud">WhatsApp Cloud API (Meta)</option>
              <option value="msg91">MSG91</option>
              <option value="smartping">SmartPing</option>
            </Select>
          </Field>
        </div>

        {whatsapp.form.provider === "cloud" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phone Number ID"><Input value={whatsapp.form.phoneNumberId} onChange={(e) => whatsapp.set("phoneNumberId", e.target.value)} /></Field>
            <Field label="Access Token"><Input type="password" value={whatsapp.form.accessToken} onChange={(e) => whatsapp.set("accessToken", e.target.value)} placeholder="EAAG…" /></Field>
            <Field label="Cloud API URL"><Input value={whatsapp.form.cloudApiUrl} onChange={(e) => whatsapp.set("cloudApiUrl", e.target.value)} /></Field>
          </div>
        )}
        {whatsapp.form.provider === "msg91" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Auth Key"><Input type="password" value={whatsapp.form.msg91AuthKey} onChange={(e) => whatsapp.set("msg91AuthKey", e.target.value)} /></Field>
            <Field label="Integrated Number"><Input value={whatsapp.form.msg91IntegratedNumber} onChange={(e) => whatsapp.set("msg91IntegratedNumber", e.target.value)} /></Field>
            <Field label="MSG91 WhatsApp URL"><Input value={whatsapp.form.msg91WhatsappUrl} onChange={(e) => whatsapp.set("msg91WhatsappUrl", e.target.value)} /></Field>
          </div>
        )}
        {whatsapp.form.provider === "smartping" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="API Key"><Input type="password" value={whatsapp.form.smartpingApiKey} onChange={(e) => whatsapp.set("smartpingApiKey", e.target.value)} /></Field>
            <Field label="Campaign Name (Live, not the template name)"><Input value={whatsapp.form.smartpingCampaignName} onChange={(e) => whatsapp.set("smartpingCampaignName", e.target.value)} /></Field>
          </div>
        )}
        <SaveBar busy={whatsapp.busy} saved={whatsapp.saved} error={whatsapp.error} onSave={whatsapp.save} />
      </Card>

      {/* AI Operating Agent */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">AI Operating Agent</h3>
        <p className="mt-0.5 text-xs text-slate-500">Powers sales pitches, proposals, price predictions, and agreement drafts. Pricing fields are only used to estimate cost on the Usage &amp; Cost tab.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Provider">
            <Select value={openai.form.provider} onChange={(e) => openai.set("provider", e.target.value as OpenAiSettings["provider"])}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
            </Select>
          </Field>
        </div>

        {openai.form.provider === "openai" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="API Key"><Input type="password" value={openai.form.apiKey} onChange={(e) => openai.set("apiKey", e.target.value)} placeholder="sk-…" /></Field>
            <Field label="Model"><Input value={openai.form.model} onChange={(e) => openai.set("model", e.target.value)} placeholder="gpt-4o-mini" /></Field>
            <Field label="API URL"><Input value={openai.form.apiUrl} onChange={(e) => openai.set("apiUrl", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Input $ / 1M tokens">
                <Input type="number" step="any" min={0} value={openai.form.inputPricePerMillion} onChange={(e) => openai.set("inputPricePerMillion", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Output $ / 1M tokens">
                <Input type="number" step="any" min={0} value={openai.form.outputPricePerMillion} onChange={(e) => openai.set("outputPricePerMillion", Number(e.target.value) || 0)} />
              </Field>
            </div>
          </div>
        )}
        {openai.form.provider === "gemini" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="API Key"><Input type="password" value={openai.form.geminiApiKey} onChange={(e) => openai.set("geminiApiKey", e.target.value)} placeholder="AIza…" /></Field>
            <Field label="Model"><Input value={openai.form.geminiModel} onChange={(e) => openai.set("geminiModel", e.target.value)} placeholder="gemini-1.5-flash" /></Field>
            <Field label="API URL"><Input value={openai.form.geminiApiUrl} onChange={(e) => openai.set("geminiApiUrl", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Input $ / 1M tokens">
                <Input type="number" step="any" min={0} value={openai.form.geminiInputPricePerMillion} onChange={(e) => openai.set("geminiInputPricePerMillion", Number(e.target.value) || 0)} />
              </Field>
              <Field label="Output $ / 1M tokens">
                <Input type="number" step="any" min={0} value={openai.form.geminiOutputPricePerMillion} onChange={(e) => openai.set("geminiOutputPricePerMillion", Number(e.target.value) || 0)} />
              </Field>
            </div>
          </div>
        )}
        <SaveBar busy={openai.busy} saved={openai.saved} error={openai.error} onSave={openai.save} />
      </Card>

      {/* Meta Lead Ads */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Meta Lead Ads webhook</h3>
        <p className="mt-0.5 text-xs text-slate-500">Auto-creates a lead whenever someone submits a Facebook/Instagram Lead Ads form. Webhook URL: <code className="rounded bg-slate-100 px-1">/api/leads/webhook/meta</code></p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Verify Token"><Input value={meta.form.verifyToken} onChange={(e) => meta.set("verifyToken", e.target.value)} /></Field>
          <Field label="App Secret"><Input type="password" value={meta.form.appSecret} onChange={(e) => meta.set("appSecret", e.target.value)} /></Field>
          <Field label="Page Access Token"><Input type="password" value={meta.form.pageAccessToken} onChange={(e) => meta.set("pageAccessToken", e.target.value)} /></Field>
          <Field label="Graph API URL"><Input value={meta.form.graphApiUrl} onChange={(e) => meta.set("graphApiUrl", e.target.value)} /></Field>
        </div>
        <SaveBar busy={meta.busy} saved={meta.saved} error={meta.error} onSave={meta.save} />
      </Card>

      {/* Website sync */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Public website property sync</h3>
        <p className="mt-0.5 text-xs text-slate-500">Pushes property changes to your website's API, and lets your website push properties back in via <code className="rounded bg-slate-100 px-1">/api/integrations/website/properties</code>.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Website API URL"><Input value={websiteSync.form.apiUrl} onChange={(e) => websiteSync.set("apiUrl", e.target.value)} placeholder="https://yoursite.com/api" /></Field>
          <Field label="Website API Key"><Input type="password" value={websiteSync.form.apiKey} onChange={(e) => websiteSync.set("apiKey", e.target.value)} /></Field>
          <Field label="Inbound Webhook Secret"><Input type="password" value={websiteSync.form.webhookSecret} onChange={(e) => websiteSync.set("webhookSecret", e.target.value)} /></Field>
        </div>
        <SaveBar busy={websiteSync.busy} saved={websiteSync.saved} error={websiteSync.error} onSave={websiteSync.save} />
      </Card>

      {/* Lead webhooks */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Lead capture webhooks</h3>
        <p className="mt-0.5 text-xs text-slate-500">Shared secret for the generic website-form and WhatsApp click-to-chat lead webhooks: <code className="rounded bg-slate-100 px-1">/api/leads/webhook/website</code> and <code className="rounded bg-slate-100 px-1">/api/leads/webhook/whatsapp-click</code></p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Webhook Secret"><Input type="password" value={leadWebhook.form.secret} onChange={(e) => leadWebhook.set("secret", e.target.value)} /></Field>
        </div>
        <SaveBar busy={leadWebhook.busy} saved={leadWebhook.saved} error={leadWebhook.error} onSave={leadWebhook.save} />
      </Card>
    </div>
  );
}
