import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Trophy, Star, Calendar, AlertTriangle, Eye, EyeOff,
  RefreshCw, Zap, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Competition = {
  id: number; title: string; subtitle: string; description: string;
  prizePool: string; prizeUnit: string; topPrize: string;
  rewardTiersJson: string; rulesJson: string;
  heroIcon: string; heroColor: string; joinUrl: string; scoringRule: string;
  startsAt: string | null; endsAt: string | null;
  status: string; isFeatured: boolean; isPublished: boolean; position: number;
};

const STANDARD_TIERS = [
  { rank: "1",    label: "Champion",    prize: "500 USDT",  extra: "+ Diamond Badge",   tone: "amber"   },
  { rank: "2",    label: "Runner-up",   prize: "200 USDT",  extra: "+ Gold Badge",      tone: "zinc"    },
  { rank: "3",    label: "Third Place", prize: "100 USDT",  extra: "+ Silver Badge",    tone: "orange"  },
  { rank: "4-10", label: "Top 10",      prize: "20 USDT",   extra: "+ Bronze Badge",    tone: "orange"  },
  { rank: "11-25",label: "Top 25",      prize: "4 USDT",    extra: "+ Participant NFT", tone: "emerald" },
];

const STANDARD_RULES = [
  "Valid for KYC Level 2 (Aadhaar + selfie) verified users only.",
  "Trading volume from Spot, Futures and Convert all count.",
  "Minimum 10 trades required to be eligible for prizes.",
  "Season runs from 1st to last day of the month (IST).",
  "Prize distributed within 7 days of season end to your USDT wallet.",
  "TDS @ 1% applicable per Section 194S of the Income Tax Act.",
  "Zebvix reserves the right to disqualify wash trading or bot activity.",
];

const blank = (): Partial<Competition> & { rewardTiers: any[]; rules: string[] } => ({
  title: "", subtitle: "", description: "",
  prizePool: "1000", prizeUnit: "USDT", topPrize: "500",
  rewardTiers: STANDARD_TIERS,
  rules: STANDARD_RULES,
  heroIcon: "trophy", heroColor: "#fcd535", joinUrl: "/leagues", scoringRule: "volume",
  status: "upcoming", isFeatured: true, isPublished: true, position: 0,
});

function safeArr(j: string): any[] { try { const v = JSON.parse(j); return Array.isArray(v) ? v : []; } catch { return []; } }
function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" }); } catch { return d; }
}
function toLocalInputValue(d: string | null): string {
  if (!d) return "";
  try { const dt = new Date(d); return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16); } catch { return ""; }
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function CompetitionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery<Competition[]>({
    queryKey: ["/admin/competitions"],
    queryFn: () => get<Competition[]>("/admin/competitions"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [tab, setTab] = useState("all");
  const [deleteFor, setDeleteFor] = useState<Competition | null>(null);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const nowDate = new Date();
  const [monthlyYear, setMonthlyYear] = useState(nowDate.getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState(nowDate.getMonth() + 1);
  const [monthlyScoringRule, setMonthlyScoringRule] = useState("volume");

  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/competitions"] });
  const save = useMutation({
    mutationFn: (c: any) => c.id ? patch(`/admin/competitions/${c.id}`, c) : post("/admin/competitions", c),
    onSuccess: (_d, v) => { inv(); setOpen(false); setEditing(null); toast({ title: v.id ? "Updated" : "Created", description: v.title }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(`/admin/competitions/${id}`, body),
    onSuccess: () => inv(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/competitions/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Deleted" }); },
  });
  const autoCreate = useMutation({
    mutationFn: () => post<Competition>("/admin/competitions/monthly", { year: monthlyYear, month: monthlyMonth, scoringRule: monthlyScoringRule }),
    onSuccess: (row: any) => {
      inv();
      setMonthlyOpen(false);
      toast({ title: "Monthly competition created!", description: row.title });
    },
    onError: (e: Error) => toast({ title: "Auto-create failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => ({
    total: data.length,
    active: data.filter(c => c.status === "active" && c.isPublished).length,
    upcoming: data.filter(c => c.status === "upcoming" && c.isPublished).length,
    finished: data.filter(c => c.status === "finished").length,
  }), [data]);

  const filtered = useMemo(() => tab === "all" ? data : data.filter(c => c.status === tab), [data, tab]);

  const startEdit = (c: Competition) => {
    setEditing({ ...c, rewardTiers: safeArr(c.rewardTiersJson), rules: safeArr(c.rulesJson) });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CMS"
        title="Competitions / Trading Leagues"
        description="Trading contests shown at /leagues — 25,000 USDT prize pool, monthly seasons, live leaderboard."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMonthlyOpen(true)}>
              <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              Monthly Auto-Create
            </Button>
            <Button onClick={() => { setEditing(blank()); setOpen(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />New competition
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="Total" value={stats.total} icon={Trophy} />
        <PremiumStatCard title="Active" value={stats.active} icon={Eye} accent />
        <PremiumStatCard title="Upcoming" value={stats.upcoming} icon={Calendar} />
        <PremiumStatCard title="Finished" value={stats.finished} icon={EyeOff} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All ({data.length})</TabsTrigger>
          <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({stats.upcoming})</TabsTrigger>
          <TabsTrigger value="finished">Finished ({stats.finished})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-3">
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div>
        : filtered.length === 0 ? <EmptyState icon={Trophy} title="No competitions" description="Create one to start a season." />
        : filtered.map(c => (
          <div key={c.id} className={cn("premium-card rounded-xl p-4", !c.isPublished && "opacity-60")}>
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${c.heroColor}22`, border: `1px solid ${c.heroColor}55` }}>
                <Trophy className="w-7 h-7" style={{ color: c.heroColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusPill variant={c.status === "active" ? "success" : c.status === "upcoming" ? "warning" : "neutral"} className="capitalize">{c.status}</StatusPill>
                  {c.isFeatured && <StatusPill variant="gold"><Star className="w-2.5 h-2.5 mr-1" />Featured</StatusPill>}
                  {!c.isPublished && <StatusPill variant="neutral">Hidden</StatusPill>}
                  <span className="text-[11px] text-muted-foreground ml-auto">{fmtDate(c.startsAt)} → {fmtDate(c.endsAt)}</span>
                </div>
                <div className="font-bold text-lg mt-1.5">{c.title}</div>
                {c.subtitle && <div className="text-sm text-muted-foreground">{c.subtitle}</div>}
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span><span className="text-muted-foreground">Prize Pool:</span> <span className="gold-text font-semibold">{c.prizePool} {c.prizeUnit}</span></span>
                  <span><span className="text-muted-foreground">Top Prize:</span> <span className="font-semibold">{c.topPrize} {c.prizeUnit}</span></span>
                  <span><span className="text-muted-foreground">Score:</span> <span className="capitalize">{c.scoringRule}</span></span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Switch checked={c.isPublished} onCheckedChange={(b) => toggle.mutate({ id: c.id, body: { isPublished: b } })} aria-label="Publish" />
                <div className="flex">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle.mutate({ id: c.id, body: { isFeatured: !c.isFeatured } })}>
                    <Star className={cn("w-3.5 h-3.5", c.isFeatured && "fill-amber-300 text-amber-300")} />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(c)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-300" onClick={() => setDeleteFor(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit competition" : "New competition"}</DialogTitle>
            <DialogDescription>Configures the hero card and reward table on /leagues.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Title *</Label>
                  <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Zebvix Trading Champions" />
                </div>
                <div className="col-span-2">
                  <Label>Subtitle</Label>
                  <Input value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} placeholder="Season 1 — May 2026" />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Textarea rows={3} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="30 din ka contest. Highest ROI…" />
                </div>
                <div>
                  <Label>Status</Label>
                  <select className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                    <option value="upcoming">Upcoming</option>
                    <option value="active">Active</option>
                    <option value="finished">Finished</option>
                  </select>
                </div>
                <div>
                  <Label>Scoring rule</Label>
                  <select className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm" value={editing.scoringRule} onChange={(e) => setEditing({ ...editing, scoringRule: e.target.value })}>
                    <option value="roi">ROI %</option>
                    <option value="volume">Trading Volume</option>
                    <option value="pnl">P&L (USDT)</option>
                  </select>
                </div>
                <div>
                  <Label>Prize pool</Label>
                  <Input value={editing.prizePool} onChange={(e) => setEditing({ ...editing, prizePool: e.target.value })} placeholder="25000" />
                </div>
                <div>
                  <Label>Prize unit</Label>
                  <Input value={editing.prizeUnit} onChange={(e) => setEditing({ ...editing, prizeUnit: e.target.value })} placeholder="USDT" />
                </div>
                <div>
                  <Label>Top prize</Label>
                  <Input value={editing.topPrize} onChange={(e) => setEditing({ ...editing, topPrize: e.target.value })} placeholder="5000" />
                </div>
                <div>
                  <Label>Hero color</Label>
                  <Input type="color" value={editing.heroColor} onChange={(e) => setEditing({ ...editing, heroColor: e.target.value })} className="h-10" />
                </div>
                <div>
                  <Label>Starts at</Label>
                  <Input type="datetime-local" value={toLocalInputValue(editing.startsAt)} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value || null })} />
                </div>
                <div>
                  <Label>Ends at</Label>
                  <Input type="datetime-local" value={toLocalInputValue(editing.endsAt)} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value || null })} />
                </div>
                <div className="col-span-2">
                  <Label>Join URL</Label>
                  <Input value={editing.joinUrl} onChange={(e) => setEditing({ ...editing, joinUrl: e.target.value })} placeholder="/leagues or https://…" />
                </div>
              </div>

              <div>
                <Label>Reward tiers</Label>
                <div className="space-y-2 mt-1">
                  {(editing.rewardTiers || []).map((t: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-2" placeholder="Rank" value={t.rank ?? ""} onChange={(e) => {
                        const arr = [...editing.rewardTiers]; arr[i] = { ...arr[i], rank: e.target.value }; setEditing({ ...editing, rewardTiers: arr });
                      }} />
                      <Input className="col-span-4" placeholder="Label (e.g. Champion)" value={t.label ?? ""} onChange={(e) => {
                        const arr = [...editing.rewardTiers]; arr[i] = { ...arr[i], label: e.target.value }; setEditing({ ...editing, rewardTiers: arr });
                      }} />
                      <Input className="col-span-5" placeholder="Prize (e.g. 5000 USDT)" value={t.prize ?? ""} onChange={(e) => {
                        const arr = [...editing.rewardTiers]; arr[i] = { ...arr[i], prize: e.target.value }; setEditing({ ...editing, rewardTiers: arr });
                      }} />
                      <Button size="icon" variant="ghost" className="col-span-1 h-8 w-8 text-rose-300" onClick={() => setEditing({ ...editing, rewardTiers: editing.rewardTiers.filter((_: any, j: number) => j !== i) })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, rewardTiers: [...(editing.rewardTiers || []), { rank: "", label: "", prize: "" }] })}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Add tier
                  </Button>
                </div>
              </div>

              <div>
                <Label>Rules (one per line)</Label>
                <Textarea rows={4} value={(editing.rules || []).join("\n")} onChange={(e) => setEditing({ ...editing, rules: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.isFeatured} onCheckedChange={(b) => setEditing({ ...editing, isFeatured: b })} /> Featured</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.isPublished !== false} onCheckedChange={(b) => setEditing({ ...editing, isPublished: b })} /> Published</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.title || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Monthly Auto-Create dialog ──────────────────────────────────── */}
      <Dialog open={monthlyOpen} onOpenChange={(o) => { setMonthlyOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" /> Monthly Auto-Create
            </DialogTitle>
            <DialogDescription>
              Generates a "Zebvix Trading Champions" competition for the selected month with the standard <strong>1,000 USDT</strong> prize pool and 5-tier reward structure.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Prize pool preview */}
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Standard Prize Structure</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {STANDARD_TIERS.map((t, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Rank {t.rank}</span>
                    <span className="font-mono font-semibold text-amber-400">{t.prize}</span>
                  </div>
                ))}
                <div className="col-span-2 border-t border-border/50 pt-1 flex justify-between">
                  <span className="font-semibold">Total Pool</span>
                  <span className="font-mono font-bold text-amber-400">1,000 USDT</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Month</Label>
                <select
                  value={monthlyMonth}
                  onChange={e => setMonthlyMonth(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Year</Label>
                <select
                  value={monthlyYear}
                  onChange={e => setMonthlyYear(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {[2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Scoring Rule</Label>
              <select
                value={monthlyScoringRule}
                onChange={e => setMonthlyScoringRule(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="volume">Trading Volume (USDT)</option>
                <option value="roi">Return on Investment (ROI %)</option>
                <option value="pnl">Net Realized P&L (USDT)</option>
              </select>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 text-xs text-muted-foreground">
              Will create: <strong className="text-foreground">Zebvix Trading Champions — {MONTHS[monthlyMonth - 1]} {monthlyYear}</strong>
              <br />Runs: 1 {MONTHS[monthlyMonth - 1]?.slice(0,3)} → {new Date(monthlyYear, monthlyMonth, 0).getDate()} {MONTHS[monthlyMonth - 1]?.slice(0,3)} {monthlyYear}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMonthlyOpen(false)}>Cancel</Button>
            <Button
              onClick={() => autoCreate.mutate()}
              disabled={autoCreate.isPending}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
            >
              {autoCreate.isPending
                ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Creating…</>
                : <><Zap className="w-3.5 h-3.5 mr-1.5" /> Create Season</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-300" />Delete competition?</DialogTitle>
            <DialogDescription>"{deleteFor?.title}" will be removed permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteFor && remove.mutate(deleteFor.id)} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
