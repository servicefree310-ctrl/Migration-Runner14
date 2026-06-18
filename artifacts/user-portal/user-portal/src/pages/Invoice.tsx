/**
 * Trade Invoice — premium full-colour tax invoice for a filled spot order.
 * Route: /orders/:id/invoice
 * Download PDF via html-to-image + jsPDF (always captured at fixed 794px width).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  CheckCircle2, TrendingUp, TrendingDown, Shield,
  Zap, Hash, Calendar, User,
} from "lucide-react";

interface InvoiceData {
  invoiceNo: string;
  issuedAt: string;
  currency: string;
  brand: {
    legalName: string; tradingName: string; address: string;
    gstin: string; cin: string; pan: string; supportEmail: string; website: string;
  };
  customer: { name: string; email: string; userId: number };
  order: {
    id: number; symbol: string; base: string; quote: string;
    side: "buy" | "sell"; type: string; status: string;
    qty: number; filledQty: number; avgPrice: number; placedAt: string;
  };
  breakdown: {
    grossNotional: number; tradingFee: number;
    gstPercent: number; gstAmount: number; totalFee: number;
    tdsPercent: number; tdsAmount: number; netAmount: number;
    netInr: number; inrRate: number; direction: "credit" | "debit";
  };
  fills: Array<{
    id: number; uid: string; price: number; qty: number;
    subtotal: number; fee: number; tds: number; executedAt: string;
  }>;
}

const fmt = (n: number, dp = 4) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";

const fmtInr = (n: number) =>
  Number.isFinite(n) ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function Invoice() {
  const [, params] = useRoute<{ id: string }>("/orders/:id/invoice");
  const orderId = params?.id;

  const { data, isLoading, isError, error } = useQuery<InvoiceData>({
    queryKey: ["invoice", orderId],
    queryFn: () => get(`/orders/${orderId}/invoice`),
    enabled: !!orderId,
  });

  useEffect(() => {
    if (!data?.invoiceNo) return;
    const prev = document.title;
    document.title = data.invoiceNo;
    return () => { document.title = prev; };
  }, [data?.invoiceNo]);

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
    if (!data || !bodyRef.current || !zoomWrapRef.current || !screenWrapRef.current) return;
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
      await downloadElementAsPdf(body, `${data.invoiceNo}.pdf`, { backgroundColor: "#0f172a" });

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
        style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
            <Loader2 className="w-7 h-7 animate-spin text-white" />
          </div>
          <p className="text-sm text-slate-400">Generating your invoice…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as any)?.data?.message ?? (error as any)?.message ?? "Could not load invoice";
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-10 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-rose-400 mb-4" />
          <p className="font-bold text-rose-400 text-lg">{msg}</p>
          <p className="text-sm text-slate-400 mt-2 mb-6">
            An invoice is generated only after at least one fill has been recorded.
          </p>
          <Link href="/orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to orders
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { brand, customer, order, breakdown, fills, invoiceNo, issuedAt, currency } = data;
  const isSell   = order.side === "sell";
  const isBuy    = order.side === "buy";
  const isFilled = order.status === "filled";
  const accentColor = "#F59E0B";
  const accentDark  = "#B45309";

  // Shared invoice body — used both for screen and hidden print clone
  const InvoiceBody = ({ fixed }: { fixed?: boolean }) => (
    <div
      className={fixed ? undefined : "rounded-3xl overflow-hidden shadow-2xl"}
      style={{
        boxShadow: fixed ? undefined : "0 25px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(245,158,11,0.15)",
        width: fixed ? 794 : undefined,
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 5, background: "linear-gradient(90deg,#B45309,#D97706,#F59E0B,#FCD34D,#F59E0B,#D97706)" }} />

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg,#0f172a 0%,#1e2d45 60%,#162032 100%)",
        position: "relative", overflow: "hidden",
      }} className={fixed ? "px-8 py-7" : "px-4 py-5 sm:px-8 sm:py-7"}>

        {/* Geometric bg pattern */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "repeating-linear-gradient(45deg,#F59E0B 0,#F59E0B 1px,transparent 0,transparent 50%)",
          backgroundSize: "20px 20px",
        }} />

        {/* Glow orb */}
        <div style={{
          position: "absolute", top: -60, right: -60, width: 200, height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(245,158,11,0.18) 0%,transparent 70%)",
        }} />

        {/* Brand + Invoice meta */}
        <div className={`relative ${fixed ? "flex items-start justify-between gap-4" : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"}`}>
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-base shadow-lg"
                style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#0f172a",
                  boxShadow: "0 4px 14px rgba(245,158,11,0.4)", flexShrink: 0 }}>
                Z
              </div>
              <div>
                <div className="text-xl font-extrabold tracking-tight" style={{ color: "#F59E0B" }}>
                  {brand.tradingName}
                </div>
                <div className="text-[10px] text-slate-500 font-medium tracking-wide">
                  CERTIFIED CRYPTO EXCHANGE
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">{brand.legalName}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1 max-w-[280px]">{brand.address}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
              <p className="text-[10px] text-slate-600 font-mono">GSTIN: <span className="text-slate-400">{brand.gstin || "Registration Pending"}</span></p>
              <p className="text-[10px] text-slate-600 font-mono">CIN: <span className="text-slate-400">{brand.cin}</span></p>
              <p className="text-[10px] text-slate-600 font-mono">PAN: <span className="text-slate-400">{brand.pan}</span></p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
              <p className="text-[10px] text-slate-600 font-mono">✉ <span className="text-slate-400">{brand.supportEmail}</span></p>
              <p className="text-[10px] text-slate-600 font-mono">🌐 <span className="text-slate-400">{brand.website}</span></p>
            </div>
          </div>

          {/* Invoice meta */}
          <div className={fixed ? "text-right shrink-0" : "sm:text-right"}>
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
              Tax Invoice
            </div>
            <p className="text-2xl font-extrabold text-white tabular-nums mt-0.5">{invoiceNo}</p>
            <div className={`flex items-center gap-1.5 mt-1.5 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <Calendar style={{ width: 10, height: 10, color: "#64748b" }} />
              <p className="text-[11px] text-slate-400">Issued: {fmtDate(issuedAt)}</p>
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold"
              style={isFilled
                ? { background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }
                : { background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
              <CheckCircle2 style={{ width: 10, height: 10 }} />
              {order.status.replace("_", " ").toUpperCase()}
            </div>
          </div>
        </div>

        {/* Verified badge */}
        <div className="relative mt-5 flex items-center gap-3 rounded-xl px-4 py-2.5"
          style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <Shield style={{ width: 14, height: 14, color: "#10B981", flexShrink: 0 }} />
          <p className="text-[10px] text-emerald-400 font-semibold tracking-wide">
            VERIFIED DIGITAL DOCUMENT — Cryptographically recorded on {fmtDateShort(issuedAt)}
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
            transform: "rotate(-35deg)", fontSize: 80, fontWeight: 900,
            color: "rgba(245,158,11,0.04)", letterSpacing: "0.05em",
            userSelect: "none", whiteSpace: "nowrap",
          }}>TAX INVOICE</span>
        </div>

        {/* Bill-to + Order summary */}
        <div className={`relative ${fixed ? "px-8 py-6 grid grid-cols-2 gap-6" : "px-4 py-5 sm:px-8 sm:py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: accentColor }}>
                <User style={{ width: 9, height: 9, color: "#0f172a" }} />
              </div>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>Bill To</p>
            </div>
            <p className="font-bold text-slate-800 text-sm">{customer.name || customer.email}</p>
            <p className="text-xs text-slate-500 mt-0.5">{customer.email}</p>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              <span className="text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                UID #{customer.userId}
              </span>
            </p>
          </div>
          <div className={fixed ? "text-right" : "sm:text-right"}>
            <div className={`flex items-center gap-1.5 mb-2 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>Order Details</p>
              <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: accentColor }}>
                <Hash style={{ width: 9, height: 9, color: "#0f172a" }} />
              </div>
            </div>
            <p className="font-bold text-slate-800 text-sm font-mono">
              #{order.id} · <span className="tracking-wide">{order.symbol}</span>
            </p>
            <div className={`flex items-center gap-2 mt-1.5 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
                style={isBuy
                  ? { background: "#DCFCE7", color: "#15803D", border: "1px solid #86EFAC" }
                  : { background: "#FEE2E2", color: "#DC2626", border: "1px solid #FCA5A5" }}>
                {isBuy ? <TrendingUp style={{ width: 10, height: 10 }} /> : <TrendingDown style={{ width: 10, height: 10 }} />}
                {order.side}
              </span>
              <span className="text-[10px] uppercase text-slate-400 font-semibold tracking-wide px-2 py-0.5 bg-slate-100 rounded-full">
                {order.type}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              <Calendar style={{ width: 9, height: 9, display: "inline", marginRight: 3 }} />
              {fmtDate(order.placedAt)}
            </p>
          </div>
        </div>

        {/* Fills table */}
        <div className={`relative ${fixed ? "px-8 py-5" : "px-4 py-4 sm:px-8 sm:py-5"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#F59E0B,#D97706)" }} />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>
              Trade Fills ({fills.length} execution{fills.length !== 1 ? "s" : ""})
            </p>
          </div>
          {fills.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No fill detail available — summary above.</p>
          ) : (
            <div className={fixed ? undefined : "overflow-x-auto -mx-1"}>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0", minWidth: fixed ? undefined : 500 }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "linear-gradient(135deg,#FFF7ED,#FFFBEB)" }}>
                      <th className="text-left px-3 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">#</th>
                      <th className="text-left px-3 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Time</th>
                      <th className="text-right px-3 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Price ({order.quote})</th>
                      <th className="text-right px-3 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Qty ({order.base})</th>
                      <th className="text-right px-3 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Subtotal ({order.quote})</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {fills.map((f, i) => (
                      <tr key={f.id} style={{
                        background: i % 2 === 0 ? "#fff" : "#fffbf5",
                        borderTop: "1px solid #f1f5f9",
                      }}>
                        <td className="px-3 py-2 text-slate-300 font-sans">{i + 1}</td>
                        <td className="px-3 py-2 text-slate-500 font-sans text-[11px]">{fmtDate(f.executedAt)}</td>
                        <td className="text-right px-3 py-2 text-slate-700 font-semibold">{fmt(f.price, 4)}</td>
                        <td className="text-right px-3 py-2 text-slate-700">{fmt(f.qty, 8)}</td>
                        <td className="text-right px-3 py-2 text-slate-800 font-semibold">{fmt(f.subtotal, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "linear-gradient(135deg,#FFF7ED,#FFFBEB)", borderTop: "2px solid #FCD34D" }}>
                      <td colSpan={2} className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: accentDark }}>
                        VWAP &amp; Total
                      </td>
                      <td className="text-right px-3 py-2.5 font-mono font-bold text-slate-800">{fmt(order.avgPrice, 4)}</td>
                      <td className="text-right px-3 py-2.5 font-mono font-bold text-slate-800">{fmt(order.filledQty, 8)}</td>
                      <td className="text-right px-3 py-2.5 font-mono font-extrabold text-slate-900">{fmt(breakdown.grossNotional, 4)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Tax breakdown */}
        <div className={`relative ${fixed ? "px-8 py-5" : "px-4 py-4 sm:px-8 sm:py-5"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(180deg,#F59E0B,#D97706)" }} />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>
              Tax Breakdown (Indian Compliance — VDA)
            </p>
          </div>
          <div className="space-y-0 rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
            <BRow label="Gross trade value" value={`${fmt(breakdown.grossNotional, 4)} ${currency}`} accent={accentColor} first />
            <BRow label="Trading fee (excl. GST)" value={`− ${fmt(breakdown.tradingFee, 4)} ${currency}`} muted />
            <BRow label={`GST @ ${breakdown.gstPercent}% on fee`} value={`− ${fmt(breakdown.gstAmount, 4)} ${currency}`} muted />
            {isSell && (
              <BRow label={`TDS @ ${breakdown.tdsPercent}% on proceeds (Sec 194S)`}
                value={`− ${fmt(breakdown.tdsAmount, 4)} ${currency}`} muted />
            )}
          </div>

          {/* Net amount */}
          <div className="mt-4 rounded-2xl overflow-hidden"
            style={{
              background: isSell ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "linear-gradient(135deg,#fff7ed,#fef3c7)",
              border: isSell ? "2px solid #86EFAC" : "2px solid #FCD34D",
              boxShadow: isSell ? "0 4px 20px rgba(16,185,129,0.12)" : "0 4px 20px rgba(245,158,11,0.15)",
            }}>
            <div className="px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.15em] font-extrabold"
                  style={{ color: isSell ? "#15803D" : "#92400E" }}>
                  {isSell ? "✓ Net Amount Credited to Wallet" : "✓ Net Amount Debited from Wallet"}
                </p>
                <p className="text-[11px] mt-1" style={{ color: isSell ? "#16a34a" : "#b45309" }}>
                  ≈ {fmtInr(breakdown.netInr)} &nbsp;·&nbsp; 1 USDT ≈ ₹{(breakdown.inrRate ?? 84).toFixed(2)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-extrabold tabular-nums"
                  style={{ color: isSell ? "#15803D" : "#B45309" }}>
                  {fmt(breakdown.netAmount, 4)}
                </p>
                <p className="text-sm font-bold" style={{ color: isSell ? "#16a34a" : "#d97706" }}>
                  {currency}
                </p>
              </div>
            </div>
            <div className="h-1" style={{
              background: isSell
                ? "linear-gradient(90deg,#10B981,#34D399)"
                : "linear-gradient(90deg,#F59E0B,#FCD34D)",
            }} />
          </div>
        </div>

        {/* Footer notes */}
        <div className={`relative ${fixed ? "px-8 py-6" : "px-4 py-5 sm:px-8 sm:py-6"}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              { icon: <Shield style={{ width: 12, height: 12, color: "#10B981" }} />, label: "TDS (Sec 194S)", desc: "1% deducted on every sell, deposited with Govt against your PAN." },
              { icon: <Zap style={{ width: 12, height: 12, color: "#F59E0B" }} />, label: "GST", desc: "18% levied on trading fee component only, not on trade value." },
              { icon: <CheckCircle2 style={{ width: 12, height: 12, color: "#60A5FA" }} />, label: "Dispute", desc: `Contact ${brand.supportEmail} within 7 days quoting ${invoiceNo}.` },
            ].map(item => (
              <div key={item.label} className="rounded-xl p-3.5 flex gap-2.5"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div className="mt-0.5 shrink-0">{item.icon}</div>
                <div>
                  <p className="text-[10px] font-bold text-slate-700 mb-0.5">{item.label}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs"
                style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#0f172a" }}>
                Z
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-600">{brand.tradingName}</p>
                <p className="text-[9px] text-slate-400">{brand.website}</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-400 text-right">
              Computer-generated · No physical signature required<br />
              <span className="font-mono text-slate-300">{invoiceNo}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{ height: 5, background: "linear-gradient(90deg,#B45309,#D97706,#F59E0B,#FCD34D,#F59E0B)" }} />
    </div>
  );

  return (
    <div className="min-h-screen py-6 sm:py-8 print:py-0"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#1a2540 50%,#0f172a 100%)" }}>

      {/* Action bar */}
      <div className="container mx-auto px-4 max-w-3xl mb-5 flex items-center justify-between print:hidden">
        <Link href="/orders">
          <Button variant="outline" size="sm"
            className="border-white/20 text-white/80 hover:text-white hover:border-amber-400/50 bg-white/5 gap-2">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:block">{invoiceNo}</span>
          <Button size="sm" onClick={downloadPdf} disabled={downloading}
            style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)", color: "#0f172a" }}
            className="font-bold hover:opacity-90 disabled:opacity-70 shadow-lg shadow-amber-500/25 gap-2">
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

function BRow({
  label, value, muted = false, accent, first = false,
}: {
  label: string; value: string; muted?: boolean; accent?: string; first?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm"
      style={{ borderTop: first ? undefined : "1px solid #f1f5f9", background: first ? "#fffbf5" : "white" }}>
      <span style={{ color: muted ? "#94a3b8" : "#475569", fontSize: 12 }}>{label}</span>
      <span className="font-mono tabular-nums font-semibold text-xs"
        style={{ color: accent ?? (muted ? "#94a3b8" : "#0f172a") }}>
        {value}
      </span>
    </div>
  );
}
