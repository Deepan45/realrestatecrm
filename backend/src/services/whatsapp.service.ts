import { MessageStatus } from "@prisma/client";
import { env } from "../config/env";

export interface SendResult {
  status: MessageStatus;
  providerMessageId?: string;
  error?: string;
}

export interface WhatsAppProvider {
  sendText(toNumber: string, body: string): Promise<SendResult>;
}

/** WhatsApp Cloud API (Meta Graph API) provider. */
class CloudApiProvider implements WhatsAppProvider {
  async sendText(toNumber: string, body: string): Promise<SendResult> {
    const url = `${env.whatsapp.apiUrl}/${env.whatsapp.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toNumber.replace(/[^\d+]/g, ""),
          type: "text",
          text: { body },
        }),
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

/** Development provider: logs the message and reports it as sent. */
class MockProvider implements WhatsAppProvider {
  async sendText(toNumber: string, body: string): Promise<SendResult> {
    console.log(`[whatsapp:mock] to=${toNumber}\n${body}`);
    return { status: MessageStatus.SENT, providerMessageId: `mock-${Date.now()}` };
  }
}

export const whatsappProvider: WhatsAppProvider =
  env.whatsapp.provider === "cloud" ? new CloudApiProvider() : new MockProvider();

/** Replace {{placeholders}} in a template body with values. */
export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
