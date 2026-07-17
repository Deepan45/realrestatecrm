import { MessageStatus } from "@prisma/client";
import { WhatsAppSettings, getIntegrationSettings } from "./integrationSettings.service";
import { getBrandName } from "./branding.service";

export interface SendResult {
  status: MessageStatus;
  providerMessageId?: string;
  error?: string;
}

export interface WhatsAppProvider {
  sendText(toNumber: string, body: string, contactName?: string, mediaUrl?: string): Promise<SendResult>;
}

/** WhatsApp Cloud API (Meta Graph API) provider. */
class CloudApiProvider implements WhatsAppProvider {
  constructor(private settings: WhatsAppSettings) {}
  async sendText(toNumber: string, body: string, _contactName?: string, mediaUrl?: string): Promise<SendResult> {
    const url = `${this.settings.cloudApiUrl}/${this.settings.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.accessToken}`,
          "Content-Type": "application/json",
        },
        // WhatsApp caps image captions at 1024 chars — session (non-template) messages
        // support this directly, unlike SmartPing's campaign API below.
        body: JSON.stringify(
          mediaUrl
            ? { messaging_product: "whatsapp", to: toNumber.replace(/[^\d+]/g, ""), type: "image", image: { link: mediaUrl, caption: body.slice(0, 1024) } }
            : { messaging_product: "whatsapp", to: toNumber.replace(/[^\d+]/g, ""), type: "text", text: { body } }
        ),
      });
      const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
      if (!res.ok || data.error) {
        return { status: MessageStatus.FAILED, error: data.error?.message ?? `HTTP ${res.status}` };
      }
      return { status: MessageStatus.SENT, providerMessageId: data.messages?.[0]?.id };
    } catch (err) {
      return { status: MessageStatus.FAILED, error: err instanceof Error ? err.message : "Network error" };
    }
  }
}

/**
 * MSG91 WhatsApp provider (https://msg91.com).
 * Sends a session (free-form text) message — the recipient must have messaged
 * the integrated number within the last 24 hours; outside that window MSG91
 * requires an approved template, which is account-specific.
 */
class Msg91Provider implements WhatsAppProvider {
  constructor(private settings: WhatsAppSettings) {}
  async sendText(toNumber: string, body: string): Promise<SendResult> {
    // MSG91's media-message shape isn't wired up here yet — session messages stay text-only.
    // MSG91 expects numbers as digits with country code, no "+"
    const to = toNumber.replace(/\D/g, "");
    try {
      const res = await fetch(this.settings.msg91WhatsappUrl, {
        method: "POST",
        headers: {
          authkey: this.settings.msg91AuthKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integrated_number: this.settings.msg91IntegratedNumber.replace(/\D/g, ""),
          content_type: "text",
          recipient_number: to,
          text: body,
        }),
      });
      const raw = await res.text();
      let data: { status?: string; errors?: unknown; message?: unknown; request_id?: string } = {};
      try { data = JSON.parse(raw); } catch { /* keep raw for the error message */ }
      if (!res.ok || data.status === "fail" || data.status === "error") {
        const detail = [data.errors, data.message].find((v) => typeof v === "string") as string | undefined;
        return { status: MessageStatus.FAILED, error: detail || raw.slice(0, 300) || `HTTP ${res.status}` };
      }
      return { status: MessageStatus.SENT, providerMessageId: data.request_id };
    } catch (err) {
      return { status: MessageStatus.FAILED, error: err instanceof Error ? err.message : "Network error" };
    }
  }
}

/**
 * SmartPing (https://smartping.in) WhatsApp Business API — a campaign/template
 * provider, not a free-form-text one: every send targets a pre-approved WhatsApp
 * template ("campaign") and fills its {{n}} placeholders via `templateParams`.
 *
 * The rest of this app already renders one final message string per send (via
 * renderTemplate() against our own WhatsAppTemplate rows), so bridging the two means
 * the SmartPing campaign's template must have exactly ONE variable that holds the
 * whole rendered message — set the campaign name in Settings → Integrations.
 *
 * Template to submit for Meta approval (in Meta Business Manager → WhatsApp Manager
 * → Message Templates, or wherever SmartPing's dashboard forwards the request to):
 *   Name:     realrest_notification
 *   Category: UTILITY
 *   Language: English (en_US)
 *   Body:     *RealRest CRM*
 *
 *             {{1}}
 *
 *             _Sent via RealRest CRM_
 * (Type this with real Enter/line-break presses in the template composer — WhatsApp
 * templates are plain text, not HTML, so a literal "<br>" shows up as those four
 * characters in the delivered message instead of a line break. Meta/WhatsApp templates
 * also cannot start or end with a variable — the bolded opener and italic signature
 * line are the minimum static text needed to satisfy that rule while keeping our one
 * rendered message in a single {{1}} slot. Note Meta may auto-reclassify a minimal
 * template like this from Utility to Marketing on review.)
 *
 * Once Meta approves it, create a Live "campaign" in SmartPing pointing at that
 * template — it's that CAMPAIGN's name (not the template name above) that goes in
 * the Settings → Integrations → WhatsApp "SmartPing campaign name" field. If your
 * approved template instead has multiple named variables, this integration needs
 * adjusting to pass a matching templateParams array.
 */
class SmartPingProvider implements WhatsAppProvider {
  constructor(private settings: WhatsAppSettings) {}
  async sendText(toNumber: string, body: string, contactName?: string, mediaUrl?: string): Promise<SendResult> {
    if (!this.settings.smartpingApiKey || !this.settings.smartpingCampaignName) {
      return { status: MessageStatus.FAILED, error: "SmartPing is not configured — set its API key and campaign name in Settings → Integrations" };
    }
    // This runs on AiSensy's campaign API under the hood (per the apiKey's JWT payload) —
    // a verified-working request against it used a bare local number (no "+", no country
    // code) and included every optional field as an explicit empty default; omitting them
    // got misreported back as "Campaign does not exist" rather than a schema error.
    const destination = toNumber.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    // WhatsApp template parameters reject newline/tab characters and runs of more than a
    // few spaces — our rendered messages (property shortlists etc.) are multi-line, so
    // flatten them into one line for this one param slot without losing the line breaks
    // visually (a bullet reads fine where the emoji markers already segment each line).
    const templateParam = body.replace(/[\r\n\t]+/g, " • ").replace(/ {2,}/g, " ").trim();
    try {
      const res = await fetch("https://backend.api-wa.co/campaign/smartpingbsp/api/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: this.settings.smartpingApiKey,
          campaignName: this.settings.smartpingCampaignName,
          destination,
          userName: contactName || "Customer",
          source: `${await getBrandName()} CRM`,
          templateParams: [templateParam],
          // Actually attaches the property photo instead of just a text link — but this
          // only takes effect if the approved WhatsApp template has an Image header
          // component; a body-only template (like the one documented above) can't carry
          // media regardless of what's sent here, since WhatsApp ties media to the
          // template's structure, not the per-send request.
          media: mediaUrl ? { url: mediaUrl, filename: "property.jpg" } : {},
          buttons: [],
          carouselCards: [],
          location: {},
          attributes: {},
          paramsFallbackValue: {},
        }),
      });
      const raw = await res.text();
      let data: { id?: string; messageId?: string; submitted_message_id?: string; message?: string; error?: string; msg?: string } = {};
      try { data = JSON.parse(raw); } catch { /* keep raw for the error message */ }
      if (!res.ok) {
        return { status: MessageStatus.FAILED, error: data.message || data.error || data.msg || raw.slice(0, 300) || `HTTP ${res.status}` };
      }
      return { status: MessageStatus.SENT, providerMessageId: data.submitted_message_id || data.id || data.messageId };
    } catch (err) {
      return { status: MessageStatus.FAILED, error: err instanceof Error ? err.message : "Network error" };
    }
  }
}

/** Development provider: logs the message and reports it as sent. */
class MockProvider implements WhatsAppProvider {
  async sendText(toNumber: string, body: string, _contactName?: string, mediaUrl?: string): Promise<SendResult> {
    console.log(`[whatsapp:mock] to=${toNumber}${mediaUrl ? ` media=${mediaUrl}` : ""}\n${body}`);
    return { status: MessageStatus.SENT, providerMessageId: `mock-${Date.now()}` };
  }
}

/**
 * Builds the active provider from current settings on every call (cheap — these are
 * just plain classes) rather than a module-level singleton, so switching providers or
 * updating credentials from Settings → Integrations takes effect immediately without
 * a server restart.
 */
export async function sendWhatsApp(toNumber: string, body: string, contactName?: string, mediaUrl?: string): Promise<SendResult> {
  const settings = (await getIntegrationSettings()).whatsapp;
  const provider: WhatsAppProvider =
    settings.provider === "cloud" ? new CloudApiProvider(settings)
    : settings.provider === "msg91" ? new Msg91Provider(settings)
    : settings.provider === "smartping" ? new SmartPingProvider(settings)
    : new MockProvider();
  return provider.sendText(toNumber, body, contactName, mediaUrl);
}

/** Replace {{placeholders}} in a template body with values. Different callers support
 * different variable sets for the same WhatsAppTemplate.body field (manual shares fill
 * name/agent/properties; stage-automation sends fill name/agent/time) — a placeholder
 * valid in one context but typed into a template used in the other would previously
 * vanish as an empty string with no trace. Leaving the literal {{key}} in place when
 * it's not recognized at least makes the mistake visible instead of silently deleting
 * a chunk of every message sent from that template. */
export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}
