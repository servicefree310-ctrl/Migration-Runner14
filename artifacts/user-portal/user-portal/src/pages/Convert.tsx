import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import { ArrowDownUp, RefreshCw, History, Zap, Clock, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { get, post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { cn } from "@/lib/utils";

// Quick Convert: quote-then-execute with 10-second locked rates.

type Wallet = { coin: string; balance: number; spotBalance?: number; spotLocked?: number };
type Coin   = { id: number; symbol: string; name: string; status?: string; isListed?: boolean };
type Quote = {
  quoteId: number; uid: string; fromCoin: string; toCoin: string;
  fromAmount: number; toAmount: number; rate: number; feeAmount: number;
  feePercent: number; feeBps: number; spreadPercent: number;
  vipTier: number; tierName: string; expiresAt: string; ttlMs: number;
};
type ConvertHistoryRow = {
  id: number; fromCoin: string; toCoin: string;
  fromAmount: number; toAmount: number; rate: number; feeAmount: number;
  status: string; createdAt: string; executedAt: string | null;
};

const POPULAR = ["BTC", "ETH", "SOL", "USDT", "BNB", "XRP", "INR"];

function fmt(n: number, max = 8) {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) >= 1) return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-IN", { maximumFractionDigits: max });
}

function useCountdown(target: string | null): { msLeft: number; expired: boolean } {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const i = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(i);
  }, [target]);
  if (!target) return { msLeft: 0, expired: true };
  const left = new Date(target).getTime() - now;
  return { msLeft: Math.max(0, left), expired: left <= 0 };
}

export default function Convert() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  // Coin universe (server-curated). Filter to active+listed and popular order.
  const coinsQ = useQuery<Coin[]>({
    queryKey: ["/coins"],
    queryFn: () => get<Coin[]>("/coins"),
  });
  const coins = useMemo(() => {
    const all = (coinsQ.data ?? []).filter((c) =>
      (c.status ?? "active") === "active" && c.isListed !== false,
    );
    const order = new Map(POPULAR.map((s, i) => [s, i] as const));
    return all.sort((a, b) => {
      const ai = order.get(a.symbol) ?? 999;
      const bi = order.get(b.symbol) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [coinsQ.data]);

  // Wallet balances (used for "Max" + insufficient-balance hint).
  const walletQ = useQuery<{ items: Array<{ currency: string; balance: number; inOrder: number; type: string }> } | Wallet[]>({
    queryKey: ["/finance/wallet?perPage=200"],
    queryFn: () => get("/finance/wallet?perPage=200"),
  });
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    const data = walletQ.data as any;
    const items: any[] = Array.isArray(data) ? data : (data?.items ?? []);
    for (const w of items) {
      // Spot only — convert debits the spot wallet.
      const sym = (w.currency || w.coin || "").toUpperCase();
      const isSpot = (w.type ?? "spot").toLowerCase() === "spot";
      if (!sym || !isSpot) continue;
      const bal = Number(w.balance ?? 0);
      m.set(sym, (m.get(sym) ?? 0) + bal);
    }
    return m;
  }, [walletQ.data]);

  const [fromCoin, setFromCoin] = useState("USDT");
  const [toCoin, setToCoin] = useState("BTC");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  const fromBal = balances.get(fromCoin) ?? 0;
  const amtNum = Number(amount);
  const insufficient = amtNum > fromBal + 1e-12;

  // Auto-quote on input change (debounced) and every TTL.
  const quoteSeq = useRef(0);
  const fetchQuote = async () => {
    if (!amount || amtNum <= 0 || !Number.isFinite(amtNum)) {
      setQuote(null); setQuoteErr(null); return;
    }
    if (fromCoin === toCoin) {
      setQuote(null); setQuoteErr("Source and destination assets cannot be the same"); return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    try {
      const q = await post<Quote>("/convert/quote", { fromCoin, toCoin, fromAmount: amtNum });
      if (seq !== quoteSeq.current) return; // newer request raced ahead
      setQuote(q); setQuoteErr(null);
    } catch (e: any) {
      if (seq !== quoteSeq.current) return;
      setQuote(null);
      setQuoteErr(e?.data?.error || e?.message || "Quote failed");
    } finally {
      if (seq === quoteSeq.current) setQuoting(false);
    }
  };

  // Debounce keystrokes; explicit deps keep the effect cheap.
  useEffect(() => {
    const t = setTimeout(() => { void fetchQuote(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, fromCoin, toCoin]);

  // Live countdown — when it hits 0 we auto-refresh so the user always sees
  // a usable rate (no dead "Expired" state to manually clear).
  const { msLeft, expired } = useCountdown(quote?.expiresAt ?? null);
  useEffect(() => {
    if (expired && quote) { void fetchQuote(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const exec = useMutation({
    mutationFn: (quoteId: number) => post<{ ok: true; toAmount: number }>("/convert/execute", { quoteId }),
    onSuccess: (r) => {
      setGenericSuccess({
        kind: "generic",
        accentColor: "#A78BFA",
        iconKind: "convert",
        title: "Converted!",
        subtitle: `${fromCoin} → ${toCoin}`,
        rows: [
          { label: "You Swapped", value: `${fmt(Number(amount || 0), 6).replace(/\.?0+$/, "")} ${fromCoin}` },
          { label: "You Received", value: `${fmt(r.toAmount, 6).replace(/\.?0+$/, "")} ${toCoin}`, accent: "text-emerald-400" },
          { label: "Rate", value: `1 ${fromCoin} = ${fmt(r.toAmount / Number(amount || 1), 4)} ${toCoin}`, accent: "text-muted-foreground" },
        ],
        primaryLabel: "Done",
      });
      setAmount(""); setQuote(null);
      qc.invalidateQueries({ queryKey: ["/finance/wallet?perPage=200"] });
      qc.invalidateQueries({ queryKey: ["/convert/history"] });
    },
    onError: async (e: any) => {
      const status = e?.status;
      const msg = e?.data?.error || e?.message || "Convert failed";
      if (status === 410) {
        toast.error("Rate expired — quoting again");
        await fetchQuote();
      } else if (status === 409) {
        toast.error("This quote was already used");
        setQuote(null); await fetchQuote();
      } else {
        toast.error(msg);
      }
    },
  });

  const swap = () => { setFromCoin(toCoin); setToCoin(fromCoin); };
  const setMax = () => { if (fromBal > 0) setAmount(String(fromBal)); };

  const historyQ = useQuery<ConvertHistoryRow[]>({
    queryKey: ["/convert/history"],
    queryFn: () => get<ConvertHistoryRow[]>("/convert/history"),
    refetchInterval: 15_000,
  });

  const ttlPct = quote ? Math.max(0, Math.min(100, (msLeft / quote.ttlMs) * 100)) : 0;
  const secLeft = Math.ceil(msLeft / 1000);

  if (user && (user.kycLevel ?? 0) < 1) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
        <PageHeader eyebrow="Quick Convert" title="Convert" description="Instantly swap between cryptocurrencies." />
        <KycGate requiredLevel={1} feature="Quick Convert" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Quick Convert"
        title="Instant Crypto Swap"
        description="Instant conversion at a locked rate. No order book, no slippage — convert in one click."
        actions={
          <StatusPill status="active" variant="gold">
            <Zap className="w-3 h-3 mr-1" /> Tier {quote?.tierName ?? "—"}
          </StatusPill>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard className="lg:col-span-2" title="Convert" icon={ArrowDownUp}>
          {/* From */}
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
              <span className="text-xs text-muted-foreground">
                Balance:{" "}
                <button
                  onClick={setMax}
                  className="font-mono tabular-nums text-amber-400 hover:underline"
                  data-testid="convert-max"
                  disabled={fromBal <= 0}
                >
                  {fmt(fromBal)} {fromCoin}
                </button>
              </span>
            </div>
            <div className="flex gap-2">
              <Select value={fromCoin} onValueChange={setFromCoin}>
                <SelectTrigger className="w-32 bg-background/40" data-testid="convert-from-coin">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {coins.map((c) => (
                    <SelectItem key={c.symbol} value={c.symbol} disabled={c.symbol === toCoin}>
                      {c.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number" inputMode="decimal" min="0" step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "flex-1 text-right font-mono tabular-nums text-lg bg-background/40",
                  insufficient && "border-rose-500/50 text-rose-300",
                )}
                data-testid="convert-amount"
              />
            </div>
            {insufficient && (
              <p className="text-xs text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Insufficient {fromCoin} balance
              </p>
            )}
          </div>

          {/* Swap divider */}
          <div className="flex justify-center my-3">
            <Button
              size="icon"
              variant="outline"
              onClick={swap}
              className="rounded-full h-9 w-9 bg-card hover:bg-amber-500/10 hover:border-amber-500/40"
              data-testid="convert-swap"
              aria-label="Swap from and to"
            >
              <ArrowDownUp className="w-4 h-4" />
            </Button>
          </div>

          {/* To */}
          <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">To (estimated)</Label>
              <span className="text-xs text-muted-foreground">
                Balance: <span className="font-mono tabular-nums">{fmt(balances.get(toCoin) ?? 0)} {toCoin}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <Select value={toCoin} onValueChange={setToCoin}>
                <SelectTrigger className="w-32 bg-background/40" data-testid="convert-to-coin">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {coins.map((c) => (
                    <SelectItem key={c.symbol} value={c.symbol} disabled={c.symbol === fromCoin}>
                      {c.symbol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1 px-3 py-2 rounded-md border border-border/50 bg-background/30 text-right font-mono tabular-nums text-lg flex items-center justify-end" data-testid="convert-to-amount">
                {quoting ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
                  <span className={cn(quote ? "text-emerald-300" : "text-muted-foreground")}>
                    {quote ? fmt(quote.toAmount) : "—"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quote breakdown + countdown */}
          {quoteErr && !quoting && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {quoteErr}
            </div>
          )}
          {quote && !quoteErr && (
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-card p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rate</span>
                <span className="font-mono tabular-nums">
                  1 {quote.fromCoin} ≈ {fmt(quote.rate, 6)} {quote.toCoin}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Spread</span>
                <span className="font-mono tabular-nums">{quote.spreadPercent.toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  VIP Fee · <span className="text-amber-400 font-medium">{quote.tierName}</span>
                </span>
                <span className="font-mono tabular-nums">
                  {quote.feePercent.toFixed(3)}% · {fmt(quote.feeAmount, 6)} {quote.toCoin}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-mono tabular-nums text-emerald-400 font-bold">
                  {fmt(quote.toAmount)} {quote.toCoin}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Rate refreshes in
                </span>
                <span className="text-xs font-mono tabular-nums text-amber-300">{secLeft}s</span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-[width] duration-200"
                  style={{ width: `${ttlPct}%` }}
                />
              </div>
            </div>
          )}

          <Button
            className="w-full mt-5 h-12 text-base font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
            disabled={!quote || quoting || expired || insufficient || exec.isPending || amtNum <= 0}
            onClick={() => quote && exec.mutate(quote.quoteId)}
            data-testid="convert-execute"
          >
            {exec.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Converting…</>
            ) : expired || !quote ? (
              <>Get Quote</>
            ) : (
              <>Convert {fmt(amtNum)} {fromCoin} → {toCoin}</>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground mt-3 text-center">
            Quotes are locked for 10 seconds. Higher VIP tiers pay lower convert fees — see your tier on Profile.
          </p>
        </SectionCard>

        {/* Info side panel */}
        <SectionCard title="Why Convert?" icon={Sparkles} className="lg:col-span-1">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <Zap className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <span><span className="text-foreground font-medium">Instant fills.</span> No orderbook depth, no slippage games — one click and done.</span>
            </li>
            <li className="flex gap-3">
              <Clock className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <span><span className="text-foreground font-medium">10s locked rate.</span> Whatever the screen shows is what you get — even if the market jumps.</span>
            </li>
            <li className="flex gap-3">
              <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <span><span className="text-foreground font-medium">VIP-tiered fees.</span> Trade more on Spot/Futures, pay less on Convert. Full ladder on your Profile.</span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Recent Conversions" icon={History} padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/60">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">From → To</th>
                <th className="px-4 py-3 font-medium text-right">From</th>
                <th className="px-4 py-3 font-medium text-right">To</th>
                <th className="px-4 py-3 font-medium text-right">Rate</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {historyQ.isLoading ? (
                <tr><td colSpan={6} className="p-4"><div className="h-4 bg-muted/30 rounded animate-pulse" /></td></tr>
              ) : (historyQ.data?.length ?? 0) === 0 ? (
                <tr><td colSpan={6} className="p-0">
                  <EmptyState
                    icon={History}
                    title="No conversions yet"
                    description="Your first quick swap will appear here."
                  />
                </td></tr>
              ) : (
                historyQ.data!.map((r) => (
                  <tr key={r.id} className="border-b border-border/40" data-testid={`convert-history-row-${r.id}`}>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                      {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {r.fromCoin} <span className="text-muted-foreground">→</span> {r.toCoin}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-right">{fmt(r.fromAmount)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-right text-emerald-400">{fmt(r.toAmount)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-right text-xs text-muted-foreground">{fmt(r.rate, 6)}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SuccessModal
        open={genericSuccess !== null}
        onClose={() => setGenericSuccess(null)}
        payload={genericSuccess}
      />
    </div>
  );
}
