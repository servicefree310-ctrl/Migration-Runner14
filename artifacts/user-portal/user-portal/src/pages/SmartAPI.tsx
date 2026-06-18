import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, RefreshCw, PlugZap, X, Search,
  Shield, AlertTriangle, CheckCircle2, Wifi, WifiOff, Eye, EyeOff,
  BarChart3, BookOpen, Wallet, List, Activity, ChevronRight,
  ArrowUpRight, ArrowDownRight, Clock, Info, Zap, LogOut, Bot,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type SmartApiAccount = {
  id: number; userId: number; clientCode: string;
  name: string | null; email: string | null; mobile: string | null;
  pan: string | null; brokerName: string | null;
  availableCash: string | null; totalPnl: string | null;
  status: string; lastError: string | null; lastConnectedAt: string | null;
  hasToken: boolean; hasFeedToken: boolean;
};
type Holding = {
  tradingsymbol: string; exchange: string; isin: string;
  quantity: number; authorisedquantity: number;
  averageprice: number; ltp: number;
  profitandloss: number; pnlpercentage: number;
};
type Position = {
  tradingsymbol: string; exchange: string;
  producttype: string; netqty: number; buyqty: number; sellqty: number;
  netprice: number; buyprice: number; sellprice: number;
  ltp: number; pnl: number; unrealised: number; realised: number;
};
type Order = {
  orderid: string; variety: string; tradingsymbol: string; exchange: string;
  transactiontype: string; producttype: string; ordertype: string;
  quantity: string; price: string; status: string;
  strikeprice?: string; optiontype?: string;
  updatetime?: string; exchtime?: string; text?: string;
};
type Funds = {
  net?: number; availablecash?: number; utiliseddebits?: number;
  collateral?: number; m2munrealisedprofit?: number;
};
type ScripResult = {
  tradingsymbol: string; symboltoken: string; exchange: string; name?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtINR(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtPct(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "—";
  const s = n.toFixed(2);
  return (n >= 0 ? "+" : "") + s + "%";
}
function pnlColor(n: number | null | undefined) {
  if (!n) return "text-foreground/40";
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}
function statusBadge(status: string) {
  const map: Record<string, string> = {
    complete: "bg-emerald-500/15 text-emerald-400",
    open: "bg-blue-500/15 text-blue-400",
    pending: "bg-amber-500/15 text-amber-400",
    cancelled: "bg-muted/50 text-foreground/40",
    rejected: "bg-red-500/15 text-red-400",
    "open pending": "bg-blue-500/15 text-blue-400",
    "modify pending": "bg-amber-500/15 text-amber-400",
  };
  const key = status?.toLowerCase() ?? "";
  const cls = Object.entries(map).find(([k]) => key.includes(k))?.[1] ?? "bg-muted/50 text-foreground/40";
  return <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", cls)}>{status || "—"}</span>;
}

// ─── ConnectModal ─────────────────────────────────────────────────────────────
// User provides only their Angel One credentials.
// The platform API Key is configured by the admin — users never need to enter it.
function ConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
  const [form, setForm] = useState({ clientCode: "", password: "", totp: "", otpMode: "totp" as "totp" | "sms" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: platformStatus } = useQuery({
    queryKey: ["smartapi-platform-status"],
    queryFn: async () => {
      const r = await fetch("/api/smartapi/platform-status", { credentials: "include" });
      return r.json();
    },
  });

  const handleConnect = async () => {
    if (!form.clientCode || !form.password) {
      setError("Client Code and Password are required."); return;
    }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/smartapi/connect", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? data.detail ?? "Connection failed"); return; }
      toast.success(`Angel One Connected! ${data.message ?? ""}`.trim());
      onConnected();
    } catch { setError("Network error — please retry."); }
    finally { setLoading(false); }
  };

  const platformConfigured = platformStatus?.configured ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <Zap size={17} className="text-orange-400" />
            </div>
            <div>
              <div className="font-bold text-foreground">Connect Angel One</div>
              <div className="text-[11px] text-foreground/40">SmartAPI — Direct NSE / BSE / MCX access</div>
            </div>
          </div>
          <button onClick={onClose} className="text-foreground/30 hover:text-foreground/70 transition-colors"><X size={16} /></button>
        </div>

        {/* Platform status badge */}
        {platformConfigured === false ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
            <AlertTriangle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[11px] text-red-300 font-semibold">Platform Not Configured</p>
              <p className="text-[10px] text-red-300/70 mt-0.5">The platform SmartAPI key has not been configured. Please contact your administrator.</p>
            </div>
          </div>
        ) : platformConfigured === true ? (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/15 mb-4">
            <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
            <p className="text-[11px] text-emerald-300">Platform SmartAPI is configured — just connect your Angel One account below.</p>
          </div>
        ) : (
          <div className="h-9 mb-4 bg-white/3 rounded-xl animate-pulse" />
        )}

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/8 border border-blue-500/15 mb-5">
          <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-blue-300/80 leading-relaxed">
            Enter only your Angel One <strong>Client Code, Password, and TOTP</strong>. The API key is managed at the platform level by your administrator — no additional setup required.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-foreground/40 mb-1 block">Angel One Client Code <span className="text-red-400">*</span></label>
            <input value={form.clientCode} onChange={e => setForm(f => ({ ...f, clientCode: e.target.value.toUpperCase() }))}
              placeholder="e.g. A123456"
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors font-mono uppercase" />
          </div>
          <div>
            <label className="text-[11px] text-foreground/40 mb-1 block">Password <span className="text-red-400">*</span></label>
            <div className="relative">
              <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                type={showPwd ? "text" : "password"} placeholder="Angel One login password"
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 pr-10 text-sm text-foreground placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors" />
              <button onClick={() => setShowPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-foreground/40">
                OTP / TOTP <span className="text-red-400/60">*</span>
              </label>
              <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, otpMode: "totp" }))}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-md transition-colors",
                    form.otpMode === "totp"
                      ? "bg-orange-500/20 text-orange-300 font-semibold"
                      : "text-foreground/30 hover:text-foreground/60"
                  )}
                >
                  Authenticator App
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, otpMode: "sms" }))}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-md transition-colors",
                    form.otpMode === "sms"
                      ? "bg-blue-500/20 text-blue-300 font-semibold"
                      : "text-foreground/30 hover:text-foreground/60"
                  )}
                >
                  SMS OTP
                </button>
              </div>
            </div>
            <input value={form.totp} onChange={e => setForm(f => ({ ...f, totp: e.target.value.replace(/\D/g, "") }))}
              placeholder="6-digit code" maxLength={6} inputMode="numeric"
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors font-mono tracking-[0.35em]" />
            {form.otpMode === "totp" ? (
              <p className="text-[10px] text-foreground/20 mt-1">
                6-digit code from your Google Authenticator / TOTP app — expires every 30 seconds, submit promptly
              </p>
            ) : (
              <p className="text-[10px] text-blue-300/50 mt-1">
                An SMS OTP has been sent to your Angel One registered mobile number — enter the 6-digit code here
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-300">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-foreground/50 hover:text-foreground/80 text-sm transition-colors">Cancel</button>
          <button onClick={handleConnect} disabled={loading || platformConfigured === false}
            className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-foreground font-semibold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            {loading ? <><RefreshCw size={13} className="animate-spin" /> Connecting...</> : <><PlugZap size={13} /> Connect Angel One</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AccountCard ──────────────────────────────────────────────────────────────
function AccountCard({ acct, onDisconnect, onRefresh, selected, onSelect }:
  { acct: SmartApiAccount; onDisconnect: () => void; onRefresh: () => void; selected: boolean; onSelect: () => void }) {
  const connected = acct.status === "connected";
  const cash = parseFloat(acct.availableCash ?? "0");

  return (
    <div onClick={onSelect}
      className={cn("p-4 rounded-2xl border cursor-pointer transition-all",
        selected ? "border-orange-500/40 bg-orange-500/5" : "border-border/60 bg-white/3 hover:border-white/15")}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold",
            connected ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/40 text-foreground/30")}>
            {acct.name?.charAt(0) ?? acct.clientCode.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground">{acct.name ?? acct.clientCode}</div>
            <div className="text-[10px] text-foreground/35 font-mono">{acct.clientCode}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
            connected ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/40 text-foreground/30")}>
            {connected ? <><Wifi size={8} /> LIVE</> : <><WifiOff size={8} /> Offline</>}
          </span>
          <button onClick={e => { e.stopPropagation(); onRefresh(); }}
            className="p-1.5 rounded-lg text-foreground/25 hover:text-foreground/60 hover:bg-muted/30 transition-colors">
            <RefreshCw size={11} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDisconnect(); }}
            className="p-1.5 rounded-lg text-foreground/25 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut size={11} />
          </button>
        </div>
      </div>

      {connected && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/20 rounded-xl p-2.5">
            <div className="text-[9px] text-foreground/30 uppercase tracking-wider mb-0.5">Available Cash</div>
            <div className="text-sm font-bold text-foreground tabular-nums">{fmtINR(cash)}</div>
          </div>
          <div className="bg-black/20 rounded-xl p-2.5">
            <div className="text-[9px] text-foreground/30 uppercase tracking-wider mb-0.5">Broker</div>
            <div className="text-xs text-foreground/50 font-semibold">Angel One SmartAPI</div>
          </div>
        </div>
      )}
      {acct.lastError && (
        <div className="flex items-center gap-1.5 mt-2 p-2 rounded-lg bg-red-500/8">
          <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
          <p className="text-[10px] text-red-300 truncate">{acct.lastError}</p>
        </div>
      )}
    </div>
  );
}

// ─── Holdings Table ───────────────────────────────────────────────────────────
function HoldingsTab({ accountId }: { accountId: number }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["smartapi-holdings", accountId],
    queryFn: async () => {
      const r = await fetch(`/api/smartapi/holdings?accountId=${accountId}`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 30000,
  });

  const holdings: Holding[] = data?.data?.holdings ?? [];
  const totalValue = holdings.reduce((s, h) => s + (h.ltp * h.quantity), 0);
  const totalPnl = holdings.reduce((s, h) => s + h.profitandloss, 0);
  const invested = holdings.reduce((s, h) => s + (h.averageprice * h.quantity), 0);

  if (isLoading) return <LoadingPanel label="Fetching holdings from Angel One..." />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary strip */}
      {holdings.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-3 border-b border-border/40 bg-white/2 flex-shrink-0">
          <Metric label="Holdings" value={String(holdings.length)} />
          <Metric label="Current Value" value={fmtINR(totalValue)} />
          <Metric label="Invested" value={fmtINR(invested)} />
          <Metric label="Total P&L" value={fmtINR(totalPnl)} pnl={totalPnl}
            sub={invested > 0 ? fmtPct((totalPnl / invested) * 100) : undefined} />
          <button onClick={() => refetch()} className="ml-auto flex items-center gap-1.5 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors">
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      )}

      {holdings.length === 0 ? (
        <EmptyState icon={<Wallet size={22} />} title="No holdings found" sub="Buy stocks to see them here" />
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-foreground/25 border-b border-border/40 text-[10px]">
                {["Symbol", "Qty", "Avg Price", "LTP", "Current Value", "P&L", "P&L %"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={i} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-foreground">{h.tradingsymbol}</div>
                    <div className="text-[10px] text-foreground/30">{h.exchange} · ISIN: {h.isin?.slice(-6)}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground/70">{h.quantity}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-foreground/50">{fmtINR(h.averageprice)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono font-semibold text-foreground">{fmtINR(h.ltp)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-foreground/70">{fmtINR(h.ltp * h.quantity)}</td>
                  <td className="px-3 py-2.5">
                    <PnlPill value={h.profitandloss} />
                  </td>
                  <td className={cn("px-3 py-2.5 tabular-nums font-semibold", pnlColor(h.pnlpercentage))}>
                    {fmtPct(h.pnlpercentage)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Positions Table ──────────────────────────────────────────────────────────
function PositionsTab({ accountId }: { accountId: number }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["smartapi-positions", accountId],
    queryFn: async () => {
      const r = await fetch(`/api/smartapi/positions?accountId=${accountId}`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 10000,
  });

  const positions: Position[] = data?.data ?? [];
  const totalPnl = positions.reduce((s, p) => s + (p.pnl || 0), 0);
  const open = positions.filter(p => (p.netqty ?? 0) !== 0);

  if (isLoading) return <LoadingPanel label="Fetching positions from Angel One..." />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {positions.length > 0 && (
        <div className="flex items-center gap-6 px-4 py-3 border-b border-border/40 bg-white/2 flex-shrink-0">
          <Metric label="Open" value={String(open.length)} />
          <Metric label="Total P&L" value={fmtINR(totalPnl)} pnl={totalPnl} />
          <button onClick={() => refetch()} className="ml-auto flex items-center gap-1.5 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors">
            <RefreshCw size={10} /> Refresh
          </button>
        </div>
      )}

      {positions.length === 0 ? (
        <EmptyState icon={<Activity size={22} />} title="No positions found" sub="Intraday & carryforward positions appear here" />
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-foreground/25 border-b border-border/40 text-[10px]">
                {["Symbol", "Product", "Net Qty", "Buy Qty", "Sell Qty", "Avg Buy", "Avg Sell", "LTP", "P&L", "Unrealised", "Realised"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={i} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-foreground">{p.tradingsymbol}</div>
                    <div className="text-[10px] text-foreground/30">{p.exchange}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="bg-muted/40 px-1.5 py-0.5 rounded text-[10px] text-foreground/50 font-mono">{p.producttype}</span>
                  </td>
                  <td className={cn("px-3 py-2.5 tabular-nums font-bold",
                    (p.netqty ?? 0) > 0 ? "text-emerald-400" : (p.netqty ?? 0) < 0 ? "text-red-400" : "text-foreground/40")}>
                    {(p.netqty ?? 0) > 0 ? "+" : ""}{p.netqty ?? 0}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-emerald-400/70">{p.buyqty ?? 0}</td>
                  <td className="px-3 py-2.5 tabular-nums text-red-400/70">{p.sellqty ?? 0}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-foreground/50">{fmtINR(p.buyprice)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-foreground/50">{fmtINR(p.sellprice)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono font-semibold text-foreground">{fmtINR(p.ltp)}</td>
                  <td className="px-3 py-2.5"><PnlPill value={p.pnl} /></td>
                  <td className={cn("px-3 py-2.5 tabular-nums", pnlColor(p.unrealised))}>{fmtINR(p.unrealised)}</td>
                  <td className={cn("px-3 py-2.5 tabular-nums", pnlColor(p.realised))}>{fmtINR(p.realised)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Orders Tab (Order Book + Place Order) ────────────────────────────────────
function OrdersTab({ accountId }: { accountId: number }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ScripResult[]>([]);
  const [selectedScrip, setSelectedScrip] = useState<ScripResult | null>(null);
  const [orderForm, setOrderForm] = useState({
    transactiontype: "BUY", exchange: "NSE", ordertype: "MARKET",
    producttype: "INTRADAY", duration: "DAY", price: "", quantity: "",
    variety: "NORMAL",
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["smartapi-orders", accountId],
    queryFn: async () => {
      const r = await fetch(`/api/smartapi/orders?accountId=${accountId}`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 8000,
  });

  const orders: Order[] = data?.data ?? [];

  const placeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScrip) throw new Error("Select a scrip first");
      const r = await fetch("/api/smartapi/orders", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          ...orderForm,
          tradingsymbol: selectedScrip.tradingsymbol,
          symboltoken: selectedScrip.symboltoken,
          exchange: selectedScrip.exchange,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? d.error ?? "Order failed");
      return d;
    },
    onSuccess: (d) => {
      toast.success(`Order Placed — ID: ${d.data?.orderid ?? ""}`);
      qc.invalidateQueries({ queryKey: ["smartapi-orders", accountId] });
      setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message || "Order failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await fetch(`/api/smartapi/orders/${orderId}`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, variety: "NORMAL" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? "Cancel failed");
      return d;
    },
    onSuccess: () => {
      toast.success("Order cancelled");
      qc.invalidateQueries({ queryKey: ["smartapi-orders", accountId] });
    },
    onError: (e: Error) => toast.error(e.message || "Cancel failed"),
  });

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const r = await fetch(`/api/smartapi/search?query=${encodeURIComponent(q)}&exchange=${orderForm.exchange}&accountId=${accountId}`, { credentials: "include" });
      const d = await r.json();
      setSearchResults(d.data?.slice(0, 8) ?? []);
    } catch { setSearchResults([]); }
  }, [accountId, orderForm.exchange]);

  if (isLoading) return <LoadingPanel label="Fetching orders from Angel One..." />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 flex-shrink-0">
        <span className="text-[11px] text-foreground/40">{orders.length} orders today</span>
        <button onClick={() => refetch()} className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors">
          <RefreshCw size={10} /> Refresh
        </button>
        <button onClick={() => setShowForm(s => !s)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-foreground text-xs font-semibold transition-colors">
          <Zap size={11} /> {showForm ? "Close" : "Place Order"}
        </button>
      </div>

      {/* Place order form */}
      {showForm && (
        <div className="flex-shrink-0 border-b border-border/60 bg-black/20 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {/* Scrip search */}
            <div className="col-span-2 relative">
              <label className="text-[10px] text-foreground/35 mb-1 block">Symbol *</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground/30" />
                <input value={selectedScrip ? selectedScrip.tradingsymbol : search}
                  onChange={e => { setSelectedScrip(null); handleSearch(e.target.value); }}
                  placeholder="Search e.g. RELIANCE, SBIN"
                  className="w-full bg-muted/30 border border-border rounded-xl pl-7 pr-3 py-2 text-xs text-foreground placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors" />
              </div>
              {searchResults.length > 0 && !selectedScrip && (
                <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
                  {searchResults.map((s, i) => (
                    <button key={i} onClick={() => { setSelectedScrip(s); setSearch(""); setSearchResults([]); setOrderForm(f => ({ ...f, exchange: s.exchange })); }}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 text-left transition-colors">
                      <div>
                        <span className="text-xs font-bold text-foreground">{s.tradingsymbol}</span>
                        {s.name && <span className="ml-2 text-[10px] text-foreground/30">{s.name}</span>}
                      </div>
                      <span className="text-[10px] text-foreground/30 font-mono">{s.exchange} · {s.symboltoken}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] text-foreground/35 mb-1 block">Side</label>
              <div className="flex rounded-xl overflow-hidden border border-border">
                {["BUY", "SELL"].map(s => (
                  <button key={s} onClick={() => setOrderForm(f => ({ ...f, transactiontype: s }))}
                    className={cn("flex-1 py-2 text-xs font-bold transition-colors",
                      orderForm.transactiontype === s
                        ? (s === "BUY" ? "bg-emerald-500 text-foreground" : "bg-red-500 text-foreground")
                        : "bg-white/3 text-foreground/40 hover:text-foreground/60")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-foreground/35 mb-1 block">Order Type</label>
              <select value={orderForm.ordertype} onChange={e => setOrderForm(f => ({ ...f, ordertype: e.target.value }))}
                className="w-full bg-muted/30 border border-border rounded-xl px-2 py-2 text-xs text-foreground focus:outline-none focus:border-orange-500/50 transition-colors">
                {["MARKET", "LIMIT", "STOPLOSS", "STOPLOSS_MARKET"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-foreground/35 mb-1 block">Product</label>
              <select value={orderForm.producttype} onChange={e => setOrderForm(f => ({ ...f, producttype: e.target.value }))}
                className="w-full bg-muted/30 border border-border rounded-xl px-2 py-2 text-xs text-foreground focus:outline-none focus:border-orange-500/50 transition-colors">
                {["INTRADAY", "DELIVERY", "CARRYFORWARD", "MARGIN"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-foreground/35 mb-1 block">Exchange</label>
              <select value={orderForm.exchange} onChange={e => setOrderForm(f => ({ ...f, exchange: e.target.value }))}
                className="w-full bg-muted/30 border border-border rounded-xl px-2 py-2 text-xs text-foreground focus:outline-none focus:border-orange-500/50 transition-colors">
                {["NSE", "BSE", "NFO", "MCX", "CDS"].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-foreground/35 mb-1 block">Quantity *</label>
              <input value={orderForm.quantity} onChange={e => setOrderForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="e.g. 1" type="number" min="1"
                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors" />
            </div>

            {orderForm.ordertype !== "MARKET" && orderForm.ordertype !== "STOPLOSS_MARKET" && (
              <div>
                <label className="text-[10px] text-foreground/35 mb-1 block">Price *</label>
                <input value={orderForm.price} onChange={e => setOrderForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00" type="number" step="0.05"
                  className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder-white/20 focus:outline-none focus:border-orange-500/50 transition-colors" />
              </div>
            )}

            <div className="col-span-2 md:col-span-1 flex items-end">
              <button onClick={() => placeMutation.mutate()} disabled={placeMutation.isPending || !selectedScrip || !orderForm.quantity}
                className={cn("w-full py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-50",
                  orderForm.transactiontype === "BUY" ? "bg-emerald-500 hover:bg-emerald-400 text-foreground" : "bg-red-500 hover:bg-red-400 text-foreground")}>
                {placeMutation.isPending ? "Placing..." : `${orderForm.transactiontype} ${selectedScrip?.tradingsymbol ?? "—"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState icon={<BookOpen size={22} />} title="No orders today" sub="Place an order to see it here" />
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-foreground/25 border-b border-border/40 text-[10px]">
                {["Time", "Symbol", "Type", "Side", "Qty", "Price", "Product", "Status", ""].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => (
                <tr key={i} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2.5 text-foreground/30 text-[10px] font-mono whitespace-nowrap">{o.updatetime?.slice(0, 8) ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-foreground">{o.tradingsymbol}</div>
                    <div className="text-[10px] text-foreground/30">{o.exchange} · {o.orderid?.slice(-8)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-foreground/50">{o.ordertype}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                      o.transactiontype === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                      {o.transactiontype}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground/70">{o.quantity}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-foreground/60">{o.price === "0" ? "MKT" : `₹${o.price}`}</td>
                  <td className="px-3 py-2.5 text-foreground/40">{o.producttype}</td>
                  <td className="px-3 py-2.5">{statusBadge(o.status)}</td>
                  <td className="px-3 py-2.5">
                    {(o.status?.toLowerCase().includes("open") || o.status?.toLowerCase() === "pending") && (
                      <button onClick={() => cancelMutation.mutate(o.orderid)}
                        disabled={cancelMutation.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[10px] font-semibold transition-all">
                        <X size={9} /> Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Trade Book Tab ───────────────────────────────────────────────────────────
function TradeBookTab({ accountId }: { accountId: number }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["smartapi-tradebook", accountId],
    queryFn: async () => {
      const r = await fetch(`/api/smartapi/tradebook?accountId=${accountId}`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 15000,
  });

  const trades: any[] = data?.data ?? [];

  if (isLoading) return <LoadingPanel label="Fetching trade book..." />;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 flex-shrink-0">
        <span className="text-[11px] text-foreground/40">{trades.length} trades executed today</span>
        <button onClick={() => refetch()} className="flex items-center gap-1 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors ml-auto">
          <RefreshCw size={10} /> Refresh
        </button>
      </div>
      {trades.length === 0 ? (
        <EmptyState icon={<List size={22} />} title="No trades today" sub="Executed trades appear here" />
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-foreground/25 border-b border-border/40 text-[10px]">
                {["Time", "Symbol", "Side", "Qty", "Price", "Order ID", "Exchange"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i} className="border-b border-white/4 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2.5 text-foreground/30 text-[10px] font-mono">{t.tradetime ?? "—"}</td>
                  <td className="px-3 py-2.5 font-bold text-foreground">{t.tradingsymbol}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold",
                      t.transactiontype === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                      {t.transactiontype}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-foreground/70">{t.fillsize ?? t.quantity}</td>
                  <td className="px-3 py-2.5 tabular-nums font-mono text-foreground/70">{fmtINR(parseFloat(t.fillprice ?? t.tradedprice))}</td>
                  <td className="px-3 py-2.5 text-foreground/30 font-mono text-[10px]">{t.orderid?.slice(-8)}</td>
                  <td className="px-3 py-2.5 text-foreground/40">{t.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Funds Tab ────────────────────────────────────────────────────────────────
function FundsTab({ accountId }: { accountId: number }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["smartapi-funds", accountId],
    queryFn: async () => {
      const r = await fetch(`/api/smartapi/funds?accountId=${accountId}`, { credentials: "include" });
      return r.json();
    },
    refetchInterval: 30000,
  });

  const funds: Funds = data?.data ?? {};

  if (isLoading) return <LoadingPanel label="Fetching funds from Angel One..." />;

  const rows = [
    { label: "Available Cash", value: funds.availablecash, highlight: true },
    { label: "Net", value: funds.net },
    { label: "Utilised Debits", value: funds.utiliseddebits },
    { label: "Collateral", value: funds.collateral },
    { label: "M2M Unrealised P&L", value: funds.m2munrealisedprofit },
  ];

  return (
    <div className="p-5 space-y-3 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Funds & Margins</h3>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors">
          <RefreshCw size={10} /> Refresh
        </button>
      </div>
      {Object.keys(funds).length === 0 ? (
        <EmptyState icon={<Wallet size={22} />} title="No funds data" sub="Could not fetch margin data from Angel One" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.filter(r => r.value !== undefined).map((row, i) => (
            <div key={i} className={cn("p-4 rounded-2xl border", row.highlight ? "border-orange-500/25 bg-orange-500/5" : "border-border/60 bg-white/3")}>
              <div className="text-[10px] text-foreground/35 uppercase tracking-wider mb-1">{row.label}</div>
              <div className={cn("text-xl font-bold tabular-nums", row.highlight ? "text-orange-300" : "text-foreground")}>{fmtINR(row.value as number)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared micro-components ──────────────────────────────────────────────────
function PnlPill({ value }: { value: number | null | undefined }) {
  const n = value ?? 0;
  return (
    <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold tabular-nums text-[11px]",
      n >= 0 ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20" : "bg-red-500/15 text-red-400 ring-1 ring-red-500/20")}>
      {n >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {fmtINR(Math.abs(n))}
    </div>
  );
}
function Metric({ label, value, pnl, sub }: { label: string; value: string; pnl?: number; sub?: string }) {
  return (
    <div>
      <div className="text-[9px] text-foreground/25 uppercase tracking-wider">{label}</div>
      <div className={cn("text-sm font-bold tabular-nums", pnl !== undefined ? pnlColor(pnl) : "text-foreground")}>{value}</div>
      {sub && <div className={cn("text-[10px] tabular-nums", pnlColor(pnl))}>{sub}</div>}
    </div>
  );
}
function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-40 gap-2 text-foreground/20">
      <RefreshCw size={18} className="animate-spin" />
      <div className="text-xs">{label}</div>
    </div>
  );
}
function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-foreground/20">
      {icon}
      <div className="text-sm text-foreground/30 font-medium">{title}</div>
      <div className="text-[11px] text-foreground/15">{sub}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { id: "holdings", label: "Holdings", icon: Wallet },
  { id: "positions", label: "Positions", icon: Activity },
  { id: "orders", label: "Orders", icon: BookOpen },
  { id: "tradebook", label: "Trade Book", icon: List },
  { id: "funds", label: "Funds", icon: BarChart3 },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SmartAPI() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const COMING_SOON_SMARTAPI: boolean = true;
  if (COMING_SOON_SMARTAPI) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center gap-6 px-4 text-center bg-background">
        <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <Bot className="w-9 h-9 text-violet-400" />
        </div>
        <div className="max-w-sm space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Coming Soon</p>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Smart API</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Connect your Angel One broker account for automated trading, live holdings, and real-time P&amp;L — coming soon to Zebvix.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 border border-border/50">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs text-muted-foreground font-medium">Launching soon on Zebvix</span>
        </div>
      </div>
    );
  }

  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("holdings");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  const { data: accountData, refetch: refetchAccounts } = useQuery({
    queryKey: ["smartapi-accounts"],
    queryFn: async () => {
      const r = await fetch("/api/smartapi/account", { credentials: "include" });
      return r.json();
    },
    enabled: !!user,
  });

  const accounts: SmartApiAccount[] = accountData?.accounts ?? [];
  const connectedAccounts = accounts.filter(a => a.status === "connected");
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) ?? connectedAccounts[0] ?? null;

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const r = await fetch("/api/smartapi/disconnect", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Disconnect failed");
      return d;
    },
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "withdraw", accentColor: "#ef4444",
        title: "Account Disconnected",
        subtitle: "Your Angel One account has been unlinked from Zebvix.",
        rows: [{ label: "Status", value: "Disconnected", accent: "#ef4444" }],
      });
      qc.invalidateQueries({ queryKey: ["smartapi-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Disconnect failed"),
  });

  const refreshMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const r = await fetch("/api/smartapi/refresh", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Refresh failed");
      return d;
    },
    onSuccess: () => {
      setSuccessData({
        kind: "generic", iconKind: "paid", accentColor: "#10b981",
        title: "Session Refreshed",
        subtitle: "Your Angel One session token has been renewed.",
        rows: [{ label: "Status", value: "Active ✓", accent: "#10b981" }],
      });
      qc.invalidateQueries({ queryKey: ["smartapi-accounts"] });
    },
    onError: (e: Error) => toast.error(e.message || "Refresh failed"),
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-foreground/20">
        <Shield size={36} />
        <div className="text-lg font-semibold text-foreground/40">Login Required</div>
        <p className="text-sm text-foreground/25">Please log in to use Angel One SmartAPI trading.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] bg-background text-foreground overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <Zap size={15} className="text-orange-400" />
          </div>
          <div>
            <div className="font-bold text-sm text-foreground">Angel One SmartAPI</div>
            <div className="text-[10px] text-foreground/35">Direct market access — NSE / BSE / MCX / NFO</div>
          </div>
          {connectedAccounts.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20">
              <Wifi size={9} className="text-emerald-400" />
              <span className="text-[10px] text-emerald-400 font-semibold">{connectedAccounts.length} LIVE</span>
            </div>
          )}
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-foreground text-xs font-semibold transition-colors">
          <PlugZap size={11} /> Add Account
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar — accounts ─────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 border-r border-border/60 overflow-y-auto p-3 space-y-3 bg-card">
          <div className="text-[10px] text-foreground/25 uppercase tracking-wider px-1 pt-1">Connected Accounts</div>

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-foreground/20">
              <WifiOff size={24} />
              <div className="text-xs text-center text-foreground/25">No accounts connected.<br />Add your Angel One account.</div>
              <button onClick={() => setShowModal(true)}
                className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/25 text-orange-400 text-xs font-semibold transition-colors">
                <PlugZap size={11} /> Connect Now
              </button>
            </div>
          ) : accounts.map(acct => (
            <AccountCard key={acct.id} acct={acct}
              selected={selectedAccount?.id === acct.id}
              onSelect={() => setSelectedAccountId(acct.id)}
              onDisconnect={() => disconnectMutation.mutate(acct.id)}
              onRefresh={() => refreshMutation.mutate(acct.id)} />
          ))}
        </div>

        {/* ── Main content area ────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {!selectedAccount ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-foreground/20">
              <Activity size={32} />
              <div className="text-base font-semibold text-foreground/30">No account selected</div>
              <p className="text-sm text-foreground/20 text-center max-w-xs">Connect an Angel One account to start trading with SmartAPI.</p>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-foreground text-sm font-semibold transition-colors">
                <PlugZap size={13} /> Connect Angel One
              </button>
            </div>
          ) : (
            <>
              {/* Account info bar */}
              <div className="flex items-center gap-4 px-4 py-2.5 border-b border-border/40 bg-card flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", selectedAccount.status === "connected" ? "bg-emerald-400 animate-pulse" : "bg-white/20")} />
                  <span className="text-sm font-semibold text-foreground">{selectedAccount.name ?? selectedAccount.clientCode}</span>
                  <span className="text-[10px] text-foreground/30 font-mono">({selectedAccount.clientCode})</span>
                </div>
                {selectedAccount.availableCash && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-foreground/30">Cash:</span>
                    <span className="text-sm font-bold text-orange-300">{fmtINR(parseFloat(selectedAccount.availableCash))}</span>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {selectedAccount.pan && <span className="text-[10px] text-foreground/25 font-mono">PAN: {selectedAccount.pan.slice(0, 3)}***</span>}
                  <span className="text-[10px] text-foreground/25">{selectedAccount.brokerName ?? "Angel One"}</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border/40 flex-shrink-0 overflow-x-auto">
                {TABS.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                        activeTab === tab.id
                          ? "bg-orange-500/15 text-orange-400 border border-orange-500/25"
                          : "text-foreground/35 hover:text-foreground/70 hover:bg-white/4")}>
                      <Icon size={12} /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-hidden">
                {activeTab === "holdings" && <HoldingsTab accountId={selectedAccount.id} />}
                {activeTab === "positions" && <PositionsTab accountId={selectedAccount.id} />}
                {activeTab === "orders" && <OrdersTab accountId={selectedAccount.id} />}
                {activeTab === "tradebook" && <TradeBookTab accountId={selectedAccount.id} />}
                {activeTab === "funds" && <FundsTab accountId={selectedAccount.id} />}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Connect Modal */}
      {showModal && (
        <ConnectModal
          onClose={() => setShowModal(false)}
          onConnected={() => {
            setShowModal(false);
            refetchAccounts();
            qc.invalidateQueries({ queryKey: ["smartapi-accounts"] });
          }}
        />
      )}
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}
