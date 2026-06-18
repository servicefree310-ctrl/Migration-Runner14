import Anthropic from "@anthropic-ai/sdk";

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
const apiKey  =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  null;

export const anthropic: Anthropic | null =
  apiKey
    ? new Anthropic({ apiKey, baseURL })
    : null;

export function requireAnthropic(): Anthropic {
  if (!anthropic) {
    throw new Error(
      "Anthropic AI integration is not configured. Set ANTHROPIC_API_KEY (or AI_INTEGRATIONS_ANTHROPIC_API_KEY).",
    );
  }
  return anthropic;
}
