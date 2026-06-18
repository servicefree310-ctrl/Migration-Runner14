import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, or, inArray, sql } from "drizzle-orm";
import { z, type ZodSchema } from "zod";
import { db, usersTable, loginLogsTable, walletsTable, coinsTable, settingsTable, otpCodesTable, referralsTable } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  readSessionCookie,
  generateReferralCode,
  generateUid,
  sanitizeUser,
  SESSION_COOKIE,
} from "../lib/auth";
import { requireAuth } from "../middlewares/auth";
import { consumeVerifiedOtp, dispatchOtp } from "./otp";
import {
  issueChallenge,
  getChallenge,
  consumeChallenge,
  maskEmail,
  maskPhone,
  type AuthChallengePurpose,
} from "../lib/auth-challenge";
import { sendWelcomeEmail } from "../lib/email";
import { loadReferralConfig } from "./admin-referrals";
import { screenOnboarding } from "../lib/sanctions";

const router: IRouter = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────
// We validate explicitly (and lowercase email up-front) so the route bodies
// can trust their inputs and we return clean 400s instead of 500s on bad
// payloads. .strict() rejects unknown keys to harden against mass-assignment.
const RegisterBody = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  phone: z.string().trim().min(7).max(20).optional().or(z.literal("").transform(() => undefined)),
  name: z.string().trim().max(100).optional().or(z.literal("").transform(() => undefined)),
  referralCode: z.string().trim().max(32).optional().or(z.literal("").transform(() => undefined)),
}).strict();

const LoginBody = z.object({
  // login accepts either an email or a phone in the same field
  email: z.string().trim().min(3, "Email or phone required").max(120),
  password: z.string().min(1, "Password required").max(128),
}).strict();

const VerifyBody = z.object({
  challengeToken: z.string().min(16).max(200),
  emailOtpId: z.union([z.number(), z.string()]).optional(),
  phoneOtpId: z.union([z.number(), z.string()]).optional(),
  twoFaOtpId: z.union([z.number(), z.string()]).optional(),
}).strict();

function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path?.join(".") || "body";
      res.status(400).json({
        error: first?.message || "Invalid request",
        field,
        // expose all issues for richer client-side form feedback
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

const COOKIE_OPTS = {
  httpOnly: true,
  // strict: cookie is never sent on cross-site requests — the strongest
  // built-in CSRF defense. Combined with the originGuard middleware in
  // app.ts this gives belt-and-braces protection. All our web clients
  // (admin, user-portal, flutter web) are same-site to the API, so this
  // is safe. Mobile Expo uses Bearer tokens via the bicrypto adapter and
  // is unaffected by cookie SameSite.
  sameSite: "strict" as const,
  path: "/",
  maxAge: 14 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === "production",
};

// ─── Auth policy (admin-controlled OTP/2FA toggles) ─────────────────────
// Public endpoint so the signup/login UI can ask "what factors do I need
// to collect?" before the user submits the form. Returns plain booleans
// derived from the settings table (key=value strings).
const POLICY_KEYS = [
  "auth.signup_email_otp",
  "auth.signup_phone_otp",
  "auth.login_email_otp",
  "auth.login_phone_otp",
] as const;

type PolicyKey = (typeof POLICY_KEYS)[number];

async function loadAuthPolicy(): Promise<Record<PolicyKey, boolean>> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(inArray(settingsTable.key, POLICY_KEYS as unknown as string[]));
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  const on = (k: PolicyKey) => String(m[k] ?? "off").toLowerCase() === "on";
  return {
    "auth.signup_email_otp": on("auth.signup_email_otp"),
    "auth.signup_phone_otp": on("auth.signup_phone_otp"),
    "auth.login_email_otp": on("auth.login_email_otp"),
    "auth.login_phone_otp": on("auth.login_phone_otp"),
  };
}

router.get("/auth/policy", async (_req, res): Promise<void> => {
  const p = await loadAuthPolicy();
  res.json({
    signup: {
      emailOtp: p["auth.signup_email_otp"],
      phoneOtp: p["auth.signup_phone_otp"],
    },
    login: {
      emailOtp: p["auth.login_email_otp"],
      phoneOtp: p["auth.login_phone_otp"],
    },
  });
});

// ─── Helper: build the "requires" map for a given user + purpose ────────
function buildRequires(opts: {
  purpose: AuthChallengePurpose;
  policy: Record<PolicyKey, boolean>;
  user: { phone: string | null; loginEmailOtpEnabled?: boolean; loginPhoneOtpEnabled?: boolean; twoFaEnabled?: boolean; emailVerified?: boolean; phoneVerified?: boolean };
}): { email: boolean; phone: boolean; twofa: boolean } {
  const { purpose, policy, user } = opts;
  if (purpose === "signup") {
    // At signup we only verify ownership of the contact channel. 2FA isn't
    // applicable yet (user just created the account). If admin requires
    // phone OTP but the user didn't provide a phone, we skip phone since
    // they cannot satisfy it — admin can re-enforce later via /security.
    return {
      email: policy["auth.signup_email_otp"] && !user.emailVerified,
      phone: policy["auth.signup_phone_otp"] && !!user.phone && !user.phoneVerified,
      twofa: false,
    };
  }
  // login. Note we DO NOT silently drop a globally-required phone factor
  // when the user has no phone on file — that would let users bypass the
  // admin policy. Instead /auth/login below detects the unsatisfiable case
  // and returns a clear 403 telling the user to add+verify a phone first.
  return {
    email: policy["auth.login_email_otp"] || !!user.loginEmailOtpEnabled,
    phone: policy["auth.login_phone_otp"] || !!user.loginPhoneOtpEnabled,
    twofa: !!user.twoFaEnabled,
  };
}

router.post("/auth/register", validate(RegisterBody), async (req, res): Promise<void> => {
  const { email, phone, password, name, referralCode } = req.body as z.infer<typeof RegisterBody>;

  // Pre-flight: if admin requires phone OTP at signup, the user MUST supply
  // a phone — otherwise we'd silently let them bypass the policy.
  const policyPre = await loadAuthPolicy();
  if (policyPre["auth.signup_phone_otp"] && !phone) {
    res.status(400).json({
      error: "Phone number is required to sign up. Please add a phone number and try again.",
      field: "phone",
      code: "phone_required_by_policy",
    });
    return;
  }

  // PMLA 2002 / FIU-IND: sanctions screening at onboarding
  const sanctionsResult = screenOnboarding({ name: name || "" });
  if (sanctionsResult.riskLevel === "blocked") {
    res.status(403).json({
      error: "Account creation denied. Please contact compliance@zebvix.com.",
      code: "sanctions_blocked",
    });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, email), phone ? eq(usersTable.phone, phone) : eq(usersTable.email, email)))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "User already exists" });
    return;
  }
  let referredBy: number | null = null;
  if (referralCode) {
    const [r] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1);
    if (r) referredBy = r.id;
  }
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      phone: phone || null,
      passwordHash,
      name: name || "",
      referralCode: generateReferralCode(),
      uid: generateUid(),
      referredBy,
      role: "user",
    })
    .returning();
  if (!user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  // Initialize INR + USDT spot wallets at zero
  const inrCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "INR")).limit(1);
  const usdtCoin = await db.select().from(coinsTable).where(eq(coinsTable.symbol, "USDT")).limit(1);
  const inits = [];
  if (inrCoin[0]) {
    inits.push({ userId: user.id, walletType: "inr", coinId: inrCoin[0].id, balance: "0" });
    inits.push({ userId: user.id, walletType: "spot", coinId: inrCoin[0].id, balance: "0" });
  }
  if (usdtCoin[0]) {
    inits.push({ userId: user.id, walletType: "spot", coinId: usdtCoin[0].id, balance: "0" });
  }
  if (inits.length) await db.insert(walletsTable).values(inits);

  // ── Registration referral: insert a PENDING row — bonus is credited later
  // only after the referred user completes KYC Level 1 AND makes a qualifying
  // deposit (≥10 USDT or ≥₹1000 INR). checkAndCreditRegistrationBonus() is
  // called fire-and-forget from the KYC-approval and deposit-approval routes.
  if (referredBy) {
    db.insert(referralsTable).values({
      referrerId:    referredBy,
      referredId:    user.id,
      bonusCredited: false,
      bonusAmount:   "0",
      commissionRate: "0",
      level:         1,
      sourceType:    "registration",
    }).catch(() => null);
  }

  // Fire-and-forget welcome email (non-blocking)
  if (user.email) {
    sendWelcomeEmail(user.email, { name: user.name }).catch(() => {});
  }

  // If admin requires email or phone OTP at signup, gate session creation
  // behind a verification challenge. Otherwise sign the user in immediately.
  const policy = await loadAuthPolicy();
  const requires = buildRequires({ purpose: "signup", policy, user });
  if (requires.email || requires.phone) {
    const ch = issueChallenge({
      userId: user.id,
      purpose: "signup",
      requires,
      recipientEmail: user.email,
      recipientPhone: user.phone,
    });
    res.status(202).json({
      challenge: {
        token: ch.token,
        purpose: "signup",
        requires,
        maskedEmail: maskEmail(user.email),
        maskedPhone: maskPhone(user.phone),
        email: user.email,        // signup: client already knows the email; safe to echo
        phone: user.phone,
      },
    });
    return;
  }

  const token = await createSession(user.id, req);
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
  res.status(201).json({ user: sanitizeUser(user), token });
});

router.post("/auth/login", validate(LoginBody), async (req, res): Promise<void> => {
  const { email, password } = req.body as z.infer<typeof LoginBody>;
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.email, email), eq(usersTable.phone, email)))
    .limit(1);

  if (!user) {
    await db.insert(loginLogsTable).values({ email, ip, userAgent: ua, success: "false", reason: "no_user" });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await db.insert(loginLogsTable).values({ userId: user.id, email, ip, userAgent: ua, success: "false", reason: "bad_password" });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.status !== "active") {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  // Compute multi-factor requirements (admin policy + user prefs + 2FA).
  // If anything is required, return a challenge instead of a session — the
  // caller must complete /auth/login/verify to receive the cookie.
  const policy = await loadAuthPolicy();
  const requires = buildRequires({ purpose: "login", policy, user });

  // Unsatisfiable requirement guard: if the admin (or user pref) demands a
  // factor we have no recipient for, refuse with a clear, actionable error
  // instead of issuing a challenge the user can never complete.
  if (requires.phone && !user.phone) {
    await db.insert(loginLogsTable).values({
      userId: user.id, email, ip, userAgent: ua, success: "false", reason: "mfa_no_phone",
    });
    res.status(403).json({
      error: "Phone OTP is required to sign in but no phone number is on file. Please contact support to add one.",
      code: "phone_required_no_phone",
    });
    return;
  }
  if (requires.email || requires.phone || requires.twofa) {
    const ch = issueChallenge({
      userId: user.id,
      purpose: "login",
      requires,
      recipientEmail: user.email,
      recipientPhone: user.phone,
    });
    await db.insert(loginLogsTable).values({
      userId: user.id, email, ip, userAgent: ua, success: "false", reason: "mfa_required",
    });
    res.status(202).json({
      challenge: {
        token: ch.token,
        purpose: "login",
        requires,
        maskedEmail: maskEmail(user.email),
        maskedPhone: maskPhone(user.phone),
      },
    });
    return;
  }

  await db.insert(loginLogsTable).values({ userId: user.id, email, ip, userAgent: ua, success: "true" });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  const token = await createSession(user.id, req);
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
  res.json({ user: sanitizeUser(user), token });
});

// ─── /auth/challenge/send — server-driven OTP send for a challenge ──────
// The signup/login UI no longer chooses recipients; it asks the server to
// dispatch an OTP for a specific factor of an open challenge. The server
// resolves the recipient from the challenge it issued, so the user can't
// be tricked (or stuck) by client-side state — and we don't need to expose
// the user's full email/phone before they're authenticated.
router.post("/auth/challenge/send", async (req, res): Promise<void> => {
  const { challengeToken, factor } = (req.body ?? {}) as {
    challengeToken?: string;
    factor?: "email" | "phone" | "twofa";
  };
  if (!challengeToken || (factor !== "email" && factor !== "phone" && factor !== "twofa")) {
    res.status(400).json({ error: "challengeToken and factor=email|phone|twofa required" });
    return;
  }
  const ch = getChallenge(challengeToken);
  if (!ch) {
    res.status(410).json({ error: "Verification expired — please sign in again" });
    return;
  }
  if (!ch.requires[factor]) {
    res.status(400).json({ error: `${factor} OTP is not required for this sign-in` });
    return;
  }

  const channel: "email" | "sms" = factor === "phone" ? "sms" : "email";
  // 2FA always goes via email in our current setup.
  const recipient = factor === "phone" ? ch.recipientPhone : ch.recipientEmail;
  if (!recipient) {
    res.status(400).json({ error: `No ${factor === "phone" ? "phone" : "email"} on file for this account` });
    return;
  }
  const purpose: "signup" | "login" | "2fa" =
    factor === "twofa" ? "2fa" : ch.purpose === "signup" ? "signup" : "login";

  const r = await dispatchOtp({ channel, purpose, recipient, log: req.log });
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  const { ok, ...payload } = r;
  void ok;
  res.json(payload);
});

// ─── /auth/login/verify — finishes a login challenge ─────────────────────
router.post("/auth/login/verify", validate(VerifyBody), async (req, res): Promise<void> => {
  const { challengeToken, emailOtpId, phoneOtpId, twoFaOtpId } = req.body as z.infer<typeof VerifyBody>;
  const ch = getChallenge(challengeToken);
  if (!ch || ch.purpose !== "login") {
    res.status(410).json({ error: "Verification expired — please sign in again" });
    return;
  }

  // For each required factor, the caller must supply a verified OTP id.
  if (ch.requires.email && !emailOtpId) { res.status(400).json({ error: "Email OTP required" }); return; }
  if (ch.requires.phone && !phoneOtpId) { res.status(400).json({ error: "Phone OTP required" }); return; }
  if (ch.requires.twofa && !twoFaOtpId) { res.status(400).json({ error: "2FA code required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, ch.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  try {
    await db.transaction(async (tx) => {
      if (ch.requires.email) {
        const r = await consumeVerifiedOtp({ otpId: Number(emailOtpId), purpose: "login", userId: user.id, recipient: ch.recipientEmail || undefined, tx });
        if (!r.ok) { const e: any = new Error(`Email OTP: ${r.error}`); e.code = 400; throw e; }
      }
      if (ch.requires.phone) {
        const r = await consumeVerifiedOtp({ otpId: Number(phoneOtpId), purpose: "login", userId: user.id, recipient: ch.recipientPhone || undefined, tx });
        if (!r.ok) { const e: any = new Error(`Phone OTP: ${r.error}`); e.code = 400; throw e; }
      }
      if (ch.requires.twofa) {
        const r = await consumeVerifiedOtp({ otpId: Number(twoFaOtpId), purpose: "2fa", userId: user.id, tx });
        if (!r.ok) { const e: any = new Error(`2FA: ${r.error}`); e.code = 400; throw e; }
      }
    });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }

  consumeChallenge(challengeToken);

  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;
  await db.insert(loginLogsTable).values({ userId: user.id, email: user.email, ip, userAgent: ua, success: "true", reason: "mfa_ok" });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  const sessToken = await createSession(user.id, req);
  res.cookie(SESSION_COOKIE, sessToken, COOKIE_OPTS);
  res.json({ user: sanitizeUser(user), token: sessToken });
});

// ─── /auth/register/verify — finishes a signup challenge ─────────────────
router.post("/auth/register/verify", validate(VerifyBody), async (req, res): Promise<void> => {
  const { challengeToken, emailOtpId, phoneOtpId } = req.body as z.infer<typeof VerifyBody>;
  const ch = getChallenge(challengeToken);
  if (!ch || ch.purpose !== "signup") {
    res.status(410).json({ error: "Verification expired — please sign up again" });
    return;
  }
  if (ch.requires.email && !emailOtpId) { res.status(400).json({ error: "Email OTP required" }); return; }
  if (ch.requires.phone && !phoneOtpId) { res.status(400).json({ error: "Phone OTP required" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, ch.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  try {
    await db.transaction(async (tx) => {
      const upd: Record<string, unknown> = { updatedAt: new Date() };
      if (ch.requires.email) {
        const r = await consumeVerifiedOtp({ otpId: Number(emailOtpId), purpose: "signup", userId: user.id, recipient: ch.recipientEmail || undefined, tx });
        if (!r.ok) { const e: any = new Error(`Email OTP: ${r.error}`); e.code = 400; throw e; }
        upd.emailVerified = true;
      }
      if (ch.requires.phone) {
        const r = await consumeVerifiedOtp({ otpId: Number(phoneOtpId), purpose: "signup", userId: user.id, recipient: ch.recipientPhone || undefined, tx });
        if (!r.ok) { const e: any = new Error(`Phone OTP: ${r.error}`); e.code = 400; throw e; }
        upd.phoneVerified = true;
      }
      await tx.update(usersTable).set(upd).where(eq(usersTable.id, user.id));
    });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }

  consumeChallenge(challengeToken);
  const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, ch.userId)).limit(1);
  const sessToken = await createSession(ch.userId, req);
  res.cookie(SESSION_COOKIE, sessToken, COOKIE_OPTS);
  res.status(201).json({ user: sanitizeUser(fresh ?? user), token: sessToken });
});

/**
 * POST /auth/verify-contact
 * Authenticated — verifies an OTP code and marks emailVerified / phoneVerified on the user.
 * Body: { channel: "email"|"sms", otpId: number, code: string }
 */
router.post("/auth/verify-contact", requireAuth, async (req, res): Promise<void> => {
  const { channel, otpId, code } = req.body ?? {};
  if (!channel || !otpId || !code) {
    res.status(400).json({ error: "channel, otpId and code are required" });
    return;
  }
  if (channel !== "email" && channel !== "sms") {
    res.status(400).json({ error: "channel must be 'email' or 'sms'" });
    return;
  }

  const MAX_ATT = 5;
  const [row] = await db.select().from(otpCodesTable).where(eq(otpCodesTable.id, Number(otpId))).limit(1);
  if (!row) { res.status(404).json({ error: "OTP not found" }); return; }
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: "OTP expired — request a new one" }); return;
  }
  if (row.attempts >= MAX_ATT) {
    res.status(429).json({ error: "Too many attempts — request a new code" }); return;
  }

  // Hash the submitted code and compare
  const { createHash, randomInt: _r } = await import("crypto");
  void _r;
  const submitted = createHash("sha256").update(String(code).trim()).digest("hex");
  if (submitted !== row.code) {
    await db.update(otpCodesTable)
      .set({ attempts: sql`${otpCodesTable.attempts} + 1` })
      .where(eq(otpCodesTable.id, row.id));
    res.status(400).json({ error: "Incorrect code", attemptsLeft: MAX_ATT - row.attempts - 1 });
    return;
  }

  // Mark OTP consumed
  await db.update(otpCodesTable).set({ verifiedAt: new Date(), expiresAt: new Date(0) }).where(eq(otpCodesTable.id, row.id));

  // Update user verification flag
  const userId = req.user!.id;
  const upd = channel === "email"
    ? { emailVerified: true, updatedAt: new Date() }
    : { phoneVerified: true, updatedAt: new Date() };
  await db.update(usersTable).set(upd).where(eq(usersTable.id, userId));

  const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  res.json({ ok: true, user: sanitizeUser(fresh!) });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = readSessionCookie(req);
  await destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json({ user: sanitizeUser(req.user!) });
});

export default router;
