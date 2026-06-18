/**
 * Convert Invoice — premium tax receipt for an executed instant conversion.
 * Route: /convert/:id/invoice
 * PDF download via html-to-image + jsPDF at fixed 794px width.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Loader2, AlertCircle,
  CheckCircle2, Shield, Hash, Calendar, User,
  ArrowRightLeft,
} from "lucide-react";

interface ConvertInvoiceData {
  invoiceNo: string;
  issuedAt: string;
  brand: {
    legalName: string; tradingName: string; address: string;
    gstin: string; cin: string; pan: string; supportEmail: string; website: string;
  };
  customer: { name: string; email: string; userId: number };
  convert: {
    id: number; uid: string;
    fromCoin: string; toCoin: string;
    fromAmount: number; toAmount: number;
    rate: number; feeAmount: number;
    feeBps: number; feePercent: number;
    grossOut: number;
    executedAt: string | null; createdAt: string;
  };
}

const fmt = (n: number, dp = 8) =>
  Number.isFinite(n) ? n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: dp }) : "—";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function ConvertInvoice() {
  const [, params] = useRoute<{ id: string }>("/convert/:id/invoice");
  const convertId = params?.id;

  const { data, isLoading, isError, error } = useQuery<ConvertInvoiceData>({
    queryKey: ["convert-invoice", convertId],
    queryFn: () => get(`/convert/${convertId}/invoice`),
    enabled: !!convertId,
  });

  useEffect(() => {
    if (!data?.invoiceNo) return;
    const prev = document.title;
    document.title = data.invoiceNo;
    return () => { document.title = prev; };
  }, [data?.invoiceNo]);

  const [downloading, setDownloading] = useState(false);

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
      body.style.width    = prevWidth;
      zoomWrap.style.zoom = prevZoom;
      wrap.style.overflow = prevOverflow;
      toast.success("Invoice downloaded successfully");
    } catch {
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
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
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
            Invoice is only available for completed conversions.
          </p>
          <Link href="/convert">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to Convert
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const { brand, customer, convert, invoiceNo, issuedAt } = data;
  const accentColor = "#6366f1";
  const accentDark  = "#4338ca";

  const InvoiceBody = ({ fixed }: { fixed?: boolean }) => (
    <div
      className={fixed ? undefined : "rounded-3xl overflow-hidden shadow-2xl"}
      style={{
        boxShadow: fixed ? undefined : "0 25px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(99,102,241,0.15)",
        width: fixed ? 794 : undefined,
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 5, background: "linear-gradient(90deg,#312e81,#4f46e5,#6366f1,#818cf8,#6366f1,#4f46e5)" }} />

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg,#0f172a 0%,#1e2d45 60%,#162032 100%)",
        position: "relative", overflow: "hidden",
      }} className={fixed ? "px-8 py-7" : "px-4 py-5 sm:px-8 sm:py-7"}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: "repeating-linear-gradient(45deg,#6366f1 0,#6366f1 1px,transparent 0,transparent 50%)",
          backgroundSize: "20px 20px",
        }} />
        <div style={{
          position: "absolute", top: -60, right: -60, width: 200, height: 200,
          borderRadius: "50%",
          background: "radial-gradient(circle,rgba(99,102,241,0.18) 0%,transparent 70%)",
        }} />

        <div className={`relative ${fixed ? "flex items-start justify-between gap-4" : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"}`}>
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-base shadow-lg"
                style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff",
                  boxShadow: "0 4px 14px rgba(99,102,241,0.4)", flexShrink: 0 }}>
                Z
              </div>
              <div>
                <div className="text-xl font-extrabold tracking-tight" style={{ color: "#818cf8" }}>
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
              style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}>
              <ArrowRightLeft style={{ width: 9, height: 9 }} /> Convert Receipt
            </div>
            <p className="text-2xl font-extrabold text-white tabular-nums mt-0.5">{invoiceNo}</p>
            <div className={`flex items-center gap-1.5 mt-1.5 ${fixed ? "justify-end" : "sm:justify-end"}`}>
              <Calendar style={{ width: 10, height: 10, color: "#64748b" }} />
              <p className="text-[11px] text-slate-400">Issued: {fmtDate(issuedAt)}</p>
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold"
              style={{ background: "rgba(16,185,129,0.15)", color: "#10B981", border: "1px solid rgba(16,185,129,0.3)" }}>
              <CheckCircle2 style={{ width: 10, height: 10 }} />
              EXECUTED
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
            transform: "rotate(-35deg)", fontSize: 72, fontWeight: 900,
            color: "rgba(99,102,241,0.04)", letterSpacing: "0.05em",
            userSelect: "none", whiteSpace: "nowrap",
          }}>CONVERT</span>
        </div>

        {/* Bill-to + Convert reference */}
        <div className={`relative ${fixed ? "px-8 py-6 grid grid-cols-2 gap-6" : "px-4 py-5 sm:px-8 sm:py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: accentColor }}>
                <User style={{ width: 9, height: 9, color: "#fff" }} />
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
              <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>Reference</p>
              <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: accentColor }}>
                <Hash style={{ width: 9, height: 9, color: "#fff" }} />
              </div>
            </div>
            <p className="font-bold text-slate-800 text-sm font-mono">#{convert.id}</p>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono break-all">{convert.uid}</p>
            <p className="text-[11px] text-slate-400 mt-1.5">
              <Calendar style={{ width: 9, height: 9, display: "inline", marginRight: 3 }} />
              {fmtDate(convert.executedAt ?? convert.createdAt)}
            </p>
          </div>
        </div>

        {/* Conversion visual */}
        <div className={`relative ${fixed ? "px-8 py-6" : "px-4 py-5 sm:px-8 sm:py-6"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 rounded-full" style={{ background: `linear-gradient(180deg,${accentColor},${accentDark})` }} />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>
              Conversion Summary
            </p>
          </div>

          <div className={`flex items-center gap-3 ${fixed ? "justify-center" : "flex-col sm:flex-row sm:justify-center"}`}>
            {/* From */}
            <div className="rounded-2xl border-2 px-6 py-4 text-center flex-1"
              style={{ borderColor: "#e0e7ff", background: "linear-gradient(135deg,#eef2ff,#f5f3ff)" }}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-indigo-400 mb-1">You Sent</p>
              <p className="text-3xl font-extrabold text-slate-800 tabular-nums">
                {fmt(convert.fromAmount, 8)}
              </p>
              <p className="text-base font-bold mt-1" style={{ color: accentColor }}>{convert.fromCoin}</p>
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center shadow-lg"
              style={{ background: `linear-gradient(135deg,${accentColor},${accentDark})` }}>
              <ArrowRightLeft style={{ width: 20, height: 20, color: "#fff" }} />
            </div>

            {/* To */}
            <div className="rounded-2xl border-2 px-6 py-4 text-center flex-1"
              style={{ borderColor: "#d1fae5", background: "linear-gradient(135deg,#ecfdf5,#f0fdf4)" }}>
              <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-500 mb-1">You Received</p>
              <p className="text-3xl font-extrabold text-slate-800 tabular-nums">
                {fmt(convert.toAmount, 8)}
              </p>
              <p className="text-base font-bold mt-1 text-emerald-600">{convert.toCoin}</p>
            </div>
          </div>
        </div>

        {/* Fee breakdown */}
        <div className={`relative ${fixed ? "px-8 py-5" : "px-4 py-4 sm:px-8 sm:py-5"}`}
          style={{ borderBottom: "2px solid #f1f5f9" }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 rounded-full" style={{ background: `linear-gradient(180deg,${accentColor},${accentDark})` }} />
            <p className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: accentDark }}>
              Fee Breakdown
            </p>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #e2e8f0" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "linear-gradient(135deg,#eef2ff,#f5f3ff)" }}>
                  <th className="text-left px-4 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Description</th>
                  <th className="text-right px-4 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Amount</th>
                  <th className="text-right px-4 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wide">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: "1px solid #f1f5f9", background: "#fff" }}>
                  <td className="px-4 py-3 text-slate-700 font-medium">Source Amount</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{fmt(convert.fromAmount, 8)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{convert.fromCoin}</td>
                </tr>
                <tr style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
                  <td className="px-4 py-3 text-slate-700 font-medium">Exchange Rate</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">1 {convert.fromCoin} = {fmt(convert.rate, 8)} {convert.toCoin}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-400">—</td>
                </tr>
                <tr style={{ borderTop: "1px solid #f1f5f9", background: "#fff" }}>
                  <td className="px-4 py-3 text-slate-700 font-medium">Gross Output</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{fmt(convert.grossOut, 8)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{convert.toCoin}</td>
                </tr>
                <tr style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "#dc2626" }}>
                    Convert Fee ({convert.feeBps} bps / {convert.feePercent.toFixed(2)}%)
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: "#dc2626" }}>
                    − {fmt(convert.feeAmount, 8)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-500">{convert.toCoin}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{ background: "linear-gradient(135deg,#eef2ff,#f5f3ff)", borderTop: "2px solid #e0e7ff" }}>
                  <td className="px-4 py-3.5 font-extrabold text-sm" style={{ color: accentDark }}>Net Received</td>
                  <td className="px-4 py-3.5 text-right font-extrabold text-sm font-mono" style={{ color: "#059669" }}>
                    {fmt(convert.toAmount, 8)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-extrabold text-sm font-mono" style={{ color: "#059669" }}>
                    {convert.toCoin}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className={fixed ? "px-8 py-5" : "px-4 py-4 sm:px-8 sm:py-5"}
          style={{ background: "linear-gradient(135deg,#f8fafc,#f1f5f9)" }}>
          <div className={`flex items-start gap-6 ${fixed ? "" : "flex-col sm:flex-row"}`}>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5">Terms</p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                This document serves as a transaction receipt for an instant conversion executed on {brand.tradingName}.
                All conversions are final and non-reversible. Subject to{" "}
                <span style={{ color: accentColor }}>{brand.website}/terms</span>.
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Support</p>
              <p className="text-[10px] text-slate-500 font-mono">{brand.supportEmail}</p>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{brand.website}</p>
            </div>
          </div>
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid #e2e8f0" }}>
            <p className="text-[9px] text-slate-400 text-center">
              {invoiceNo} · {brand.legalName} · GSTIN {brand.gstin || "Pending"} · Generated {fmtDate(issuedAt)}
            </p>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div style={{ height: 4, background: `linear-gradient(90deg,${accentDark},${accentColor},#818cf8,${accentColor},${accentDark})` }} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen"
      style={{ background: "linear-gradient(135deg,#0f172a 0%,#1a2540 50%,#0f172a 100%)" }}>

      {/* Toolbar */}
      <div className="sticky top-0 z-10 border-b border-white/5 backdrop-blur-md"
        style={{ background: "rgba(15,23,42,0.8)" }}>
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/convert">
            <button className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-medium">
              <ArrowLeft className="w-4 h-4" /> Convert
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:block">{data.invoiceNo}</span>
            <Button
              onClick={downloadPdf}
              disabled={downloading}
              size="sm"
              className="font-semibold text-white"
              style={{ background: `linear-gradient(135deg,${accentColor},${accentDark})` }}
            >
              {downloading
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating…</>
                : <><Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF</>
              }
            </Button>
          </div>
        </div>
      </div>

      {/* Scaled invoice */}
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div ref={screenWrapRef} className="w-full">
          <div ref={zoomWrapRef} style={{ zoom, transformOrigin: "top left" }}>
            <div ref={bodyRef}>
              <InvoiceBody />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
