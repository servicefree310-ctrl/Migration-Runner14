/**
 * AI Trading Invoice — premium full-colour statement for an AI bot subscription.
 * Route: /ai-trading/:id/invoice
 * PDF captured from a hidden fixed-width 794px clone for consistent A4 output.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  Bot, TrendingUp, TrendingDown, CheckCircle2,
  Zap, Clock, Shield, Calendar, Star,
} from "lucide-react";

interface AIInvoiceData {
  invoiceNo: string;
  issuedAt: string;
  type: string;
  exchange: {
    name: string; short: string; legal: string;
    cin: string; gst: string; address: string;
  };
  user: { id?: number; name: string; email: string };
  bot: {
    subscriptionId: number; planName: string; riskLevel: string | null;
    dailyReturnPercent: number | null; durationDays: number | null;
    status: "active" | "completed" | "cancelled"; statusLabel: string; payouts: number;
    startedAt: string | null; expiresAt: string | null; lastCreditedAt: string | null;
  };
  charges: { tdsEnabled: boolean; tdsRatePct: number; tdsNote: string };
  totals: {
    principalUsdt: number; grossProfitUsdt: number; tdsUsdt: number;
    netProfitUsdt: number; principalReturned: boolean; payoutUsdt: number; roiPct: number;
    principalInr: number; grossProfitInr: number; tdsInr: number;
    netProfitInr: number; payoutInr: number; inrRate: number;
  };
  legend: string;
}

const fmtU = (n: number, dp = 4) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";

const fmtInr = (n: number) =>
  Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTs = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  active:    { background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" },
  completed: { background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.3)" },
  cancelled: { background: "rgba(248,113,113,0.12)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)" },
};
const RISK_STYLE: Record<string, React.CSSProperties> = {
  low:    { background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)" },
  medium: { background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.2)" },
  high:   { background: "rgba(248,113,113,0.12)", color: "#F87171", border: "1px solid rgba(248,113,113,0.2)" },
  ultra:  { background: "rgba(167,139,250,0.12)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.2)" },
};

export default function AIInvoice() {
  const [, params] = useRoute<{ id: string }>("/ai-trading/:id/invoice");
  const subId = params?.id;

  const { data: inv, isLoading, isError, error } = useQuery<AIInvoiceData>({
    queryKey: ["ai-invoice", subId],
    queryFn: () => get(`/ai-trading/subscriptions/${subId}/invoice`),
    enabled: !!subId,
  });

  useEffect(() => {
    if (!inv?.invoiceNo) return;
    const prev = document.title;
    document.title = inv.invoiceNo;
    return () => { document.title = prev; };
  }, [inv?.invoiceNo]);

  const [downloading, setDownloading] = useState(false);

  // Auto-scale invoice to fit any screen width (CSS zoom — no layout changes needed)
  const screenWrapRef = useRef<HTMLDivElement>(null);
  const zoomWrapRef   = useRef<HTMLDivElement>(null);
  const bodyRef       = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = screenWrapRef.current;
    if (!el) return;
    const update = () => setZoom(Math.min(1, el.offsetWidth / 480));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const downloadPdf = async () => {
    if (!inv || !bodyRef.current || !zoomWrapRef.current || !screenWrapRef.current) return;
    setDownloading(true);
    try {
      const body     = bodyRef.current;
      const zoomWrap = zoomWrapRef.current;
      const wrap     = screenWrapRef.current;

      // Temporarily expand to 794px for high-quality capture (hide overflow so no visual flash)
      const prevOverflow = wrap.style.overflow;
      wrap.style.overflow = "hidden";
      const prevZoom = zoomWrap.style.zoom;
      zoomWrap.style.zoom = "1";
      const prevWidth = body.style.width;
      body.style.width = "794px";

      await new Promise(r => setTimeout(r, 150));
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const { downloadElementAsPdf } = await import("@/lib/download-pdf");
      await downloadElementAsPdf(body, `${inv.invoiceNo}.pdf`, { backgroundColor: "#0f172a" });

      // Restore layout
      body.style.width    = prevWidth;
      zoomWrap.style.zoom = prevZoom;
      wrap.style.overflow = prevOverflow;
      toast.success("Invoice downloaded successfully");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("PDF generation failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#0f172a,#1e1b4b)" }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
              boxShadow: "0 8px 30px rgba(124,58,237,0.4)" }}>
            <Loader2 className="w-7 h-7 animate-spin text-white" />
          </div>
          <p className="text-sm text-slate-400">Loading AI Trading Invoice…</p>
        </div>
      </div>
    );
  }

  if (isError || !inv) {
    const msg = (error as any)?.data?.message ?? (error as any)?.message ?? "Could not load invoice";
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-10 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-rose-400 mb-4" />
          <p className="font-bold text-rose-400 text-lg">{msg}</p>
          <Link href="/ai-trading">
            <Button variant="outline" size="sm" className="mt-6">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to AI Trading
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { exchange, user, bot, charges, totals } = inv;
  const isProfit  = totals.grossProfitUsdt >= 0;
  const roiColor  = isProfit ? "#10B981" : "#F87171";
  const statusSty = STATUS_STYLE[bot.status] ?? STATUS_STYLE.active;
  const riskSty   = RISK_STYLE[(bot.riskLevel ?? "").toLowerCase()] ?? RISK_STYLE.medium;
  const roiAbs    = Math.abs(totals.roiPct);
  const roiBarPct = Math.min(100, roiAbs);

  // Shared body — screen uses responsive classes; fixed=true always renders at desktop layout
  const InvoiceBody = ({ fixed }: { fixed?: boolean }) => (
    <div
      className={fixed ? undefined : "rounded-3xl overflow-hidden shadow-2xl"}
      style={{
        boxShadow: fixed ? undefined : "0 25px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(139,92,246,0.2)",
        width: fixed ? 794 : undefined,
      }}
    >
      {/* Top violet accent bar */}
      <div style={{ height: 5, background: "linear-gradient(90deg,#4C1D95,#6D28D9,#7C3AED,#8B5CF6,#A78BFA,#8B5CF6)" }} />

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg,#0f172a 0%,#1a1040 60%,#0f172a 100%)",
        position: "relative", overflow: "hidden",
      }} className={fixed ? "px-8 py-7" : "px-4 py-5 sm:px-8 sm:py-7"}>

        <div style={{
          position: "absolute", inset: 0, opacity: 0.05,
          backgroundImage: "radial-gradient(circle,#8B5CF6 1px,transparent 1px)",
          backgroundSize: "24px 24px",
        }} />
        <div style={{
          position: "absolute", top: -80, right: -40, width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(139,92,246,0.2) 0%,transparent 70%)",
        }} />
        <div style={{
          position: "absolute", bottom: -60, left: -40, width: 160, height: 160, borderRadius: "50%",
          background: "radial-gradient(circle,rgba(109,40,217,0.15) 0%,transparent 70%)",
        }} />

        {/* Brand + Invoice meta */}
        <div className={`relative ${fixed ? "flex items-start justify-between gap-4" : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"}`}>
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg shrink-0"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
                  boxShadow: "0 4px 14px rgba(124,58,237,0.45)" }}>
                <Bot style={{ width: 20, height: 20, color: "white" }} />
              </div>
              <div>
                <div className="text-xl font-extrabold tracking-tight" style={{ color: "#A78BFA" }}>
                  {exchange.short} <span className="text-white/80">AI</span>
                </div>
                <div className="text-[10px] text-slate-500 font-medium tracking-wide">ALGORITHMIC TRADING ENGINE</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">{exchange.name}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1 max-w-[280px]">{exchange.address}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
              <p className="text-[10px] text-slate-600 font-mono">GSTIN: <span className="text-slate-400">{exchange.gst || "Registration Pending"}</span></p>
              <p className="text-[10px] text-slate-600 font-mono">CIN: <span className="text-slate-400">{exchange.cin}</span></p>
            </div>
          </div>

          {/* Invoice meta */}
          <div className={fixed ? "text-right shrink-0" : "sm:text-right"}>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ background: "rgba(139,92,246,0.2)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.35)" }}>
              AI Trading Statement
            </div>
            <p className="text-2xl font-extrabold text-white tabular-nums mt-0.5">{inv.invoiceNo}</p>
            <div className={`flex items-center gap-1.5 mt-1.5 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <Calendar style={{ width: 10, height: 10, color: "#64748b" }} />
              <p className="text-[11px] text-slate-400">Issued: {fmtTs(inv.issuedAt)}</p>
            </div>
            <div className={`mt-2.5 flex items-center gap-2 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={statusSty}>
                {bot.status === "active" ? <Zap style={{ width: 9, height: 9 }} />
                  : bot.status === "completed" ? <CheckCircle2 style={{ width: 9, height: 9 }} />
                  : <Clock style={{ width: 9, height: 9 }} />}
                {bot.statusLabel}
              </span>
            </div>
            <div className={`mt-2.5 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${fixed ? "" : ""}`}
              style={{
                background: isProfit ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)",
                border: isProfit ? "1.5px solid rgba(16,185,129,0.35)" : "1.5px solid rgba(248,113,113,0.35)",
              }}>
              {isProfit
                ? <TrendingUp style={{ width: 13, height: 13, color: "#10B981" }} />
                : <TrendingDown style={{ width: 13, height: 13, color: "#F87171" }} />}
              <span className="font-extrabold text-base tabular-nums" style={{ color: roiColor }}>
                {isProfit ? "+" : ""}{totals.roiPct.toFixed(2)}% ROI
              </span>
            </div>
          </div>
        </div>

        {/* Verified badge */}
        <div className="relative mt-5 flex items-center gap-3 rounded-xl px-4 py-2.5"
          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <Shield style={{ width: 14, height: 14, color: "#10B981", flexShrink: 0 }} />
          <p className="text-[10px] text-emerald-400 font-semibold tracking-wide">
            VERIFIED AI TRADING RECORD — Generated {fmtTs(inv.issuedAt)}
          </p>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-500 font-bold">AUTHENTIC</span>
          </div>
        </div>
      </div>

      {/* ── WHITE BODY ── */}
      <div className="bg-white relative">
        {/* Watermark */}
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", pointerEvents: "none", zIndex: 0, overflow: "hidden",
        }}>
          <span style={{
            transform: "rotate(-35deg)", fontSize: 72, fontWeight: 900,
            color: "rgba(139,92,246,0.04)", letterSpacing: "0.05em",
            userSelect: "none", whiteSpace: "nowrap",
          }}>AI TRADING</span>
        </div>

        {/* Bill-to + Bot info */}
        <div className={`relative ${fixed ? "px-8 py-6 grid grid-cols-2 gap-6" : "px-4 py-5 sm:px-8 sm:py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-4 h-4 rounded flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                <Bot style={{ width: 9, height: 9, color: "white" }} />
              </div>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: "#6D28D9" }}>Bill To</p>
            </div>
            <p className="font-bold text-slate-800 text-sm">{user.name || user.email}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-mono">UID #{user.id}</span>
            </p>
          </div>
          <div className={fixed ? "text-right" : "sm:text-right"}>
            <div className={`flex items-center gap-1.5 mb-2 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: "#6D28D9" }}>Bot / Strategy</p>
              <div className="w-4 h-4 rounded flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                <Star style={{ width: 9, height: 9, color: "white" }} />
              </div>
            </div>
            <p className="font-bold text-slate-800 text-sm">{bot.planName}</p>
            <div className={`flex items-center gap-2 mt-1.5 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={riskSty}>
                {bot.riskLevel ?? "N/A"} risk
              </span>
              {bot.dailyReturnPercent !== null && (
                <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded-full">
                  {bot.dailyReturnPercent}%/day
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              Sub #<span className="font-mono font-semibold text-slate-600">{bot.subscriptionId}</span>
            </p>
          </div>
        </div>

        {/* Timeline strip */}
        <div className={`relative ${fixed ? "px-8 py-4 grid grid-cols-3 gap-4" : "px-4 py-4 sm:px-8 grid grid-cols-3 gap-2 sm:gap-4"}`}
          style={{ borderBottom: "2px solid #f1f5f9", background: "linear-gradient(135deg,#faf5ff,#f5f3ff)" }}>
          {[
            { label: "Started", value: fmtDate(bot.startedAt), icon: <Zap style={{ width: 10, height: 10, color: "#8B5CF6" }} /> },
            { label: "Expires", value: bot.expiresAt ? fmtDate(bot.expiresAt) : "No expiry", icon: <Clock style={{ width: 10, height: 10, color: "#8B5CF6" }} /> },
            { label: "Last credited", value: fmtDate(bot.lastCreditedAt), icon: <CheckCircle2 style={{ width: 10, height: 10, color: "#10B981" }} /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {icon}
                <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400">{label}</p>
              </div>
              <p className="text-xs font-bold text-slate-700">{value}</p>
            </div>
          ))}
        </div>

        {/* ROI bar */}
        <div className={`relative ${fixed ? "px-8 pt-5 pb-4" : "px-4 pt-4 pb-3 sm:px-8 sm:pt-5 sm:pb-4"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#8B5CF6,#6D28D9)" }} />
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: "#6D28D9" }}>Return on Investment</p>
            </div>
            <span className="text-lg font-extrabold tabular-nums" style={{ color: roiColor }}>
              {isProfit ? "+" : ""}{totals.roiPct.toFixed(2)}%
            </span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "#f1f5f9" }}>
            <div className="h-full rounded-full"
              style={{
                width: `${roiBarPct}%`,
                background: isProfit ? "linear-gradient(90deg,#10B981,#34D399)" : "linear-gradient(90deg,#F87171,#EF4444)",
                minWidth: "4px",
              }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">0%</span>
            <span className="text-[10px] text-slate-400">Target</span>
          </div>
        </div>

        {/* Earnings breakdown table */}
        <div className={`relative ${fixed ? "px-8 py-5" : "px-4 py-4 sm:px-8 sm:py-5"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#8B5CF6,#6D28D9)" }} />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: "#6D28D9" }}>Earnings Statement</p>
          </div>
          <div className={fixed ? undefined : "overflow-x-auto -mx-1"}>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", minWidth: fixed ? undefined : 480 }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)" }}>
                    <th className="text-left px-4 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Description</th>
                    <th className="text-right px-4 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">USDT</th>
                    <th className="text-right px-4 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">INR (est.)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Principal invested", usdt: fmtU(totals.principalUsdt) + " USDT", inr: fmtInr(totals.principalInr), bg: "#f8fafc", color: "#475569" },
                    { label: isProfit ? "Gross profit" : "Gross loss", usdt: (isProfit ? "+" : "") + fmtU(totals.grossProfitUsdt) + " USDT", inr: fmtInr(totals.grossProfitInr), bg: isProfit ? "#F0FDF4" : "#FEF2F2", color: isProfit ? "#15803D" : "#DC2626" },
                    { label: `TDS @ ${charges.tdsRatePct}% on profit`, usdt: "− " + fmtU(totals.tdsUsdt) + " USDT", inr: "− " + fmtInr(totals.tdsInr), bg: "#f8fafc", color: "#64748b" },
                    { label: "Net profit / loss", usdt: (isProfit ? "+" : "") + fmtU(totals.netProfitUsdt) + " USDT", inr: fmtInr(totals.netProfitInr), bg: isProfit ? "#DCFCE7" : "#FEE2E2", color: isProfit ? "#15803D" : "#DC2626", bold: true },
                  ].map(({ label, usdt, inr, bg, color, bold }) => (
                    <tr key={label} style={{ background: bg, borderTop: "1px solid #f1f5f9" }}>
                      <td className="px-4 py-2.5 text-slate-700" style={{ fontWeight: bold ? 700 : 400 }}>{label}</td>
                      <td className="text-right px-4 py-2.5 font-mono tabular-nums" style={{ color, fontWeight: bold ? 700 : 500 }}>{usdt}</td>
                      <td className="text-right px-4 py-2.5 font-mono tabular-nums text-slate-400" style={{ fontWeight: bold ? 600 : 400 }}>{inr}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #7C3AED", background: "linear-gradient(135deg,#faf5ff,#f5f3ff)" }}>
                    <td className="px-4 py-3 font-bold text-violet-800 text-[11px]">
                      {totals.principalReturned ? "Total payout (principal + net profit)" : "Profit accrued (principal still locked)"}
                    </td>
                    <td className="text-right px-4 py-3 font-extrabold text-violet-700 font-mono tabular-nums">{fmtU(totals.payoutUsdt)} USDT</td>
                    <td className="text-right px-4 py-3 font-bold text-violet-600 font-mono tabular-nums">{fmtInr(totals.payoutInr)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className={`relative ${fixed ? "px-8 py-5" : "px-4 py-4 sm:px-8 sm:py-5"}`}
          style={{ borderBottom: "2px solid #f1f5f9", background: "#fafafa" }}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "ROI", value: (isProfit ? "+" : "") + totals.roiPct.toFixed(2) + "%", color: roiColor, bg: isProfit ? "#F0FDF4" : "#FEF2F2", border: isProfit ? "#BBF7D0" : "#FECACA" },
              { label: "Payouts Credited", value: `${bot.payouts} credits`, color: "#7C3AED", bg: "#faf5ff", border: "#e9d5ff" },
              { label: "1 USDT ≈", value: `₹${(totals.inrRate ?? 84).toFixed(2)}`, color: "#475569", bg: "#f8fafc", border: "#e2e8f0" },
            ].map(({ label, value, color, bg, border }) => (
              <div key={label} className="rounded-xl py-3 px-3 text-center"
                style={{ background: bg, border: `1.5px solid ${border}` }}>
                <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-slate-400 mb-1">{label}</p>
                <p className="font-extrabold text-sm tabular-nums" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={`relative ${fixed ? "px-8 py-6" : "px-4 py-5 sm:px-8 sm:py-6"}`}>
          <div className="rounded-xl p-4 mb-5"
            style={{ background: "linear-gradient(135deg,#faf5ff,#f5f3ff)", border: "1px solid #e9d5ff" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                <Bot style={{ width: 14, height: 14, color: "white" }} />
              </div>
              <div className="text-[11px] text-slate-500 space-y-1.5">
                <p className="font-semibold text-slate-700">{inv.legend}</p>
                <p>
                  <span className="font-semibold text-slate-700">TDS Note:</span> {charges.tdsNote}.
                  Deducted at {charges.tdsRatePct}% on realized profit (Sec 194S) and deposited with the Government.
                </p>
                <p className="text-[10px] text-slate-400">
                  This statement is auto-generated for AI Trading bot #{bot.subscriptionId}. INR values are indicative only.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                <Bot style={{ width: 13, height: 13, color: "white" }} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-600">{exchange.short} AI Trading</p>
                <p className="text-[9px] text-slate-400">{exchange.name}</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 text-right">
              Computer-generated · No physical signature required<br />
              <span className="font-mono text-slate-300">{inv.invoiceNo}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom accent bar */}
      <div style={{ height: 5, background: "linear-gradient(90deg,#4C1D95,#6D28D9,#8B5CF6,#A78BFA,#8B5CF6)" }} />
    </div>
  );

  return (
    <div className="min-h-screen py-6 sm:py-8 print:py-0"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)" }}>

      {/* Action bar */}
      <div className="container mx-auto px-4 max-w-3xl mb-5 flex items-center justify-between print:hidden">
        <Link href="/ai-trading">
          <Button variant="outline" size="sm"
            className="border-white/20 text-white/80 hover:text-white hover:border-violet-400/50 bg-white/5 gap-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:block">{inv.invoiceNo}</span>
          <Button size="sm" onClick={downloadPdf} disabled={downloading}
            style={{ background: "linear-gradient(135deg,#8B5CF6,#7C3AED)", color: "white" }}
            className="font-bold hover:opacity-90 disabled:opacity-70 shadow-lg shadow-violet-500/25 gap-2">
            {downloading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
              : <><Download className="w-3.5 h-3.5" />Download PDF</>}
          </Button>
        </div>
      </div>

      {/* Responsive screen view — CSS zoom auto-scales to fit any device width.
          bodyRef is used for PDF capture (zoom reset to 1 + 794px width temporarily). */}
      <div ref={screenWrapRef} className="container mx-auto px-3 sm:px-4 max-w-3xl print:hidden">
        <div ref={zoomWrapRef} style={{ zoom }}>
          <div ref={bodyRef}>
            <InvoiceBody />
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 8mm; }
          body { background: white !important; }
          * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}
