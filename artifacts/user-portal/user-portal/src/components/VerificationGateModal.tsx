import { useState, useEffect } from "react";
import { ShieldAlert, Mail, Smartphone, CheckCircle2, Loader2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { post } from "@/lib/api";

type Step = "email" | "phone" | "done";

function stepFor(emailVerified?: boolean, phoneVerified?: boolean, hasPhone?: boolean): Step {
  if (!emailVerified) return "email";
  if (hasPhone && !phoneVerified) return "phone";
  return "done";
}

export function VerificationGateModal() {
  const { user, setUser } = useAuth();

  const emailVerified = !!user?.emailVerified;
  const hasPhone = !!user?.phone;
  const phoneVerified = !!user?.phoneVerified;
  const needsGate = user && (!emailVerified || (hasPhone && !phoneVerified));

  const [step, setStep] = useState<Step>(() => stepFor(emailVerified, phoneVerified, hasPhone));
  const [otpId, setOtpId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    setStep(stepFor(user?.emailVerified, user?.phoneVerified, hasPhone));
  }, [user?.emailVerified, user?.phoneVerified, hasPhone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!needsGate || step === "done") return null;

  const channel = step === "email" ? "email" : "sms";
  const recipient = step === "email" ? user!.email : user!.phone!;
  const maskedRecipient =
    step === "email"
      ? recipient.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.max(2, b.length)) + c)
      : recipient.replace(/(\d{2})\d+(\d{2})/, "$1*****$2");

  async function sendOtp() {
    setError(null);
    setSending(true);
    try {
      const r: any = await post("/otp/send", { channel, purpose: "signup", recipient });
      setOtpId(r.otpId);
      setSentTo(maskedRecipient);
      setCooldown(30);
      setCode("");
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP");
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (!otpId || code.length < 4) return;
    setError(null);
    setVerifying(true);
    try {
      const r: any = await post("/auth/verify-contact", { channel, otpId, code });
      if (r.ok && r.user) {
        setUser(r.user);
        setOtpId(null);
        setCode("");
        setSentTo(null);
        const next = stepFor(r.user.emailVerified, r.user.phoneVerified, !!r.user.phone);
        setStep(next);
      }
    } catch (e: any) {
      setError(e?.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  const isEmail = step === "email";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border-b border-border p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 mb-3">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-bold">Verify Your Account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            To access the exchange, please verify your {isEmail ? "email address" : "phone number"}.
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 px-6 pt-4">
          {/* Email step */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition-all
              ${emailVerified
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : step === "email"
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-muted/30 border-border text-muted-foreground"}`}>
              {emailVerified ? <CheckCircle2 className="w-4 h-4" /> : <Mail className="w-3.5 h-3.5" />}
            </div>
            <span className={`text-xs font-medium ${step === "email" ? "text-foreground" : "text-muted-foreground"}`}>Email</span>
          </div>

          {hasPhone && (
            <>
              <div className="h-px w-8 bg-border" />
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition-all
                  ${phoneVerified
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : step === "phone"
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                    : "bg-muted/30 border-border text-muted-foreground"}`}>
                  {phoneVerified ? <CheckCircle2 className="w-4 h-4" /> : <Smartphone className="w-3.5 h-3.5" />}
                </div>
                <span className={`text-xs font-medium ${step === "phone" ? "text-foreground" : "text-muted-foreground"}`}>Phone</span>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {!otpId ? (
            <>
              <div className="rounded-lg border border-border bg-muted/20 p-4 text-center space-y-2">
                {isEmail
                  ? <Mail className="w-8 h-8 text-amber-400 mx-auto" />
                  : <Smartphone className="w-8 h-8 text-amber-400 mx-auto" />
                }
                <p className="text-sm text-muted-foreground">
                  We'll send a verification code to
                </p>
                <p className="font-semibold text-sm font-mono">{maskedRecipient}</p>
              </div>
              <Button className="w-full" onClick={sendOtp} disabled={sending}>
                {sending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                  : <><ArrowRight className="w-4 h-4 mr-2" />Send Verification Code</>
                }
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center text-sm text-emerald-300">
                OTP sent to <span className="font-mono font-semibold">{sentTo}</span>. Check your {isEmail ? "inbox / spam" : "messages"}.
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Enter 6-digit code</label>
                <Input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                  placeholder="000000"
                  className="text-center text-xl font-mono tracking-[0.5em] h-12"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verifyOtp()}
                />
              </div>

              {error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-400">
                  {error}
                </div>
              )}

              <Button
                className="w-full"
                onClick={verifyOtp}
                disabled={verifying || code.length < 4}
              >
                {verifying
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</>
                  : <><CheckCircle2 className="w-4 h-4 mr-2" />Confirm Code</>
                }
              </Button>

              <button
                type="button"
                onClick={cooldown > 0 ? undefined : sendOtp}
                disabled={cooldown > 0 || sending}
                className="w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 py-1 transition"
              >
                <RefreshCw className="w-3 h-3" />
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </>
          )}
        </div>

        <div className="border-t border-border px-6 py-3 bg-muted/10 text-center">
          <p className="text-[11px] text-muted-foreground">
            Verification is required to ensure the security of your account and comply with exchange regulations.
          </p>
        </div>
      </div>
    </div>
  );
}
