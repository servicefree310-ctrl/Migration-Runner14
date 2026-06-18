import { Link } from "wouter";
import { Shield, Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const LEVEL_META: Record<number, { name: string; tagline: string; color: string }> = {
  1: { name: "Basic KYC", tagline: "Verify PAN & personal details", color: "sky" },
  2: { name: "Intermediate KYC", tagline: "Add Aadhaar & upload documents", color: "amber" },
  3: { name: "Advanced KYC", tagline: "Selfie + residential address", color: "emerald" },
};

const FEATURE_UNLOCKS: Record<number, string[]> = {
  1: ["Spot trading", "INR & crypto deposits", "Quick Convert", "AI Trading Bots", "Copy Trading", "P2P buying", "Flexible Earn"],
  2: ["INR & crypto withdrawals", "Futures trading", "P2P selling", "Locked Earn (higher yields)", "Higher trading limits"],
  3: ["Maximum limits", "Institutional access", "Priority support"],
};

interface KycGateProps {
  requiredLevel: 1 | 2 | 3;
  feature?: string;
  children?: React.ReactNode;
  mode?: "overlay" | "page";
  className?: string;
}

export function KycGate({ requiredLevel, feature, children, mode = "page", className }: KycGateProps) {
  const { user } = useAuth();
  const kycLevel = (user?.kycLevel ?? 0) as number;

  if (!user) {
    return (
      <div className={cn("flex flex-col items-center justify-center min-h-[400px] gap-4", className)}>
        <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center">
          <Lock className="w-7 h-7 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-lg">Login Required</p>
          <p className="text-muted-foreground text-sm mt-1">Sign in to access {feature ?? "this feature"}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (kycLevel >= requiredLevel) return <>{children}</>;

  const meta = LEVEL_META[requiredLevel] ?? LEVEL_META[1];
  const unlocks = FEATURE_UNLOCKS[requiredLevel] ?? [];
  const colorMap: Record<string, string> = {
    sky: "bg-sky-500/10 border-sky-500/30 text-sky-400",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  };
  const badgeColor = colorMap[meta.color] ?? colorMap.sky;

  if (mode === "overlay") {
    return (
      <div className={cn("relative", className)}>
        <div className="pointer-events-none select-none blur-sm opacity-40 overflow-hidden max-h-[400px]">
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 rounded-lg backdrop-blur-sm z-10">
          <KycLockCard requiredLevel={requiredLevel} meta={meta} badgeColor={badgeColor} unlocks={unlocks} feature={feature} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center min-h-[400px] px-4 py-10", className)}>
      <KycLockCard requiredLevel={requiredLevel} meta={meta} badgeColor={badgeColor} unlocks={unlocks} feature={feature} />
    </div>
  );
}

function KycLockCard({
  requiredLevel, meta, badgeColor, unlocks, feature,
}: {
  requiredLevel: number;
  meta: { name: string; tagline: string };
  badgeColor: string;
  unlocks: string[];
  feature?: string;
}) {
  return (
    <div className="max-w-sm w-full bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
        <Shield className="w-7 h-7 text-amber-400" />
      </div>

      <div>
        <h3 className="font-bold text-lg">
          {feature ? `${feature} Locked` : "Feature Locked"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Complete <span className={cn("font-semibold px-1.5 py-0.5 rounded border text-xs", badgeColor)}>{meta.name}</span> to unlock
        </p>
        <p className="text-xs text-muted-foreground mt-1">{meta.tagline}</p>
      </div>

      <div className="w-full text-left bg-zinc-800/60 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Level {requiredLevel} unlocks
        </p>
        {unlocks.map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <Button className="w-full gap-2" asChild>
        <Link href="/kyc">
          Complete {meta.name}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Button>
    </div>
  );
}

export function KycProgressBanner({ className }: { className?: string }) {
  const { user } = useAuth();
  if (!user) return null;
  const kycLevel = (user.kycLevel ?? 0) as number;
  if (kycLevel >= 2) return null;

  const nextLevel = kycLevel + 1;
  const meta = LEVEL_META[nextLevel] ?? LEVEL_META[1];
  const unlocks = FEATURE_UNLOCKS[nextLevel] ?? [];

  const bannerColors: Record<number, string> = {
    0: "border-amber-500/40 bg-amber-500/5",
    1: "border-sky-500/40 bg-sky-500/5",
  };
  const bannerColor = bannerColors[kycLevel] ?? bannerColors[0];

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border text-sm", bannerColor, className)}>
      <Shield className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">
          {kycLevel === 0 ? "Verify your identity" : "Upgrade to Intermediate KYC"}
        </span>
        <span className="text-muted-foreground ml-1.5 hidden sm:inline">
          — Unlock {unlocks.slice(0, 3).join(", ")} and more
        </span>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" asChild>
        <Link href="/kyc">
          {kycLevel === 0 ? "Start KYC" : "Upgrade"} <ArrowRight className="w-3 h-3" />
        </Link>
      </Button>
    </div>
  );
}
