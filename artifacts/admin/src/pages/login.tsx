import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { ZebvixMark } from "@/components/ZebvixMark";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Ambient gold glow background */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute top-[-20%] left-[15%] w-[55%] h-[55%] rounded-full bg-amber-500/10 blur-[140px]" />
        <div className="absolute bottom-[-25%] right-[10%] w-[50%] h-[50%] rounded-full bg-amber-500/[0.06] blur-[160px]" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Brand strip on top */}
        <div className="flex flex-col items-center mb-6">
          <ZebvixMark size={64} className="mb-3" />
          <div className="text-3xl font-bold tracking-wider gold-text">ZEBVIX</div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mt-1">
            Admin Console
          </div>
        </div>

        <div className="premium-card-hero rounded-2xl p-6 md:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in with your administrator credentials
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                Email or Phone
              </Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="h-11 bg-[hsl(222_18%_8%)] border-border focus:border-amber-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-11 bg-[hsl(222_18%_8%)] border-border focus:border-amber-500/50"
              />
            </div>
            {error && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-11 gold-bg text-black font-semibold hover:opacity-90"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Encrypted
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              MFA ready
            </span>
          </div>
        </div>

        <div className="text-center mt-4 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Zebvix Exchange · For authorised personnel only
        </div>
      </div>
    </div>
  );
}
