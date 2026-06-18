import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, type AuthChallenge } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { get } from "@/lib/api";
import { VerifyChallenge } from "@/components/auth/VerifyChallenge";
import {
  Eye,
  EyeOff,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
  AlertCircle,
  Loader2,
  Wallet as WalletIcon,
  ArrowRight,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

function detectIdentifier(v: string): "email" | "phone" | "unknown" {
  if (!v) return "unknown";
  if (/^[+]?[\d\s\-()]{6,}$/.test(v.trim())) return "phone";
  if (v.includes("@")) return "email";
  return "unknown";
}

export default function Login() {
  const { login, user, setUser } = useAuth();
  const [, setLocation] = useLocation();

  // Controlled fields — keeps "Demo Fill" button rock-solid and avoids the
  // RHF + uncontrolled-input edge cases we hit in earlier e2e runs.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    identifier?: string;
    password?: string;
  }>({});
  const [capsLock, setCapsLock] = useState(false);
  const firstRef = useRef<HTMLInputElement | null>(null);
  // Multi-factor: when admin policy or user prefs require it, the server
  // returns a challenge instead of a session — we render the verify panel.
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);

  const idKind = useMemo(() => detectIdentifier(identifier), [identifier]);

  // Redirect away if already signed in
  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  // Auto-focus the first field
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const handleKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState && e.getModifierState("CapsLock"));
  };

  const validate = () => {
    const next: typeof fieldErrors = {};
    if (!identifier.trim()) next.identifier = "Email or phone is required";
    else if (identifier.trim().length < 3) next.identifier = "Too short";
    if (!password) next.password = "Password is required";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await login({ email: identifier.trim(), password });
      if (result.kind === "challenge") {
        // Server requires extra factors (admin policy or per-user prefs).
        setChallenge(result.challenge);
        return;
      }
      toast.success("Welcome back!", {
        description: "You're now signed in to Zebvix.",
      });
      setLocation("/");
    } catch (err: any) {
      const msg =
        err?.data?.error ||
        err?.message ||
        "Sign-in failed. Please check your credentials and try again.";
      setServerError(msg);
      toast.error("Sign-in failed", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const onChallengeSuccess = async () => {
    // Hydrate the auth context with the freshly-issued session, then redirect.
    try {
      const me: any = await get("/auth/me");
      if (me?.user) setUser(me.user);
    } catch { /* ignore — RequireAuth guard will catch it */ }
    toast.success("Verified — welcome back!");
    setLocation("/");
  };


  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ─── LEFT — FORM ─────────────────────────────────────────────── */}
        <div className="flex flex-col px-6 py-8 sm:px-10 md:px-16 lg:px-20">
          {/* Top bar: logo + signup hint */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 group"
              data-testid="link-logo"
            >
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-md ring-1 ring-primary/20 group-hover:scale-105 transition-transform">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                Zebvix<span className="text-primary">.</span>
              </span>
            </Link>
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <span>New here?</span>
              <Link
                href="/signup"
                className="font-medium text-primary hover:underline"
                data-testid="link-to-signup"
              >
                Create account
              </Link>
            </div>
          </div>

          {/* Form column */}
          <div className="flex-1 flex items-center justify-center py-10">
            <div className="w-full max-w-md">
              {challenge ? (
                <VerifyChallenge
                  challenge={challenge}
                  loginRecipients={{ email: identifier.includes("@") ? identifier.trim() : null, phone: !identifier.includes("@") ? identifier.trim() : null }}
                  onSuccess={onChallengeSuccess}
                  onCancel={() => { setChallenge(null); setServerError(null); }}
                />
              ) : (
              <>
              <div className="mb-7">
                <Badge
                  variant="outline"
                  className="mb-3 border-primary/30 bg-primary/5 text-primary font-medium"
                >
                  <ShieldCheck className="h-3 w-3 mr-1" /> Secure sign-in
                </Badge>
                <h1
                  className="text-3xl sm:text-4xl font-bold tracking-tight"
                  data-testid="heading-login"
                >
                  Welcome back
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Sign in to trade ZBX, Bitcoin, Ethereum &amp; 200+ assets on
                  India&apos;s premium crypto exchange.
                </p>
              </div>

              {/* Server error */}
              {serverError && (
                <Alert
                  variant="destructive"
                  className="mb-5"
                  data-testid="alert-login-error"
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              )}

              <form
                onSubmit={onSubmit}
                noValidate
                className="space-y-4"
                data-testid="form-login"
              >
                {/* Identifier (email or phone) */}
                <div className="space-y-1.5">
                  <Label htmlFor="identifier" className="text-sm font-medium">
                    Email or phone
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                      {idKind === "phone" ? (
                        <Phone className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                    </span>
                    <Input
                      id="identifier"
                      name="identifier"
                      autoComplete="username"
                      placeholder="you@example.com or +91 98765 43210"
                      className="pl-10 h-11"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (fieldErrors.identifier)
                          setFieldErrors((s) => ({ ...s, identifier: undefined }));
                      }}
                      aria-invalid={!!fieldErrors.identifier}
                      data-testid="input-identifier"
                      ref={firstRef}
                    />
                  </div>
                  {fieldErrors.identifier && (
                    <p
                      className="text-xs text-destructive"
                      role="alert"
                      data-testid="error-identifier"
                    >
                      {fieldErrors.identifier}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Password
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </span>
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="pl-10 pr-10 h-11"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password)
                          setFieldErrors((s) => ({ ...s, password: undefined }));
                      }}
                      onKeyDown={handleKeyEvent}
                      onKeyUp={handleKeyEvent}
                      aria-invalid={!!fieldErrors.password}
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-2 flex items-center px-1.5 text-muted-foreground hover:text-foreground rounded"
                      data-testid="btn-toggle-password"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p
                      className="text-xs text-destructive"
                      role="alert"
                      data-testid="error-password"
                    >
                      {fieldErrors.password}
                    </p>
                  )}
                  {capsLock && (
                    <p
                      className="text-xs text-amber-500 flex items-center gap-1"
                      data-testid="warn-caps-lock"
                    >
                      <AlertCircle className="h-3 w-3" /> Caps Lock is on
                    </p>
                  )}
                </div>

                {/* Session note (sessions are 14 days by default) */}
                <p
                  className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5"
                  data-testid="text-session-note"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Sessions stay signed in for 14 days on this device.
                </p>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-semibold"
                  disabled={submitting}
                  data-testid="btn-submit-login"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px bg-border flex-1" />
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  or
                </span>
                <div className="h-px bg-border flex-1" />
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" asChild className="h-10">
                  <Link href="/signup" data-testid="btn-signup-link">
                    <Sparkles className="h-4 w-4 mr-2 text-primary" />
                    Create account
                  </Link>
                </Button>
                <Button variant="outline" asChild className="h-10">
                  <Link href="/markets" data-testid="btn-explore-markets">
                    <TrendingUp className="h-4 w-4 mr-2 text-primary" />
                    Explore markets
                  </Link>
                </Button>
              </div>

              {/* Mobile signup hint */}
              <p className="mt-6 sm:hidden text-center text-sm text-muted-foreground">
                New to Zebvix?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-primary hover:underline"
                >
                  Create an account
                </Link>
              </p>
              </>
              )}
            </div>
          </div>

          {/* Footer compliance notes */}
          <div className="text-xs text-muted-foreground/80 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> SOC2 &amp; ISO 27001
            </span>
            <Link href="/legal/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/help" className="hover:underline">
              Help
            </Link>
            <span className="ml-auto">© 2026 Zebvix Exchange</span>
          </div>
        </div>

        {/* ─── RIGHT — BRAND PANEL ────────────────────────────────────── */}
        <aside
          className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-background border-l border-border"
          aria-hidden="true"
        >
          {/* Animated grid backdrop */}
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:42px_42px]" />
          {/* Glow orbs */}
          <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-primary/20 blur-3xl animate-pulse" />
          <div
            className="absolute bottom-0 -left-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />

          <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
            <div>
              <Badge className="bg-primary/15 text-primary border-primary/30 backdrop-blur">
                <Zap className="h-3 w-3 mr-1" /> Powered by Zebvix Blockchain
              </Badge>
              <h2 className="mt-6 text-3xl xl:text-4xl font-bold tracking-tight leading-tight">
                Trade smarter on the
                <br />
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  next-gen exchange.
                </span>
              </h2>
              <p className="mt-4 text-lg text-muted-foreground max-w-md">
                Lightning-fast matching, deep liquidity, and bank-grade security
                — engineered for institutional-grade performance.
              </p>
            </div>

            {/* Feature cards */}
            <div className="space-y-3 my-8">
              {[
                {
                  icon: TrendingUp,
                  title: "200+ markets, real-time",
                  desc: "Spot, futures, and earn — INR, USDT, and BTC pairs.",
                },
                {
                  icon: ShieldCheck,
                  title: "Insurance-protected wallets",
                  desc: "98% cold storage with industry-leading custody.",
                },
                {
                  icon: WalletIcon,
                  title: "Instant INR deposits",
                  desc: "UPI, IMPS, and bank transfers — settled in seconds.",
                },
                {
                  icon: Gift,
                  title: "Earn up to 18% APY",
                  desc: "Stake ZBX and 30+ assets with flexible terms.",
                },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 backdrop-blur p-4 hover:border-primary/40 hover:bg-card/60 transition-all"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {f.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-border/60">
              {[
                { v: "₹4,200Cr+", l: "24h volume" },
                { v: "1.2M+", l: "Verified users" },
                { v: "0.05%", l: "Maker fee" },
              ].map((s, i) => (
                <div key={i}>
                  <div className="text-xl xl:text-2xl font-bold tracking-tight">
                    {s.v}
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
