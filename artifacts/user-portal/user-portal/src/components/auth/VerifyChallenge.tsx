import { useState } from "react";
import { post } from "@/lib/api";
import type { AuthChallenge } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Mail, Phone, KeyRound, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

// Reusable two-step verification panel for both login & signup challenges.
//
// Server-driven: the panel does NOT need (or trust) any client-side email or
// phone. It just asks the server "send me an OTP for factor X of this open
// challenge". The server resolves the real recipient from the challenge it
// issued, dispatches the OTP, and returns the {otpId} we need to verify.
// This means a user who logs in with their phone can still receive an email
// OTP (and vice versa), and the global admin policy is always enforceable.

type FactorKey = "email" | "phone" | "twofa";

type Row = {
  key: FactorKey;
  label: string;
  hint: string;
  Icon: typeof Mail;
};

interface Props {
  challenge: AuthChallenge;
  // Reserved for future per-page customisation. The server now drives all
  // recipient resolution, so this prop is intentionally not consulted.
  loginRecipients?: { email?: string | null; phone?: string | null };
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
}

interface FactorState {
  otpId: number | null;
  code: string;
  verified: boolean;
  sending: boolean;
  verifying: boolean;
  error: string | null;
  devCode?: string | null;
  cooldownUntil?: number;
}

const initial: FactorState = {
  otpId: null, code: "", verified: false, sending: false, verifying: false, error: null,
};

export function VerifyChallenge({ challenge, onSuccess, onCancel }: Props) {
  const isSignup = challenge.purpose === "signup";

  // Build the rows we actually need to render.
  const rows: Row[] = [];
  if (challenge.requires.email) {
    rows.push({
      key: "email",
      label: "Email verification code",
      hint: `We'll email a 6-digit code to ${challenge.maskedEmail ?? "your email"}.`,
      Icon: Mail,
    });
  }
  if (challenge.requires.phone) {
    rows.push({
      key: "phone",
      label: "Phone verification code",
      hint: `We'll SMS a 6-digit code to ${challenge.maskedPhone ?? "your phone"}.`,
      Icon: Phone,
    });
  }
  if (challenge.requires.twofa) {
    rows.push({
      key: "twofa",
      label: "Two-factor (2FA) code",
      hint: `Enter the 2FA code we just emailed to ${challenge.maskedEmail ?? "your account"}.`,
      Icon: ShieldCheck,
    });
  }

  const [states, setStates] = useState<Record<FactorKey, FactorState>>(() => {
    const init: Partial<Record<FactorKey, FactorState>> = {};
    rows.forEach((r) => { init[r.key] = { ...initial }; });
    return init as Record<FactorKey, FactorState>;
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const update = (k: FactorKey, p: Partial<FactorState>) =>
    setStates((s) => ({ ...s, [k]: { ...s[k], ...p } }));

  const sendCode = async (row: Row) => {
    update(row.key, { sending: true, error: null, devCode: null });
    try {
      const res: any = await post("/auth/challenge/send", {
        challengeToken: challenge.token,
        factor: row.key,
      });
      update(row.key, {
        otpId: res.otpId,
        sending: false,
        devCode: res.devCode ?? null,
        cooldownUntil: Date.now() + 30_000,
      });
      toast.success("Code sent", { description: res.devCode ? `Dev code: ${res.devCode}` : res.message });
    } catch (e: any) {
      update(row.key, { sending: false, error: e?.data?.error || e?.message || "Failed to send code" });
    }
  };

  const verifyCode = async (row: Row): Promise<boolean> => {
    const st = states[row.key];
    if (!st.otpId) { update(row.key, { error: "Send the code first" }); return false; }
    if (!st.code || st.code.length < 4) { update(row.key, { error: "Enter the code" }); return false; }
    update(row.key, { verifying: true, error: null });
    try {
      await post("/otp/verify", { otpId: st.otpId, code: st.code });
      update(row.key, { verifying: false, verified: true });
      return true;
    } catch (e: any) {
      update(row.key, { verifying: false, error: e?.data?.error || e?.message || "Wrong code" });
      return false;
    }
  };

  const onSubmit = async () => {
    setServerError(null);

    // Verify any not-yet-verified rows in parallel.
    const checks = await Promise.all(
      rows.map(async (r) => (states[r.key].verified ? true : await verifyCode(r))),
    );
    if (checks.some((ok) => !ok)) return;

    setSubmitting(true);
    try {
      const body: any = { challengeToken: challenge.token };
      for (const r of rows) {
        const id = states[r.key].otpId;
        if (r.key === "email") body.emailOtpId = id;
        if (r.key === "phone") body.phoneOtpId = id;
        if (r.key === "twofa") body.twoFaOtpId = id;
      }
      const path = isSignup ? "/auth/register/verify" : "/auth/login/verify";
      await post(path, body);
      await onSuccess();
    } catch (e: any) {
      setServerError(e?.data?.error || e?.message || "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="verify-challenge">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary mb-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          {isSignup ? "Verify your account" : "Extra verification required"}
        </div>
        <h2 className="text-2xl font-bold">
          {isSignup ? "Confirm it's really you" : "One more step"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignup
            ? "We need to verify your contact info before activating your account."
            : "Your account has extra protection enabled. Enter the codes below to continue."}
        </p>
      </div>

      {serverError && (
        <Alert variant="destructive" data-testid="alert-verify-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {rows.map((row) => {
          const st = states[row.key];
          const cooldown = !!(st.cooldownUntil && st.cooldownUntil > Date.now());
          return (
            <div key={row.key} className={`rounded-xl border p-4 ${st.verified ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 bg-card/50"}`}>
              <div className="flex items-center gap-2 mb-2">
                <row.Icon className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">{row.label}</Label>
                {st.verified && (
                  <span className="ml-auto text-xs font-medium text-emerald-500">✓ Verified</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">{row.hint}</p>

              <div className="flex gap-2 items-stretch">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="• • • • • •"
                  className="font-mono tracking-widest text-center text-base h-11"
                  value={st.code}
                  onChange={(e) => update(row.key, { code: e.target.value.replace(/\D/g, "").slice(0, 6), verified: false, error: null })}
                  disabled={st.verified || submitting}
                  data-testid={`input-otp-${row.key}`}
                  aria-label={row.label}
                />
                <Button
                  type="button"
                  variant={st.otpId ? "outline" : "default"}
                  onClick={() => sendCode(row)}
                  disabled={st.sending || st.verified || submitting || cooldown}
                  className="shrink-0 min-w-[110px]"
                  data-testid={`btn-send-${row.key}`}
                >
                  {st.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : st.otpId ? "Resend" : (
                    <><KeyRound className="h-3.5 w-3.5 mr-1.5" />Send code</>
                  )}
                </Button>
              </div>
              {cooldown && !st.sending && (
                <p className="text-[11px] text-muted-foreground mt-1.5">Resend available in ~30s</p>
              )}
              {st.devCode && !st.verified && (
                <p className="text-[11px] text-amber-500 mt-1.5">Dev code: <span className="font-mono font-semibold">{st.devCode}</span></p>
              )}
              {st.error && (
                <p className="text-xs text-destructive mt-1.5" role="alert" data-testid={`error-otp-${row.key}`}>
                  {st.error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting} data-testid="btn-verify-cancel">
          Back
        </Button>
        <Button
          type="button"
          className="flex-1 h-11 text-base font-semibold"
          onClick={onSubmit}
          disabled={submitting}
          data-testid="btn-verify-submit"
        >
          {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : <>Verify and continue<ArrowRight className="h-4 w-4 ml-2" /></>}
        </Button>
      </div>
    </div>
  );
}
