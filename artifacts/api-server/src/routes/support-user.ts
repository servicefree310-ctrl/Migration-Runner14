import { Router, type IRouter, type Request } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  chatThreadsTable,
  chatMessagesTable,
  usersTable,
  kycRecordsTable,
  walletsTable,
  bankAccountsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { chatComplete, isOpenAIConfigured, type ChatMsg } from "../lib/openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ROLE_USER = "user";
const ROLE_AI = "ai";

const MAX_THREADS_PER_USER = 50;
const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY_TURNS = 12; // sliding window for AI context

// ─────────────── System prompt ───────────────────────────────────────────
const SYSTEM_BASE = `You are "Zara", the official AI support assistant for Zebvix Exchange — \
a premium crypto exchange built on the Zebvix Blockchain (chain id 7878 / 0x1ec6, \
native token ZBX, ZBX-20 standard).

You help Indian retail crypto users with their account, trading, wallets, \
deposits, withdrawals, KYC, bank linking, security/2FA, Earn (staking) products, \
referrals, and platform features. Always:

• Be concise (3–6 short sentences max unless walking through steps).
• Use clear bullet points or numbered steps when explaining a flow.
• Speak in the same language the user wrote in (English or Hinglish).
• When the user reports a transaction issue (deposit pending, withdrawal stuck, \
  KYC rejected, bank not verified), gather: the txn ID / order ID / time, the \
  amount, the symbol/coin, and the page they're on. Then explain likely cause and \
  the resolution path. If you cannot resolve from FAQ knowledge, advise opening a \
  support ticket from this same Support page (Tickets tab) so a human agent picks \
  it up.
• Never invent prices, balances, fees, or txn IDs. If you don't know, say so and \
  point to the right page in the app.

Key product knowledge (always-true facts you can cite):

KYC: 3 levels — L1 (PAN, instant), L2 (Aadhaar + selfie + address proof, ~24h \
  review), L3 (advanced for higher limits). Locked products in Earn require L2.
Bank: Only ONE verified bank per account (RBI compliance). IFSC validation, \
  small-value verification deposit. Add/remove from Account → Bank Accounts.
Withdrawals: INR via IMPS/NEFT to verified bank only. Crypto withdrawals require \
  L1+ KYC and 2FA. Network fee shown before submit. Typical settlement: INR ~30 \
  min, crypto on-chain confirmations.
Deposits: INR via UPI/IMPS through gateway. Crypto via on-chain to your unique \
  deposit address (visible in Wallet → Deposit). Always match the network exactly.
Trading fees: maker 0.10%, taker 0.10% on Spot. Futures up to 50× leverage. Fees \
  reduced by VIP tier and ZBX holdings.
Referrals: 30% lifetime commission of friend's trading fees, paid instantly to \
  spot wallet. Friend must complete KYC L1 to activate. Tiers Bronze/Silver/Gold.
Earn: subscribe ZBX/USDT/BTC etc. to flexible or locked products, view APY on \
  the Earn page. Early redeem from a locked product forfeits accrued interest.
Security: enable 2FA from Settings → Security, review active sessions, revoke \
  others if you see anything unfamiliar.
Support: this in-app chat for instant answers; ticket for issues needing manual \
  review or proof attachments.

Format rules: plain text only — no markdown headers, no code fences, no HTML. \
Use "•" or "1." for lists. Keep replies friendly and trustworthy.`;

async function buildSystemPrompt(userId: number): Promise<string> {
  // Pull a tiny, privacy-safe snapshot of the user's account so the assistant
  // can give answers like "your KYC is at level 1, here's how to upgrade".
  try {
    const [u] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        kycLevel: usersTable.kycLevel,
        vipTier: usersTable.vipTier,
        twoFaEnabled: usersTable.twoFaEnabled,
        referralCode: usersTable.referralCode,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!u) return SYSTEM_BASE;

    const [bankRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bankAccountsTable)
      .where(and(eq(bankAccountsTable.userId, userId), eq(bankAccountsTable.status, "verified")));

    const [walletRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId));

    const verifiedBank = (bankRow?.count ?? 0) > 0;
    const walletCount = walletRow?.count ?? 0;

    const ctx = `\n\nUser context (use this to personalize answers — do NOT repeat it back \
verbatim unless asked):
• Name: ${u.name || "—"}
• Member since: ${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "—"}
• KYC level achieved: L${u.kycLevel ?? 0}${(u.kycLevel ?? 0) === 0 ? " (no KYC yet — recommend starting with L1 from the KYC page)" : ""}
• 2FA: ${u.twoFaEnabled ? "ON" : "OFF — recommend enabling for crypto withdrawals"}
• Verified bank account on file: ${verifiedBank ? "YES" : "NO"}
• Wallets: ${walletCount}
• Referral code: ${u.referralCode || "—"}
• VIP tier: V${u.vipTier ?? 0}`;

    return SYSTEM_BASE + ctx;
  } catch (err) {
    logger.warn({ err }, "support: buildSystemPrompt fallback");
    return SYSTEM_BASE;
  }
}

// ─────────────── Helpers ─────────────────────────────────────────────────

function clampMessage(m: unknown): string {
  if (typeof m !== "string") return "";
  return m.trim().slice(0, MAX_MESSAGE_LEN);
}

async function generateAiReply(
  userId: number,
  threadId: number | null,
  userMessage: string,
): Promise<string> {
  if (!isOpenAIConfigured()) {
    return "AI assistant is currently unavailable. Please open a support ticket and a human agent will respond shortly.";
  }

  const system = await buildSystemPrompt(userId);
  const messages: ChatMsg[] = [{ role: "system", content: system }];

  if (threadId != null) {
    // History already includes the just-inserted user message as the tail
    // (caller inserts before calling us), so we do NOT append userMessage
    // again — that would duplicate the prompt and waste tokens.
    const history = await db
      .select({
        senderRole: chatMessagesTable.senderRole,
        message: chatMessagesTable.message,
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.threadId, threadId))
      .orderBy(desc(chatMessagesTable.id))
      .limit(MAX_HISTORY_TURNS);

    for (const m of history.reverse()) {
      messages.push({
        role: m.senderRole === ROLE_USER ? "user" : "assistant",
        content: m.message,
      });
    }
  } else {
    // Stateless caller: just the system + the new user turn.
    messages.push({ role: "user", content: userMessage });
  }

  try {
    const reply = await chatComplete(messages);
    return reply;
  } catch (err: any) {
    logger.error({ err: err?.message, status: err?.status }, "support: AI generation failed");
    return "Sorry, I'm having trouble reaching the AI right now. Please try again in a moment, or create a support ticket and a human agent will follow up.";
  }
}

// ─────────────── FAQ (static, public) ─────────────────────────────────────

const FAQS = [
  {
    category: "KYC",
    icon: "shield-check",
    questions: [
      { q: "How do I complete KYC verification?", a: "Open Account → KYC. Submit Level 1 (PAN — instant), then Level 2 (Aadhaar + selfie + address — ~24h review). Higher levels unlock higher limits." },
      { q: "Why was my KYC rejected?", a: "Common reasons: blurry document photo, name mismatch with PAN, expired ID, or selfie doesn't match. Re-submit with clear photos in good light." },
      { q: "How long does KYC review take?", a: "Level 1 (PAN) is instant. Level 2 takes up to 24 hours. Level 3 may take 48 hours." },
    ],
  },
  {
    category: "Bank",
    icon: "landmark",
    questions: [
      { q: "How do I add a bank account?", a: "Account → Bank Accounts → Add Bank. Enter IFSC, account number, and account holder name (must match KYC name). We send a small verification deposit." },
      { q: "Can I add multiple bank accounts?", a: "Per RBI compliance, only ONE verified bank account is allowed per user at a time. You can remove the existing one to add a new one." },
      { q: "Bank verification is taking too long. What do I do?", a: "Verification deposit usually arrives within 30 minutes. If 24h has passed, open a support ticket with the bank statement showing your account activity." },
    ],
  },
  {
    category: "Deposit",
    icon: "arrow-down-circle",
    questions: [
      { q: "How do I deposit INR?", a: "Wallet → Deposit → INR. Use UPI or IMPS. Funds usually credit within 5 minutes." },
      { q: "How do I deposit crypto?", a: "Wallet → Deposit → Choose coin → Choose network. Send to the shown address. Match the network exactly (BEP-20 ≠ ERC-20)." },
      { q: "My deposit is not showing up. What now?", a: "Crypto needs network confirmations (BTC ~30 min, ETH ~3 min). For INR, check the gateway reference. If 1h+ has passed, open a ticket with the txn hash / UTR." },
    ],
  },
  {
    category: "Withdraw",
    icon: "arrow-up-circle",
    questions: [
      { q: "How do I withdraw INR?", a: "Wallet → Withdraw → INR. Funds go to your verified bank only. IMPS settles in ~30 minutes during banking hours." },
      { q: "How do I withdraw crypto?", a: "Wallet → Withdraw → Choose coin → Choose network → Enter address + amount → Confirm with 2FA. Network fee is shown upfront." },
      { q: "Why is my withdrawal pending?", a: "Crypto withdrawals first wait for an internal security check, then on-chain broadcast. INR withdrawals follow bank cut-off times (NEFT/IMPS hours)." },
    ],
  },
  {
    category: "Trading",
    icon: "trending-up",
    questions: [
      { q: "What are the trading fees?", a: "Spot: 0.10% maker / 0.10% taker. Futures: up to 50× leverage with tiered fees. VIP tier and ZBX holdings reduce fees further." },
      { q: "How do I place a limit order?", a: "Trade → choose pair → Limit tab → enter price and amount → Buy/Sell. Order shows in your Open Orders until filled or cancelled." },
      { q: "Why can't I trade futures?", a: "Futures requires KYC Level 2 and a small initial margin in your futures wallet. Transfer USDT from Spot → Futures from the Wallet page." },
    ],
  },
  {
    category: "Earn",
    icon: "coins",
    questions: [
      { q: "How do I earn interest on my crypto?", a: "Earn page → choose product → Subscribe. Flexible products are redeemable any time; locked products give higher APY but lock funds for the chosen term." },
      { q: "Can I redeem early from a locked product?", a: "Yes, but you forfeit accrued interest and may pay a small early-redemption fee. The exact penalty is shown in the redeem dialog." },
    ],
  },
  {
    category: "Invite",
    icon: "gift",
    questions: [
      { q: "How does the referral program work?", a: "Share your referral code or link from the Invite page. When friends sign up and complete KYC, you earn 30% of their trading fees — paid instantly, for life." },
      { q: "When do referral commissions get paid?", a: "Instantly. Every time your invitee places a trade, your share is credited to your spot wallet in real-time." },
      { q: "Is there a limit on invites or earnings?", a: "No cap. Tiers (Bronze/Silver/Gold) auto-upgrade as your KYC-verified invitee count grows." },
    ],
  },
  {
    category: "Security",
    icon: "lock",
    questions: [
      { q: "How do I enable 2FA?", a: "Settings → Security → Enable 2FA. Scan the QR with Google Authenticator / Authy and enter the code. Save your backup codes." },
      { q: "I see an unknown active session. What do I do?", a: "Settings → Security → Sessions → Revoke other sessions. Immediately change your password and enable 2FA if you haven't already." },
      { q: "I forgot my password. How do I reset it?", a: "Login → Forgot password. We send a reset link to your registered email. Always verify the link domain before clicking." },
    ],
  },
  {
    category: "Account",
    icon: "user",
    questions: [
      { q: "How do I change my email?", a: "Settings → Account. Email change requires identity verification — contact support via ticket if you've lost access." },
      { q: "How do I delete my account?", a: "Account closure requires zero balance and no open positions. Open a support ticket and an agent will guide you through KYC re-verification before closure." },
    ],
  },
];

router.get("/support/faqs", async (_req, res): Promise<void> => {
  res.json({ items: FAQS });
});

// ─────────────── Stateless quick AI chat (floating widget) ────────────────
router.post("/support/ai-chat", requireAuth, async (req: Request, res): Promise<void> => {
  const userId = req.user!.id;
  const message = clampMessage(req.body?.message);
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  // Optional client-supplied short history so the widget can keep context
  // across messages without persisting a thread.
  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const history: ChatMsg[] = rawHistory
    .slice(-MAX_HISTORY_TURNS)
    .map((m: any): ChatMsg | null => {
      const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
      const content = clampMessage(m?.content);
      if (!role || !content) return null;
      return { role, content };
    })
    .filter((m: ChatMsg | null): m is ChatMsg => m !== null);

  if (!isOpenAIConfigured()) {
    res.json({
      reply: "AI assistant is currently unavailable. Please open a support ticket from the Support page and a human agent will respond shortly.",
      configured: false,
    });
    return;
  }

  const system = await buildSystemPrompt(userId);
  // If the client already included the latest user turn at the tail of
  // `history`, drop it so we don't double-send.
  const tail = history[history.length - 1];
  const dedupedHistory =
    tail && tail.role === "user" && tail.content === message
      ? history.slice(0, -1)
      : history;
  const messages: ChatMsg[] = [
    { role: "system", content: system },
    ...dedupedHistory,
    { role: "user", content: message },
  ];

  try {
    const reply = await chatComplete(messages);
    res.json({ reply, configured: true });
  } catch (err: any) {
    logger.error({ err: err?.message, status: err?.status }, "support: ai-chat failed");
    res.status(502).json({
      error: "AI temporarily unavailable",
      reply: "Sorry, I'm having trouble reaching the AI right now. Please try again in a moment, or create a support ticket and a human agent will follow up.",
    });
  }
});

// ─────────────── Threads ──────────────────────────────────────────────────
router.get("/support/threads", requireAuth, async (req: Request, res): Promise<void> => {
  const userId = req.user!.id;
  const rows = await db
    .select({
      id: chatThreadsTable.id,
      subject: chatThreadsTable.subject,
      status: chatThreadsTable.status,
      lastMessageAt: chatThreadsTable.lastMessageAt,
      createdAt: chatThreadsTable.createdAt,
    })
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.userId, userId))
    .orderBy(desc(chatThreadsTable.lastMessageAt))
    .limit(MAX_THREADS_PER_USER);

  // Attach last-message preview + unread (last sender != user) flag in one go
  const ids = rows.map((r) => r.id);
  const lastMsgByThread = new Map<number, { message: string; senderRole: string; createdAt: Date }>();
  if (ids.length > 0) {
    const lastMsgs = await db.execute<{
      thread_id: number;
      message: string;
      sender_role: string;
      created_at: Date;
    }>(sql`
      SELECT DISTINCT ON (thread_id) thread_id, message, sender_role, created_at
      FROM chat_messages
      WHERE thread_id = ANY(${ids})
      ORDER BY thread_id, created_at DESC
    `);
    for (const m of lastMsgs.rows ?? []) {
      lastMsgByThread.set(m.thread_id, {
        message: m.message,
        senderRole: m.sender_role,
        createdAt: m.created_at,
      });
    }
  }

  res.json({
    items: rows.map((r) => {
      const last = lastMsgByThread.get(r.id);
      return {
        id: r.id,
        subject: r.subject,
        status: r.status,
        lastMessageAt: r.lastMessageAt,
        createdAt: r.createdAt,
        lastMessage: last?.message ?? "",
        lastSenderRole: last?.senderRole ?? "",
      };
    }),
  });
});

router.post("/support/threads", requireAuth, async (req: Request, res): Promise<void> => {
  const userId = req.user!.id;
  const subject = clampMessage(req.body?.subject) || "Support";
  const message = clampMessage(req.body?.message);
  if (!message) {
    res.status(400).json({ error: "Initial message is required" });
    return;
  }

  // Cap per-user thread count (prevent spam)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatThreadsTable)
    .where(and(eq(chatThreadsTable.userId, userId), eq(chatThreadsTable.status, "open")));
  if ((count ?? 0) >= MAX_THREADS_PER_USER) {
    res.status(429).json({ error: "Too many open tickets. Please close some before opening new ones." });
    return;
  }

  const [thread] = await db
    .insert(chatThreadsTable)
    .values({ userId, subject: subject.slice(0, 200), status: "open" })
    .returning();

  await db.insert(chatMessagesTable).values({
    threadId: thread.id,
    senderId: userId,
    senderRole: ROLE_USER,
    message,
  });

  // Auto AI reply (best-effort — never block ticket creation)
  const aiReply = await generateAiReply(userId, thread.id, message);
  await db.insert(chatMessagesTable).values({
    threadId: thread.id,
    senderId: 0,
    senderRole: ROLE_AI,
    message: aiReply,
  });
  await db
    .update(chatThreadsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatThreadsTable.id, thread.id));

  res.status(201).json({ id: thread.id, subject: thread.subject });
});

router.get("/support/threads/:id", requireAuth, async (req: Request, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [thread] = await db
    .select()
    .from(chatThreadsTable)
    .where(and(eq(chatThreadsTable.id, id), eq(chatThreadsTable.userId, userId)))
    .limit(1);
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const messages = await db
    .select({
      id: chatMessagesTable.id,
      senderRole: chatMessagesTable.senderRole,
      message: chatMessagesTable.message,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, id))
    .orderBy(chatMessagesTable.id);
  res.json({
    id: thread.id,
    subject: thread.subject,
    status: thread.status,
    createdAt: thread.createdAt,
    lastMessageAt: thread.lastMessageAt,
    messages,
  });
});

router.post("/support/threads/:id/messages", requireAuth, async (req: Request, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  const message = clampMessage(req.body?.message);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const [thread] = await db
    .select({ id: chatThreadsTable.id, status: chatThreadsTable.status })
    .from(chatThreadsTable)
    .where(and(eq(chatThreadsTable.id, id), eq(chatThreadsTable.userId, userId)))
    .limit(1);
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (thread.status === "closed") {
    res.status(409).json({ error: "Ticket is closed. Please open a new one." });
    return;
  }

  await db.insert(chatMessagesTable).values({
    threadId: id,
    senderId: userId,
    senderRole: ROLE_USER,
    message,
  });

  const aiReply = await generateAiReply(userId, id, message);
  const [aiRow] = await db
    .insert(chatMessagesTable)
    .values({
      threadId: id,
      senderId: 0,
      senderRole: ROLE_AI,
      message: aiReply,
    })
    .returning();
  await db
    .update(chatThreadsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatThreadsTable.id, id));

  res.json({
    aiReply: {
      id: aiRow.id,
      senderRole: aiRow.senderRole,
      message: aiRow.message,
      createdAt: aiRow.createdAt,
    },
  });
});

router.post("/support/threads/:id/close", requireAuth, async (req: Request, res): Promise<void> => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db
    .update(chatThreadsTable)
    .set({ status: "closed" })
    .where(and(eq(chatThreadsTable.id, id), eq(chatThreadsTable.userId, userId)))
    .returning({ id: chatThreadsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
