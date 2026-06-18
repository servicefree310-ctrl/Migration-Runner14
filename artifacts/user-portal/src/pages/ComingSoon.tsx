import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Bell, Zap } from "lucide-react";

const FEATURE_META: Record<string, { title: string; description: string; icon: string }> = {
  spot_trading:  { title: "Spot Trading",      description: "Buy and sell crypto instantly at real-time market prices with deep liquidity and low fees.", icon: "📈" },
  futures:       { title: "Futures Trading",   description: "Trade perpetual futures with up to 100× leverage. Advanced order types, funding rates, and deep orderbook depth.", icon: "⚡" },
  options:       { title: "Options",           description: "Hedge your portfolio or speculate with European-style options on major crypto pairs.", icon: "🎯" },
  p2p:           { title: "P2P Marketplace",   description: "Trade directly with other users via escrow-secured P2P orders. Pay with UPI, NEFT, IMPS and more.", icon: "🤝" },
  convert:       { title: "Convert",           description: "Instantly swap between any two assets at the best available rate — no order book required.", icon: "🔄" },
  ai_trading:    { title: "AI Trading Plans",  description: "Let our AI-powered engine trade on your behalf using proven quantitative strategies.", icon: "🤖" },
  trading_bots:  { title: "Trading Bots",      description: "Automate your strategy with grid bots, DCA bots, and market-making bots.", icon: "⚙️" },
  copy_trading:  { title: "Copy Trading",      description: "Copy top traders automatically. Follow their moves, share their profits.", icon: "📋" },
  earn:          { title: "Earn & Staking",    description: "Earn passive yield on your crypto with flexible and fixed staking products.", icon: "💰" },
  wallet:        { title: "Wallet",            description: "Deposit, withdraw, and manage all your crypto and fiat balances in one place.", icon: "👛" },
  inr_payments:  { title: "INR Payments",      description: "Deposit and withdraw Indian Rupees instantly via UPI, NEFT, RTGS, and IMPS.", icon: "₹" },
  leagues:       { title: "Trading Leagues",   description: "Compete with other traders in real-time leaderboard competitions and win prizes.", icon: "🏆" },
  price_alerts:  { title: "Price Alerts",      description: "Set custom price alerts and get notified instantly when your targets are hit.", icon: "🔔" },
  referrals:     { title: "Referrals",         description: "Invite friends and earn a share of their trading fees for life.", icon: "🎁" },
  broker:        { title: "Broker Platform",   description: "Access global equity, forex, and commodity markets through our integrated broker platform.", icon: "🌐" },
  smart_api:     { title: "Smart API",         description: "Programmatic access to all trading functions via our high-performance REST + WebSocket API.", icon: "🔌" },
  portfolio:     { title: "Portfolio",         description: "Track your complete portfolio performance, P&L, and asset allocation in real time.", icon: "📊" },
};

interface ComingSoonProps {
  featureKey?: string;
}

export default function ComingSoon({ featureKey }: ComingSoonProps) {
  const [, navigate] = useLocation();
  const meta = featureKey ? (FEATURE_META[featureKey] ?? null) : null;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Icon badge */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/20 flex items-center justify-center text-5xl shadow-lg shadow-primary/10">
              {meta?.icon ?? "🚀"}
            </div>
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
              <span className="relative inline-flex rounded-full h-5 w-5 bg-primary/80 items-center justify-center">
                <Zap className="w-2.5 h-2.5 text-white" />
              </span>
            </span>
          </div>
        </div>

        {/* Label */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-medium tracking-wide uppercase">
          <Clock className="w-3 h-3" />
          Coming Soon
        </div>

        {/* Title + description */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {meta?.title ?? "Feature Coming Soon"}
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            {meta?.description ?? "This feature is currently under development and will be available soon. We're working hard to bring it to you."}
          </p>
        </div>

        {/* Status card */}
        <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Currently in development</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            <span>Beta testing phase coming next</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            <span>General availability soon</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="default" className="gap-2" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => navigate("/price-alerts")}>
            <Bell className="w-4 h-4" />
            Set Price Alerts
          </Button>
        </div>

        {/* Footer note */}
        <p className="text-xs text-muted-foreground/60">
          Stay updated — follow our announcements for launch dates and early access.
        </p>
      </div>
    </div>
  );
}
