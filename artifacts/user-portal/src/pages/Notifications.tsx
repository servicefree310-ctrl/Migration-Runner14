import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, del, patch } from "@/lib/api";
import { Link } from "wouter";
import {
  Bell, BellRing, CheckCheck, Trash2, Plus, TrendingUp, TrendingDown, Clock,
  Filter, AlertTriangle, Info, CheckCircle2, XCircle, Gift, Activity, Wallet, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Notif = {
  id: number; kind: string; category: string;
  title: string; body: string;
  ctaLabel: string | null; ctaUrl: string | null;
  readAt: string | null; createdAt: string;
};

type Alert = {
  id: number; coinSymbol: string; condition: "above" | "below";
  targetPrice: string; status: string;
  triggerOnce: boolean; note: string | null;
  triggeredAt: string | null; triggeredPrice: string | null;
  createdAt: string;
};

const KIND_ICON: Record<string, typeof Bell> = {
  info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle, promo: Gift,
};
const KIND_TONE: Record<string, string> = {
  info: "text-sky-400 bg-sky-500/10 border-sky-500/20",
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  danger: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  promo: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
};
const CAT_ICON: Record<string, typeof Bell> = {
  trade: Activity, wallet: Wallet, security: Shield, alert: BellRing, promo: Gift, system: Info,
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function Notifications() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "alerts">("all");
  const [filter, setFilter] = useState<string>("");
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  const { data: notifsResp, isLoading } = useQuery({
    queryKey: ["/notifications/me", filter],
    queryFn: () => get<{ items: Notif[] }>(`/notifications/me${filter ? `?category=${filter}` : ""}`),
    refetchInterval: 30_000,
  });
  const { data: unread } = useQuery({
    queryKey: ["/notifications/me/unread-count"],
    queryFn: () => get<{ count: number }>("/notifications/me/unread-count"),
    refetchInterval: 30_000,
  });

  const { data: alertsResp } = useQuery({
    queryKey: ["/alerts/me"],
    queryFn: () => get<{ items: Alert[] }>("/alerts/me"),
  });

  const readAllMut = useMutation({
    mutationFn: () => post("/notifications/me/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/notifications/me"] });
      qc.invalidateQueries({ queryKey: ["/notifications/me/unread-count"] });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "emerald", title: "All Caught Up!", subtitle: "All notifications have been marked as read.", rows: [], primaryLabel: "Done" });
    },
  });
  const readOneMut = useMutation({
    mutationFn: (id: number) => post(`/notifications/me/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/notifications/me"] });
      qc.invalidateQueries({ queryKey: ["/notifications/me/unread-count"] });
    },
  });
  const deleteOneMut = useMutation({
    mutationFn: (id: number) => del(`/notifications/me/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/notifications/me"] });
      toast.success("Notification deleted");
    },
  });
  const testMut = useMutation({
    mutationFn: () => post("/notifications/me/test"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/notifications/me"] });
      qc.invalidateQueries({ queryKey: ["/notifications/me/unread-count"] });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "amber", title: "Test Sent!", subtitle: "A test notification has been delivered to your inbox.", rows: [], primaryLabel: "Check Inbox" });
    },
  });

  const items = notifsResp?.items ?? [];
  const alerts = alertsResp?.items ?? [];

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5 max-w-5xl">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Everything in one place — trade fills, deposits, security alerts, and your price alerts."
        actions={
          <div className="flex flex-wrap gap-2">
            {(unread?.count ?? 0) > 0 && (
              <Button variant="outline" size="sm" onClick={() => readAllMut.mutate()}>
                <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => testMut.mutate()}>
              <BellRing className="h-3.5 w-3.5 mr-1.5" /> Test
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full sm:w-auto grid-cols-2">
          <TabsTrigger value="all">
            <Bell className="h-3.5 w-3.5 mr-1.5" /> All
            {(unread?.count ?? 0) > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full font-bold">{unread?.count}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Price Alerts
            <span className="ml-1.5 bg-muted text-foreground text-[10px] px-1.5 rounded-full">{alerts.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {(["", "trade", "wallet", "security", "alert", "promo", "system"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  filter === c
                    ? "bg-primary/15 text-primary border-primary/30 font-bold"
                    : "bg-muted/40 text-muted-foreground border-border hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {c || "All"}
              </button>
            ))}
          </div>

          {isLoading ? (
            <SectionCard><div className="text-center py-12 text-muted-foreground">Loading…</div></SectionCard>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Inbox empty"
              description="Trade fills, deposits, and your price alerts will appear here."
            />
          ) : (
            <div className="space-y-2">
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Bell;
                const CatIcon = CAT_ICON[n.category] ?? Info;
                const tone = KIND_TONE[n.kind] ?? KIND_TONE.info;
                const unreadRow = !n.readAt;
                return (
                  <div
                    key={n.id}
                    className={`group rounded-lg border ${unreadRow ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card/40"} p-3 sm:p-4 flex gap-3 hover:border-primary/40 transition-colors`}
                  >
                    <div className={`h-9 w-9 rounded-lg ${tone} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{n.title}</span>
                            {unreadRow && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                              <CatIcon className="h-2.5 w-2.5" /> {n.category}
                            </span>
                          </div>
                          {n.body && <p className="text-xs text-muted-foreground mt-1 leading-snug">{n.body}</p>}
                          <div className="flex items-center gap-3 mt-2 text-[11px]">
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {relTime(n.createdAt)}
                            </span>
                            {n.ctaUrl && (
                              <Link href={n.ctaUrl} className="text-primary hover:underline font-medium" onClick={() => readOneMut.mutate(n.id)}>
                                {n.ctaLabel ?? "View →"}
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          {unreadRow && (
                            <button onClick={() => readOneMut.mutate(n.id)} title="Mark read" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                              <CheckCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => deleteOneMut.mutate(n.id)} title="Delete" className="p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-3 mt-4">
          <CreateAlertDialog />
          {alerts.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No alerts set"
              description="Get notified when BTC crosses $100k, ETH drops below $3k, or any custom threshold."
            />
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => <AlertRow key={a.id} alert={a} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </div>
  );
}

function CreateAlertDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [coin, setCoin] = useState("BTC");
  const [cond, setCond] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [alertSuccess, setAlertSuccess] = useState<GenericSuccess | null>(null);

  const createMut = useMutation({
    mutationFn: () => post("/alerts", {
      coinSymbol: coin.toUpperCase(),
      condition: cond,
      targetPrice: Number(target),
      note: note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/alerts/me"] });
      setOpen(false); setCoin("BTC"); setCond("above"); setTarget(""); setNote("");
      setAlertSuccess({ kind: "generic", iconKind: "paid", accentColor: "amber", title: "Alert Created!", subtitle: `You'll be notified when ${coin.toUpperCase()} ${cond === "above" ? "rises above" : "falls below"} $${Number(target).toLocaleString()}`, rows: [{ label: "Coin", value: coin.toUpperCase() }, { label: "Condition", value: cond === "above" ? "Above" : "Below" }, { label: "Target", value: `$${Number(target).toLocaleString()}` }], primaryLabel: "Done" });
    },
    onError: (err: any) => toast.error(err?.message || "Could not create alert"),
  });

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New price alert</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create price alert</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Coin</Label>
              <Input value={coin} onChange={(e) => setCoin(e.target.value)} placeholder="BTC" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Condition</Label>
              <Select value={cond} onValueChange={(v) => setCond(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Above</SelectItem>
                  <SelectItem value="below">Below</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target price (USD)</Label>
            <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100000" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Take profit at this level" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMut.mutate()} disabled={!target || createMut.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SuccessModal open={alertSuccess !== null} payload={alertSuccess} onClose={() => setAlertSuccess(null)} />
    </>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const qc = useQueryClient();
  const toggleMut = useMutation({
    mutationFn: () => patch(`/alerts/${alert.id}`, {
      status: alert.status === "active" ? "paused" : "active",
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/alerts/me"] }),
  });
  const delMut = useMutation({
    mutationFn: () => del(`/alerts/${alert.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/alerts/me"] });
      toast.success("Alert deleted");
    },
  });

  const variant = alert.status === "triggered" ? "success" : alert.status === "paused" ? "neutral" : "warning";
  const Icon = alert.condition === "above" ? TrendingUp : TrendingDown;
  const target = Number(alert.targetPrice);

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 sm:p-4 flex items-center gap-3 hover:border-primary/40 transition-colors">
      <div className={`h-9 w-9 rounded-lg ${alert.condition === "above" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"} border flex items-center justify-center flex-shrink-0`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm">{alert.coinSymbol}</span>
          <span className="text-xs text-muted-foreground">{alert.condition} ${target.toLocaleString()}</span>
          <StatusPill variant={variant as any}>{alert.status}</StatusPill>
        </div>
        {alert.note && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{alert.note}</p>}
        {alert.triggeredAt && (
          <p className="text-[11px] text-emerald-400 mt-0.5">
            Triggered at ${Number(alert.triggeredPrice).toLocaleString()} · {relTime(alert.triggeredAt)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {alert.status !== "triggered" && (
          <Button variant="ghost" size="sm" onClick={() => toggleMut.mutate()} className="h-8">
            {alert.status === "active" ? "Pause" : "Resume"}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => delMut.mutate()}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
