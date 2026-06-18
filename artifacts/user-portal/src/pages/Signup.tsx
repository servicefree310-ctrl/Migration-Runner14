import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useAuth, type AuthChallenge } from "@/lib/auth";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { get } from "@/lib/api";
import { VerifyChallenge } from "@/components/auth/VerifyChallenge";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User as UserIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
  AlertCircle,
  Loader2,
  Wallet as WalletIcon,
  ArrowRight,
  Gift,
  Check,
  X,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const REF_STORAGE_KEY = "zbx_referral_code";

/** Persist referral code in localStorage so it survives navigation within the SPA. */
function saveReferral(code: string) {
  try { localStorage.setItem(REF_STORAGE_KEY, code); } catch { /* incognito */ }
}
function loadReferral(): string {
  try { return localStorage.getItem(REF_STORAGE_KEY) ?? ""; } catch { return ""; }
}
function clearReferral() {
  try { localStorage.removeItem(REF_STORAGE_KEY); } catch { /* ignore */ }
}

type FormValues = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  referralCode: string;
  agreeTerms: boolean;
  newsletter: boolean;
};

/* ─── Password strength helpers ─────────────────────────────────────── */

type Strength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  color: string;
  rules: { id: string; label: string; ok: boolean }[];
};

function checkPassword(pw: string): Strength {
  const rules = [
    { id: "len",   label: "At least 8 characters",  ok: pw.length >= 8 },
    { id: "lower", label: "One lowercase letter",    ok: /[a-z]/.test(pw) },
    { id: "upper", label: "One uppercase letter",    ok: /[A-Z]/.test(pw) },
    { id: "num",   label: "One number",              ok: /\d/.test(pw) },
    { id: "sym",   label: "One symbol (!@#$…)",      ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const passed = rules.filter(r => r.ok).length;
  let score: Strength["score"] = 0;
  let label: Strength["label"] = "Too short";
  let color = "text-muted-foreground";
  if (pw.length === 0) {
    score = 0; label = "Too short"; color = "text-muted-foreground";
  } else if (pw.length < 6 || passed <= 1) {
    score = 1; label = "Weak";   color = "text-red-500";
  } else if (passed === 2) {
    score = 2; label = "Fair";   color = "text-amber-500";
  } else if (passed === 3 || passed === 4) {
    score = 3; label = "Good";   color = "text-blue-500";
  } else {
    score = 4; label = "Strong"; color = "text-emerald-500";
  }
  return { score, label, color, rules };
}

const BAR_COLOR = [
  "bg-muted",
  "bg-red-500",
  "bg-amber-500",
  "bg-blue-500",
  "bg-emerald-500",
];

/* ─── Component ─────────────────────────────────────────────────────── */

export default function Signup() {
  const { signup, user, setUser } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch(); // reactive — updates when query string changes
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);

  /** Read ?ref= (or ?referral=) from URL, fall back to localStorage */
  const refFromUrl = useMemo(() => {
    const params = new URLSearchParams(search);
    const code = (
      params.get("ref") ??
      params.get("referral") ??
      params.get("referralCode") ??
      ""
    ).trim().toUpperCase();
    if (code) {
      saveReferral(code);
      return code;
    }
    return loadReferral();
  }, [search]);

  const form = useForm<FormValues>({
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      referralCode: refFromUrl,
      agreeTerms: false,
      newsletter: true,
    },
    mode: "onTouched",
  });

  const [showPw,  setShowPw]  = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [serverError,  setServerError]  = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | null>(null);

  const password        = form.watch("password");
  const confirmPassword = form.watch("confirmPassword");
  const agreeTerms      = form.watch("agreeTerms");
  const strength        = useMemo(() => checkPassword(password), [password]);
  const passwordsMatch   = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  // Redirect if already signed in
  useEffect(() => { if (user) setLocation("/"); }, [user, setLocation]);

  // Sync ref code whenever URL changes (e.g. user lands on page with ?ref= after SPA nav)
  useEffect(() => {
    if (refFromUrl) form.setValue("referralCode", refFromUrl);
  }, [refFromUrl, form]);

  // Auto-focus name field
  useEffect(() => { firstRef.current?.focus(); }, []);

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    if (!data.agreeTerms) {
      setServerError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    if (data.password !== data.confirmPassword) {
      setServerError("Passwords do not match.");
      return;
    }
    if (strength.score < 2) {
      setServerError("Please pick a stronger password (mix letters, numbers, and symbols).");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, string> = {
        email:    data.email.trim(),
        password: data.password,
        name:     data.fullName.trim(),
      };
      if (data.phone.trim()) payload.phone = data.phone.trim();
      if (data.referralCode.trim()) payload.referralCode = data.referralCode.trim().toUpperCase();

      const result = await signup(payload);
      clearReferral(); // Wipe stored code after successful signup
      if (result.kind === "challenge") {
        setChallenge(result.challenge);
        return;
      }
      toast.success("Welcome to Zebvix!", {
        description: "Your account is ready. Complete KYC to unlock INR deposits.",
      });
      setLocation("/");
    } catch (e: any) {
      const msg = e?.data?.error ?? e?.message ?? "Sign-up failed. Please try again.";
      setServerError(msg);
      toast.error("Sign-up failed", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const nameReg = form.register("fullName", {
    required: "Full name is required",
    minLength: { value: 2, message: "Name is too short" },
  });

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* ─── LEFT — FORM ─────────────────────────────────────────────── */}
        <div className="flex flex-col px-4 py-6 sm:px-8 md:px-14 lg:px-16 xl:px-20">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-1">
            <Link href="/" className="inline-flex items-center gap-2 group" data-testid="link-logo">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                Zebvix<span className="text-primary">.</span>
              </span>
            </Link>
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <span>Already a member?</span>
              <Link href="/login" className="font-medium text-primary hover:underline" data-testid="link-to-login">
                Sign in
              </Link>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center py-6 sm:py-10">
            <div className="w-full max-w-md">
              {challenge ? (
                <VerifyChallenge
                  challenge={challenge}
                  loginRecipients={{
                    email: form.getValues("email")?.trim() || null,
                    phone: form.getValues("phone")?.trim() || null,
                  }}
                  onSuccess={async () => {
                    try {
                      const me: any = await get("/auth/me");
                      if (me?.user) setUser(me.user);
                    } catch { /* guard catches it */ }
                    clearReferral();
                    toast.success("Welcome to Zebvix!", {
                      description: "Account verified. Complete KYC to unlock INR deposits.",
                    });
                    setLocation("/");
                  }}
                  onCancel={() => { setChallenge(null); setServerError(null); }}
                />
              ) : (
              <>
                {/* ── Heading ── */}
                <div className="mb-6">
                  <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary font-medium">
                    <Sparkles className="h-3 w-3 mr-1" /> Free forever
                  </Badge>
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="heading-signup">
                    Create your account
                  </h1>
                  <p className="mt-2 text-muted-foreground text-sm sm:text-base">
                    Join 1.2M+ traders. Get ZBX welcome bonus once you complete KYC.
                  </p>
                </div>

                {/* ── Referral applied banner ── */}
                {refFromUrl && (
                  <Alert className="mb-5 border-amber-500/40 bg-amber-500/10" data-testid="badge-referral-applied">
                    <Gift className="h-4 w-4 text-amber-500 shrink-0" />
                    <AlertDescription className="text-amber-600 dark:text-amber-300">
                      Joining via referral code{" "}
                      <span className="font-mono font-semibold">{refFromUrl}</span>
                      . You&apos;ll both earn rewards on your first trade! 🎉
                    </AlertDescription>
                  </Alert>
                )}

                {/* ── Server error ── */}
                {serverError && (
                  <Alert variant="destructive" className="mb-5" data-testid="alert-signup-error">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{serverError}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4" data-testid="form-signup">

                  {/* Full name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName" className="text-sm font-medium">Full name</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        <UserIcon className="h-4 w-4" />
                      </span>
                      <Input
                        id="fullName"
                        autoComplete="name"
                        placeholder="As on your PAN card"
                        className="pl-10 h-11"
                        aria-invalid={!!form.formState.errors.fullName}
                        data-testid="input-fullname"
                        {...nameReg}
                        ref={el => { nameReg.ref(el); firstRef.current = el; }}
                      />
                    </div>
                    {form.formState.errors.fullName && (
                      <p className="text-xs text-destructive" role="alert" data-testid="error-fullname">
                        {form.formState.errors.fullName.message}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        <Mail className="h-4 w-4" />
                      </span>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="pl-10 h-11"
                        aria-invalid={!!form.formState.errors.email}
                        data-testid="input-email"
                        {...form.register("email", {
                          required: "Email is required",
                          pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
                        })}
                      />
                    </div>
                    {form.formState.errors.email && (
                      <p className="text-xs text-destructive" role="alert" data-testid="error-email">
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </div>

                  {/* Phone — full width, compact picker */}
                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      Mobile number{" "}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Controller
                      name="phone"
                      control={form.control}
                      rules={{
                        validate: (v: string) =>
                          !v?.trim() ||
                          /^[+]?[\d\s\-()]{6,20}$/.test(v.trim()) ||
                          "Enter a valid mobile number",
                      }}
                      render={({ field }) => (
                        <PhoneInput
                          id="phone"
                          value={field.value ?? ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          aria-invalid={!!form.formState.errors.phone}
                          data-testid="input-phone"
                        />
                      )}
                    />
                    {form.formState.errors.phone && (
                      <p className="text-xs text-destructive" role="alert" data-testid="error-phone">
                        {form.formState.errors.phone.message}
                      </p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        <Lock className="h-4 w-4" />
                      </span>
                      <Input
                        id="password"
                        type={showPw ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Create a strong password"
                        className="pl-10 pr-10 h-11"
                        aria-invalid={!!form.formState.errors.password}
                        data-testid="input-password"
                        {...form.register("password", {
                          required: "Password is required",
                          minLength: { value: 6, message: "Min 6 characters" },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(s => !s)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                        aria-pressed={showPw}
                        className="absolute inset-y-0 right-2 flex items-center px-1.5 text-muted-foreground hover:text-foreground rounded touch-manipulation"
                        data-testid="btn-toggle-password"
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {form.formState.errors.password && (
                      <p className="text-xs text-destructive" role="alert" data-testid="error-password">
                        {form.formState.errors.password.message}
                      </p>
                    )}

                    {/* Strength meter */}
                    {password.length > 0 && (
                      <div className="pt-1.5" data-testid="password-strength">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(i => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${i <= strength.score ? BAR_COLOR[strength.score] : "bg-muted"}`}
                            />
                          ))}
                        </div>
                        <div className={`mt-1.5 text-xs font-medium ${strength.color}`} data-testid="password-strength-label">
                          {strength.label}
                        </div>
                        {strength.score < 4 && (
                          <ul className="mt-2 grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-x-4 gap-y-1">
                            {strength.rules.map(r => (
                              <li key={r.id} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-500" : "text-muted-foreground"}`}>
                                {r.ok
                                  ? <Check className="h-3 w-3 shrink-0" />
                                  : <X className="h-3 w-3 shrink-0 opacity-50" />}
                                <span>{r.label}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confirm password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium">
                      Confirm password
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        <Lock className="h-4 w-4" />
                      </span>
                      <Input
                        id="confirmPassword"
                        type={showCpw ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                        className={`pl-10 pr-16 h-11 ${
                          passwordsMismatch ? "border-destructive focus-visible:ring-destructive"
                          : passwordsMatch  ? "border-emerald-500/60" : ""
                        }`}
                        aria-invalid={passwordsMismatch}
                        data-testid="input-confirm-password"
                        {...form.register("confirmPassword", { required: "Please confirm your password" })}
                      />
                      <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                        {passwordsMatch && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Passwords match" data-testid="icon-passwords-match" />
                        )}
                        <button
                          type="button"
                          onClick={() => setShowCpw(s => !s)}
                          aria-label={showCpw ? "Hide password" : "Show password"}
                          aria-pressed={showCpw}
                          className="px-1.5 text-muted-foreground hover:text-foreground rounded touch-manipulation"
                          data-testid="btn-toggle-confirm-password"
                        >
                          {showCpw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {passwordsMismatch && (
                      <p className="text-xs text-destructive" role="alert" data-testid="error-confirm-password">
                        Passwords do not match
                      </p>
                    )}
                  </div>

                  {/* Referral code */}
                  <div className="space-y-1.5">
                    <Label htmlFor="referralCode" className="text-sm font-medium">
                      Referral code{" "}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        <Gift className="h-4 w-4" />
                      </span>
                      <Input
                        id="referralCode"
                        placeholder="ABCD1234"
                        className={`pl-10 h-11 font-mono uppercase tracking-wider ${refFromUrl ? "border-amber-500/60 bg-amber-500/5" : ""}`}
                        data-testid="input-signup-referral"
                        {...form.register("referralCode")}
                      />
                    </div>
                    {refFromUrl && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Gift className="h-3 w-3" />
                        Referral code applied automatically
                      </p>
                    )}
                  </div>

                  {/* Terms */}
                  <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={agreeTerms}
                        onCheckedChange={v => form.setValue("agreeTerms", Boolean(v), { shouldValidate: true })}
                        className="mt-0.5 shrink-0"
                        data-testid="checkbox-agree-terms"
                      />
                      <span className="text-muted-foreground leading-snug">
                        I agree to the{" "}
                        <Link href="/legal/terms"  className="text-primary hover:underline">Terms of Service</Link>,{" "}
                        <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>, and{" "}
                        <Link href="/legal/aml"     className="text-primary hover:underline">AML Policy</Link>.
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={form.watch("newsletter")}
                        onCheckedChange={v => form.setValue("newsletter", Boolean(v))}
                        className="mt-0.5 shrink-0"
                        data-testid="checkbox-newsletter"
                      />
                      <span className="text-muted-foreground leading-snug">
                        Send me product updates and trading insights (optional).
                      </span>
                    </label>
                  </div>

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold mt-1"
                    disabled={submitting || !agreeTerms}
                    data-testid="btn-submit-signup"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating account...</>
                    ) : (
                      <>Create my account <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>

                  {/* Trust row */}
                  <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs text-muted-foreground/70">
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> SOC2 Certified</span>
                    <span className="hidden xs:block">·</span>
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> ISO 27001</span>
                    <span className="hidden xs:block">·</span>
                    <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> FIU-IND Registered</span>
                  </div>
                </form>

                {/* Mobile sign-in link */}
                <p className="mt-5 sm:hidden text-center text-sm text-muted-foreground">
                  Already a member?{" "}
                  <Link href="/login" className="font-medium text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground/80 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2">
            <Link href="/legal/terms"   className="hover:underline">Terms</Link>
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
            <Link href="/help"          className="hover:underline">Help</Link>
            <span className="ml-auto">© 2026 Zebvix Exchange</span>
          </div>
        </div>

        {/* ─── RIGHT — BRAND PANEL ─────────────────────────────────────── */}
        <aside
          className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background border-l border-border"
          aria-hidden="true"
        >
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:42px_42px]" />
          <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-primary/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-0 -left-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

          <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
            <div>
              <Badge className="bg-primary/15 text-primary border-primary/30 backdrop-blur">
                <Gift className="h-3 w-3 mr-1" /> Sign-up bonus
              </Badge>
              <h2 className="mt-6 text-3xl xl:text-4xl font-bold tracking-tight leading-tight">
                Get up to{" "}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  ₹500 in ZBX
                </span>
                <br />
                when you complete KYC.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-md">
                A premium account on India&apos;s most advanced crypto exchange — regulated, secure, and built to perform.
              </p>
            </div>

            {/* Onboarding steps */}
            <div className="space-y-4 my-8">
              {[
                { icon: Sparkles,   step: "01", title: "Create your account",     desc: "Email + strong password. Takes under a minute." },
                { icon: ShieldCheck,step: "02", title: "Verify your identity",     desc: "Quick KYC with PAN and Aadhaar — fully encrypted." },
                { icon: WalletIcon, step: "03", title: "Deposit INR via UPI",      desc: "Instant funding. Zero deposit fees, ever." },
                { icon: TrendingUp, step: "04", title: "Trade your first asset",   desc: "Start with ZBX, BTC, ETH, or any of 200+ pairs." },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    <div className="h-11 w-11 rounded-xl bg-primary/15 text-primary flex items-center justify-center ring-1 ring-primary/30">
                      <f.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="min-w-0 pt-1">
                    <div className="text-[10px] font-mono text-primary/70 tracking-wider mb-0.5">STEP {f.step}</div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-muted-foreground">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border/60">
              {[
                { v: "1.2M+", l: "Verified users" },
                { v: "200+",  l: "Listed assets" },
                { v: "₹0",    l: "Deposit fee" },
              ].map((s, i) => (
                <div key={i}>
                  <div className="text-xl xl:text-2xl font-bold tracking-tight">{s.v}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
