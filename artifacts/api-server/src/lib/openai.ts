/**
 * Tiny OpenAI client wrapper that uses the Replit AI Integrations proxy
 * (env vars provisioned via setupReplitAIIntegrations). No SDK dep —
 * we just call the Chat Completions API directly with fetch().
 */

const BASE = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1";
const KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Hard wall-clock cap on the upstream call; default 20s. */
  timeoutMs?: number;
}

export class OpenAIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function chatComplete(
  messages: ChatMsg[],
  opts: ChatOptions = {},
): Promise<string> {
  if (!KEY) throw new OpenAIError("OpenAI not configured", 500);

  const url = `${BASE.replace(/\/$/, "")}/chat/completions`;
  // gpt-5-* are reasoning models; reasoning tokens count against the budget,
  // so a small cap (e.g. 600) often produces an empty visible reply. The
  // ai-integrations-openai skill mandates 8192 as the floor.
  const body = {
    model: opts.model ?? "gpt-5-mini",
    messages,
    max_completion_tokens: opts.maxTokens ?? 8192,
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 20_000);
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new OpenAIError("OpenAI request timed out", 504);
    }
    throw new OpenAIError(`OpenAI fetch failed: ${err?.message || err}`, 502);
  }
  clearTimeout(timer);

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new OpenAIError(
      `OpenAI ${r.status}: ${text.slice(0, 400) || r.statusText}`,
      r.status,
    );
  }

  const j: any = await r.json();
  const out = j?.choices?.[0]?.message?.content;
  if (typeof out !== "string" || !out.trim()) {
    throw new OpenAIError("OpenAI returned empty response", 502);
  }
  return out.trim();
}

export function isOpenAIConfigured(): boolean {
  return !!KEY;
}
