import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, X, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { get, post, del, patch } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

interface PriceAlert {
  id: number;
  coinSymbol: string;
  condition: string;
  targetPrice: string;
  status: string;
  triggeredAt: string | null;
  note: string | null;
  createdAt: string;
}

export default function PriceAlerts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "BTC", condition: "above", targetPrice: "", note: "" });
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const alertsQ = useQuery<PriceAlert[]>({
    queryKey: ["/price-alerts"],
    queryFn: () => get<PriceAlert[]>("/price-alerts"),
    enabled: !!user,
  });

  const createMut = useMutation({
    mutationFn: (data: object) => post("/price-alerts", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/price-alerts"] });
      setGenericSuccess({
        kind: "generic", iconKind: "paid", accentColor: "amber",
        title: "Alert Created!",
        subtitle: `You'll be notified when ${form.symbol.toUpperCase()} ${form.condition === "above" ? "rises above" : "falls below"} $${Number(form.targetPrice).toLocaleString()}`,
        rows: [
          { label: "Coin", value: form.symbol.toUpperCase() },
          { label: "Condition", value: form.condition === "above" ? "Above" : "Below" },
          { label: "Target", value: `$${Number(form.targetPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}` },
        ],
        primaryLabel: "Done",
      });
      setShowForm(false);
      setForm({ symbol: "BTC", condition: "above", targetPrice: "", note: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create alert"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => del(`/price-alerts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/price-alerts"] });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "rose", title: "Alert Removed", subtitle: "Your price alert has been deleted.", rows: [], primaryLabel: "Done" });
    },
    onError: () => toast.error("Failed to delete alert"),
  });

  const disableMut = useMutation({
    mutationFn: (id: number) => patch(`/price-alerts/${id}/disable`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/price-alerts"] });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "amber", title: "Alert Paused", subtitle: "This alert won't fire while paused. You can re-enable it anytime.", rows: [], primaryLabel: "Got it" });
    },
  });

  const alerts = alertsQ.data ?? [];
  const active    = alerts.filter(a => a.status === "active");
  const triggered = alerts.filter(a => a.status === "triggered");
  const disabled  = alerts.filter(a => a.status === "disabled");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      symbol: form.symbol.toUpperCase(),
      condition: form.condition,
      targetPrice: parseFloat(form.targetPrice),
      note: form.note || undefined,
    });
  };

  if (!user) {
    return (
      <div className="container mx-auto max-w-3xl p-4 sm:p-6">
        <EmptyState icon={Bell} title="Sign in required" description="Please log in to manage price alerts." />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Notifications"
        title="Price Alerts"
        description="Get notified instantly when prices hit your target levels."
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Alert
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <PremiumStatCard
          hero
          title="Active Alerts"
          value={active.length}
          icon={Bell}
          loading={alertsQ.isLoading}
          hint="Monitoring now"
        />
        <PremiumStatCard
          title="Triggered"
          value={triggered.length}
          icon={TrendingUp}
          loading={alertsQ.isLoading}
          hint="Hit your target"
        />
        <PremiumStatCard
          title="Total Created"
          value={alerts.length}
          icon={AlertCircle}
          loading={alertsQ.isLoading}
          hint="All time"
        />
      </div>

      {alertsQ.isLoading ? (
        <SectionCard title="Alerts" icon={Bell}>
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
          </div>
        </SectionCard>
      ) : alerts.length === 0 ? (
        <SectionCard title="Your Alerts" icon={Bell}>
          <EmptyState
            icon={Bell}
            title="No price alerts yet"
            description="Create your first alert to get notified when prices move."
            action={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Create Alert</Button>}
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <SectionCard title={`Active (${active.length})`} icon={Bell} padded={false}>
              <div className="divide-y divide-border/40">
                {active.map(a => <AlertRow key={a.id} alert={a} onDelete={() => setConfirmDeleteId(a.id)} onDisable={() => disableMut.mutate(a.id)} />)}
              </div>
            </SectionCard>
          )}
          {triggered.length > 0 && (
            <SectionCard title={`Triggered (${triggered.length})`} icon={TrendingUp} padded={false}>
              <div className="divide-y divide-border/40">
                {triggered.map(a => <AlertRow key={a.id} alert={a} onDelete={() => setConfirmDeleteId(a.id)} />)}
              </div>
            </SectionCard>
          )}
          {disabled.length > 0 && (
            <SectionCard title={`Disabled (${disabled.length})`} icon={X} padded={false}>
              <div className="divide-y divide-border/40">
                {disabled.map(a => <AlertRow key={a.id} alert={a} onDelete={() => setConfirmDeleteId(a.id)} />)}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Price Alert</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Coin Symbol</Label>
                <Input
                  value={form.symbol}
                  onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))}
                  placeholder="BTC"
                  className="font-mono uppercase"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Price rises above</SelectItem>
                    <SelectItem value="below">Price falls below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Target Price (USDT)</Label>
              <Input
                type="number"
                step="any"
                value={form.targetPrice}
                onChange={e => setForm(f => ({ ...f, targetPrice: e.target.value }))}
                placeholder="e.g. 100000"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Buy target"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create Alert"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-400" /> Delete Price Alert?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This price alert will be permanently removed and you won't receive any further notifications for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600 text-white"
              onClick={() => { if (confirmDeleteId !== null) deleteMut.mutate(confirmDeleteId); setConfirmDeleteId(null); }}
            >
              Delete Alert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AlertRow({ alert, onDelete, onDisable }: {
  alert: PriceAlert;
  onDelete: () => void;
  onDisable?: () => void;
}) {
  const isUp = alert.condition === "above";
  const statusVariant = alert.status === "triggered" ? "success" : alert.status === "disabled" ? "neutral" : "warning";

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${alert.status === "disabled" ? "opacity-50" : ""}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        alert.status === "triggered" ? "bg-emerald-500/20" :
        alert.status === "disabled"  ? "bg-muted/60" :
        "bg-amber-500/20"
      }`}>
        {isUp
          ? <TrendingUp className={`h-4 w-4 ${alert.status === "triggered" ? "text-emerald-400" : alert.status === "disabled" ? "text-muted-foreground" : "text-amber-400"}`} />
          : <TrendingDown className={`h-4 w-4 ${alert.status === "triggered" ? "text-emerald-400" : alert.status === "disabled" ? "text-muted-foreground" : "text-rose-400"}`} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{alert.coinSymbol}USDT</div>
        <div className="text-xs text-muted-foreground">
          {isUp ? "Rises above" : "Falls below"}{" "}
          <span className="text-amber-400 font-mono">${parseFloat(alert.targetPrice).toLocaleString()}</span>
        </div>
        {alert.note && <div className="text-xs text-muted-foreground mt-0.5">{alert.note}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill variant={statusVariant} status={alert.status} />
        {alert.status === "active" && onDisable && (
          <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-muted-foreground" onClick={onDisable}>
            Disable
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-rose-400" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
