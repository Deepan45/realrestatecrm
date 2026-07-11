import { badRequest } from "../lib/errors";
import { OpenAiSettings, getIntegrationSettings } from "./integrationSettings.service";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AiResponse {
  text: string;
  usage: AiUsage;
  model: string;
}

async function askOpenAi(settings: OpenAiSettings, messages: ChatMessage[]): Promise<AiResponse> {
  if (!settings.apiKey) {
    throw badRequest("AI features are not configured — set an OpenAI API key in Settings → Integrations");
  }
  const res = await fetch(settings.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.6,
    }),
  });
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?: { message: string };
  };
  if (!res.ok || data.error) {
    throw badRequest(`AI request failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw badRequest("AI returned an empty response");

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;
  return {
    text,
    model: settings.model,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens,
      estimatedCostUsd:
        (promptTokens / 1_000_000) * settings.inputPricePerMillion +
        (completionTokens / 1_000_000) * settings.outputPricePerMillion,
    },
  };
}

/** Google Gemini (generateContent) — a different request/response shape from OpenAI's
 * chat completions: the system prompt is its own top-level field rather than a message
 * with role "system", and there's no "model" role in the conversation array here since
 * this app only ever sends one system + one user message per call. */
async function askGemini(settings: OpenAiSettings, messages: ChatMessage[]): Promise<AiResponse> {
  if (!settings.geminiApiKey) {
    throw badRequest("AI features are not configured — set a Gemini API key in Settings → Integrations");
  }
  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role === "user");
  const url = `${settings.geminiApiUrl}/${settings.geminiModel}:generateContent?key=${settings.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage.content }] } } : {}),
      contents: userMessages.map((m) => ({ role: "user", parts: [{ text: m.content }] })),
    }),
  });
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    error?: { message: string };
  };
  if (!res.ok || data.error) {
    throw badRequest(`AI request failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw badRequest("AI returned an empty response");

  const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    text,
    model: settings.geminiModel,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: data.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens,
      estimatedCostUsd:
        (promptTokens / 1_000_000) * settings.geminiInputPricePerMillion +
        (completionTokens / 1_000_000) * settings.geminiOutputPricePerMillion,
    },
  };
}

/** Calls whichever AI provider is configured in Settings → Integrations (falling back to
 * env vars if never configured there). Throws a 400 if the active provider has no key
 * set, so the caller gets a clear message instead of a silent failure. */
export async function askAI(messages: ChatMessage[]): Promise<AiResponse> {
  const settings = (await getIntegrationSettings()).openai;
  return settings.provider === "gemini" ? askGemini(settings, messages) : askOpenAi(settings, messages);
}
