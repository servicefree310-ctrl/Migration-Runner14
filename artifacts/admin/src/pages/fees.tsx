import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Percent, Save, RotateCcw, Plus, Trash2, ShieldAlert, Loader2, Crown, ArrowLeftRight,
} from "lucide-react";

type VipTier = {
  level: number;
  name: string;
  minVolume: number;
  spotMaker: number;
  spotTaker: number;
  futuresMaker: number;
  futuresTaker: number;
  convertFee: number;
  withdrawDiscount: number;
};

const DEFAULTS: VipTier[] = [
  { level: 0, name: "Regular", minVolume: 0,        spotMaker: 0.20, spotTaker: 0.25, futuresMaker: 0.05, futuresTaker: 0.07, convertFee: 0.300, withdrawDiscount: 0  },
  { level: 1, name: "VIP 1",   minVolume: 100000,   spotMaker: 0.16, spotTaker: 0.20, futuresMaker: 0.04, futuresTaker: 0.06, convertFee: 0.250, withdrawDiscount: 5  },
  { level: 2, name: "VIP 2",   minVolume: 500000,   spotMaker: 0.12, spotTaker: 0.15, futuresMaker: 0.03, futuresTaker: 0.05, convertFee: 0.200, withdrawDiscount: 10 },
  { level: 3, name: "VIP 3",   minVolume: 2500000,  spotMaker: 0.08, spotTaker: 0.10, futuresMaker: 0.02, futuresTaker: 0.04, convertFee: 0.150, withdrawDiscount: 15 },
  { level: 4, name: "VIP 4",   minVolume: 10000000, spotMaker: 0.06, spotTaker: 0.08, futuresMaker: 0.015,futuresTaker: 0.03, convertFee: 0.100, withdrawDiscount: 20 },
  { level: 5, name: "VIP 5",   minVolume: 50000000, spotMaker: 0.04, spotTaker: 0.06, futuresMaker: 0.01, futuresTaker: 0.025,convertFee: 0.075, withdrawDiscount: 25 },
];

const NUM_FIELDS: Array<keyof VipTier> = [
  "minVolume", "spotMaker", "spotTaker", "futuresMaker", "futuresTaker", "convertFee", "withdrawDiscount",
];

// Admin Fees & VIP Tiers — editable matrix saved via PUT /admin/fees/tiers.
export default function FeesAdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = user?.role === "admin" || user?.role === "superadmin";

  const tiersQ = useQuery<VipTier[]>({
    queryKey: ["/admin/fees/tiers"],
    queryFn: () => get<VipTier[]>("/admin/fees/tiers"),
  });

  const [draft, setDraft] = useState<VipTier[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);

  // Initial load: sync draft from server.
  useEffect(() => {
    if (tiersQ.data && draft.length === 0) {
      setDraft(tiersQ.data.map((t) => ({ ...t })));
    }
  }, [tiersQ.data, draft.length]);

  const dirty = useMemo(() => {
    if (!tiersQ.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(tiersQ.data);
  }, [draft, tiersQ.data]);

  const save = useMutation({
    mutationFn: (tiers: VipTier[]) => put<{ ok: true; tiers: VipTier[] }>("/admin/fees/tiers", { tiers }),
    onSuccess: (r) => {
      toast({ title: "Tiers saved", description: `${r.tiers.length} levels active` });
      qc.invalidateQueries({ queryKey: ["/admin/fees/tiers"] });
      qc.invalidateQueries({ queryKey: ["/fees/tiers"] });
      qc.invalidateQueries({ queryKey: ["/fees/my"] });
      setDraft(r.tiers.map((t) => ({ ...t })));
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.data?.error || e?.message, variant: "destructive" }),
  });

  function update(idx: number, patch: Partial<VipTier>) {
    setDraft((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }
  function addTier() {
    setDraft((prev) => {
      const last = prev[prev.length - 1];
      const next: VipTier = last
        ? { ...last, level: last.level + 1, name: `VIP ${last.level + 1}`, minVolume: last.minVolume * 5 || 1_000_000 }
        : DEFAULTS[0];
      return [...prev, next];
    });
  }
  function removeTier(idx: number) {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  }
  function resetToDefaults() {
    setDraft(DEFAULTS.map((t) => ({ ...t })));
    setConfirmReset(false);
  }

  if (!canEdit) {
    return (
      <div className="p-6">
        <SectionCard title="Access restricted">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldAlert className="w-4 h-4" /> Only admin and superadmin roles can edit this page.
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        eyebrow="Markets"
        title="Fees & VIP Tiers"
        description="VIP ladder: maker/taker fees for Spot & Futures, plus the Convert fee. All edits are audit-logged."
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status="active" variant="gold">
              <Crown className="w-3 h-3 mr-1" /> {draft.length} Tiers
            </StatusPill>
            <Button
              variant="outline" size="sm"
              onClick={() => setConfirmReset(true)}
              disabled={save.isPending}
              data-testid="fees-reset-defaults"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Reset Defaults
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate(draft)}
              disabled={!dirty || save.isPending}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              data-testid="fees-save"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {dirty ? "Save Changes" : "Saved"}
            </Button>
          </div>
        }
      />

      <SectionCard title="VIP Tier Matrix" icon={Percent} padded={false}>
        {tiersQ.isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border/60">
                <tr className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                  <th className="px-3 py-3 font-medium">Level</th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium text-right">30d Vol (USDT)</th>
                  <th className="px-3 py-3 font-medium text-right">Spot Maker %</th>
                  <th className="px-3 py-3 font-medium text-right">Spot Taker %</th>
                  <th className="px-3 py-3 font-medium text-right">Fut Maker %</th>
                  <th className="px-3 py-3 font-medium text-right">Fut Taker %</th>
                  <th className="px-3 py-3 font-medium text-right text-amber-400">
                    <span className="inline-flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" /> Convert %</span>
                  </th>
                  <th className="px-3 py-3 font-medium text-right">W/d Disc %</th>
                  <th className="px-3 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {draft.map((t, i) => (
                  <tr key={`${t.level}-${i}`} className="border-b border-border/40 hover:bg-muted/10" data-testid={`fees-row-${t.level}`}>
                    <td className="px-3 py-2">
                      <Input
                        type="number" min={0} max={50}
                        value={t.level}
                        onChange={(e) => update(i, { level: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                        className="w-16 h-8 text-center font-mono"
                        data-testid={`fees-input-level-${i}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={t.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className="w-28 h-8"
                        data-testid={`fees-input-name-${i}`}
                      />
                    </td>
                    {NUM_FIELDS.map((f) => (
                      <td key={f} className="px-3 py-2 text-right">
                        <Input
                          type="number" step="any" min={0}
                          value={t[f] as number}
                          onChange={(e) => update(i, { [f]: Number(e.target.value) || 0 } as Partial<VipTier>)}
                          className="w-24 h-8 text-right font-mono tabular-nums ml-auto"
                          data-testid={`fees-input-${f}-${i}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Button
                        size="icon" variant="ghost"
                        className="h-8 w-8 text-rose-400 hover:bg-rose-500/10"
                        onClick={() => removeTier(i)}
                        disabled={draft.length <= 1}
                        data-testid={`fees-remove-${i}`}
                        aria-label={`Remove tier ${t.level}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-border/60 bg-muted/10 px-4 py-3 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={addTier} data-testid="fees-add-tier">
            <Plus className="w-4 h-4 mr-1.5" /> Add Tier
          </Button>
          <div className="text-xs text-muted-foreground">
            Validation: levels must be unique and minVolume must be non-decreasing across tiers.
          </div>
        </div>
      </SectionCard>

      <SectionCard title="How these fees apply" icon={Percent}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-semibold text-amber-400 mb-1">Spot</div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              <span className="text-foreground">Maker</span> = order rests in the book.{" "}
              <span className="text-foreground">Taker</span> = market order or any order that crosses. GST is added on top per Site Settings.
            </p>
          </div>
          <div>
            <div className="font-semibold text-amber-400 mb-1">Futures</div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Lower than Spot since futures pay funding. Same maker/taker rule. Liquidation fees are configured separately on the pair.
            </p>
          </div>
          <div>
            <div className="font-semibold text-amber-400 mb-1">Convert</div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Flat fee on the OUT amount. The platform also keeps a small spread on top. No GST overlay (already included in the displayed rate).
            </p>
          </div>
        </div>
      </SectionCard>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to platform defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current draft with the default 6-tier fee ladder. Changes go live only after you click Save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetToDefaults} data-testid="fees-reset-confirm">Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
