import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, ToggleLeft, TrendingUp, Wallet, Bot, Users, Zap, Globe } from "lucide-react";

type FeatureKey =
  | "spot_trading" | "futures" | "options" | "p2p" | "convert"
  | "ai_trading" | "trading_bots" | "copy_trading" | "earn" | "wallet"
  | "inr_payments" | "leagues" | "price_alerts" | "referrals"
  | "broker" | "smart_api" | "portfolio";

interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  route: string;
  badge?: string;
}

interface FeatureCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  features: FeatureDef[];
}

const CATEGORIES: FeatureCategory[] = [
  {
    id: "trading",
    label: "Core Trading",
    icon: <TrendingUp className="w-4 h-4" />,
    color: "text-blue-500",
    features: [
      { key: "spot_trading",  label: "Spot Trading",        route: "/trade",    description: "Buy/sell crypto at live market prices with the in-house matching engine." },
      { key: "futures",       label: "Futures (Perps)",     route: "/futures",  description: "Perpetual futures with leverage up to 100×. Powered by the Go matching engine.", badge: "Go engine" },
      { key: "options",       label: "Options",             route: "/options",  description: "European-style options on BTC, ETH and other major pairs.", badge: "Beta" },
      { key: "p2p",           label: "P2P Marketplace",     route: "/p2p",      description: "Escrow-secured peer-to-peer trading with UPI / bank transfer support." },
      { key: "convert",       label: "Convert / Swap",      route: "/convert",  description: "Instant zero-orderbook swaps between any two supported assets." },
    ],
  },
  {
    id: "automation",
    label: "AI & Automation",
    icon: <Bot className="w-4 h-4" />,
    color: "text-purple-500",
    features: [
      { key: "ai_trading",   label: "AI Trading Plans",  route: "/ai-trading",   description: "Managed AI strategies that auto-invest and auto-compound on behalf of users." },
      { key: "trading_bots", label: "Trading Bots",      route: "/bots",         description: "Grid, DCA, and market-making bots configurable per-pair." },
      { key: "copy_trading", label: "Copy Trading",      route: "/copy-trading", description: "Follow top traders and mirror their positions in real time." },
    ],
  },
  {
    id: "finance",
    label: "Finance & Earn",
    icon: <Wallet className="w-4 h-4" />,
    color: "text-green-500",
    features: [
      { key: "wallet",      label: "Wallet",          route: "/wallet",  description: "Crypto deposit / withdrawal management. Disabling hides the Wallet page." },
      { key: "earn",        label: "Earn / Staking",  route: "/earn",    description: "Fixed and flexible savings products with admin-configured APY." },
      { key: "inr_payments",label: "INR Payments",    route: "/inr",     description: "INR deposit & withdrawal via UPI, NEFT, RTGS (Razorpay-backed)." },
      { key: "portfolio",   label: "Portfolio",       route: "/portfolio", description: "Performance tracking, asset allocation and P&L history." },
    ],
  },
  {
    id: "social",
    label: "Social & Growth",
    icon: <Users className="w-4 h-4" />,
    color: "text-amber-500",
    features: [
      { key: "referrals",    label: "Referrals",          route: "/referrals",    description: "Invite-a-friend programme with configurable commission structure." },
      { key: "leagues",      label: "Trading Leagues",    route: "/leagues",      description: "Leaderboard competitions with prize pool distribution." },
      { key: "price_alerts", label: "Price Alerts",       route: "/price-alerts", description: "User-configurable price notifications via push / email." },
    ],
  },
  {
    id: "advanced",
    label: "Advanced / Institutional",
    icon: <Globe className="w-4 h-4" />,
    color: "text-rose-500",
    features: [
      { key: "broker",    label: "Broker Platform (Angel One)", route: "/broker", description: "Integrated access to equities, forex, and commodities via Angel One API.", badge: "Partner" },
      { key: "smart_api", label: "Smart API",                   route: "/smartapi", description: "Programmatic trading API with WebSocket streams for algorithmic traders.", badge: "Pro" },
    ],
  },
];

const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
  spot_trading: true, futures: true, options: true, p2p: true, convert: true,
  ai_trading: true, trading_bots: true, copy_trading: true, earn: true, wallet: true,
  inr_payments: true, leagues: true, price_alerts: true, referrals: true,
  broker: false, smart_api: false, portfolio: true,
};

export default function FeaturesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: savedFlags, isLoading } = useQuery<Record<FeatureKey, boolean>>({
    queryKey: ["admin-feature-flags"],
    queryFn: () => get<Record<FeatureKey, boolean>>("/admin/features"),
    staleTime: 0,
  });

  const [flags, setFlags] = useState<Record<FeatureKey, boolean>>({ ...DEFAULT_FLAGS });

  useEffect(() => {
    if (savedFlags) setFlags({ ...DEFAULT_FLAGS, ...savedFlags });
  }, [savedFlags]);

  const mutation = useMutation({
    mutationFn: (f: Record<FeatureKey, boolean>) =>
      put<Record<FeatureKey, boolean>>("/admin/features", f),
    onSuccess: (updated) => {
      qc.setQueryData(["admin-feature-flags"], updated);
      toast({ title: "Feature flags saved", description: "Changes are live within ~30 seconds on the user portal." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save feature flags.", variant: "destructive" });
    },
  });

  const toggle = (key: FeatureKey) =>
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));

  const enabledCount = Object.values(flags).filter(Boolean).length;
  const totalCount   = Object.keys(flags).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feature Management"
        description="Control which platform features are live. Disabled features show a professional 'Coming Soon' page to users."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {enabledCount}/{totalCount} features enabled
            </span>
            <Button
              onClick={() => mutation.mutate(flags)}
              disabled={mutation.isPending || isLoading}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {mutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        }
      />

      {/* Summary bar */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const on  = cat.features.filter((f) => flags[f.key]).length;
          const tot = cat.features.length;
          return (
            <div key={cat.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs">
              <span className={cat.color}>{cat.icon}</span>
              <span className="font-medium">{cat.label}</span>
              <span className="text-muted-foreground">{on}/{tot}</span>
            </div>
          );
        })}
      </div>

      {/* Category cards */}
      {CATEGORIES.map((cat) => (
        <Card key={cat.id}>
          <CardHeader className="pb-3">
            <CardTitle className={`flex items-center gap-2 text-base ${cat.color}`}>
              {cat.icon}
              {cat.label}
            </CardTitle>
            <CardDescription className="text-xs">
              {cat.features.filter((f) => flags[f.key]).length} of {cat.features.length} features enabled
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            {cat.features.map((feat, idx) => (
              <div
                key={feat.key}
                className={`flex items-start gap-4 py-4 ${idx < cat.features.length - 1 ? "border-b border-border/50" : ""}`}
              >
                <Switch
                  checked={flags[feat.key] ?? false}
                  onCheckedChange={() => toggle(feat.key)}
                  disabled={isLoading}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${flags[feat.key] ? "" : "text-muted-foreground"}`}>
                      {feat.label}
                    </span>
                    {feat.badge && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {feat.badge}
                      </Badge>
                    )}
                    {flags[feat.key] ? (
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-500 border-green-500/20">
                        Live
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-500 border-amber-500/20">
                        Coming Soon
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{feat.description}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1 font-mono">
                    Route: <span className="text-muted-foreground/70">{feat.route}</span>
                  </p>
                </div>

                {/* Quick enable-all / disable-all for the row */}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-destructive">
            <Zap className="w-4 h-4" />
            Bulk Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const all = Object.fromEntries(
                Object.keys(DEFAULT_FLAGS).map((k) => [k, true])
              ) as Record<FeatureKey, boolean>;
              setFlags(all);
            }}
          >
            Enable All Features
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => {
              const none = Object.fromEntries(
                Object.keys(DEFAULT_FLAGS).map((k) => [k, false])
              ) as Record<FeatureKey, boolean>;
              setFlags(none);
            }}
          >
            Disable All Features
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFlags({ ...DEFAULT_FLAGS, ...savedFlags })}
          >
            Reset to Saved
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
