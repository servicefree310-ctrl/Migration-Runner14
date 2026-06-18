import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Loader2,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = "email" | "otp" | "success";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
    { label: "Symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor =
    score <= 1 ? "bg-red-500" : score === 2 ? "bg-amber-500" : score === 3 ? "bg-yellow-400" : "bg-emerald-500";
  const label =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              score >= i ? barColor : "bg-border"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${barColor.replace("bg-", "text-")}`}>{label}</span>
        <div className="flex gap-3">
          {checks.map((c) => (
            <span
              key={c.label}
              className={`text-[10px] ${c.ok ? "text-emerald-400" : "text-muted-foreground"}`}
            >
              {c.ok ? "✓" : "·"} {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("email");

  // Step 1 — email
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [sending, setSending] = useState(false);
  const [otpId, setOtpId] = useState<number | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Step 2 — OTP + new password
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [pwError, setPwError] = useState("");

  // Resend
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleSendCode(isResend = false) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailErr("Enter a valid email address");
      return;
    }
    setEmailErr("");
    setSending(true);
    try {
      const res = await post("/api/auth/reset", { email: trimmed });
      const data = await res.json();
      if (!res.ok) {
        setEmailErr(data.message ?? "Failed to send reset code");
        return;
      }
      setOtpId(data.otpId ?? null);
      setDevCode(data.devCode ?? null);
      if (isResend) {
        toast.success("Reset code resent to your email");
        setDigits(Array(OTP_LENGTH).fill(""));
        setOtpError("");
      } else {
        setStep("otp");
        setTimeout(() => digitRefs.current[0]?.focus(), 100);
      }
      startCooldown();
    } catch {
      setEmailErr("Network error — please try again");
    } finally {
      setSending(false);
    }
  }

  function handleDigitChange(idx: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    setOtpError("");
    if (char && idx < OTP_LENGTH - 1) {
      digitRefs.current[idx + 1]?.focus();
    }
  }

  function handleDigitKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = "";
        setDigits(next);
      } else if (idx > 0) {
        digitRefs.current[idx - 1]?.focus();
      }
    }
  }

  function handleDigitPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    setTimeout(() => digitRefs.current[focusIdx]?.focus(), 0);
  }

  async function handleReset() {
    const code = digits.join("");
    if (code.length < OTP_LENGTH) {
      setOtpError("Enter the complete 6-digit code");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    setOtpError("");
    setPwError("");
    setConfirming(true);
    try {
      const res = await post("/api/auth/reset/confirm", {
        email: email.trim().toLowerCase(),
        otpId,
        code,
        newPassword,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 410) {
          setOtpError("Code expired — request a new one");
        } else if (res.status === 429) {
          setOtpError("Too many attempts — request a new code");
        } else if (data.message?.toLowerCase().includes("wrong code") || data.message?.toLowerCase().includes("code")) {
          setOtpError(data.message);
        } else {
          setPwError(data.message ?? "Reset failed — try again");
        }
        return;
      }
      setStep("success");
    } catch {
      setPwError("Network error — please try again");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[420px] bg-gradient-to-br from-primary/10 via-background to-background border-r border-border p-10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-primary"
              style={{
                width: `${120 + i * 80}px`,
                height: `${120 + i * 80}px`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2.5 mb-auto">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">Zebvix</span>
        </div>

        <div className="space-y-6 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <KeyRound className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Password Recovery</h2>
            <p className="text-muted-foreground leading-relaxed">
              We'll send a 6-digit OTP to your registered email address. The code expires in 10 minutes.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: Mail, text: "OTP sent directly to your email" },
              { icon: ShieldCheck, text: "Secure one-time code — never reusable" },
              { icon: Lock, text: "Old sessions invalidated on reset" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5" />
          Your account security is our priority
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8">

          {/* Logo (mobile) */}
          <div className="flex lg:hidden items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Zebvix</span>
          </div>

          {/* Step indicator */}
          {step !== "success" && (
            <div className="flex items-center gap-3">
              {(["email", "otp"] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  {i > 0 && <div className={`h-px w-8 transition-colors ${step === "otp" ? "bg-primary" : "bg-border"}`} />}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${step === s ? "bg-primary text-primary-foreground scale-110" :
                      (step === "otp" && s === "email") ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>
                    {(step === "otp" && s === "email") ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                </div>
              ))}
              <span className="ml-1 text-sm text-muted-foreground">
                {step === "email" ? "Enter your email" : "Verify & reset"}
              </span>
            </div>
          )}

          {/* ── Step 1: Email ── */}
          {step === "email" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">Forgot password?</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Enter your registered email and we'll send a reset code.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fp-email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="pl-10 h-11"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                      aria-invalid={!!emailErr}
                    />
                  </div>
                  {emailErr && <p className="text-xs text-destructive">{emailErr}</p>}
                </div>

                <Button
                  className="w-full h-11 font-semibold"
                  onClick={() => handleSendCode()}
                  disabled={sending}
                >
                  {sending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending code…</>
                  ) : (
                    <><ArrowRight className="w-4 h-4 mr-2" /> Send Reset Code</>
                  )}
                </Button>
              </div>

              <div className="text-center text-sm">
                <Link href="/login" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to login
                </Link>
              </div>
            </div>
          )}

          {/* ── Step 2: OTP + New password ── */}
          {step === "otp" && (
            <div className="space-y-6">
              <div>
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Change email
                </button>
                <h1 className="text-2xl font-bold">Reset your password</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium text-foreground">
                    {email.replace(/^(.{2})(.+)(@.+)$/, (_, a, b, c) => a + "*".repeat(b.length) + c)}
                  </span>
                </p>
                {devCode && (
                  <p className="mt-1.5 text-xs font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2.5 py-1.5 inline-block">
                    Dev code: {devCode}
                  </p>
                )}
              </div>

              <div className="space-y-5">
                {/* OTP digits */}
                <div className="space-y-2">
                  <Label>One-time code</Label>
                  <div className="flex gap-2.5 justify-between" onPaste={handleDigitPaste}>
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => { digitRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]"
                        maxLength={1}
                        value={d}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(i, e)}
                        className={`w-12 h-14 text-center text-xl font-bold rounded-lg border bg-background
                          transition-all outline-none focus:ring-2 focus:ring-primary focus:border-primary
                          ${otpError ? "border-destructive" : "border-input"}
                          ${d ? "border-primary/60 text-foreground" : "text-muted-foreground"}`}
                        aria-label={`Digit ${i + 1}`}
                      />
                    ))}
                  </div>
                  {otpError && <p className="text-xs text-destructive">{otpError}</p>}
                </div>

                {/* New password */}
                <div className="space-y-1.5">
                  <Label htmlFor="fp-new-pw">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="fp-new-pw"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Min. 8 characters"
                      className="pl-10 pr-10 h-11"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPwError(""); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? "Hide" : "Show"}
                      className="absolute inset-y-0 right-2 flex items-center px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <PasswordStrength password={newPassword} />
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <Label htmlFor="fp-confirm-pw">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="fp-confirm-pw"
                      type={showCpw ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter new password"
                      className={`pl-10 pr-10 h-11 ${
                        confirmPassword && confirmPassword !== newPassword ? "border-destructive" : ""
                      }`}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleReset()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpw((s) => !s)}
                      aria-label={showCpw ? "Hide" : "Show"}
                      className="absolute inset-y-0 right-2 flex items-center px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {showCpw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>

                {pwError && <p className="text-xs text-destructive font-medium">{pwError}</p>}

                <Button
                  className="w-full h-11 font-semibold"
                  onClick={handleReset}
                  disabled={confirming || digits.join("").length < OTP_LENGTH}
                >
                  {confirming ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resetting…</>
                  ) : (
                    <><KeyRound className="w-4 h-4 mr-2" /> Reset Password</>
                  )}
                </Button>

                {/* Resend */}
                <div className="text-center text-sm text-muted-foreground">
                  Didn't receive the code?{" "}
                  {cooldown > 0 ? (
                    <span className="text-primary font-medium">Resend in {cooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                      onClick={() => handleSendCode(true)}
                      disabled={sending}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${sending ? "animate-spin" : ""}`} />
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Success ── */}
          {step === "success" && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Password Reset!</h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  Your password has been updated. All previous sessions have been signed out for security.
                </p>
              </div>
              <Button className="w-full h-11 font-semibold" onClick={() => setLocation("/login")}>
                <ArrowRight className="w-4 h-4 mr-2" /> Sign in with new password
              </Button>
              <p className="text-xs text-muted-foreground">
                Having trouble?{" "}
                <Link href="/support" className="text-primary hover:underline">
                  Contact support
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
