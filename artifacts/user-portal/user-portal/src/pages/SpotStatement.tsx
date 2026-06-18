/**
 * Spot Trading Statement — full account statement for all spot trades in a period.
 * Route: /orders/statement
 * Amber/gold Zebvix branding. Download as PDF via html2canvas + jsPDF.
 */
import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  TrendingUp, TrendingDown, BarChart2, FileText,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ── */
interface SpotStatementData {
  statementNo: string;
  generatedAt: string;
  period: { from: string; to: string };
  brand: {
    legalName: string; tradingName: string; address: string;
    gstin: string; cin: string; pan: string; supportEmail: string; website: string;
  };
  customer: { name: string; email: string; userId: number };
  summary: {
    totalTrades: number;
    totalVolumeUsdt: number; totalVolumeInr: number;
    tradingFee: number; gstPercent: number; gstAmount: number;
    totalFeeWithGst: number; tdsPercent: number; totalTds: number;
    netDeducted: number; inrRate: number;
  };
  trades: Array<{
    id: number; uid: string; symbol: string; base: string; quote: string;
    side: string; price: number; qty: number; notional: number;
    fee: number; tds: number; executedAt: string;
  }>;
}

/* ── Presets ── */
const now = new Date();
const PRESETS = [
  {
    label: "This Month",
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
    to:   now.toISOString().slice(0, 10),
  },
  {
    label: "Last Month",
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10),
    to:   new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10),
  },
  {
    label: "This Quarter",
    from: new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)).toISOString().slice(0, 10),
    to:   now.toISOString().slice(0, 10),
  },
  {
    label: "This Year",
    from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10),
    to:   now.toISOString().slice(0, 10),
  },
  {
    label: "All Time",
    from: "2020-01-01",
    to:   now.toISOString().slice(0, 10),
  },
];

/* ── Formatters ── */
const fmt  = (n: number, dp = 4) => Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";
const fmtI = (n: number) => Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const fmtD = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const fmtD2 = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function SpotStatement() {
  const defaultFrom = PRESETS[0].from;
  const defaultTo   = PRESETS[0].to;

  const [from, setFrom] = useState(defaultFrom);
  const [to,   setTo]   = useState(defaultTo);
  const [activePreset, setActivePreset] = useState("This Month");
  const [fetch, setFetch] = useState(true);
  const stmtRef   = useRef<HTMLDivElement>(null);
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

  const { data, isLoading, isError, error, refetch } = useQuery<SpotStatementData>({
    queryKey: ["spot-statement", from, to],
    queryFn:  () => get(`/orders/statement?from=${from}&to=${to}`),
    enabled: fetch,
  });

  const applyPreset = (p: typeof PRESETS[0]) => {
    setFrom(p.from); setTo(p.to); setActivePreset(p.label); setFetch(true);
  };

  const handleGenerate = () => { setFetch(true); refetch(); };

  const downloadPdf = async () => {
    if (!stmtRef.current || !data) return;
    setDownloading(true);
    try {
      const { downloadElementAsPdf } = await import("@/lib/download-pdf");
      await downloadElementAsPdf(stmtRef.current, `${data.statementNo}.pdf`, { backgroundColor: "#0f172a" });
      toast.success("Statement downloaded successfully");
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("PDF generation failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const { brand, customer, summary, trades, statementNo, generatedAt, period } = data ?? {};

  return (
    <div className="min-h-screen py-6" style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)" }}>

      {/* ── Toolbar ── */}
      <div className="container mx-auto px-4 max-w-5xl mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/orders">
          <Button variant="outline" size="sm" className="border-white/20 text-white/80 hover:text-white hover:border-white/40 bg-white/5">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to Orders
          </Button>
        </Link>
        <Button size="sm" onClick={downloadPdf} disabled={downloading || !data}
          style={{ background: "#F59E0B", color: "#0f172a" }}
          className="font-semibold hover:opacity-90 disabled:opacity-50">
          {downloading
            ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Generating…</>
            : <><Download className="w-3.5 h-3.5 mr-2" />Download PDF</>}
        </Button>
      </div>

      {/* ── Date Filter ── */}
      <div className="container mx-auto px-4 max-w-5xl mb-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={activePreset === p.label
                  ? { background: "#F59E0B", color: "#0f172a" }
                  : { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset("Custom"); }}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-xs" />
            <span className="text-white/40 text-xs">to</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset("Custom"); }}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-xs" />
            <Button size="sm" onClick={handleGenerate} style={{ background: "#F59E0B", color: "#0f172a" }} className="font-semibold text-xs">
              Generate
            </Button>
          </div>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#F59E0B" }} />
            <p className="text-sm text-slate-400">Generating statement…</p>
          </div>
        </div>
      )}
      {isError && (
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-3" />
            <p className="font-semibold text-destructive">{(error as any)?.data?.message ?? "Failed to load statement"}</p>
          </div>
        </div>
      )}

      {/* ── Statement Paper ── */}
      {data && (
        <div ref={screenWrapRef} className="container mx-auto px-4 max-w-5xl">
          <div style={{ zoom }}>
          <div ref={stmtRef} className="rounded-2xl overflow-hidden shadow-2xl" data-testid="spot-statement-paper">

            {/* Amber accent */}
            <div style={{ height: 6, background: "linear-gradient(90deg,#F59E0B,#D97706,#B45309)" }} />

            {/* ── Header ── */}
            <div style={{ background: "#0f172a" }} className="px-8 py-6 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl"
                    style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#0f172a" }}>Z</div>
                  <div>
                    <div className="font-bold text-white text-lg leading-tight">{brand?.tradingName}</div>
                    <div className="text-xs text-slate-400">{brand?.legalName}</div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-xs">{brand?.address}</div>
                <div className="flex gap-4 mt-2">
                  <span className="text-[10px] text-slate-500">GSTIN: <span className="text-slate-300">{brand?.gstin}</span></span>
                  <span className="text-[10px] text-slate-500">PAN: <span className="text-slate-300">{brand?.pan}</span></span>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2 mb-2">
                  <FileText className="w-5 h-5" style={{ color: "#F59E0B" }} />
                  <span className="font-bold text-white text-lg">TRADING STATEMENT</span>
                </div>
                <div className="text-xs text-slate-400">Statement No.</div>
                <div className="font-mono font-bold text-white text-sm">{statementNo}</div>
                <div className="text-xs text-slate-400 mt-1">Generated</div>
                <div className="text-xs text-slate-300">{fmtD(generatedAt!)}</div>
                <div className="text-xs text-slate-400 mt-1">Period</div>
                <div className="text-xs text-slate-300">{fmtD2(period!.from)} — {fmtD2(period!.to)}</div>
              </div>
            </div>

            {/* ── Customer bar ── */}
            <div style={{ background: "#1e293b", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              className="px-8 py-3 flex flex-wrap gap-6">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Account Holder</div>
                <div className="text-sm font-semibold text-white">{customer?.name}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Email</div>
                <div className="text-sm text-slate-300">{customer?.email}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">User ID</div>
                <div className="text-sm font-mono text-slate-300">#{customer?.userId}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Exchange Rate</div>
                <div className="text-sm text-slate-300">1 USDT ≈ {fmtI(summary!.inrRate)}</div>
              </div>
            </div>

            {/* ── Summary Cards ── */}
            <div style={{ background: "#fff" }} className="px-8 py-6">
              <div className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#D97706" }}>
                Summary — {fmtD2(period!.from)} to {fmtD2(period!.to)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total Trades", value: summary!.totalTrades.toString(), sub: "executions" },
                  { label: "Total Volume", value: fmt(summary!.totalVolumeUsdt, 2) + " USDT", sub: fmtI(summary!.totalVolumeInr) },
                  { label: "Trading Fee + GST", value: fmt(summary!.totalFeeWithGst, 6) + " USDT", sub: `Fee ${fmt(summary!.tradingFee,6)} + GST ${fmt(summary!.gstAmount,6)}` },
                  { label: "TDS Deducted", value: fmt(summary!.totalTds, 6) + " USDT", sub: `${summary!.tdsPercent}% on sell proceeds` },
                ].map(c => (
                  <div key={c.label} className="rounded-xl p-4 text-center" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1">{c.label}</div>
                    <div className="font-bold text-slate-800 text-sm leading-tight">{c.value}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Net deducted summary row */}
              <div className="rounded-xl px-6 py-4 flex items-center justify-between"
                style={{ background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "1px solid #fcd34d" }}>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Total Net Deducted (Fees + GST + TDS)</div>
                  <div className="text-[11px] text-amber-600 mt-0.5">Trading Fee ₊ 18% GST ₊ 1% TDS (Sec 194S) on sell trades</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-amber-800">{fmt(summary!.netDeducted, 6)} USDT</div>
                  <div className="text-sm text-amber-600">{fmtI(summary!.netDeducted * summary!.inrRate)}</div>
                </div>
              </div>

              {/* ── Trade Table ── */}
              <div className="mt-8">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
                  Trade Ledger ({trades!.length} fills)
                </div>
                {trades!.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    No trades found for this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#f1f5f9" }}>
                          {["#", "Pair", "Side", "Price (USDT)", "Qty", "Notional (USDT)", "Fee (USDT)", "TDS (USDT)", "Time"].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trades!.map((t, i) => (
                          <tr key={t.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                            <td className="px-3 py-2 font-mono text-slate-400">{i + 1}</td>
                            <td className="px-3 py-2 font-semibold text-slate-700">{t.symbol}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={t.side === "buy"
                                  ? { background: "rgba(16,185,129,0.12)", color: "#059669" }
                                  : { background: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
                                {t.side.toUpperCase()}
                                {t.side === "buy" ? <TrendingUp className="w-2.5 h-2.5 inline ml-1" /> : <TrendingDown className="w-2.5 h-2.5 inline ml-1" />}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">{fmt(t.price, 2)}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{fmt(t.qty, 4)}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">{fmt(t.notional, 4)}</td>
                            <td className="px-3 py-2 font-mono text-orange-600">{fmt(t.fee, 6)}</td>
                            <td className="px-3 py-2 font-mono text-red-500">{fmt(t.tds, 6)}</td>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtD(t.executedAt)}</td>
                          </tr>
                        ))}
                        {/* Totals footer */}
                        <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
                          <td colSpan={5} className="px-3 py-2.5 text-right text-slate-600 text-xs">TOTAL</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{fmt(summary!.totalVolumeUsdt, 4)}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-orange-600">{fmt(summary!.tradingFee, 6)}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-red-500">{fmt(summary!.totalTds, 6)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Tax Summary ── */}
              <div className="mt-6 rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600"
                  style={{ background: "#f1f5f9" }}>Tax Summary (Indian Compliance)</div>
                {[
                  ["Gross Trading Volume",          fmt(summary!.totalVolumeUsdt, 4) + " USDT",        fmtI(summary!.totalVolumeInr)],
                  ["Trading Fee",                    fmt(summary!.tradingFee, 6) + " USDT",              "charged by exchange"],
                  [`GST @ ${summary!.gstPercent}% on fee`, fmt(summary!.gstAmount, 6) + " USDT",         "18% GST on brokerage (IGST)"],
                  ["Total Fee incl. GST",            fmt(summary!.totalFeeWithGst, 6) + " USDT",         "fee + GST combined"],
                  [`TDS @ ${summary!.tdsPercent}% (Sec 194S)`, fmt(summary!.totalTds, 6) + " USDT",     "deducted on sell trades only"],
                  ["NET TOTAL DEDUCTED",             fmt(summary!.netDeducted, 6) + " USDT",             fmtI(summary!.netDeducted * summary!.inrRate)],
                ].map(([label, val, sub], i, arr) => (
                  <div key={label} className="flex items-center justify-between px-5 py-2.5"
                    style={{
                      borderTop: i > 0 ? "1px solid #e2e8f0" : undefined,
                      background: i === arr.length - 1 ? "#fffbeb" : "#fff",
                      fontWeight: i === arr.length - 1 ? 700 : 400,
                    }}>
                    <span className="text-xs text-slate-600">{label}</span>
                    <div className="text-right">
                      <span className="text-xs font-mono text-slate-800">{val}</span>
                      {sub && <span className="text-[10px] text-slate-400 ml-2">{sub}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Footer ── */}
              <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <div>
                  {brand?.legalName} · CIN: {brand?.cin} · GSTIN: {brand?.gstin}<br />
                  {brand?.supportEmail} · {brand?.website}
                </div>
                <div className="text-right">
                  This is a computer-generated statement.<br />
                  No signature required.
                </div>
              </div>
            </div>

            {/* Bottom accent */}
            <div style={{ height: 4, background: "linear-gradient(90deg,#F59E0B,#D97706,#B45309)" }} />
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
