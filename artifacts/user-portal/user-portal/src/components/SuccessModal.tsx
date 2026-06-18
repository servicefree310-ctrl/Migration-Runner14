/**
 * SuccessModal — premium animated confirmation overlay.
 * Kinds: order, plan, bot, generic (transfer, withdraw, deposit, convert, earn, redeem, futures, p2p)
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BarChart2, Bot, Zap, ArrowUpRight,
  ArrowLeftRight, ArrowUpFromLine, ArrowDownToLine,
  RefreshCcw, Coins, Unlock, TrendingUp, Users, Shield,
  IndianRupee, CheckCircle2,
} from "lucide-react";

/* ── Keyframe CSS ─────────────────────────────────────────────────────────── */
const KEYFRAMES = `
@keyframes sm-ring {
  from { stroke-dashoffset: 201; opacity: 0; }
  to   { stroke-dashoffset: 0;   opacity: 1; }
}
@keyframes sm-check {
  0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
  55%  { transform: scale(1.25) rotate(5deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg);   opacity: 1; }
}
@keyframes sm-card {
  from { transform: translateY(24px) scale(0.96); opacity: 0; }
  to   { transform: translateY(0) scale(1);       opacity: 1; }
}
@keyframes sm-row {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;

/* ── Payload types ────────────────────────────────────────────────────────── */
export type OrderSuccess = {
  kind: "order";
  side: "buy" | "sell";
  orderType: string;
  pair: string;
  amount: string;
  baseSymbol: string;
  quoteSymbol: string;
  price?: string;
  orderId?: string | number;
};

export type PlanSuccess = {
  kind: "plan";
  planName: string;
  riskColor: string;
  investedUsdt: number;
  dailyPct: number;
  durationDays: number | null;
  dailyProfit: number;
  expectedProfit: number;
};

export type BotSuccess = {
  kind: "bot";
  botId?: number;
  botName: string;
  botType: "grid" | "dca";
  pair: string;
};

export type GenericSuccess = {
  kind: "generic";
  accentColor: string;
  iconKind:
    | "transfer" | "withdraw" | "deposit" | "convert"
    | "earn" | "redeem" | "futures" | "p2p" | "dispute"
    | "inr_deposit" | "inr_withdraw" | "p2p_ad" | "paid";
  title: string;
  subtitle?: string;
  rows: { label: string; value: string; accent?: string }[];
  primaryLabel?: string;
  onPrimaryExtra?: () => void;
};

export type SuccessPayload = OrderSuccess | PlanSuccess | BotSuccess | GenericSuccess;

/* ── Icon map for GenericSuccess ─────────────────────────────────────────── */
const GENERIC_ICON: Record<GenericSuccess["iconKind"], React.FC<any>> = {
  transfer:    ArrowLeftRight,
  withdraw:    ArrowUpFromLine,
  deposit:     ArrowDownToLine,
  convert:     RefreshCcw,
  earn:        Coins,
  redeem:      Unlock,
  futures:     TrendingUp,
  p2p:         Users,
  dispute:     Shield,
  inr_deposit: IndianRupee,
  inr_withdraw:ArrowUpFromLine,
  p2p_ad:      CheckCircle2,
  paid:        CheckCircle2,
};

/* ── Animated SVG ring + checkmark ───────────────────────────────────────── */
function AnimatedCheck({ color }: { color: string }) {
  return (
    <div className="relative w-24 h-24 mx-auto mb-5">
      <svg viewBox="0 0 96 96" className="w-full h-full" fill="none">
        <circle cx="48" cy="48" r="44" fill={`${color}10`} />
        <circle cx="48" cy="48" r="40" fill={`${color}06`} />
        <circle cx="48" cy="48" r="38" stroke={`${color}30`} strokeWidth="2" />
        <circle
          cx="48" cy="48" r="38"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="239"
          strokeDashoffset="239"
          style={{
            animation: "sm-ring 0.65s cubic-bezier(0.4,0,0.2,1) forwards",
            transformOrigin: "48px 48px",
            transform: "rotate(-90deg)",
          }}
        />
        <g style={{ animation: "sm-check 0.45s 0.55s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          <path
            d="M31 49 L43 61 L66 35"
            stroke={color}
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}

/* ── Single detail row ────────────────────────────────────────────────────── */
function Row({
  label, value, accent, delay = 0,
}: {
  label: string; value: React.ReactNode; accent?: string; delay?: number;
}) {
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
      style={{ animation: `sm-row 0.3s ${0.58 + delay * 0.07}s ease both`, opacity: 0 }}
    >
      <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">{label}</span>
      <span className={`text-sm font-bold font-mono ${accent ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

/* ── Shared card layout ──────────────────────────────────────────────────── */
function ModalCard({
  accentColor, title, subtitle, rows, actions,
}: {
  accentColor: string;
  title: string;
  subtitle?: string;
  rows: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <DialogContent
      className="max-w-sm border-0 p-0 overflow-hidden gap-0"
      style={{
        background: "linear-gradient(145deg, #0f172a 0%, #1a1040 60%, #0f172a 100%)",
        boxShadow: `0 0 80px ${accentColor}18, 0 25px 80px rgba(0,0,0,0.85)`,
        border: `1px solid ${accentColor}28`,
        animation: "sm-card 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
      }}
    >
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)` }} />
      <div className="px-6 pt-7 pb-6">
        <AnimatedCheck color={accentColor} />
        <div className="text-center mb-5" style={{ animation: "sm-row 0.3s 0.48s ease both", opacity: 0 }}>
          <h2 className="text-2xl font-black tracking-tight" style={{ color: accentColor }}>{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1 font-medium">{subtitle}</p>}
        </div>
        <div
          className="rounded-xl border px-4 py-0.5 mb-1"
          style={{ borderColor: `${accentColor}22`, background: `${accentColor}07`, animation: "sm-row 0.3s 0.54s ease both", opacity: 0 }}
        >
          {rows}
        </div>
        {actions}
      </div>
    </DialogContent>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export function SuccessModal({
  open, onClose, payload, onViewOrders, onViewBots,
}: {
  open: boolean;
  onClose: () => void;
  payload: SuccessPayload | null;
  onViewOrders?: () => void;
  onViewBots?: () => void;
}) {
  if (!payload) return null;

  const fmt = (n: number, dp = 2) =>
    n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  /* ── Generic ─────────────────────────────────────────────────────────────── */
  if (payload.kind === "generic") {
    const { accentColor, iconKind, title, subtitle, rows, primaryLabel, onPrimaryExtra } = payload;
    const Icon = GENERIC_ICON[iconKind];
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <style>{KEYFRAMES}</style>
        <ModalCard
          accentColor={accentColor}
          title={title}
          subtitle={subtitle}
          rows={
            <>
              {rows.map((r, i) => (
                <Row key={i} label={r.label} value={r.value} accent={r.accent} delay={i} />
              ))}
            </>
          }
          actions={
            <div className="flex gap-2 mt-5">
              <Button
                className="flex-1 gap-1.5 text-xs h-9 font-semibold"
                style={{ background: accentColor, color: "#000" }}
                onClick={() => { onPrimaryExtra?.(); onClose(); }}
              >
                <Icon className="w-3.5 h-3.5" />
                {primaryLabel ?? "Done"}
              </Button>
            </div>
          }
        />
      </Dialog>
    );
  }

  /* ── Shared local vars ───────────────────────────────────────────────────── */
  let accentColor: string;
  let title: string;
  let subtitle: string;
  let rows: React.ReactNode;
  let actions: React.ReactNode;

  /* ── Order ──────────────────────────────────────────────── */
  if (payload.kind === "order") {
    const isBuy = payload.side === "buy";
    accentColor = isBuy ? "#10B981" : "#F87171";
    title = isBuy ? "Buy Order Placed!" : "Sell Order Placed!";
    subtitle = `${payload.pair} · ${payload.orderType.charAt(0).toUpperCase() + payload.orderType.slice(1)}`;
    const isInr = payload.quoteSymbol === "INR";
    const priceFormatted = payload.price
      ? `${isInr ? "₹" : ""}${fmt(Number(payload.price), isInr ? 0 : 2)} ${payload.quoteSymbol}`
      : null;
    const totalFormatted = payload.price
      ? `${isInr ? "₹" : ""}${fmt(Number(payload.amount) * Number(payload.price), isInr ? 0 : 2)} ${payload.quoteSymbol}`
      : "Market Price";

    rows = (
      <>
        <Row label="Side" value={<span style={{ color: accentColor }}>{isBuy ? "▲ BUY" : "▼ SELL"}</span>} delay={0} />
        <Row label="Amount" value={`${payload.amount} ${payload.baseSymbol}`} delay={1} />
        {priceFormatted && <Row label="Price" value={priceFormatted} delay={2} />}
        <Row label={isBuy ? "Total Cost" : "You Receive"} value={totalFormatted} accent="text-amber-300" delay={3} />
        {payload.orderId && <Row label="Order ID" value={`#${payload.orderId}`} accent="text-muted-foreground" delay={4} />}
      </>
    );
    actions = (
      <div className="flex gap-2 mt-5">
        {onViewOrders && (
          <Button variant="outline" className="flex-1 border-white/10 gap-1.5 text-xs h-9" onClick={() => { onViewOrders(); onClose(); }}>
            <BarChart2 className="w-3.5 h-3.5" /> View Orders
          </Button>
        )}
        <Button className="flex-1 gap-1.5 text-xs h-9 font-semibold" style={{ background: accentColor, color: "#000" }} onClick={onClose}>
          Continue <ArrowUpRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    );

  /* ── AI Plan ─────────────────────────────────────────────── */
  } else if (payload.kind === "plan") {
    accentColor = payload.riskColor || "#F59E0B";
    title = "Bot Activated! 🚀";
    subtitle = payload.planName;
    rows = (
      <>
        <Row label="Invested"      value={`$${fmt(payload.investedUsdt)} USDT`} delay={0} />
        <Row label="Daily Return"  value={`+${payload.dailyPct}% / day`} accent="text-emerald-400" delay={1} />
        <Row label="Daily Profit"  value={`+$${fmt(payload.dailyProfit, 4)} USDT`} accent="text-emerald-400" delay={2} />
        <Row label="Duration"      value={payload.durationDays ? `${payload.durationDays} days` : "Unlimited ∞"} delay={3} />
        {payload.expectedProfit > 0 && (
          <Row label="Expected Profit" value={`+$${fmt(payload.expectedProfit, 2)} USDT`} accent="text-amber-300" delay={4} />
        )}
      </>
    );
    actions = (
      <div className="flex gap-2 mt-5">
        {onViewBots && (
          <Button className="flex-1 gap-1.5 text-xs h-9 font-semibold" style={{ background: accentColor, color: "#000" }} onClick={() => { onViewBots(); onClose(); }}>
            <Zap className="w-3.5 h-3.5" /> View My Bots
          </Button>
        )}
        <Button variant="outline" className="flex-1 border-white/10 gap-1.5 text-xs h-9" onClick={onClose}>Close</Button>
      </div>
    );

  /* ── Trading Bot ─────────────────────────────────────────── */
  } else {
    accentColor = "#60A5FA";
    title = "Bot Created!";
    subtitle = `${payload.botName} · ${payload.botType === "grid" ? "Grid Bot" : "DCA Bot"}`;
    rows = (
      <>
        <Row label="Pair"     value={payload.pair} delay={0} />
        <Row label="Strategy" value={payload.botType === "grid" ? "Grid Trading" : "DCA (Cost Avg)"} accent="text-blue-400" delay={1} />
        <Row label="Status"   value="Ready — press Start to begin" accent="text-amber-300" delay={2} />
      </>
    );
    actions = (
      <div className="flex gap-2 mt-5">
        {onViewBots && (
          <Button className="flex-1 gap-1.5 text-xs h-9 font-semibold" style={{ background: accentColor, color: "#000" }} onClick={() => { onViewBots(); onClose(); }}>
            <Bot className="w-3.5 h-3.5" /> Go to Bots
          </Button>
        )}
        <Button variant="outline" className="flex-1 border-white/10 gap-1.5 text-xs h-9" onClick={onClose}>Close</Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <style>{KEYFRAMES}</style>
      <ModalCard accentColor={accentColor} title={title} subtitle={subtitle} rows={rows} actions={actions} />
    </Dialog>
  );
}
