import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, put, del } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Video, Eye, CheckCircle2, XCircle, Clock, RefreshCw, Trophy,
  Crown, Award, TrendingUp, Users, Coins, Settings, ExternalLink,
  ChevronLeft, ChevronRight, Search, Youtube, Instagram, Twitter,
  Facebook, Globe, AlertCircle, Loader2, Save, Trash2, BarChart3,
  Zap, Flame, BadgeCheck, Info, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────
type Submission = {
  id: number; userId: number; platform: string;
  videoUrl: string; title: string; description: string;
  screenshotUrl?: string; views: number;
  status: "pending" | "reviewing" | "approved" | "rejected";
  reviewNote?: string; baseReward: string; bonusPaid: string;
  rewardPaid: boolean; reviewedAt?: string; createdAt: string;
  username?: string; email?: string;
};

type Stats = {
  total: number; approved: number; pending: number;
  reviewing: number; rejected: number;
  totalRewards: number; totalViews: number;
};

type ProgramSettings = {
  id: number; programEnabled: boolean;
  baseRewardUsdt: string; referralRewardUsdt: string;
  bonus1kUsdt: string; bonus100kUsdt: string; bonus1mUsdt: string;
  minVideoDurationSec: number; maxSubmissionsPerUser: number;
  autoApprove: boolean;
};

type LeaderEntry = {
  rank: number; userId: number; username: string; email: string;
  videos: number; totalViews: number; totalRewards: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const PLATFORM_MAP: Record<string, { label: string; Icon: React.FC<{ className?: string }>; color: string }> = {
  youtube:   { label: "YouTube Shorts",  Icon: Youtube,   color: "text-red-500" },
  instagram: { label: "Instagram Reels", Icon: Instagram, color: "text-pink-500" },
  facebook:  { label: "Facebook Reels",  Icon: Facebook,  color: "text-blue-500" },
  x:         { label: "X (Twitter)",     Icon: Twitter,   color: "text-sky-400" },
};

const STATUS_CFG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  pending:   { label: "Pending",   variant: "secondary",   color: "text-amber-500" },
  reviewing: { label: "Reviewing", variant: "outline",     color: "text-blue-500" },
  approved:  { label: "Approved",  variant: "default",     color: "text-emerald-500" },
  rejected:  { label: "Rejected",  variant: "destructive", color: "text-red-500" },
};

function fmtViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}
function fmtDate(s?: string) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PlatformIcon({ platform, size = 4 }: { platform: string; size?: number }) {
  const p = PLATFORM_MAP[platform?.toLowerCase()];
  if (!p) return <Globe className={`h-${size} w-${size} text-muted-foreground`} />;
  return <p.Icon className={`h-${size} w-${size} ${p.color}`} />;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.FC<{ className?: string }>; label: string; value: string | number;
  sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color ?? "bg-primary/10"}`}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-2xl font-black tabular-nums">{value}</div>
          <div className="text-xs font-semibold text-muted-foreground">{label}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Review dialog ─────────────────────────────────────────────────────────────
function ReviewDialog({
  sub, open, onClose, onSave,
}: {
  sub: Submission | null; open: boolean;
  onClose: () => void; onSave: (id: number, status: string, note: string, views?: number) => void;
}) {
  const [status, setStatus]   = useState<string>(sub?.status ?? "pending");
  const [note, setNote]       = useState(sub?.reviewNote ?? "");
  const [views, setViews]     = useState<string>(String(sub?.views ?? 0));
  const [saving, setSaving]   = useState(false);

  if (!sub) return null;

  const p = PLATFORM_MAP[sub.platform?.toLowerCase()];

  async function handleSave() {
    setSaving(true);
    await onSave(sub!.id, status, note, Number(views) || undefined);
    setSaving(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> Review Submission #{sub.id}
          </DialogTitle>
          <DialogDescription>
            Submitted by{" "}
            <strong>{sub.username ?? `User #${sub.userId}`}</strong>{" "}
            ({sub.email}) on {fmtDate(sub.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Video info */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {p && <p.Icon className={`h-4 w-4 ${p.color}`} />}
              {p?.label ?? sub.platform}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Title</div>
              <div className="font-semibold text-sm">{sub.title}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Description</div>
              <div className="text-sm text-muted-foreground leading-relaxed">{sub.description}</div>
            </div>
            <a
              href={sub.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open video
            </a>
            {sub.screenshotUrl && (
              <img src={sub.screenshotUrl} alt="screenshot" className="rounded-lg w-full max-h-48 object-cover" />
            )}
          </div>

          {/* Views update */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Current Views</Label>
              <Input
                type="number" min={0} value={views}
                onChange={(e) => setViews(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Total Reward So Far</Label>
              <div className="h-10 rounded-md border bg-muted/30 px-3 flex items-center font-mono text-sm text-emerald-600 font-bold">
                {(Number(sub.baseReward) + Number(sub.bonusPaid)).toFixed(2)} USDT
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Decision *</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="approved">✅ Approve (credits reward)</SelectItem>
                <SelectItem value="rejected">❌ Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Review Note <span className="font-normal">(shown to user if rejected)</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional review note…"
              rows={2}
              maxLength={500}
            />
          </div>

          {status === "approved" && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              Approving will credit reward to the user's USDT spot wallet.
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────
function SettingsPanel() {
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery<ProgramSettings>({
    queryKey: ["admin", "creator-rewards", "settings"],
    queryFn: () => get<ProgramSettings>("/admin/creator-rewards/settings"),
  });

  const [form, setForm] = useState<Partial<ProgramSettings>>({});
  const effective = { ...(s ?? {}), ...form };

  const mut = useMutation({
    mutationFn: () => put("/admin/creator-rewards/settings", {
      programEnabled:        effective.programEnabled,
      baseRewardUsdt:        Number(effective.baseRewardUsdt),
      referralRewardUsdt:    Number(effective.referralRewardUsdt),
      bonus1kUsdt:           Number(effective.bonus1kUsdt),
      bonus100kUsdt:         Number(effective.bonus100kUsdt),
      bonus1mUsdt:           Number(effective.bonus1mUsdt),
      minVideoDurationSec:   Number(effective.minVideoDurationSec),
      maxSubmissionsPerUser: Number(effective.maxSubmissionsPerUser),
      autoApprove:           effective.autoApprove,
    }),
    onSuccess: () => {
      toast.success("Settings saved.");
      qc.invalidateQueries({ queryKey: ["admin", "creator-rewards", "settings"] });
      setForm({});
    },
    onError: () => toast.error("Failed to save settings."),
  });

  if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!s) return null;

  function field(key: keyof ProgramSettings) {
    const val = (form as Record<string, unknown>)[key] ?? (s as Record<string, unknown>)[key];
    return {
      value: String(val ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }
  function boolField(key: keyof ProgramSettings) {
    const val = (form as Record<string, unknown>)[key] ?? (s as Record<string, unknown>)[key];
    return {
      checked: Boolean(val),
      onCheckedChange: (v: boolean) => setForm((prev) => ({ ...prev, [key]: v })),
    };
  }

  return (
    <div className="space-y-6">
      {/* Program toggle */}
      <Card>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm">Program Status</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              When disabled, users cannot submit new videos.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs font-semibold", effective.programEnabled ? "text-emerald-600" : "text-red-500")}>
              {effective.programEnabled ? "ACTIVE" : "DISABLED"}
            </span>
            <Switch {...boolField("programEnabled")} />
          </div>
        </CardContent>
      </Card>

      {/* Rewards */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-500" /> Reward Amounts (USDT)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Base creator reward</Label>
            <Input type="number" min={0} step={0.5} {...field("baseRewardUsdt")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Referral reward</Label>
            <Input type="number" min={0} step={0.5} {...field("referralRewardUsdt")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Bonus at 1K views
            </Label>
            <Input type="number" min={0} step={1} {...field("bonus1kUsdt")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Zap className="h-3 w-3" /> Bonus at 100K views
            </Label>
            <Input type="number" min={0} step={1} {...field("bonus100kUsdt")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
              <Flame className="h-3 w-3" /> Bonus at 1M views
            </Label>
            <Input type="number" min={0} step={1} {...field("bonus1mUsdt")} />
          </div>
        </CardContent>
      </Card>

      {/* Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" /> Submission Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Min video duration (seconds)
            </Label>
            <Input type="number" min={5} max={600} step={5} {...field("minVideoDurationSec")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Max submissions per user
            </Label>
            <Input type="number" min={1} max={1000} step={1} {...field("maxSubmissionsPerUser")} />
          </div>
        </CardContent>
      </Card>

      {/* Auto-approve */}
      <Card>
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold text-sm flex items-center gap-1.5">
              Auto-approve submissions
              <Tooltip>
                <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs">
                  When enabled, new submissions skip manual review and are auto-approved with base reward immediately. Use only for trusted creator tiers.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Skips manual review — use with caution.</div>
          </div>
          <Switch {...boolField("autoApprove")} />
        </CardContent>
      </Card>

      <Button
        onClick={() => mut.mutate()}
        disabled={mut.isPending || Object.keys(form).length === 0}
        className="gap-2 w-full sm:w-auto"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Settings
      </Button>
    </div>
  );
}

// ── Leaderboard panel ─────────────────────────────────────────────────────────
function LeaderboardPanel() {
  const { data, isLoading } = useQuery<LeaderEntry[]>({
    queryKey: ["admin", "creator-rewards", "leaderboard"],
    queryFn: () => get<LeaderEntry[]>("/admin/creator-rewards/leaderboard?limit=20"),
    staleTime: 60_000,
  });

  function Medal({ rank }: { rank: number }) {
    if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
    if (rank === 2) return <Trophy className="h-4 w-4 text-zinc-400" />;
    if (rank === 3) return <Award className="h-4 w-4 text-orange-400" />;
    return <span className="text-xs font-bold text-muted-foreground">#{rank}</span>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500" /> All-time Top Creators
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No approved submissions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-y border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-center px-4 py-2.5 w-12">Rank</th>
                  <th className="text-left px-4 py-2.5">Creator</th>
                  <th className="text-right px-4 py-2.5">Videos</th>
                  <th className="text-right px-4 py-2.5">Total Views</th>
                  <th className="text-right px-4 py-2.5">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.map((e) => (
                  <tr key={e.userId} className={cn("hover:bg-accent/30 transition-colors", e.rank === 1 && "bg-amber-500/5")}>
                    <td className="px-4 py-3 text-center"><div className="flex justify-center"><Medal rank={e.rank} /></div></td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm">{e.username}</div>
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.videos}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="flex items-center justify-end gap-1 text-xs">
                        <Eye className="h-3 w-3" />{fmtViews(e.totalViews)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {e.totalRewards.toFixed(2)} USDT
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CreatorRewardsAdmin() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
  const [reviewSub, setReviewSub]       = useState<Submission | null>(null);
  const [reviewOpen, setReviewOpen]     = useState(false);
  const [deleteId, setDeleteId]         = useState<number | null>(null);

  // Stats
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["admin", "creator-rewards", "stats"],
    queryFn: () => get<Stats>("/admin/creator-rewards/stats"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Submissions list
  const { data: listData, isLoading: listLoading, refetch } = useQuery<{
    data: Submission[]; total: number; pages: number;
  }>({
    queryKey: ["admin", "creator-rewards", "submissions", statusFilter, search, page],
    queryFn: () =>
      get(`/admin/creator-rewards/submissions?status=${statusFilter}&search=${encodeURIComponent(search)}&page=${page}&limit=20`),
    staleTime: 15_000,
  });

  // Status update mutation
  const updateStatus = useMutation({
    mutationFn: ({ id, status, reviewNote, views }: { id: number; status: string; reviewNote: string; views?: number }) =>
      patch(`/admin/creator-rewards/submissions/${id}/status`, { status, reviewNote, views }),
    onSuccess: () => {
      toast.success("Submission updated.");
      qc.invalidateQueries({ queryKey: ["admin", "creator-rewards"] });
    },
    onError: () => toast.error("Failed to update submission."),
  });

  // Delete mutation
  const deleteMut = useMutation({
    mutationFn: (id: number) => del(`/admin/creator-rewards/submissions/${id}`),
    onSuccess: () => {
      toast.success("Submission deleted.");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin", "creator-rewards"] });
    },
    onError: () => toast.error("Failed to delete."),
  });

  function openReview(s: Submission) { setReviewSub(s); setReviewOpen(true); }

  function quickAction(id: number, status: "approved" | "rejected") {
    updateStatus.mutate({ id, status, reviewNote: "" });
  }

  const submissions = listData?.data ?? [];
  const totalPages  = listData?.pages ?? 1;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2.5">
            <Video className="h-6 w-6 text-amber-500" /> Creator Rewards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review video submissions, manage rewards, configure the program.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 self-start md:self-auto">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {statsLoading ? (
          [...Array(7)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <StatCard icon={BarChart3}    label="Total"     value={stats?.total ?? 0}         color="bg-muted" />
            <StatCard icon={Clock}        label="Pending"   value={stats?.pending ?? 0}        color="bg-amber-500/10" />
            <StatCard icon={RefreshCw}    label="Reviewing" value={stats?.reviewing ?? 0}      color="bg-blue-500/10" />
            <StatCard icon={CheckCircle2} label="Approved"  value={stats?.approved ?? 0}       color="bg-emerald-500/10" />
            <StatCard icon={XCircle}      label="Rejected"  value={stats?.rejected ?? 0}       color="bg-red-500/10" />
            <StatCard icon={Coins}        label="Paid Out"  value={`$${(stats?.totalRewards ?? 0).toFixed(0)}`} color="bg-amber-500/10" />
            <StatCard icon={Eye}          label="Total Views" value={fmtViews(stats?.totalViews ?? 0)} color="bg-violet-500/10" />
          </>
        )}
      </div>

      <Tabs defaultValue="submissions">
        <TabsList className="mb-4">
          <TabsTrigger value="submissions" className="gap-1.5">
            <Video className="h-4 w-4" /> Submissions
            {(stats?.pending ?? 0) > 0 && (
              <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-amber-500 text-black">{stats!.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5"><Trophy className="h-4 w-4" /> Leaderboard</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-4 w-4" /> Settings</TabsTrigger>
        </TabsList>

        {/* ── Submissions tab ─────────────────────────────────────── */}
        <TabsContent value="submissions" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search title…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">#</th>
                    <th className="text-left px-4 py-3 font-semibold">Platform</th>
                    <th className="text-left px-4 py-3 font-semibold">Video / Creator</th>
                    <th className="text-right px-4 py-3 font-semibold">Views</th>
                    <th className="text-center px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Reward</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-center px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {listLoading ? (
                    [...Array(8)].map((_, i) => (
                      <tr key={i}><td colSpan={8} className="px-4 py-2"><Skeleton className="h-8 w-full" /></td></tr>
                    ))
                  ) : submissions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-muted-foreground">
                        <Video className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        No submissions match the current filter.
                      </td>
                    </tr>
                  ) : submissions.map((s) => {
                    const st = STATUS_CFG[s.status];
                    const totalReward = Number(s.baseReward) + Number(s.bonusPaid);
                    return (
                      <tr key={s.id} className={cn(
                        "hover:bg-accent/20 transition-colors",
                        s.status === "pending" && "bg-amber-500/3",
                      )}>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">#{s.id}</td>
                        <td className="px-4 py-3"><PlatformIcon platform={s.platform} /></td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="font-semibold text-sm truncate">{s.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.username ?? `User #${s.userId}`}
                          </div>
                          <a
                            href={s.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                          >
                            <ExternalLink className="h-2.5 w-2.5" /> View video
                          </a>
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-mono tabular-nums">
                          {fmtViews(s.views)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-xs">
                          {totalReward > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">+{totalReward.toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(s.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openReview(s)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Review</TooltipContent>
                            </Tooltip>
                            {s.status !== "approved" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                    onClick={() => quickAction(s.id, "approved")}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Quick approve</TooltipContent>
                              </Tooltip>
                            )}
                            {s.status !== "rejected" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                                    onClick={() => quickAction(s.id, "rejected")}>
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Quick reject</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setDeleteId(s.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} — {listData?.total ?? 0} total
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Leaderboard tab ─────────────────────────────────────── */}
        <TabsContent value="leaderboard">
          <LeaderboardPanel />
        </TabsContent>

        {/* ── Settings tab ────────────────────────────────────────── */}
        <TabsContent value="settings">
          <SettingsPanel />
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <ReviewDialog
        sub={reviewSub}
        open={reviewOpen}
        onClose={() => { setReviewOpen(false); setReviewSub(null); }}
        onSave={async (id, status, reviewNote, views) => {
          await updateStatus.mutateAsync({ id, status, reviewNote, views });
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete submission #{deleteId}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is permanent. Any reward already credited to the user is NOT reversed — handle wallet adjustments separately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
