/**
 * AI Chat — /api/ai/chat
 * Zebvix AI trading assistant powered by Anthropic claude-haiku-4-5.
 * Provides advice on trading plans, risk management, and exchange features.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { requireAnthropic } from "@workspace/integrations-anthropic-ai";
import { z } from "zod/v4";

const router = Router();

const SYSTEM_PROMPT = `You are ZebvixAI, the official AI trading assistant for Zebvix — India's professional cryptocurrency exchange.

Your role:
- Help users choose the right AI trading plans (Low/Medium/High risk)
- Explain cryptocurrency trading concepts clearly
- Advise on risk management, portfolio diversification, and position sizing
- Answer questions about Zebvix features: Spot, Futures, P2P, Earn, Copy Trading, AI Bots
- Guide users through KYC, deposits, withdrawals, and INR payments (UPI/IMPS/NEFT)
- Explain Indian crypto regulations (PMLA 2002, FIU-IND, TDS Section 194S, VDA)

Rules:
- You are NOT a licensed financial advisor — always include a disclaimer for investment advice
- Do NOT give specific price predictions or tell users to buy/sell specific assets
- For compliance questions, direct users to compliance@zebvix.com
- For support issues, suggest opening a support ticket at /support-tickets
- Keep answers concise, friendly, and actionable
- Use INR (₹) as the primary currency when discussing amounts
- Always be helpful and professional

Platform facts:
- Zebvix has applied for FIU-IND registration under PMLA 2002 (application submitted, pending completion)
- 1% TDS applies on crypto sell transactions per Section 194S
- KYC: Level 1 (PAN), Level 2 (Aadhaar+Selfie), Level 3 (EDD)
- Spot trading: 200+ pairs | Futures: 100x leverage | P2P: escrow-protected
- Minimum deposit: ₹100 | Withdrawal limits depend on KYC level`;

const ChatBody = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(2000),
  })).min(1).max(20),
});

router.post("/ai/chat", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const { messages } = parsed.data;

  try {
    const response = await requireAnthropic().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const block = response.content[0];
    const reply = block.type === "text" ? block.text : "I apologise, I could not generate a response. Please try again.";

    res.json({ reply, usage: response.usage });
  } catch (e: any) {
    logger.error({ err: e?.message }, "AI chat error");
    if (e?.status === 429) {
      res.status(429).json({ error: "AI service is busy — please try again in a moment." });
      return;
    }
    res.status(500).json({ error: "AI service unavailable. Please try again." });
  }
});

export default router;
