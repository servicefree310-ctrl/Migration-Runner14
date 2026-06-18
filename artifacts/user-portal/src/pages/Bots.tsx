import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KycGate } from "@/components/KycGate";
import {
  Bot as BotIcon, Plus, Play, Pause, Trash2, TrendingUp, Activity, Grid3x3, Repeat,
  Clock, DollarSign, ArrowDown, ArrowUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SuccessModal, type BotSuccess } from "@/components/SuccessModal";

type Bot = {
  id: number; name: string; botType: "grid" | "dca";
  symbol: string; baseSymbol: string; quoteSymbol: string;
  status: "running" | "stopped" | "paused" | "completed" | "failed";
  config: Record<string, any>;
  realizedPnlUsd: string; unrealizedPnlUsd: string; totalInvestedUsd: string;
  totalTrades: number; successfulTrades: number;
  startedAt: string | null; stoppedAt: string | null; lastRunAt: string | null;
  createdAt: string; lastError: string | null;
};

type BotTrade = {
  id: number; side: "buy" | "sell"; price: string; qty: string; notional: string;
  pnlUsd: string; reason: string; createdAt: string;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  running: "success", stopped: "neutral", paused: "warning", completed: "success", failed: "danger",
};

export default function Bots() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);

  const { data: botsResp, isLoading } = useQuery({
    queryKey: ["/bots"],
    queryFn: () => get<{ items: Bot[] }>("/bots"),
    refetchInterval: 15_000,
  });
  const bots = botsResp?.items ?? [];

  const totalRealized = bots.reduce((s, b) => s + Number(b.realizedPnlUsd), 0);
  const totalUnrealized = bots.reduce((s, b) => s + Number(b.unrealizedPnlUsd), 0);
  const totalInvested = bots.reduce((s, b) => s + Number(b.totalInvestedUsd), 0);
  const runningCount = bots.filter((b) => b.status === "running").length;

  if (user && (user.kycLevel ?? 0) < 1) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        <PageHeader eyebrow="Automation" title="Trading Bots" description="Automated grid and DCA strategies." />
        <KycGate requiredLevel={1} feature="Trading Bots" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
      <PageHeader
        eyebrow="Automation"
        title="Trading Bots"
        description="Grid and DCA bots — configure once and let them trade 24/7. Backtested strategies, fully automated."
        actions={<CreateBotDialog />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <PremiumStatCard title="Active bots" value={String(runningCount)} icon={BotIcon} accent />
        <PremiumStatCard
          title="Total invested"
          value={totalInvested.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDT"}
          icon={DollarSign}
        />
        <PremiumStatCard
          title="Realized PnL"
          value={`${totalRealized >= 0 ? "+" : ""}${totalRealized.toFixed(2)} USDT`}
          icon={TrendingUp}
          accent={totalRealized > 0}
        />
        <PremiumStatCard
          title="Unrealized PnL"
          value={`${totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toFixed(2)} USDT`}
          icon={Activity}
          accent={totalUnrealized > 0}
        />
      </div>

      {isLoading ? (
        <SectionCard><div className="py-12 text-center text-muted-foreground">Loading bots…</div></SectionCard>
      ) : bots.length === 0 ? (
        <EmptyState
          icon={BotIcon}
          title="No bots yet"
          description="Create your first Grid or DCA bot to start automating your trading strategy."
          action={<CreateBotDialog />}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {bots.map((b) => (
            <BotCard key={b.id} bot={b} onSelect={() => setSelected(b.id)} />
          ))}
        </div>
      )}

      {selected !== null && (
        <BotDetailDialog botId={selected} open={true} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function BotCard({ bot, onSelect }: { bot: Bot; onSelect: () => void }) {
  const qc = useQueryClient();
  const startMut = useMutation({
    mutationFn: () => post(`/bots/${bot.id}/start`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/bots"] }); toast.success("Bot started"); },
    onError: (e: any) => toast.error(e?.message || "Could not start bot"),
  });
  const stopMut = useMutation({
    mutationFn: () => post(`/bots/${bot.id}/stop`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/bots"] }); toast.success("Bot stopped"); },
    onError: (e: any) => toast.error(e?.message || "Could not stop bot"),
  });
  const delMut = useMutation({
    mutationFn: () => del(`/bots/${bot.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/bots"] }); toast.success("Bot deleted"); },
    onError: (e: any) => toast.error(e?.message || "Delete failed"),
  });

  const realized = Number(bot.realizedPnlUsd);
  const unrealized = Number(bot.unrealizedPnlUsd);
  const invested = Number(bot.totalInvestedUsd);
  const Icon = bot.botType === "grid" ? Grid3x3 : Repeat;
  const winRate = bot.totalTrades > 0 ? (bot.successfulTrades / bot.totalTrades) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${bot.botType === "grid" ? "bg-violet-500/10 text-violet-400" : "bg-amber-500/10 text-amber-400"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={onSelect} className="font-bold text-sm hover:text-primary text-left">
                  {bot.name}
                </button>
                <StatusPill variant={STATUS_VARIANT[bot.status]}>{bot.status}</StatusPill>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                {bot.botType.toUpperCase()} · {bot.baseSymbol}/{bot.quoteSymbol}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {bot.status === "running" ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => stopMut.mutate()} disabled={stopMut.isPending}>
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              ) : (bot.status === "stopped" || bot.status === "paused") ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-400" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                  <Play className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => delMut.mutate()} disabled={bot.status === "running"}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
            <div>
              <div className="text-muted-foreground">Realized</div>
              <div className={`font-mono font-bold ${realized >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {realized >= 0 ? "+" : ""}{realized.toFixed(2)} USDT
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Unrealized</div>
              <div className={`font-mono font-bold ${unrealized >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {unrealized >= 0 ? "+" : ""}{unrealized.toFixed(2)} USDT
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Trades</div>
              <div className="font-mono font-bold text-foreground">{bot.totalTrades} <span className="text-muted-foreground text-[10px]">({winRate.toFixed(0)}%)</span></div>
            </div>
          </div>

          {bot.lastError && (
            <div className="mt-2 text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded px-2 py-1 truncate">
              ⚠ {bot.lastError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateBotDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"grid" | "dca">("grid");
  const [name, setName] = useState("");
  const [pair, setPair] = useState("BTC/USDT");
  const [botSuccess, setBotSuccess] = useState<BotSuccess | null>(null);

  // Grid fields
  const [lower, setLower] = useState("");
  const [upper, setUpper] = useState("");
  const [grids, setGrids] = useState("10");
  const [total, setTotal] = useState("");
  // DCA fields
  const [amount, setAmount] = useState("");
  const [interval, setInt] = useState("60");
  const [cap, setCap] = useState("");
  const [floor, setFloor] = useState("");
  const [ceil, setCeil] = useState("");

  const createMut = useMutation({
    mutationFn: () => {
      const [base, quote] = pair.toUpperCase().split("/");
      const config = type === "grid"
        ? {
            lowerPrice: Number(lower),
            upperPrice: Number(upper),
            gridLevels: Number(grids),
            totalAmountUsd: Number(total),
          }
        : {
            amountUsd: Number(amount),
            intervalMin: Number(interval),
            totalCapUsd: Number(cap),
            ...(floor ? { priceFloor: Number(floor) } : {}),
            ...(ceil ? { priceCeil: Number(ceil) } : {}),
          };
      return post("/bots", {
        name, botType: type, symbol: pair.toUpperCase(),
        baseSymbol: base, quoteSymbol: quote, config,
      });
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/bots"] });
      setOpen(false); setName(""); setLower(""); setUpper(""); setTotal(""); setAmount(""); setCap("");
      setBotSuccess({ kind: "bot", botId: res?.bot?.id, botName: name || "New Bot", botType: type, pair });
    },
    onError: (e: any) => toast.error(e?.message || "Could not create bot"),
  });

  return (
    <>
    <SuccessModal
      open={botSuccess !== null}
      onClose={() => setBotSuccess(null)}
      payload={botSuccess}
      onViewBots={() => setBotSuccess(null)}
    />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New bot</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create trading bot</DialogTitle></DialogHeader>
        <Tabs value={type} onValueChange={(v) => setType(v as any)}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="grid"><Grid3x3 className="h-3.5 w-3.5 mr-1.5" /> Grid</TabsTrigger>
            <TabsTrigger value="dca"><Repeat className="h-3.5 w-3.5 mr-1.5" /> DCA</TabsTrigger>
          </TabsList>

          <div className="space-y-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My BTC Bot" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pair</Label>
                <Input value={pair} onChange={(e) => setPair(e.target.value)} placeholder="BTC/USDT" />
              </div>
            </div>

            <TabsContent value="grid" className="space-y-3 mt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Lower price</Label>
                  <Input type="number" value={lower} onChange={(e) => setLower(e.target.value)} placeholder="60000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Upper price</Label>
                  <Input type="number" value={upper} onChange={(e) => setUpper(e.target.value)} placeholder="80000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Grid levels (2-100)</Label>
                  <Input type="number" value={grids} onChange={(e) => setGrids(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Total (USDT)</Label>
                  <Input type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="1000" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Bot buys low, sells high in {grids || "10"} steps between ${lower || "?"} – ${upper || "?"}.
              </p>
            </TabsContent>

            <TabsContent value="dca" className="space-y-3 mt-0">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Per buy ($)</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Every (min)</Label>
                  <Input type="number" value={interval} onChange={(e) => setInt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Total cap ($)</Label>
                  <Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="2000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Buy floor (opt)</Label>
                  <Input type="number" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="—" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Buy ceil (opt)</Label>
                  <Input type="number" value={ceil} onChange={(e) => setCeil(e.target.value)} placeholder="—" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Bot will buy ${amount || "?"} every {interval} min until ${cap || "?"} reached.
              </p>
            </TabsContent>
          </div>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!name || createMut.isPending}>
            Create bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function BotDetailDialog({ botId, open, onClose }: { botId: number; open: boolean; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: [`/bots/${botId}`],
    queryFn: () => get<{ bot: Bot; trades: BotTrade[] }>(`/bots/${botId}`),
    refetchInterval: 10_000,
  });
  const bot = data?.bot;
  const trades = data?.trades ?? [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{bot?.name ?? "Bot"} — recent trades</DialogTitle></DialogHeader>
        {trades.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No trades yet. Bot is waiting for opportunities…</div>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            <div className="grid grid-cols-5 gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
              <span>Side</span><span>Price</span><span>Qty</span><span>Notional</span><span className="text-right">PnL</span>
            </div>
            {trades.map((t) => (
              <div key={t.id} className="grid grid-cols-5 gap-2 px-2 py-1 hover:bg-muted/30 rounded">
                <span className={t.side === "buy" ? "text-emerald-400 inline-flex items-center gap-1" : "text-rose-400 inline-flex items-center gap-1"}>
                  {t.side === "buy" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />} {t.side}
                </span>
                <span>{Number(t.price).toFixed(2)} {bot?.quoteSymbol ?? "USDT"}</span>
                <span>{Number(t.qty).toFixed(6)}</span>
                <span>{Number(t.notional).toFixed(2)} {bot?.quoteSymbol ?? "USDT"}</span>
                <span className={`text-right ${Number(t.pnlUsd) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {Number(t.pnlUsd) ? `${Number(t.pnlUsd) >= 0 ? "+" : ""}${Number(t.pnlUsd).toFixed(2)} USDT` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
