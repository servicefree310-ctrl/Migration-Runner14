import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent, TrendingDown, Users, FileDown, Calendar } from "lucide-react";

type Summary = {
  total_tds: string;
  total_trades: string;
  unique_sellers: string;
};

type PerUserRow = {
  user_id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  tds_collected: string;
  gross_sell_value: string;
  trade_count: string;
  last_trade_at: string | null;
};

type DailyRow = {
  day: string;
  tds: string;
  trades: string;
};

type TDSReport = {
  summary: Summary;
  perUser: PerUserRow[];
  daily: DailyRow[];
  period: { from: string; to: string };
};

function fmt(n: string | number, dec = 2): string {
  const v = Number(n);
  if (isNaN(v)) return "0.00";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function exportCSV(rows: PerUserRow[], period: { from: string; to: string }) {
  const header = ["User ID", "Name", "Email", "Phone", "Gross Sell Value (INR)", "TDS Collected (INR)", "Trade Count", "Last Trade"];
  const data = rows.map(r => [
    r.user_id, r.name ?? "", r.email ?? "", r.phone ?? "",
    Number(r.gross_sell_value).toFixed(2),
    Number(r.tds_collected).toFixed(2),
    r.trade_count,
    fmtDate(r.last_trade_at),
  ]);
  const csv = [header, ...data].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tds_report_${period.from}_to_${period.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TDSReportPage() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

  const [from, setFrom] = useState(toInputDate(thirtyDaysAgo));
  const [to, setTo] = useState(toInputDate(today));
  const [applied, setApplied] = useState({ from: toInputDate(thirtyDaysAgo), to: toInputDate(today) });

  const { data, isLoading } = useQuery<TDSReport>({
    queryKey: ["/admin/tds-report", applied.from, applied.to],
    queryFn: () => get<TDSReport>(`/admin/tds-report?from=${applied.from}&to=${applied.to}`),
  });

  const summary = data?.summary;
  const perUser = data?.perUser ?? [];
  const daily = data?.daily ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="TDS Report"
        description="Tax Deducted at Source (Section 194S) — 1% on gross sell value per Indian crypto regulation"
        actions={
          perUser.length > 0
            ? <Button variant="outline" size="sm" onClick={() => exportCSV(perUser, applied)}>
                <FileDown className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            : undefined
        }
      />

      {/* Date filter */}
      <div className="flex flex-wrap gap-4 p-4 rounded-lg border border-border bg-card/50">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Period:</span>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36 text-sm" />
        </div>
        <Button size="sm" className="h-8" onClick={() => setApplied({ from, to })}>Apply</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => {
          const f = toInputDate(thirtyDaysAgo); const t = toInputDate(today);
          setFrom(f); setTo(t); setApplied({ from: f, to: t });
        }}>Last 30 Days</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => {
          const now = new Date();
          const f = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
          const t = toInputDate(today);
          setFrom(f); setTo(t); setApplied({ from: f, to: t });
        }}>This Month</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => {
          const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
          setFrom(`${fy}-04-01`); setTo(`${fy + 1}-03-31`); setApplied({ from: `${fy}-04-01`, to: `${fy + 1}-03-31` });
        }}>FY {today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1}-{String((today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1) + 1).slice(-2)}</Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PremiumStatCard
          title="Total TDS Collected"
          value={summary ? `₹${fmt(summary.total_tds, 4)}` : "—"}
          icon={Percent}
          loading={isLoading}
          accent
          hint="1% deducted on sell value"
        />
        <PremiumStatCard
          title="Sell Trades with TDS"
          value={summary?.total_trades ?? "—"}
          icon={TrendingDown}
          loading={isLoading}
          hint="Total qualifying sell orders"
        />
        <PremiumStatCard
          title="Unique Sellers"
          value={summary?.unique_sellers ?? "—"}
          icon={Users}
          loading={isLoading}
          hint="Users with TDS deducted"
        />
      </div>

      {/* Daily trend */}
      {daily.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold">Daily TDS Trend</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground">TDS (INR)</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground">Sell Trades</th>
                </tr>
              </thead>
              <tbody>
                {daily.map(d => (
                  <tr key={d.day} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{fmtDate(d.day)}</td>
                    <td className="px-4 py-2 text-right font-mono text-amber-400">₹{fmt(d.tds, 4)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{d.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-user breakdown */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Per-User TDS Breakdown</h3>
          <span className="text-xs text-muted-foreground">{perUser.length} users</span>
        </div>
        {isLoading ? (
          <div className="p-8 flex justify-center">
            <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : perUser.length === 0 ? (
          <EmptyState icon={Percent} title="No TDS data" description="No sell orders with TDS deduction found for the selected period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left text-xs text-muted-foreground">User</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground">Gross Sell (INR)</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground">TDS (INR)</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground">Trades</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground">Last Trade</th>
                </tr>
              </thead>
              <tbody>
                {perUser.map(u => (
                  <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium text-xs">{u.name || `User #${u.user_id}`}</div>
                      <div className="text-xs text-muted-foreground">{u.email || u.phone || `ID: ${u.user_id}`}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">₹{fmt(u.gross_sell_value, 2)}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-amber-400 font-semibold">₹{fmt(u.tds_collected, 4)}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{u.trade_count}</td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{fmtDate(u.last_trade_at)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td className="px-4 py-2 font-semibold text-xs">TOTAL</td>
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                    ₹{fmt(perUser.reduce((s, r) => s + Number(r.gross_sell_value), 0), 2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-amber-400 font-bold">
                    ₹{fmt(perUser.reduce((s, r) => s + Number(r.tds_collected), 0), 4)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-semibold">
                    {perUser.reduce((s, r) => s + Number(r.trade_count), 0)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
