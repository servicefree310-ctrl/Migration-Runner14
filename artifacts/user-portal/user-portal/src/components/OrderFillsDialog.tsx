import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Layers, ArrowRight, Loader2, FileText } from "lucide-react";

type Fill = {
  id: number;
  uid: string;
  side: "buy" | "sell";
  price: number;
  qty: number;
  fee: number;
  feeCurrency: string;
  createdAt: string;
};

type FillsResp = {
  order: {
    id: number;
    symbol: string;
    base: string;
    quote: string;
    side: "buy" | "sell";
    type: string;
    status: string;
    price: number;
    qty: number;
    filledQty: number;
    avgPrice: number;
    fee: number;
    feeCurrency: string;
    createdAt: string;
  };
  fills: Fill[];
  summary: {
    count: number;
    totalQty: number;
    totalQuote: number;
    vwap: number;
    totalFee: number;
    base: string;
    quote: string;
  };
};

const fmt = (n: number, dp = 8) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: dp })
    : "—";

/**
 * OrderFillsDialog — Pro-style "trades inside this order" view.
 *
 * One placed order can be filled by the matching engine across many maker
 * orders at different prices (multi-fill). Big exchanges expose this as a
 * per-order "fills" or "trades" expansion. This dialog renders:
 *
 *   - Order header: pair, side, type, status, requested qty/price
 *   - Summary bar: number of fills, VWAP, total quote spent/received, total fee
 *   - Per-fill table: time, price, qty, sub-total (price × qty), fee
 *
 * Data comes from `GET /orders/:id/fills`. The dialog is a pure read view —
 * no mutations — so it's safe to open for any order (open / partial / filled
 * / cancelled). For an open limit order with zero fills yet we show an
 * empty-fills hint instead of a table.
 */
export function OrderFillsDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, error } = useQuery<FillsResp>({
    queryKey: ["order-fills", orderId],
    queryFn: () => get(`/orders/${orderId}/fills`),
    enabled: open && orderId != null,
    staleTime: 5_000,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            Order #{orderId} — Fills
          </DialogTitle>
          <DialogDescription>
            All individual matching trades for this order. A large order may be
            filled at multiple price levels — each fill's exact price, quantity,
            and fee is shown here.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading fills…
          </div>
        )}

        {isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(error as Error)?.message || "Couldn't load fills."}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* ── Order header ────────────────────────────── */}
            <div className="rounded-lg border border-border/60 bg-muted/15 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="font-bold text-base">{data.order.base}/{data.order.quote}</div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider",
                    data.order.side === "buy"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400",
                  )}
                >
                  {data.order.side}
                </span>
                <span className="text-xs uppercase text-muted-foreground tracking-wider">
                  {data.order.type}
                </span>
                <StatusPill status={data.order.status} />
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                  {new Date(data.order.createdAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Stat label="Requested Qty" value={`${fmt(data.order.qty, 8)} ${data.order.base}`} />
                <Stat
                  label={data.order.type === "market" ? "Order Type" : "Limit Price"}
                  value={
                    data.order.type === "market"
                      ? "Market (best available)"
                      : data.order.price > 0
                        ? `${fmt(data.order.price, 4)} ${data.order.quote}`
                        : "—"
                  }
                />
                <Stat label="Filled Qty" value={`${fmt(data.order.filledQty, 8)} ${data.order.base}`} />
                <Stat
                  label="Avg Fill Price"
                  value={
                    data.order.avgPrice > 0
                      ? `${fmt(data.order.avgPrice, 4)} ${data.order.quote}`
                      : "—"
                  }
                  accent={data.order.type === "market"}
                />
              </div>
            </div>

            {/* ── Invoice CTA — only when there's something to invoice ─ */}
            {data.order.filledQty > 0 && (
              <a
                href={`${import.meta.env.BASE_URL}orders/${data.order.id}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                data-testid="link-open-invoice"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                >
                  <FileText className="w-3.5 h-3.5 mr-2" />
                  View tax invoice (fee, GST &amp; TDS breakdown)
                </Button>
              </a>
            )}

            {/* ── Summary bar ─────────────────────────────── */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3" /> Multi-Fill Summary
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Stat label="Total Fills" value={String(data.summary.count)} accent />
                <Stat
                  label="VWAP"
                  value={
                    data.summary.vwap > 0
                      ? `${fmt(data.summary.vwap, 4)} ${data.summary.quote}`
                      : "—"
                  }
                  accent
                />
                <Stat
                  label={data.order.side === "buy" ? "Total Spent" : "Total Received"}
                  value={`${fmt(data.summary.totalQuote, 4)} ${data.summary.quote}`}
                  accent
                />
                <Stat
                  label="Total Fee"
                  value={`${fmt(data.summary.totalFee, 8)} ${data.summary.quote}`}
                  accent
                />
              </div>
            </div>

            {/* ── Per-fill table ──────────────────────────── */}
            {data.fills.length === 0 ? (
              <div className="rounded-md border border-border/60 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
                No fills yet. This order is waiting to be matched in the order book.
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">Time</th>
                        <th className="text-right px-3 py-2 font-medium">Price ({data.summary.quote})</th>
                        <th className="text-right px-3 py-2 font-medium">Qty ({data.summary.base})</th>
                        <th className="text-right px-3 py-2 font-medium">Sub-total</th>
                        <th className="text-right px-3 py-2 font-medium">Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fills.map((f, i) => {
                        const sub = f.price * f.qty;
                        return (
                          <tr key={f.id} className="border-t border-border/40 hover:bg-muted/20">
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">
                              {new Date(f.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              })}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(f.price, 4)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(f.qty, 8)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(sub, 4)}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                              {fmt(f.fee, 8)} {f.feeCurrency}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono tabular-nums mt-0.5", accent ? "text-primary font-bold" : "font-semibold")}>
        {value}
      </div>
    </div>
  );
}
