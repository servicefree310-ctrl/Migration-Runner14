import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { consumeVerifiedOtp } from "./otp";

const router: IRouter = Router();

router.get("/security/me", requireAuth, async (req, res): Promise<void> => {
  const u = req.user!;
  const sessions = await db.select({
    id: sessionsTable.id, createdAt: sessionsTable.createdAt, expiresAt: sessionsTable.expiresAt,
    ip: sessionsTable.ip, userAgent: sessionsTable.userAgent,
  }).from(sessionsTable).where(eq(sessionsTable.userId, u.id)).orderBy(desc(sessionsTable.createdAt)).limit(20);
  res.json({
    twoFaEnabled: u.twoFaEnabled,
    loginEmailOtpEnabled: u.loginEmailOtpEnabled,
    loginPhoneOtpEnabled: u.loginPhoneOtpEnabled,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    hasPhone: !!u.phone,
    activeSessions: sessions.length,
    sessions,
  });
});

// ─── Per-user login preferences ────────────────────────────────────────
// Users can opt into email/phone OTP at login on top of the admin-enforced
// global policy. We deliberately don't require an OTP to flip these — the
// user is already authenticated via session and these are protective
// (turning them ON cannot lock anyone else out; turning them OFF does not
// remove admin-enforced factors). 2FA continues to use its own dedicated
// enable/disable endpoints because that's a stronger guard.
router.patch("/security/login-prefs", requireAuth, async (req, res): Promise<void> => {
  const u = req.user!;
  const { loginEmailOtpEnabled, loginPhoneOtpEnabled } = req.body ?? {};
  const upd: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof loginEmailOtpEnabled === "boolean") {
    // Only allow opting INTO email OTP if the user actually has a verified
    // email — otherwise we'd lock them out at the next login. They can
    // always opt OUT regardless (turning a factor off can never lock anyone).
    if (loginEmailOtpEnabled && !u.emailVerified) {
      res.status(400).json({ error: "Verify your email first to enable email OTP at login" });
      return;
    }
    upd.loginEmailOtpEnabled = loginEmailOtpEnabled;
  }
  if (typeof loginPhoneOtpEnabled === "boolean") {
    // Same guard for phone — must be present AND verified to enable.
    if (loginPhoneOtpEnabled && (!u.phone || !u.phoneVerified)) {
      res.status(400).json({ error: "Add and verify a phone number first to enable phone OTP at login" });
      return;
    }
    upd.loginPhoneOtpEnabled = loginPhoneOtpEnabled;
  }
  if (Object.keys(upd).length === 1) { res.status(400).json({ error: "Nothing to update" }); return; }
  await db.update(usersTable).set(upd).where(eq(usersTable.id, u.id));
  res.json({
    ok: true,
    loginEmailOtpEnabled: typeof upd.loginEmailOtpEnabled === "boolean" ? upd.loginEmailOtpEnabled : u.loginEmailOtpEnabled,
    loginPhoneOtpEnabled: typeof upd.loginPhoneOtpEnabled === "boolean" ? upd.loginPhoneOtpEnabled : u.loginPhoneOtpEnabled,
  });
});

router.post("/security/2fa/enable", requireAuth, async (req, res): Promise<void> => {
  const u = req.user!;
  const { otpId } = req.body ?? {};
  if (!otpId) { res.status(400).json({ error: "OTP verification required" }); return; }
  try {
    await db.transaction(async (tx) => {
      const r = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "2fa", userId: u.id, tx });
      if (!r.ok) { const e: any = new Error(r.error); e.code = 400; throw e; }
      await tx.update(usersTable).set({ twoFaEnabled: true, updatedAt: new Date() }).where(eq(usersTable.id, u.id));
    });
    res.json({ ok: true, twoFaEnabled: true });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.post("/security/2fa/disable", requireAuth, async (req, res): Promise<void> => {
  const u = req.user!;
  const { otpId } = req.body ?? {};
  if (!otpId) { res.status(400).json({ error: "OTP verification required" }); return; }
  try {
    await db.transaction(async (tx) => {
      const r = await consumeVerifiedOtp({ otpId: Number(otpId), purpose: "2fa", userId: u.id, tx });
      if (!r.ok) { const e: any = new Error(r.error); e.code = 400; throw e; }
      await tx.update(usersTable).set({ twoFaEnabled: false, updatedAt: new Date() }).where(eq(usersTable.id, u.id));
    });
    res.json({ ok: true, twoFaEnabled: false });
  } catch (e: any) {
    if (e?.code) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }
});

router.post("/security/sessions/revoke-others", requireAuth, async (req, res): Promise<void> => {
  // Best-effort: keep current session, delete the rest
  const u = req.user!;
  const { readSessionCookie } = await import("../lib/auth");
  const currentToken = readSessionCookie(req);
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, u.id));
  let removed = 0;
  for (const s of sessions) {
    if (s.token !== currentToken) {
      await db.delete(sessionsTable).where(eq(sessionsTable.id, s.id));
      removed++;
    }
  }
  res.json({ ok: true, removed });
});

export default router;
