import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Wallet, BarChart2, List,
  PlusCircle, Clock, CheckCircle, XCircle, ArrowUpRight, Building2,
} from "lucide-react";
import { get } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";

const fmtPrice = (v: any, prefix = "₹") =>
  v == null ? "—" : `${prefix}${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPnl = (v: any) => {
  const n = Number(v ?? 0);
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function statusVariant(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "complete") return "success";
  if (s === "rejected" || s === "cancelled") return "danger";
  return "warning";
}

export default function BrokerDashboard() {
  const [tab, setTab] = useState<"portfolio" | "orders">("portfolio");

  const accountQ = useQuery({
    queryKey: ["/broker/account"],
    queryFn: () => get<any>("/broker/account"),
  });

  const portfolioQ = useQuery({
    queryKey: ["/broker/portfolio"],
    queryFn: () => get<any>("/broker/portfolio"),
    refetchInterval: 10_000,
  });

  const ordersQ = useQuery({
    queryKey: ["/broker/orders"],
    queryFn: () => get<any>("/broker/orders"),
    refetchInterval: 5_000,
  });

  const account   = accountQ.data?.account;
  const portfolio: any[] = portfolioQ.data?.portfolio ?? [];
  const orders:    any[] = ordersQ.data?.orders ?? [];

  const totalInvested = portfolio.reduce((s, p) => s + Number(p.holdingQty) * Number(p.avgBuyPrice), 0);
  const totalCurrent  = portfolio.reduce((s, p) => s + Number(p.holdingQty) * Number(p.currentPrice ?? p.avgBuyPrice), 0);
  const totalPnl      = totalCurrent - totalInvested;
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  const assetGroups = portfolio.reduce((acc: Record<string, any[]>, p) => {
    const g = p.assetClass ?? "other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(p);
    return acc;
  }, {});

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Angel One Sub-broker"
        title="Broker Dashboard"
        description="Manage your Angel One sub-broker account, portfolio holdings, and order history."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/broker/onboarding">Edit Application</Link>
          </Button>
        }
      />

      {/* Account card */}
      {account && (
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-card p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Angel One Account</span>
              </div>
              <div className="text-xl font-bold">{account.fullName ?? "Your Account"}</div>
              {account.angelClientId && (
                <div className="text-xs text-muted-foreground mt-1">
                  Client ID: <span className="text-amber-400 font-mono">{account.angelClientId}</span>
                  {account.angelDemat && (
                    <> · Demat: <span className="text-amber-400 font-mono">{account.angelDemat}</span></>
                  )}
                </div>
              )}
              <div className="mt-2 flex gap-1.5 flex-wrap">
                {account.segmentEquity    && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs">Equity</Badge>}
                {account.segmentFno       && <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-xs">F&O</Badge>}
                {account.segmentCommodity && <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs">Commodity</Badge>}
                {account.segmentCurrency  && <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-xs">Currency</Badge>}
              </div>
            </div>
            <StatusPill variant={account.status === "active" ? "success" : account.status === "submitted" ? "info" : "warning"}>
              {account.status?.toUpperCase() ?? "PENDING"}
            </StatusPill>
          </div>
        </div>
      )}

      {/* P&L stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard
          hero
          title="Total Invested"
          value={fmtPrice(totalInvested)}
          icon={Wallet}
          loading={portfolioQ.isLoading}
          hint="Cost basis"
        />
        <PremiumStatCard
          title="Current Value"
          value={fmtPrice(totalCurrent)}
          icon={BarChart2}
          loading={portfolioQ.isLoading}
          hint="Market value"
        />
        <PremiumStatCard
          title="Total P&L"
          value={fmtPrice(Math.abs(totalPnl))}
          prefix={totalPnl >= 0 ? "+" : "-"}
          icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
          delta={totalPnlPct}
          loading={portfolioQ.isLoading}
          hint="Unrealized"
        />
        <PremiumStatCard
          title="P&L %"
          value={`${fmtPnl(totalPnlPct)}%`}
          icon={ArrowUpRight}
          loading={portfolioQ.isLoading}
          hint="Return on investment"
        />
      </div>

      {/* Quick trade links */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Trade Forex",       href: "/forex",       cls: "border-blue-500/30 text-blue-400 hover:bg-blue-500/5" },
          { label: "Trade Stocks",      href: "/stocks",      cls: "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/5" },
          { label: "Trade Commodities", href: "/commodities", cls: "border-amber-500/30 text-amber-400 hover:bg-amber-500/5" },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center justify-center gap-2 border rounded-xl py-3 text-sm font-semibold transition-all ${link.cls}`}
          >
            <PlusCircle className="h-3.5 w-3.5" /> {link.label}
          </Link>
        ))}
      </div>

      {/* Portfolio / Orders tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as "portfolio" | "orders")} className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio" className="gap-1.5">
            <List className="h-4 w-4" /> Portfolio ({portfolio.length})
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5">
            <Clock className="h-4 w-4" /> Orders ({orders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio">
          <SectionCard title="Holdings" icon={BarChart2} padded={false}>
            {portfolioQ.isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}
              </div>
            ) : portfolio.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={BarChart2} title="No holdings yet" description="Start trading to see your portfolio here." />
              </div>
            ) : (
              <div>
                {Object.entries(assetGroups).map(([group, items]) => (
                  <div key={group}>
                    <div className="px-4 py-2 bg-muted/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {group}
                    </div>
                    <div className="divide-y divide-border/40">
                      {(items as any[]).map((pos: any) => {
                        const invested = Number(pos.holdingQty) * Number(pos.avgBuyPrice);
                        const current  = Number(pos.holdingQty) * Number(pos.currentPrice ?? pos.avgBuyPrice);
                        const pnl      = current - invested;
                        const pnlPct   = invested > 0 ? (pnl / invested) * 100 : 0;
                        return (
                          <div key={pos.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                            <div>
                              <div className="text-sm font-bold">{pos.symbol}</div>
                              <div className="text-xs text-muted-foreground">{pos.exchange} · {Number(pos.holdingQty)} units</div>
                              <div className="text-xs text-muted-foreground">Avg: {fmtPrice(pos.avgBuyPrice)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold">{fmtPrice(current)}</div>
                              <div className={`text-xs font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {pnl >= 0 ? "+" : ""}{fmtPnl(pnl)} ({fmtPnl(pnlPct)}%)
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="orders">
          <SectionCard title="Order History" icon={Clock} padded={false}>
            {ordersQ.isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}
              </div>
            ) : orders.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={List} title="No orders yet" description="Place your first trade from the trading pages." />
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {orders.map((order: any) => (
                  <div key={order.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-xs ${order.side === "buy"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                        }`}>
                          {order.side?.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-bold">{order.symbol}</span>
                        <span className="text-xs text-muted-foreground">{order.exchange}</span>
                        {order.simulated && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">SIM</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Qty: {Number(order.qty)} · Type: {order.orderType?.toUpperCase()}
                        {order.executedPrice && <> · Exec: {fmtPrice(order.executedPrice)}</>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusPill variant={statusVariant(order.status)} status={order.status} />
                      {order.pnl != null && (
                        <div className={`text-xs font-semibold mt-1 tabular-nums ${Number(order.pnl) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          P&L: {fmtPnl(order.pnl)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
