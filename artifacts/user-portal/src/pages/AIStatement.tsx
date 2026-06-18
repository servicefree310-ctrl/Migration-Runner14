/**
 * AI Trading Statement — premium account statement with analytics charts.
 * Route: /ai-trading/statement
 * Download PDF via html2canvas + jsPDF.
 */
import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  Bot, TrendingUp, TrendingDown, FileText, Zap,
  Shield, BarChart2, PieChart as PieIcon, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

/* ── Types ── */
interface AIStatementData {
  statementNo: string;
  generatedAt: string;
  period: { from: string; to: string };
  brand: {
    legalName: string; tradingName: string; address: string;
    gstin: string; cin: string; pan: string; supportEmail: string; website: string;
  };
  customer: { name: string; email: string; userId: number };
  summary: {
    totalSubscriptions: number; totalEarningsCredits: number;
    totalInvestedUsdt: number; totalInvestedInr: number;
    grossProfitUsdt: number;   grossProfitInr: number;
    tdsPercent: number;        tdsUsdt: number; tdsInr: number;
    netProfitUsdt: number;     netProfitInr: number;
    roiPct: number;            inrRate: number;
  };
  subscriptions: Array<{
    id: number; planName: string; riskLevel: string | null; status: string;
    investedUsdt: number; totalEarnedUsdt: number; roiPct: number;
    startedAt: string; expiresAt: string | null; lastCreditedAt: string | null;
  }>;
  earnings: Array<{
    id: number; subscriptionId: number; planName: string;
    amountUsdt: number; amountInr: number; creditedAt: string;
  }>;
}

/* ── Presets ── */
const now = new Date();
const PRESETS = [
  { label: "This Month",   from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  { label: "Last Month",   from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10) },
  { label: "This Quarter", from: new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  { label: "This Year",    from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) },
  { label: "All Time",     from: "2020-01-01", to: now.toISOString().slice(0, 10) },
];

/* ── Formatters ── */
const fmt  = (n: number, dp = 4) => Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";
const fmtI = (n: number) => Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtD = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const fmtD2 = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/* ── Chart colors ── */
const CHART_COLORS = ["#8B5CF6", "#A78BFA", "#7C3AED", "#6D28D9", "#5B21B6", "#C4B5FD"];
const RISK_COLORS: Record<string, string> = {
  low: "#10B981", medium: "#F59E0B", high: "#F87171", ultra: "#A78BFA",
};

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  active:    { background: "rgba(16,185,129,0.12)", color: "#059669", border: "1px solid rgba(16,185,129,0.25)" },
  completed: { background: "rgba(96,165,250,0.12)", color: "#2563eb", border: "1px solid rgba(96,165,250,0.25)" },
  cancelled: { background: "rgba(239,68,68,0.12)",  color: "#dc2626", border: "1px solid rgba(239,68,68,0.25)" },
};
const RISK_BADGE: Record<string, React.CSSProperties> = {
  low:    { background: "rgba(16,185,129,0.1)",  color: "#059669" },
  medium: { background: "rgba(245,158,11,0.1)",  color: "#d97706" },
  high:   { background: "rgba(239,68,68,0.1)",   color: "#dc2626" },
  ultra:  { background: "rgba(139,92,246,0.1)",  color: "#7c3aed" },
};

export default function AIStatement() {
  const [from, setFrom] = useState(PRESETS[0].from);
  const [to,   setTo]   = useState(PRESETS[0].to);
  const [activePreset, setActivePreset] = useState("This Month");

  const { data, isLoading, isError, error, refetch } = useQuery<AIStatementData>({
    queryKey: ["ai-statement", from, to],
    queryFn:  () => get(`/ai-trading/statement?from=${from}&to=${to}`),
  });

  const applyPreset = (p: typeof PRESETS[0]) => { setFrom(p.from); setTo(p.to); setActivePreset(p.label); };
  const handleGenerate = () => { refetch(); };

  const stmtRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  // Auto-scale statement to fit any screen width
  const screenWrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = screenWrapRef.current;
    if (!el) return;
    const update = () => setZoom(Math.min(1, el.offsetWidth / 560));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const downloadPdf = async () => {
    if (!stmtRef.current || !data) return;
    setDownloading(true);
    try {
      const { downloadElementAsPdf } = await import("@/lib/download-pdf");
      const el = stmtRef.current;

      // Temporarily force 794px so Recharts ResponsiveContainers re-render at desktop width
      const prevWidth    = el.style.width;
      const prevMaxWidth = el.style.maxWidth;
      el.style.width    = "794px";
      el.style.maxWidth = "794px";
      await new Promise(r => setTimeout(r, 450)); // wait for ResizeObserver + repaint

      await downloadElementAsPdf(el, `${data.statementNo}.pdf`, { backgroundColor: "#0f172a" });

      el.style.width    = prevWidth;
      el.style.maxWidth = prevMaxWidth;
      toast.success("Statement downloaded successfully");
    } catch (err) {
      // Restore width even on error
      if (stmtRef.current) {
        stmtRef.current.style.width    = "";
        stmtRef.current.style.maxWidth = "";
      }
      console.error("PDF generation failed:", err);
      toast.error("PDF generation failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const { brand, customer, summary, subscriptions, earnings, statementNo, generatedAt, period } = data ?? {};
  const isProfit = (summary?.netProfitUsdt ?? 0) >= 0;

  /* ── Chart data ── */
  const barData = (subscriptions ?? []).map(s => ({
    name: s.planName.length > 12 ? s.planName.slice(0, 11) + "…" : s.planName,
    earned: parseFloat((s.totalEarnedUsdt as any) ?? "0"),
    invested: parseFloat((s.investedUsdt as any) ?? "0"),
  }));

  const pieData = (subscriptions ?? []).reduce<Array<{ name: string; value: number; color: string }>>((acc, s) => {
    const idx = acc.findIndex(a => a.name === s.planName);
    const invested = parseFloat((s.investedUsdt as any) ?? "0");
    if (idx >= 0) { acc[idx].value += invested; }
    else { acc.push({ name: s.planName, value: invested, color: CHART_COLORS[acc.length % CHART_COLORS.length] }); }
    return acc;
  }, []);

  const earningsTimeline = [...(earnings ?? [])]
    .sort((a, b) => new Date(a.creditedAt).getTime() - new Date(b.creditedAt).getTime())
    .slice(-20)
    .map(e => ({
      date: new Date(e.creditedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      amount: parseFloat((e.amountUsdt as any) ?? "0"),
    }));

  return (
    <div className="min-h-screen py-6"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)" }}>

      {/* ── Toolbar ── */}
      <div className="container mx-auto px-4 max-w-5xl mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/ai-trading">
          <Button variant="outline" size="sm"
            className="border-white/20 text-white/80 hover:text-white hover:border-violet-400/50 bg-white/5 gap-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to AI Trading
          </Button>
        </Link>
        <Button size="sm" onClick={downloadPdf} disabled={!data}
          style={{ background: "linear-gradient(135deg,#8B5CF6,#7C3AED)", color: "white" }}
          className="font-bold hover:opacity-90 disabled:opacity-50 shadow-lg shadow-violet-500/25 gap-2">
          {downloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</> : <><Download className="w-3.5 h-3.5" />Download PDF</>}
        </Button>
      </div>

      {/* ── Date Filter ── */}
      <div className="container mx-auto px-4 max-w-5xl mb-5">
        <div className="rounded-2xl p-4 flex flex-wrap items-end gap-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(139,92,246,0.2)", backdropFilter: "blur(10px)" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={activePreset === p.label
                  ? { background: "linear-gradient(135deg,#8B5CF6,#7C3AED)", color: "white",
                      boxShadow: "0 2px 8px rgba(139,92,246,0.4)" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)",
                      border: "1px solid rgba(255,255,255,0.1)" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset("Custom"); }}
              className="rounded-lg px-3 py-1.5 text-white text-xs"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} />
            <span className="text-white/40 text-xs">→</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset("Custom"); }}
              className="rounded-lg px-3 py-1.5 text-white text-xs"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }} />
            <Button size="sm" onClick={handleGenerate}
              style={{ background: "linear-gradient(135deg,#8B5CF6,#7C3AED)", color: "white" }}
              className="font-bold text-xs gap-1.5">
              <Zap className="w-3 h-3" /> Generate
            </Button>
          </div>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
                boxShadow: "0 8px 30px rgba(124,58,237,0.4)" }}>
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
            <p className="text-sm text-slate-400">Generating AI statement…</p>
          </div>
        </div>
      )}
      {isError && (
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-10 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-rose-400 mb-3" />
            <p className="font-semibold text-rose-400">{(error as any)?.data?.message ?? "Failed to load statement"}</p>
          </div>
        </div>
      )}

      {/* ── Statement Paper ── */}
      {data && (
        <div ref={screenWrapRef} className="container mx-auto px-4 max-w-5xl">
          <div style={{ zoom }}>
          <div ref={stmtRef} className="rounded-3xl overflow-hidden shadow-2xl"
            style={{ boxShadow: "0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.2)" }}>

            {/* Top accent */}
            <div style={{ height: 5, background: "linear-gradient(90deg,#4C1D95,#6D28D9,#8B5CF6,#A78BFA,#8B5CF6,#6D28D9)" }} />

            {/* ── HEADER ── */}
            <div style={{
              background: "linear-gradient(135deg,#0f172a 0%,#1a1040 60%,#0f172a 100%)",
              position: "relative", overflow: "hidden",
            }} className="px-8 py-7">

              {/* Dot pattern */}
              <div style={{
                position: "absolute", inset: 0, opacity: 0.06,
                backgroundImage: "radial-gradient(circle,#A78BFA 1px,transparent 1px)",
                backgroundSize: "28px 28px",
              }} />
              {/* Glow orbs */}
              <div style={{ position: "absolute", top: -80, right: -60, width: 250, height: 250, borderRadius: "50%",
                background: "radial-gradient(circle,rgba(139,92,246,0.2) 0%,transparent 70%)" }} />
              <div style={{ position: "absolute", bottom: -60, left: -40, width: 180, height: 180, borderRadius: "50%",
                background: "radial-gradient(circle,rgba(109,40,217,0.15) 0%,transparent 70%)" }} />

              <div className="relative flex items-start justify-between gap-4">
                {/* Brand */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                      style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
                        boxShadow: "0 6px 20px rgba(124,58,237,0.5)" }}>
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-extrabold text-white">{brand?.tradingName}</span>
                        <span className="text-xl font-extrabold" style={{ color: "#A78BFA" }}>AI</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">
                        Algorithmic Trading Statement
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{brand?.legalName}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-1 max-w-xs">{brand?.address}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                    <span className="text-[10px] text-slate-600 font-mono">GSTIN: <span className="text-slate-400">{brand?.gstin}</span></span>
                    <span className="text-[10px] text-slate-600 font-mono">PAN: <span className="text-slate-400">{brand?.pan}</span></span>
                    <span className="text-[10px] text-slate-600 font-mono">CIN: <span className="text-slate-400">{brand?.cin}</span></span>
                  </div>
                </div>

                {/* Statement meta */}
                <div className="text-right shrink-0">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
                    style={{ background: "rgba(139,92,246,0.2)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.35)" }}>
                    <Zap className="w-3 h-3" /> AI Statement
                  </div>
                  <div className="font-mono font-extrabold text-white text-lg">{statementNo}</div>
                  <div className="text-[11px] text-slate-400 mt-1">Generated: {fmtD(generatedAt!)}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Period: <span className="text-slate-300">{fmtD2(period!.from)} — {fmtD2(period!.to)}</span>
                  </div>
                  {/* ROI badge */}
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                    style={{
                      background: isProfit ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)",
                      border: isProfit ? "1.5px solid rgba(16,185,129,0.35)" : "1.5px solid rgba(248,113,113,0.35)",
                    }}>
                    {isProfit
                      ? <TrendingUp style={{ width: 13, height: 13, color: "#10B981" }} />
                      : <TrendingDown style={{ width: 13, height: 13, color: "#F87171" }} />}
                    <span className="font-extrabold text-sm tabular-nums" style={{ color: isProfit ? "#10B981" : "#F87171" }}>
                      {isProfit ? "+" : ""}{summary!.roiPct.toFixed(2)}% Overall ROI
                    </span>
                  </div>
                </div>
              </div>

              {/* Verified strip */}
              <div className="relative mt-5 flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <Shield style={{ width: 14, height: 14, color: "#10B981", flexShrink: 0 }} />
                <p className="text-[10px] text-emerald-400 font-semibold tracking-wide">
                  VERIFIED AI TRADING STATEMENT — {customer?.name} · UID #{customer?.userId} · {fmtD(generatedAt!)}
                </p>
                <div className="ml-auto flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] text-emerald-500 font-bold">AUTHENTIC</span>
                </div>
              </div>
            </div>

            {/* ── Customer bar ── */}
            <div style={{ background: "#1e1b4b", borderTop: "1px solid rgba(139,92,246,0.15)", borderBottom: "1px solid rgba(139,92,246,0.15)" }}
              className="px-8 py-3 flex flex-wrap gap-6 items-center">
              {[
                { label: "Account Holder", value: customer?.name ?? "—" },
                { label: "Email", value: customer?.email ?? "—" },
                { label: "User ID", value: `#${customer?.userId}` },
                { label: "Period", value: `${fmtD2(period!.from)} — ${fmtD2(period!.to)}` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                  <div className="text-sm font-semibold text-white mt-0.5">{value}</div>
                </div>
              ))}
              <div className="ml-auto text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Exchange Rate</div>
                <div className="text-sm text-slate-300 mt-0.5">1 USDT ≈ {fmtI(summary!.inrRate)}</div>
              </div>
            </div>

            {/* ── WHITE BODY ── */}
            <div style={{ background: "#fff" }}>

              {/* ── Summary Cards ── */}
              <div className="px-8 py-6" style={{ borderBottom: "2px solid #f1f5f9" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#8B5CF6,#6D28D9)" }} />
                  <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#6D28D9" }}>
                    Period Summary — {fmtD2(period!.from)} to {fmtD2(period!.to)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Subscriptions", value: summary!.totalSubscriptions.toString(),
                      sub: "bots started", icon: <Bot style={{ width: 14, height: 14, color: "#8B5CF6" }} />,
                      bg: "#faf5ff", border: "#e9d5ff", color: "#6D28D9" },
                    { label: "Total Invested", value: fmt(summary!.totalInvestedUsdt, 2) + " USDT",
                      sub: fmtI(summary!.totalInvestedInr), icon: <Zap style={{ width: 14, height: 14, color: "#F59E0B" }} />,
                      bg: "#fffbeb", border: "#fde68a", color: "#B45309" },
                    { label: "Gross Profit", value: fmt(summary!.grossProfitUsdt, 4) + " USDT",
                      sub: fmtI(summary!.grossProfitInr),
                      icon: summary!.grossProfitUsdt >= 0
                        ? <TrendingUp style={{ width: 14, height: 14, color: "#10B981" }} />
                        : <TrendingDown style={{ width: 14, height: 14, color: "#F87171" }} />,
                      bg: summary!.grossProfitUsdt >= 0 ? "#f0fdf4" : "#fff1f2",
                      border: summary!.grossProfitUsdt >= 0 ? "#bbf7d0" : "#fecdd3",
                      color: summary!.grossProfitUsdt >= 0 ? "#15803d" : "#be123c" },
                    { label: "Net Profit (After TDS)", value: fmt(summary!.netProfitUsdt, 4) + " USDT",
                      sub: `ROI: ${summary!.roiPct.toFixed(2)}%`,
                      icon: summary!.netProfitUsdt >= 0
                        ? <TrendingUp style={{ width: 14, height: 14, color: "#10B981" }} />
                        : <TrendingDown style={{ width: 14, height: 14, color: "#F87171" }} />,
                      bg: summary!.netProfitUsdt >= 0 ? "#f0fdf4" : "#fff1f2",
                      border: summary!.netProfitUsdt >= 0 ? "#bbf7d0" : "#fecdd3",
                      color: summary!.netProfitUsdt >= 0 ? "#15803d" : "#be123c" },
                  ].map(c => (
                    <div key={c.label} className="rounded-2xl p-4"
                      style={{ background: c.bg, border: `1.5px solid ${c.border}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.color }}>{c.label}</span>
                        {c.icon}
                      </div>
                      <div className="font-extrabold text-slate-800 text-sm leading-tight">{c.value}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{c.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Net profit highlight */}
                <div className="rounded-2xl overflow-hidden"
                  style={{
                    background: isProfit ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "linear-gradient(135deg,#fff1f2,#ffe4e6)",
                    border: isProfit ? "2px solid #86EFAC" : "2px solid #FECDD3",
                    boxShadow: isProfit ? "0 4px 20px rgba(16,185,129,0.12)" : "0 4px 20px rgba(248,113,113,0.12)",
                  }}>
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wider"
                        style={{ color: isProfit ? "#15803d" : "#be123c" }}>
                        Net Profit After TDS ({summary!.tdsPercent}% Sec 194S VDA)
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: isProfit ? "#16a34a" : "#dc2626" }}>
                        Gross {fmt(summary!.grossProfitUsdt, 4)} − TDS {fmt(summary!.tdsUsdt, 4)} = Net Profit
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      {isProfit ? <TrendingUp className="w-7 h-7 text-emerald-500" /> : <TrendingDown className="w-7 h-7 text-red-500" />}
                      <div>
                        <div className="text-2xl font-extrabold tabular-nums"
                          style={{ color: isProfit ? "#15803d" : "#be123c" }}>
                          {isProfit ? "+" : ""}{fmt(summary!.netProfitUsdt, 4)} USDT
                        </div>
                        <div className="text-sm font-semibold" style={{ color: isProfit ? "#16a34a" : "#dc2626" }}>
                          {fmtI(summary!.netProfitInr)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-1" style={{
                    background: isProfit
                      ? "linear-gradient(90deg,#10B981,#34D399)"
                      : "linear-gradient(90deg,#F87171,#EF4444)",
                  }} />
                </div>
              </div>

              {/* ── CHARTS SECTION ── */}
              {(barData.length > 0 || pieData.length > 0 || earningsTimeline.length > 0) && (
                <div className="px-8 py-6" style={{ borderBottom: "2px solid #f1f5f9", background: "#fafafa" }}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#8B5CF6,#6D28D9)" }} />
                    <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#6D28D9" }}>
                      Analytics &amp; Visualisation
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                    {/* Bar chart: earnings per subscription */}
                    {barData.length > 0 && (
                      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #e9d5ff", background: "#fff" }}>
                        <div className="px-4 py-3 flex items-center gap-2"
                          style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", borderBottom: "1px solid #e9d5ff" }}>
                          <BarChart2 style={{ width: 14, height: 14, color: "#8B5CF6" }} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Earnings by Bot</span>
                        </div>
                        <div className="p-4">
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={barData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                              <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e9d5ff", background: "#faf5ff" }}
                                formatter={(v: number) => [v.toFixed(4) + " USDT", ""]}
                              />
                              <Bar dataKey="earned" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Earned">
                                {barData.map((_, i) => (
                                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Pie chart: allocation by plan */}
                    {pieData.length > 0 && (
                      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #e9d5ff", background: "#fff" }}>
                        <div className="px-4 py-3 flex items-center gap-2"
                          style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", borderBottom: "1px solid #e9d5ff" }}>
                          <PieIcon style={{ width: 14, height: 14, color: "#8B5CF6" }} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Investment Allocation</span>
                        </div>
                        <div className="p-4">
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie
                                data={pieData} cx="50%" cy="50%"
                                innerRadius={45} outerRadius={75}
                                paddingAngle={3} dataKey="value"
                              >
                                {pieData.map((entry, i) => (
                                  <Cell key={i} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e9d5ff", background: "#faf5ff" }}
                                formatter={(v: number) => [v.toFixed(2) + " USDT invested", ""]}
                              />
                              <Legend
                                wrapperStyle={{ fontSize: 10, color: "#64748b" }}
                                formatter={(value) => value.length > 14 ? value.slice(0, 13) + "…" : value}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Earnings timeline */}
                    {earningsTimeline.length > 0 && (
                      <div className="rounded-2xl overflow-hidden sm:col-span-2"
                        style={{ border: "1px solid #d1fae5", background: "#fff" }}>
                        <div className="px-4 py-3 flex items-center gap-2"
                          style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderBottom: "1px solid #d1fae5" }}>
                          <TrendingUp style={{ width: 14, height: 14, color: "#10B981" }} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            Earnings Timeline (Last {earningsTimeline.length} credits)
                          </span>
                        </div>
                        <div className="p-4">
                          <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={earningsTimeline} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                              <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #d1fae5", background: "#f0fdf4" }}
                                formatter={(v: number) => [v.toFixed(4) + " USDT", "Earned"]}
                              />
                              <Bar dataKey="amount" fill="#10B981" radius={[3, 3, 0, 0]} name="Earned" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Subscriptions Table ── */}
              <div className="px-8 py-6" style={{ borderBottom: "2px solid #f1f5f9" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#8B5CF6,#6D28D9)" }} />
                  <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#6D28D9" }}>
                    Bot Subscriptions ({subscriptions!.length})
                  </span>
                </div>
                {subscriptions!.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                    <Bot className="w-8 h-8 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-400">No subscriptions found for this period.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid #e9d5ff" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)" }}>
                          {["Plan", "Risk", "Status", "Invested (USDT)", "Earned (USDT)", "ROI %", "Started", "Expires"].map(h => (
                            <th key={h} className="px-3 py-3 text-left font-bold text-violet-700 text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {subscriptions!.map((s, i) => {
                          const roi = s.roiPct;
                          const roiPos = roi >= 0;
                          return (
                            <tr key={s.id} style={{ background: i % 2 === 0 ? "#fff" : "#faf5ff", borderTop: "1px solid #f1f5f9" }}>
                              <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)" }}>
                                    <Bot style={{ width: 10, height: 10, color: "white" }} />
                                  </div>
                                  {s.planName}
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                  style={RISK_BADGE[(s.riskLevel ?? "medium").toLowerCase()] ?? RISK_BADGE.medium}>
                                  {s.riskLevel ?? "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                  style={STATUS_BADGE[s.status] ?? STATUS_BADGE.active}>
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-slate-700">{fmt(s.investedUsdt, 2)}</td>
                              <td className="px-3 py-2.5 font-mono font-bold"
                                style={{ color: s.totalEarnedUsdt >= 0 ? "#16a34a" : "#dc2626" }}>
                                {s.totalEarnedUsdt >= 0 ? "+" : ""}{fmt(s.totalEarnedUsdt, 4)}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-xs" style={{ color: roiPos ? "#16a34a" : "#dc2626" }}>
                                    {roiPos ? "+" : ""}{roi.toFixed(2)}%
                                  </span>
                                  <div className="w-12 h-1.5 rounded-full overflow-hidden bg-slate-100">
                                    <div className="h-full rounded-full"
                                      style={{
                                        width: `${Math.min(100, Math.abs(roi))}%`,
                                        background: roiPos ? "#10B981" : "#F87171",
                                        minWidth: 2,
                                      }} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtD2(s.startedAt)}</td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{s.expiresAt ? fmtD2(s.expiresAt) : "—"}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", borderTop: "2px solid #8B5CF6" }}>
                          <td colSpan={3} className="px-3 py-3 text-right font-bold text-violet-700 text-xs">TOTAL</td>
                          <td className="px-3 py-3 font-mono font-extrabold text-slate-800">{fmt(summary!.totalInvestedUsdt, 2)}</td>
                          <td className="px-3 py-3 font-mono font-extrabold"
                            style={{ color: summary!.grossProfitUsdt >= 0 ? "#16a34a" : "#dc2626" }}>
                            {summary!.grossProfitUsdt >= 0 ? "+" : ""}{fmt(summary!.grossProfitUsdt, 4)}
                          </td>
                          <td className="px-3 py-3 font-mono font-extrabold"
                            style={{ color: summary!.roiPct >= 0 ? "#16a34a" : "#dc2626" }}>
                            {summary!.roiPct >= 0 ? "+" : ""}{summary!.roiPct.toFixed(2)}%
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Earnings Credits ── */}
              {earnings!.length > 0 && (
                <div className="px-8 py-6" style={{ borderBottom: "2px solid #f1f5f9" }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#10B981,#059669)" }} />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-700">
                      Earnings Credit Log ({earnings!.length})
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid #d1fae5", maxHeight: 240, overflowY: "auto" }}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0" style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)" }}>
                        <tr>
                          {["#", "Plan", "Amount (USDT)", "Amount (INR)", "Credited At"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-emerald-700 text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {earnings!.map((e, i) => (
                          <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f0fdf4", borderTop: "1px solid #f1f5f9" }}>
                            <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                            <td className="px-3 py-2 text-slate-700 font-medium">{e.planName}</td>
                            <td className="px-3 py-2 font-mono font-bold text-emerald-600">+{fmt(e.amountUsdt, 4)}</td>
                            <td className="px-3 py-2 font-mono text-emerald-600">{fmtI(e.amountInr)}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtD(e.creditedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tax Summary ── */}
              <div className="px-8 py-6" style={{ borderBottom: "2px solid #f1f5f9" }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#F59E0B,#D97706)" }} />
                  <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "#B45309" }}>
                    Tax Summary (Indian Compliance — VDA)
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #fde68a" }}>
                  {[
                    ["Total Invested",                    fmt(summary!.totalInvestedUsdt, 2) + " USDT",  fmtI(summary!.totalInvestedInr),  false],
                    ["Gross Profit",                      fmt(summary!.grossProfitUsdt, 4) + " USDT",    fmtI(summary!.grossProfitInr),    false],
                    [`TDS @ ${summary!.tdsPercent}% (Sec 194S VDA)`, fmt(summary!.tdsUsdt, 4) + " USDT", fmtI(summary!.tdsInr),          false],
                    ["NET PROFIT AFTER TDS",              fmt(summary!.netProfitUsdt, 4) + " USDT",      fmtI(summary!.netProfitInr),      true],
                    ["Overall ROI",                       summary!.roiPct.toFixed(2) + "%",              "net profit ÷ total invested",    false],
                  ].map(([label, val, sub, highlight], i, arr) => (
                    <div key={String(label)} className="flex items-center justify-between px-5 py-3"
                      style={{
                        borderTop: i > 0 ? "1px solid #fef3c7" : undefined,
                        background: highlight
                          ? (summary!.netProfitUsdt >= 0 ? "#f0fdf4" : "#fff1f2")
                          : (i === 0 ? "#fffbeb" : "#fff"),
                        fontWeight: highlight ? 700 : 400,
                      }}>
                      <span className="text-xs text-slate-700">{label}</span>
                      <div className="text-right">
                        <span className="text-xs font-mono font-semibold text-slate-800">{val}</span>
                        {sub && <span className="text-[10px] text-slate-400 ml-2">{sub}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Footer ── */}
              <div className="px-8 py-6">
                <div className="rounded-2xl p-5 mb-5"
                  style={{ background: "linear-gradient(135deg,#faf5ff,#f5f3ff)", border: "1.5px solid #e9d5ff" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                      <FileText style={{ width: 15, height: 15, color: "white" }} />
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-1.5">
                      <p className="font-semibold text-slate-700">
                        This is an auto-generated AI Trading account statement for {brand?.tradingName}.
                      </p>
                      <p>
                        TDS deducted under Section 194S of the Income Tax Act, 1961 on VDA (Virtual Digital Asset) profits.
                        INR values are indicative based on 1 USDT ≈ {fmtI(summary!.inrRate)} at the time of generation.
                      </p>
                      <p className="text-[10px] text-slate-400">
                        For disputes or corrections, contact <span className="font-semibold text-slate-600">{brand?.supportEmail}</span> within 30 days quoting statement no. <span className="font-mono">{statementNo}</span>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}>
                      <Bot style={{ width: 14, height: 14, color: "white" }} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-600">{brand?.tradingName} · {brand?.website}</p>
                      <p className="text-[9px] text-slate-400">{brand?.legalName} · CIN: {brand?.cin}</p>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 text-right">
                    Computer-generated · No physical signature required<br />
                    <span className="font-mono text-slate-300">{statementNo}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom accent */}
            <div style={{ height: 5, background: "linear-gradient(90deg,#4C1D95,#6D28D9,#8B5CF6,#A78BFA,#8B5CF6)" }} />
          </div>
          </div>
        </div>
      )}

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
