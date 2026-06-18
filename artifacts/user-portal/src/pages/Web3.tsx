import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowDownUp, GitBranch, Wallet as WalletIcon, History, ExternalLink, Trash2, Sparkles, Plus, Network as NetworkIcon, Construction } from "lucide-react";
import { cn } from "@/lib/utils";

type Network = {
  id: number; chainKey: string; displayName: string; chainId: number; nativeSymbol: string;
  explorerUrl: string; logoUrl: string | null; family: string; status: string;
  bridgeFeeBps: number; swapFeeBps: number; estGasUsd: string;
};
type Token = { id: number; networkId: number; symbol: string; name: string; isNative: boolean; priceCoinSymbol: string; logoUrl: string | null; isStablecoin: boolean };
type Wallet = { id: number; networkId: number; address: string; label: string; kind: string; networkKey: string; networkName: string; explorerUrl: string };
type SwapRow = { id: number; chainKey: string; networkName: string; explorerUrl: string; fromAmount: string; toAmount: string; rate: string; feeUsd: string; gasUsd: string; txHash: string | null; status: string; createdAt: string; fromTokenSymbol: string; toTokenSymbol: string };
type BridgeRow = { id: number; fromNetworkName: string; toNetworkName: string; fromChainKey: string; toChainKey: string; tokenSymbol: string; fromAmount: string; toAmount: string; feeUsd: string; srcTxHash: string | null; dstTxHash: string | null; status: string; createdAt: string };

const fmtUsd = (n: number, dp = 2) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });
const fmtTok = (n: number) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 6 });
const shortAddr = (a: string) => a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
const shortTx = (h?: string | null) => h ? `${h.slice(0, 8)}…${h.slice(-6)}` : "—";

const CHAIN_ACCENT: Record<string, string> = {
  eth: "from-indigo-500/20 to-blue-500/10 border-indigo-500/30",
  bsc: "from-yellow-500/20 to-amber-500/10 border-yellow-500/30",
  polygon: "from-purple-500/20 to-violet-500/10 border-purple-500/30",
  arbitrum: "from-sky-500/20 to-blue-500/10 border-sky-500/30",
  optimism: "from-red-500/20 to-rose-500/10 border-red-500/30",
  base: "from-blue-500/20 to-indigo-500/10 border-blue-500/30",
  avalanche: "from-red-500/20 to-orange-500/10 border-red-500/30",
  solana: "from-fuchsia-500/20 to-purple-500/10 border-fuchsia-500/30",
};

export default function Web3Page() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"swap" | "bridge" | "wallets" | "history">("swap");
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  const networksQ = useQuery<{ networks: Network[] }>({ queryKey: ["web3-networks"], queryFn: () => get(`/web3/networks`) });
  const networks = networksQ.data?.networks ?? [];

  // ─── Swap state ────────────────────────────────────────────────────────────
  const [swapNetId, setSwapNetId] = useState<number>(0);
  useEffect(() => { if (!swapNetId && networks.length) setSwapNetId(networks[0].id); }, [networks, swapNetId]);
  const tokensQ = useQuery<{ tokens: Token[] }>({
    queryKey: ["web3-tokens", swapNetId],
    queryFn: () => get(`/web3/tokens?networkId=${swapNetId}`),
    enabled: !!swapNetId,
  });
  const tokens = tokensQ.data?.tokens ?? [];
  const [fromTokId, setFromTokId] = useState<number>(0);
  const [toTokId, setToTokId] = useState<number>(0);
  useEffect(() => {
    if (tokens.length >= 2) {
      if (!tokens.find((t) => t.id === fromTokId)) setFromTokId(tokens[0].id);
      if (!tokens.find((t) => t.id === toTokId) || toTokId === fromTokId) {
        const alt = tokens.find((t) => t.id !== (fromTokId || tokens[0].id)) ?? tokens[1];
        setToTokId(alt.id);
      }
    }
  }, [tokens, fromTokId, toTokId]);

  const [swapAmount, setSwapAmount] = useState<string>("100");
  const [slippageBps, setSlippageBps] = useState<number>(50);

  const swapQuoteQ = useQuery({
    queryKey: ["web3-swap-quote", swapNetId, fromTokId, toTokId, swapAmount, slippageBps],
    queryFn: () => post(`/web3/quote`, {
      networkId: swapNetId, fromTokenId: fromTokId, toTokenId: toTokId,
      fromAmount: Number(swapAmount), slippageBps,
    }) as Promise<any>,
    enabled: !!swapNetId && !!fromTokId && !!toTokId && fromTokId !== toTokId && Number(swapAmount) > 0,
    refetchInterval: 8_000,
  });

  const doSwap = useMutation({
    mutationFn: () => post(`/web3/swap`, {
      networkId: swapNetId, fromTokenId: fromTokId, toTokenId: toTokId,
      fromAmount: Number(swapAmount), slippageBps,
    }),
    onSuccess: (r: any) => {
      const toAmt = fmtTok(Number(r?.swap?.toAmount ?? 0));
      const toSym = tokens.find((t) => t.id === toTokId)?.symbol ?? "";
      const fromSym = tokens.find((t) => t.id === fromTokId)?.symbol ?? "";
      setSuccessData({
        kind: "generic", iconKind: "convert", accentColor: "#6366f1",
        title: "Swap Completed",
        subtitle: "Your on-chain token swap was successful.",
        rows: [
          { label: "You Sent", value: `${swapAmount} ${fromSym}` },
          { label: "You Got", value: `~${toAmt} ${toSym}`, accent: "#10b981" },
          { label: "Status", value: "Confirmed ✓", accent: "#10b981" },
        ],
      });
      qc.invalidateQueries({ queryKey: ["web3-swaps"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Swap failed — please try again"),
  });

  // ─── Bridge state ──────────────────────────────────────────────────────────
  const [brFrom, setBrFrom] = useState<number>(0);
  const [brTo, setBrTo] = useState<number>(0);
  const [brToken, setBrToken] = useState<string>("USDT");
  const [brAmt, setBrAmt] = useState<string>("100");
  useEffect(() => {
    if (networks.length >= 2) {
      if (!brFrom) setBrFrom(networks[0].id);
      if (!brTo || brTo === brFrom) setBrTo(networks.find((n) => n.id !== (brFrom || networks[0].id))?.id ?? networks[1].id);
    }
  }, [networks, brFrom, brTo]);

  const bridgeQuoteQ = useQuery({
    queryKey: ["web3-bridge-quote", brFrom, brTo, brToken, brAmt],
    queryFn: () => post(`/web3/bridge/quote`, {
      fromNetworkId: brFrom, toNetworkId: brTo, tokenSymbol: brToken, fromAmount: Number(brAmt),
    }) as Promise<any>,
    enabled: !!brFrom && !!brTo && brFrom !== brTo && !!brToken && Number(brAmt) > 0,
    refetchInterval: 8_000,
  });

  const doBridge = useMutation({
    mutationFn: () => post(`/web3/bridge`, {
      fromNetworkId: brFrom, toNetworkId: brTo, tokenSymbol: brToken, fromAmount: Number(brAmt),
    }),
    onSuccess: () => {
      const fromNet = networks.find(n => n.id === brFrom)?.displayName ?? "";
      const toNet = networks.find(n => n.id === brTo)?.displayName ?? "";
      setSuccessData({
        kind: "generic", iconKind: "transfer", accentColor: "#8b5cf6",
        title: "Bridge Initiated",
        subtitle: "Cross-chain transfer is underway — usually takes 2–10 minutes.",
        rows: [
          { label: "Asset", value: `${brAmt} ${brToken}` },
          { label: "From", value: fromNet },
          { label: "To", value: toNet, accent: "#10b981" },
          { label: "Status", value: "Pending", accent: "#f59e0b" },
        ],
      });
      qc.invalidateQueries({ queryKey: ["web3-bridges"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Bridge failed — please try again"),
  });

  // ─── Wallets / History ─────────────────────────────────────────────────────
  const walletsQ = useQuery<{ wallets: Wallet[] }>({
    queryKey: ["web3-wallets"], queryFn: () => get(`/web3/wallets`), enabled: !!user,
  });
  const swapsQ = useQuery<{ swaps: SwapRow[] }>({
    queryKey: ["web3-swaps"], queryFn: () => get(`/web3/swaps?limit=50`), enabled: !!user && tab === "history",
  });
  const bridgesQ = useQuery<{ bridges: BridgeRow[] }>({
    queryKey: ["web3-bridges"], queryFn: () => get(`/web3/bridges?limit=50`), enabled: !!user && tab === "history",
  });

  const [newWallet, setNewWallet] = useState({ networkId: 0, address: "", label: "" });
  useEffect(() => { if (!newWallet.networkId && networks.length) setNewWallet((p) => ({ ...p, networkId: networks[0].id })); }, [networks, newWallet.networkId]);

  const addWallet = useMutation({
    mutationFn: () => post(`/web3/wallets`, newWallet),
    onSuccess: () => {
      const addr = newWallet.address;
      const label = newWallet.label;
      const net = networks.find(n => n.id === newWallet.networkId)?.displayName ?? "";
      setNewWallet({ ...newWallet, address: "", label: "" });
      setSuccessData({
        kind: "generic", iconKind: "deposit", accentColor: "#10b981",
        title: "Wallet Tracked",
        subtitle: "This address is now being monitored on-chain.",
        rows: [
          { label: "Label", value: label || "Unnamed" },
          { label: "Network", value: net },
          { label: "Address", value: `${addr.slice(0, 8)}…${addr.slice(-6)}` },
        ],
      });
      qc.invalidateQueries({ queryKey: ["web3-wallets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add wallet — please try again"),
  });

  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const removeWallet = useMutation({
    mutationFn: (id: number) => del(`/web3/wallets/${id}`),
    onSuccess: () => {
      setConfirmRemoveId(null);
      qc.invalidateQueries({ queryKey: ["web3-wallets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove wallet"),
  });

  const fromTok = tokens.find((t) => t.id === fromTokId);
  const toTok = tokens.find((t) => t.id === toTokId);
  const swapQuote = swapQuoteQ.data;
  const bridgeQuote = bridgeQuoteQ.data;

  return (
    <div className="container mx-auto px-3 md:px-6 py-5">
      {/* Testnet Preview banner */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/5 px-4 py-3 text-sm">
        <Construction className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">Testnet Preview Mode</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-400 border border-amber-400/30">PREVIEW</span>
          </div>
          <p className="text-amber-300/70 text-xs leading-relaxed">
            Web3 swap and bridge are in <strong className="text-amber-300">testnet preview</strong> — no real funds are used. Spot and futures trading is fully live.
          </p>
        </div>
      </div>

      <PageHeader
        eyebrow="Multi-Chain"
        title="Web3 Trading"
        description="Swap and bridge across 8 chains: Ethereum, BSC, Solana, Polygon, Arbitrum, Avalanche, Optimism, Base."
      />

      {/* Network strip */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-5">
        {networks.map((n) => (
          <div key={n.id} className={cn("rounded-lg p-2.5 border bg-gradient-to-br text-center", CHAIN_ACCENT[n.chainKey] ?? "from-muted/40 to-muted/20 border-border")}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{n.family}</div>
            <div className="font-semibold text-sm">{n.displayName}</div>
            <div className="text-[10px] text-muted-foreground">{n.nativeSymbol}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="swap" data-testid="tab-swap"><ArrowDownUp className="w-3.5 h-3.5 mr-1.5" />Swap</TabsTrigger>
          <TabsTrigger value="bridge" data-testid="tab-bridge"><GitBranch className="w-3.5 h-3.5 mr-1.5" />Bridge</TabsTrigger>
          <TabsTrigger value="wallets" data-testid="tab-wallets"><WalletIcon className="w-3.5 h-3.5 mr-1.5" />Wallets</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history"><History className="w-3.5 h-3.5 mr-1.5" />History</TabsTrigger>
        </TabsList>

        {/* ─── Swap Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="swap" className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SectionCard title="Token Swap" icon={ArrowDownUp} description="DEX aggregator ke through best route">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Network</Label>
                  <select value={swapNetId} onChange={(e) => setSwapNetId(Number(e.target.value))} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm" data-testid="select-swap-network">
                    {networks.map((n) => <option key={n.id} value={n.id}>{n.displayName} · {n.family}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">From</Label>
                    <div className="flex gap-2">
                      <select value={fromTokId} onChange={(e) => setFromTokId(Number(e.target.value))} className="bg-muted/40 border border-border rounded-md px-2 py-2 text-sm w-28" data-testid="select-from-token">
                        {tokens.map((t) => <option key={t.id} value={t.id}>{t.symbol}</option>)}
                      </select>
                      <Input type="number" step="0.0001" value={swapAmount} onChange={(e) => setSwapAmount(e.target.value)} className="flex-1" data-testid="input-swap-amount" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">To (estimated)</Label>
                    <div className="flex gap-2">
                      <select value={toTokId} onChange={(e) => setToTokId(Number(e.target.value))} className="bg-muted/40 border border-border rounded-md px-2 py-2 text-sm w-28" data-testid="select-to-token">
                        {tokens.filter((t) => t.id !== fromTokId).map((t) => <option key={t.id} value={t.id}>{t.symbol}</option>)}
                      </select>
                      <div className="flex-1 px-3 py-2 bg-muted/20 rounded-md border border-border tabular-nums">
                        {swapQuote?.toAmount ? fmtTok(swapQuote.toAmount) : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-1.5 block">Slippage tolerance: {(slippageBps / 100).toFixed(2)}%</Label>
                  <div className="flex gap-1.5">
                    {[10, 50, 100, 300].map((b) => (
                      <button key={b} onClick={() => setSlippageBps(b)} className={cn("px-3 py-1 rounded text-xs border", slippageBps === b ? "gold-bg-soft border-amber-500/40 text-amber-300" : "bg-muted/30 border-border")}>
                        {(b / 100).toFixed(2)}%
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full gold-bg text-black font-semibold"
                  disabled={!swapQuote || doSwap.isPending || !user || fromTokId === toTokId}
                  onClick={() => doSwap.mutate()}
                  data-testid="btn-swap"
                >
                  {doSwap.isPending ? "Swapping…" : !user ? "Login to swap" : `Swap ${fromTok?.symbol ?? ""} → ${toTok?.symbol ?? ""}`}
                </Button>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Quote Details" icon={Sparkles}>
            {swapQuote ? (
              <div className="space-y-2 text-sm">
                <RowKv k="Rate" v={`1 ${fromTok?.symbol} = ${fmtTok(swapQuote.rate)} ${toTok?.symbol}`} />
                <RowKv k="Min received" v={`${fmtTok(swapQuote.minToAmount)} ${toTok?.symbol}`} />
                <RowKv k="Price impact" v={`${swapQuote.priceImpactPct.toFixed(3)}%`} />
                <RowKv k="LP fee" v={`$${fmtUsd(swapQuote.feeUsd, 4)}`} />
                <RowKv k="Network gas" v={`$${fmtUsd(swapQuote.gasUsd, 4)}`} />
                <RowKv k="Route" v={swapQuote.routeHint} />
              </div>
            ) : <div className="text-sm text-muted-foreground">Quote loading…</div>}
          </SectionCard>
        </TabsContent>

        {/* ─── Bridge Tab ────────────────────────────────────────────────── */}
        <TabsContent value="bridge" className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SectionCard title="Cross-Chain Bridge" icon={GitBranch} description="Same coin different chain — fees apply">
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">From chain</Label>
                    <select value={brFrom} onChange={(e) => setBrFrom(Number(e.target.value))} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm" data-testid="select-bridge-from">
                      {networks.map((n) => <option key={n.id} value={n.id}>{n.displayName}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">To chain</Label>
                    <select value={brTo} onChange={(e) => setBrTo(Number(e.target.value))} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm" data-testid="select-bridge-to">
                      {networks.filter((n) => n.id !== brFrom).map((n) => <option key={n.id} value={n.id}>{n.displayName}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs mb-1.5 block">Token</Label>
                    <select value={brToken} onChange={(e) => setBrToken(e.target.value)} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm" data-testid="select-bridge-token">
                      <option value="USDT">USDT</option>
                      <option value="USDC">USDC</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Amount</Label>
                    <Input type="number" value={brAmt} onChange={(e) => setBrAmt(e.target.value)} data-testid="input-bridge-amount" />
                  </div>
                </div>

                <Button
                  className="w-full gold-bg text-black font-semibold"
                  disabled={!bridgeQuote || doBridge.isPending || !user}
                  onClick={() => doBridge.mutate()}
                  data-testid="btn-bridge"
                >
                  {doBridge.isPending ? "Bridging…" : !user ? "Login to bridge" : `Bridge ${brToken}`}
                </Button>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Bridge Quote" icon={Sparkles}>
            {bridgeQuote ? (
              <div className="space-y-2 text-sm">
                <RowKv k="You send" v={`${fmtTok(bridgeQuote.fromAmount)} ${bridgeQuote.tokenSymbol}`} />
                <RowKv k="You receive" v={`${fmtTok(bridgeQuote.toAmount)} ${bridgeQuote.tokenSymbol}`} />
                <RowKv k="Bridge fee" v={`$${fmtUsd(bridgeQuote.bridgeFeeUsd, 4)}`} />
                <RowKv k="Gas (both sides)" v={`$${fmtUsd(bridgeQuote.gasUsd, 4)}`} />
                <RowKv k="ETA" v={`~${bridgeQuote.estMinutes} min`} />
                <RowKv k="Route" v={bridgeQuote.routeHint} />
              </div>
            ) : <div className="text-sm text-muted-foreground">Quote loading…</div>}
          </SectionCard>
        </TabsContent>

        {/* ─── Wallets Tab ───────────────────────────────────────────────── */}
        <TabsContent value="wallets" className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SectionCard title="Saved Wallets" icon={WalletIcon} padded={false}>
              {!user ? (
                <EmptyState title="Login required" description="Please log in to manage your saved wallets" icon={WalletIcon} />
              ) : (walletsQ.data?.wallets ?? []).length === 0 ? (
                <EmptyState title="No saved wallets" description="Add an address using the form on the right" icon={WalletIcon} />
              ) : (
                <div className="divide-y divide-border/40">
                  {walletsQ.data!.wallets.map((w) => (
                    <div key={w.id} className="flex items-center justify-between p-3 hover:bg-muted/10" data-testid={`wallet-${w.id}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <NetworkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium">{w.networkName}</span>
                          <StatusPill variant={w.kind === "external" ? "info" : "neutral"}>{w.kind}</StatusPill>
                        </div>
                        <div className="text-sm font-mono mt-0.5 line-clamp-1">{w.label || shortAddr(w.address)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono break-all leading-tight">{w.address}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={`${w.explorerUrl}/address/${w.address}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-muted/40">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => setConfirmRemoveId(w.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400" data-testid={`btn-remove-${w.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Add Wallet" icon={Plus}>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block">Network</Label>
                <select value={newWallet.networkId} onChange={(e) => setNewWallet({ ...newWallet, networkId: Number(e.target.value) })} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm" data-testid="select-new-wallet-net">
                  {networks.map((n) => <option key={n.id} value={n.id}>{n.displayName}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Address</Label>
                <Input value={newWallet.address} onChange={(e) => setNewWallet({ ...newWallet, address: e.target.value })} placeholder="0x… or base58" data-testid="input-new-wallet-addr" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Label (optional)</Label>
                <Input value={newWallet.label} onChange={(e) => setNewWallet({ ...newWallet, label: e.target.value })} placeholder="My main wallet" data-testid="input-new-wallet-label" />
              </div>
              <Button className="w-full" disabled={!user || !newWallet.address || addWallet.isPending} onClick={() => addWallet.mutate()} data-testid="btn-add-wallet">
                {addWallet.isPending ? "Adding…" : "Add Wallet"}
              </Button>
              <p className="text-[10px] text-muted-foreground">Only your public address is stored — your private key is never requested.</p>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ─── History Tab ───────────────────────────────────────────────── */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <SectionCard title="Swap History" icon={ArrowDownUp} padded={false}>
            {!user ? <EmptyState title="Login required" description="Please log in to view your swap history" icon={History} />
              : (swapsQ.data?.swaps ?? []).length === 0 ? <EmptyState title="No swaps yet" description="Make your first swap to get started" icon={ArrowDownUp} />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left">Chain</th>
                        <th className="px-3 py-2 text-left">From → To</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Fee</th>
                        <th className="px-3 py-2 text-left">Tx</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {swapsQ.data!.swaps.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/10">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(s.createdAt).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2 font-medium">{s.networkName}</td>
                          <td className="px-3 py-2">{fmtTok(Number(s.fromAmount))} {s.fromTokenSymbol} → <span className="text-emerald-400 font-medium">{fmtTok(Number(s.toAmount))} {s.toTokenSymbol}</span></td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTok(Number(s.rate))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">${fmtUsd(Number(s.feeUsd) + Number(s.gasUsd), 4)}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{shortTx(s.txHash)}</td>
                          <td className="px-3 py-2">
                            {s.txHash && <a href={`${s.explorerUrl}/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </SectionCard>

          <SectionCard title="Bridge History" icon={GitBranch} padded={false}>
            {!user ? null : (bridgesQ.data?.bridges ?? []).length === 0
              ? <EmptyState title="No bridge history" description="Use the Bridge tab to transfer assets across chains" icon={GitBranch} />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left">Token</th>
                        <th className="px-3 py-2 text-left">From → To</th>
                        <th className="px-3 py-2 text-right">Sent</th>
                        <th className="px-3 py-2 text-right">Received</th>
                        <th className="px-3 py-2 text-right">Fee</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {bridgesQ.data!.bridges.map((b) => (
                        <tr key={b.id} className="hover:bg-muted/10">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(b.createdAt).toLocaleString("en-IN")}</td>
                          <td className="px-3 py-2 font-medium">{b.tokenSymbol}</td>
                          <td className="px-3 py-2">{b.fromNetworkName} → {b.toNetworkName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtTok(Number(b.fromAmount))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{fmtTok(Number(b.toAmount))}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">${fmtUsd(Number(b.feeUsd), 4)}</td>
                          <td className="px-3 py-2"><StatusPill status={b.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </SectionCard>
        </TabsContent>
      </Tabs>
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />

      <AlertDialog open={confirmRemoveId !== null} onOpenChange={(o) => { if (!o) setConfirmRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-400" /> Remove Wallet?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This wallet address will be removed from your tracked wallets. You can always re-add it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600 text-white"
              disabled={removeWallet.isPending}
              onClick={() => { if (confirmRemoveId !== null) removeWallet.mutate(confirmRemoveId); }}
            >
              {removeWallet.isPending ? "Removing…" : "Remove Wallet"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowKv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums text-right line-clamp-1 shrink-0">{v}</span>
    </div>
  );
}
