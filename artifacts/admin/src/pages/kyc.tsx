import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { PaginationBar, type PageSizeOption } from "@/components/premium/PaginationBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShieldCheck, Search, FileText, Clock, CheckCircle2, XCircle, Eye,
  User as UserIcon, Mail, Phone, Calendar, IdCard, MapPin, Image as ImageIcon,
  Activity, History, ExternalLink, X, Wallet, TrendingUp, TrendingDown,
  ArrowDownToLine, ArrowUpFromLine, KeyRound, Globe, AlertTriangle,
  Sparkles, Loader2, RefreshCw, Check, RotateCcw, ShieldAlert,
} from "lucide-react";

type KycRecord = {
  id: number; userId: number; level: number; status: string;
  fullName: string | null; dob: string | null; address: string | null;
  panNumber: string | null; aadhaarNumber: string | null;
  panDocUrl: string | null; aadhaarDocUrl: string | null; aadhaarDocBackUrl: string | null; selfieUrl: string | null;
  extra: string | null;
  rejectReason: string | null; reviewedBy: number | null; reviewedAt: string | null;
  createdAt: string; updatedAt: string;
};
type Stats = { pending: number; approved: number; rejected: number; rekyc: number; total: number };
type DossierUser = {
  id: number; uid: string; email: string; name: string; phone: string | null;
  role: string; status: string; kycLevel: number; vipTier: number;
  referralCode: string; referredBy: number | null; createdAt: string;
  twoFaEnabled: boolean;
};
type Dossier = {
  user: DossierUser;
  security: { twoFaEnabled: boolean; activeSessions: number; lastSessionAt: string | null };
  kyc: KycRecord[];
  wallets: Array<{ id: number; walletType: string; coinId: number; balance: string; locked: string }>;
  sessions: Array<{ id: number; ip: string | null; userAgent: string | null; createdAt: string }>;
  inrDeposits: Array<{ id: number; amount: string; status: string; createdAt: string }>;
  cryptoDeposits: Array<{ id: number; amount: string; status: string; createdAt: string }>;
  inrWithdrawals: Array<{ id: number; amount: string; status: string; createdAt: string }>;
  cryptoWithdrawals: Array<{ id: number; amount: string; status: string; createdAt: string }>;
  futuresPositions: Array<{ id: number; symbol: string | null; side: string; leverage: number; qty: string; entryPrice: string; unrealizedPnl: string }>;
};

const STATUS_TABS = [
  { value: "pending", label: "Pending", icon: Clock },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
  { value: "rekyc_required", label: "Re-KYC", icon: RotateCcw },
  { value: "all", label: "All", icon: FileText },
] as const;

function statusLabel(s: string): string {
  if (s === "rekyc_required") return "Re-KYC";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function statusVariant(s: string): "success" | "warning" | "danger" | "info" {
  if (s === "approved") return "success";
  if (s === "rejected") return "danger";
  if (s === "rekyc_required") return "info";
  return "warning";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function relTime(d: string | null) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd}d ago`;
  return fmtShort(d);
}
function initials(name: string | null, email: string) {
  const src = (name && name.trim()) || email;
  return src.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}
function maskAadhaar(v: string | null) {
  if (!v) return "—";
  return "XXXX XXXX " + v.slice(-4);
}
function parseExtra(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v as Record<string, unknown> : {}; } catch { return {}; }
}

export default function KycPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const [tab, setTab] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [openUserId, setOpenUserId] = useState<number | null>(null);
  const [highlightRecordId, setHighlightRecordId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);

  const { data: records = [], isLoading } = useQuery<KycRecord[]>({
    queryKey: ["/admin/kyc", tab],
    queryFn: () => get<KycRecord[]>(tab === "all" ? "/admin/kyc" : `/admin/kyc?status=${tab}`),
  });

  const { data: pendingAll = [] } = useQuery<KycRecord[]>({
    queryKey: ["/admin/kyc", "pending"],
    queryFn: () => get<KycRecord[]>("/admin/kyc?status=pending"),
    enabled: tab !== "pending",
  });
  const { data: approvedAll = [] } = useQuery<KycRecord[]>({
    queryKey: ["/admin/kyc", "approved"],
    queryFn: () => get<KycRecord[]>("/admin/kyc?status=approved"),
    enabled: tab !== "approved",
  });
  const { data: rejectedAll = [] } = useQuery<KycRecord[]>({
    queryKey: ["/admin/kyc", "rejected"],
    queryFn: () => get<KycRecord[]>("/admin/kyc?status=rejected"),
    enabled: tab !== "rejected",
  });
  const { data: rekycAll = [] } = useQuery<KycRecord[]>({
    queryKey: ["/admin/kyc", "rekyc_required"],
    queryFn: () => get<KycRecord[]>("/admin/kyc?status=rekyc_required"),
    enabled: tab !== "rekyc_required",
  });

  const stats: Stats = useMemo(() => {
    const p = tab === "pending" ? records : pendingAll;
    const a = tab === "approved" ? records : approvedAll;
    const r = tab === "rejected" ? records : rejectedAll;
    const rk = tab === "rekyc_required" ? records : rekycAll;
    return {
      pending: p.length,
      approved: a.length,
      rejected: r.length,
      rekyc: rk.length,
      total: p.length + a.length + r.length + rk.length,
    };
  }, [records, pendingAll, approvedAll, rejectedAll, rekycAll, tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      String(r.userId).includes(q) ||
      r.fullName?.toLowerCase().includes(q) ||
      r.panNumber?.toLowerCase().includes(q) ||
      r.aadhaarNumber?.includes(q),
    );
  }, [records, search]);

  useEffect(() => { setPage(1); }, [tab, search, pageSize]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const openRecord = (r: KycRecord) => {
    setHighlightRecordId(r.id);
    setOpenUserId(r.userId);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Users & Compliance"
        title="KYC Reviews"
        description="Review every detail and document a user has submitted across all verification levels — open the side panel for the full applicant dossier with joining info and on-platform activity."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <PremiumStatCard title="Pending Reviews" value={stats.pending} icon={Clock} accent />
        <PremiumStatCard title="Approved" value={stats.approved} icon={CheckCircle2} />
        <PremiumStatCard title="Rejected" value={stats.rejected} icon={XCircle} />
        <PremiumStatCard title="Re-KYC Required" value={stats.rekyc} icon={RotateCcw} />
        <PremiumStatCard title="Total Submissions" value={stats.total} icon={FileText} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-[hsl(222_22%_6%)] border border-border/60">
            {STATUS_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5 text-xs">
                <Icon className="w-3.5 h-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user ID, name, PAN, Aadhaar…"
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <Tabs value={tab}>
        {STATUS_TABS.map(({ value }) => (
          <TabsContent key={value} value={value} className="mt-0 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title={search ? "No matching submissions" : `No ${value === "all" ? "" : value} submissions`}
                description={search ? "Try a different name, PAN or user ID." : "Submissions will appear here as users complete their KYC."}
              />
            ) : (
              <>
                {paged.map((r) => (
                  <ReviewRow key={r.id} record={r} onOpen={() => openRecord(r)} />
                ))}
                <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} label="submissions" />
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <UserDossierSheet
        userId={openUserId}
        highlightRecordId={highlightRecordId}
        canModerate={isAdmin}
        onClose={() => { setOpenUserId(null); setHighlightRecordId(null); }}
      />
    </div>
  );
}

function ReviewRow({ record, onOpen }: { record: KycRecord; onOpen: () => void }) {
  const extra = useMemo(() => parseExtra(record.extra), [record.extra]);
  const extraCount = Object.keys(extra).length;
  const docCount = (record.panDocUrl ? 1 : 0) + (record.aadhaarDocUrl ? 1 : 0) + (record.selfieUrl ? 1 : 0);
  return (
    <div
      className="premium-card p-4 flex items-center gap-4 hover-elevate cursor-pointer transition-all"
      onClick={onOpen}
      data-testid={`row-kyc-${record.id}`}
    >
      <Avatar className="h-11 w-11 shrink-0 ring-1 ring-amber-400/20">
        <AvatarFallback className="bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-200 text-xs font-bold">
          {initials(record.fullName, `U${record.userId}`)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
        <div className="min-w-0 sm:col-span-2">
          <div className="font-medium text-foreground truncate">{record.fullName || "(No name on record)"}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <UserIcon className="w-3 h-3" />
            <span className="font-mono">#{record.userId}</span>
            <span>·</span>
            <span>{relTime(record.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="border-amber-400/30 text-amber-200 bg-amber-400/5 font-semibold">
            Level {record.level}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 text-[10px]">
          {record.panNumber && (
            <Badge variant="secondary" className="font-mono font-normal">
              PAN
            </Badge>
          )}
          {record.aadhaarNumber && (
            <Badge variant="secondary" className="font-mono font-normal">
              Aadhaar
            </Badge>
          )}
          {docCount > 0 && (
            <Badge variant="secondary" className="font-normal gap-1">
              <ImageIcon className="w-2.5 h-2.5" />
              {docCount} doc{docCount > 1 ? "s" : ""}
            </Badge>
          )}
          {extraCount > 0 && (
            <Badge variant="secondary" className="font-normal">
              +{extraCount} field{extraCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <StatusPill status={record.status} variant={statusVariant(record.status)}>{statusLabel(record.status)}</StatusPill>
          <Button size="sm" variant="ghost" className="h-8" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
            <Eye className="w-3.5 h-3.5 mr-1" /> Open
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserDossierSheet({
  userId, highlightRecordId, canModerate, onClose,
}: {
  userId: number | null;
  highlightRecordId: number | null;
  canModerate: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const dossier = useQuery<Dossier>({
    queryKey: ["/admin/users", userId, "full"],
    queryFn: () => get<Dossier>(`/admin/users/${userId}/full`),
    enabled: userId !== null,
  });
  const [rejectMode, setRejectMode] = useState(false);
  const [rekycMode, setRekycMode] = useState(false);
  const [rekycReason, setRekycReason] = useState("");
  const [rekycDropLevel, setRekycDropLevel] = useState(true);
  const [rejectReason, setRejectReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [aiReasons, setAiReasons] = useState<string[] | null>(null);
  const [pickedReason, setPickedReason] = useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = useState<GenericSuccess | null>(null);

  const moderate = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { status: string; rejectReason?: string } }) =>
      patch(`/admin/kyc/${id}`, body),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/admin/kyc"] });
      qc.invalidateQueries({ queryKey: ["/admin/users", userId, "full"] });
      const approved = vars.body.status === "approved";
      setKycSuccess({
        kind: "generic",
        iconKind: approved ? "paid" : "dispute",
        accentColor: approved ? "#10b981" : "#ef4444",
        title: approved ? "KYC Approved" : "KYC Rejected",
        subtitle: approved ? "User's KYC record has been approved and level upgraded." : "User notified. KYC level held.",
        rows: [
          { label: "Record", value: `#${vars.id}` },
          { label: "Decision", value: approved ? "Approved" : "Rejected", accent: approved ? "#10b981" : "#ef4444" },
          ...(vars.body.rejectReason ? [{ label: "Reason", value: vars.body.rejectReason }] : []),
        ],
      });
      setRejectMode(false);
      setRejectReason("");
      setReasonNote("");
      setAiReasons(null);
      setPickedReason(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Update failed";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });

  const requestRekyc = useMutation({
    mutationFn: ({ id, reason, dropLevel }: { id: number; reason: string; dropLevel: boolean }) =>
      post<{ record: KycRecord; newKycLevel: number | null }>(`/admin/kyc/${id}/request-rekyc`, { reason, dropLevel }),
    onSuccess: (data, vars) => {
      const dropMsg = data.newKycLevel != null ? ` Level set to L${data.newKycLevel}.` : "";
      toast({ title: "Re-KYC requested", description: `User must re-submit Level ${data.record.level}.${dropMsg}` });
      qc.invalidateQueries({ queryKey: ["/admin/kyc"] });
      qc.invalidateQueries({ queryKey: ["/admin/users", userId, "full"] });
      qc.invalidateQueries({ queryKey: ["/admin/users-search"] });
      setRekycMode(false);
      setRekycReason("");
      setRekycDropLevel(true);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Re-KYC request failed";
      toast({ title: "Re-KYC failed", description: msg, variant: "destructive" });
    },
  });

  const suggest = useMutation({
    mutationFn: (recId: number) =>
      post<{ reasons: string[] }>(`/admin/kyc/${recId}/suggest-reasons`, { note: reasonNote.trim() || undefined }),
    onSuccess: (r) => {
      setAiReasons(r.reasons);
      if (r.reasons.length === 0) {
        toast({ title: "No suggestions", description: "AI did not return any reasons. Try adding a hint.", variant: "destructive" });
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "AI request failed";
      toast({ title: "Suggestion failed", description: msg, variant: "destructive" });
    },
  });

  const open = userId !== null;
  const data = dossier.data;
  const current = useMemo(() => {
    if (!data) return null;
    if (highlightRecordId) return data.kyc.find((k) => k.id === highlightRecordId) ?? data.kyc[0] ?? null;
    return data.kyc[0] ?? null;
  }, [data, highlightRecordId]);
  const history = useMemo(() => {
    if (!data || !current) return [] as KycRecord[];
    return data.kyc.filter((k) => k.id !== current.id);
  }, [data, current]);

  return (
    <>
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl overflow-y-auto bg-[hsl(222_22%_5%)] p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border/60 sticky top-0 z-10 bg-[hsl(222_22%_5%)]/95 backdrop-blur">
          <SheetTitle className="sr-only">Applicant Dossier</SheetTitle>
          {dossier.isLoading || !data ? (
            <Skeleton className="h-12 w-2/3" />
          ) : (
            <DossierHeader user={data.user} security={data.security} currentStatus={current?.status ?? null} currentLevel={current?.level ?? null} />
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {dossier.isLoading || !data ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="submission" className="px-6 pb-6">
              <TabsList className="grid grid-cols-4 w-full sticky top-0 z-[5] bg-[hsl(222_22%_5%)]">
                <TabsTrigger value="profile" className="gap-1.5 text-xs"><UserIcon className="w-3.5 h-3.5" />Profile</TabsTrigger>
                <TabsTrigger value="submission" className="gap-1.5 text-xs"><IdCard className="w-3.5 h-3.5" />Submission</TabsTrigger>
                <TabsTrigger value="history" className="gap-1.5 text-xs"><History className="w-3.5 h-3.5" />History ({history.length})</TabsTrigger>
                <TabsTrigger value="activity" className="gap-1.5 text-xs"><Activity className="w-3.5 h-3.5" />Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-4">
                <ProfileTab user={data.user} security={data.security} />
              </TabsContent>

              <TabsContent value="submission" className="mt-4">
                {current ? (
                  <SubmissionDetails record={current} title="Current submission" />
                ) : (
                  <EmptyState icon={IdCard} title="No KYC submission" description="This user has not submitted any KYC yet." />
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4 space-y-3">
                {history.length === 0 ? (
                  <EmptyState icon={History} title="No previous submissions" description="The current submission is the only record on file." />
                ) : (
                  history.map((h) => <SubmissionDetails key={h.id} record={h} title={`Level ${h.level} · ${fmtShort(h.createdAt)}`} compact />)
                )}
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <ActivityTab d={data} />
              </TabsContent>
            </Tabs>
          )}
        </div>

        {current && canModerate && (current.status === "pending" || current.status === "approved") && (
          <div className="border-t border-border/60 bg-[hsl(222_22%_4%)] px-6 py-4 sticky bottom-0">
            {!rejectMode && !rekycMode && current.status === "pending" ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Action will apply to <span className="text-foreground font-medium">submission #{current.id}</span> (Level {current.level}).
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setRejectMode(true)}
                    disabled={moderate.isPending}
                    data-testid="button-reject"
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => moderate.mutate({ id: current.id, body: { status: "approved" } })}
                    disabled={moderate.isPending}
                    data-testid="button-approve"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {moderate.isPending ? "Saving…" : "Approve"}
                  </Button>
                </div>
              </div>
            ) : !rejectMode && !rekycMode && current.status === "approved" ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Already approved on <span className="text-foreground font-medium">{fmtShort(current.reviewedAt)}</span>. You can request the user to re-submit this level.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-sky-400/40 text-sky-200 hover:text-sky-100 hover:bg-sky-400/10"
                  onClick={() => setRekycMode(true)}
                  disabled={requestRekyc.isPending}
                  data-testid="button-request-rekyc"
                >
                  <RotateCcw className="w-4 h-4 mr-1" /> Request Re-KYC
                </Button>
              </div>
            ) : rekycMode ? (
              <div className="space-y-3">
                <div className="text-xs text-sky-200 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  The user will see this reason and be asked to re-submit Level {current.level} KYC.
                </div>
                <Textarea
                  value={rekycReason}
                  onChange={(e) => setRekycReason(e.target.value)}
                  placeholder="Why does this user need to re-submit? (e.g. document expired, suspicious activity, name mismatch detected)"
                  rows={3}
                  className="text-sm"
                  data-testid="input-rekyc-reason"
                />
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={rekycDropLevel}
                    onCheckedChange={(v) => setRekycDropLevel(v === true)}
                    data-testid="checkbox-rekyc-drop-level"
                    className="mt-0.5"
                  />
                  <span>
                    Also drop user&apos;s effective KYC level (recommended). Their level will fall back to the highest other approved level.
                  </span>
                </label>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setRekycMode(false); setRekycReason(""); setRekycDropLevel(true); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-sky-500 hover:bg-sky-400 text-white"
                    disabled={rekycReason.trim().length < 4 || requestRekyc.isPending}
                    onClick={() => requestRekyc.mutate({ id: current.id, reason: rekycReason.trim(), dropLevel: rekycDropLevel })}
                    data-testid="button-confirm-rekyc"
                  >
                    {requestRekyc.isPending
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Requesting…</>
                      : <><RotateCcw className="w-3.5 h-3.5 mr-1" /> Confirm Re-KYC</>}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                  Reason will be visible to the user.
                </div>

                <div className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                      <Sparkles className="w-3.5 h-3.5" />
                      AI suggestions
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-400/30 text-amber-200 hover:text-amber-100"
                      onClick={() => suggest.mutate(current.id)}
                      disabled={suggest.isPending}
                      data-testid="button-ai-suggest"
                    >
                      {suggest.isPending
                        ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating…</>
                        : aiReasons
                          ? <><RefreshCw className="w-3 h-3 mr-1" /> Regenerate</>
                          : <><Sparkles className="w-3 h-3 mr-1" /> Suggest reasons</>}
                    </Button>
                  </div>
                  <Input
                    value={reasonNote}
                    onChange={(e) => setReasonNote(e.target.value)}
                    placeholder="Optional hint to AI (e.g. 'aadhaar photo unclear, name mismatch')"
                    className="h-8 text-xs bg-[hsl(222_22%_4%)]"
                  />
                  {aiReasons && aiReasons.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {aiReasons.map((r, i) => {
                        const active = pickedReason === r;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => { setPickedReason(r); setRejectReason(r); }}
                            className={
                              "w-full text-left text-xs px-2.5 py-1.5 rounded-md border transition-colors flex items-start gap-2 " +
                              (active
                                ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                                : "border-border/50 bg-[hsl(222_22%_4%)] text-foreground/85 hover:bg-amber-400/10 hover:border-amber-400/30")
                            }
                            data-testid={`button-ai-reason-${i}`}
                            aria-pressed={active}
                          >
                            {active
                              ? <Check className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
                              : <Sparkles className="w-3 h-3 text-amber-300/60 mt-0.5 shrink-0" />}
                            <span className="leading-snug">{r}</span>
                          </button>
                        );
                      })}
                      <div className="text-[10px] text-muted-foreground pt-1">
                        Click any suggestion to load it below — you can edit before sending.
                      </div>
                    </div>
                  )}
                </div>

                <Textarea
                  value={rejectReason}
                  onChange={(e) => { setRejectReason(e.target.value); if (pickedReason && e.target.value !== pickedReason) setPickedReason(null); }}
                  placeholder="Type or pick an AI suggestion above…"
                  rows={3}
                  className="text-sm"
                  data-testid="input-reject-reason"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setRejectMode(false); setRejectReason(""); setReasonNote(""); setAiReasons(null); setPickedReason(null); }}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!rejectReason.trim() || moderate.isPending}
                    onClick={() => moderate.mutate({ id: current.id, body: { status: "rejected", rejectReason: rejectReason.trim() } })}
                    data-testid="button-confirm-reject"
                  >
                    {moderate.isPending ? "Saving…" : "Confirm rejection"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
    <SuccessModal open={kycSuccess !== null} payload={kycSuccess} onClose={() => setKycSuccess(null)} />
    </>
  );
}

function DossierHeader({ user, security, currentStatus, currentLevel }: {
  user: DossierUser;
  security: { activeSessions: number; lastSessionAt: string | null };
  currentStatus: string | null;
  currentLevel: number | null;
}) {
  return (
    <div className="flex items-start gap-4">
      <Avatar className="h-14 w-14 ring-2 ring-amber-400/30 shrink-0">
        <AvatarFallback className="bg-gradient-to-br from-amber-400/30 to-amber-700/20 text-amber-200 font-bold">
          {initials(user.name, user.email)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold text-foreground truncate">{user.name || user.email}</h2>
          {currentStatus && <StatusPill status={currentStatus as "pending" | "approved" | "rejected"} />}
          {currentLevel != null && (
            <Badge variant="outline" className="border-amber-400/30 text-amber-200 text-[10px]">L{currentLevel}</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</span>
          {user.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{user.phone}</span>}
          <span className="flex items-center gap-1 font-mono">UID {user.uid}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Joined {fmtShort(user.createdAt)}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
          <Chip>Role: {user.role}</Chip>
          <Chip>Status: {user.status}</Chip>
          <Chip>KYC: L{user.kycLevel}</Chip>
          <Chip>VIP: V{user.vipTier}</Chip>
          <Chip>{security.activeSessions} active session{security.activeSessions === 1 ? "" : "s"}</Chip>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ user, security }: { user: DossierUser; security: { twoFaEnabled: boolean; activeSessions: number; lastSessionAt: string | null } }) {
  return (
    <div className="space-y-4">
      <SectionTile title="Account information" icon={UserIcon}>
        <DefList rows={[
          ["User ID", `#${user.id}`],
          ["UID", user.uid, "mono"],
          ["Email", user.email],
          ["Phone", user.phone ?? "—"],
          ["Display name", user.name || "—"],
          ["Referral code", user.referralCode, "mono"],
          ["Referred by", user.referredBy ? `#${user.referredBy}` : "—"],
        ]} />
      </SectionTile>
      <SectionTile title="Account state" icon={ShieldCheck}>
        <DefList rows={[
          ["Role", user.role],
          ["Account status", user.status],
          ["KYC level", `L${user.kycLevel}`],
          ["VIP tier", `V${user.vipTier}`],
          ["Joined", fmtDate(user.createdAt)],
        ]} />
      </SectionTile>
      <SectionTile title="Security" icon={KeyRound}>
        <DefList rows={[
          ["Two-factor", security.twoFaEnabled ? "Enabled" : "Disabled"],
          ["Active sessions", String(security.activeSessions)],
          ["Last sign-in", fmtDate(security.lastSessionAt)],
        ]} />
      </SectionTile>
    </div>
  );
}

function SubmissionDetails({ record, title, compact }: { record: KycRecord; title: string; compact?: boolean }) {
  const extra = useMemo(() => parseExtra(record.extra), [record.extra]);
  const docs = [
    { label: "PAN Card", url: record.panDocUrl },
    { label: "Aadhaar (Front)", url: record.aadhaarDocUrl },
    { label: "Aadhaar (Back)", url: record.aadhaarDocBackUrl },
    { label: "Selfie with PAN", url: record.selfieUrl },
  ].filter((d) => d.url);

  return (
    <div className={"space-y-4 " + (compact ? "rounded-lg border border-border/50 p-4 bg-[hsl(222_18%_6%)]" : "")}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold text-foreground flex items-center gap-2">
          <IdCard className="w-4 h-4 text-amber-300/80" />
          {title}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StatusPill status={record.status as "pending" | "approved" | "rejected"} />
          <span>·</span>
          <span>Submitted {fmtDate(record.createdAt)}</span>
          {record.reviewedAt && (
            <>
              <span>·</span>
              <span>Reviewed {fmtDate(record.reviewedAt)}{record.reviewedBy ? ` by #${record.reviewedBy}` : ""}</span>
            </>
          )}
        </div>
      </div>

      {record.rejectReason && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold mb-0.5">Rejection reason</div>
            <div className="text-red-100/90">{record.rejectReason}</div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SectionTile title="Personal details" icon={UserIcon} dense>
          <DefList dense rows={[
            ["Full name", record.fullName ?? "—"],
            ["Date of birth", record.dob ?? "—"],
            ["PAN", record.panNumber ?? "—", "mono"],
            ["Aadhaar", maskAadhaar(record.aadhaarNumber), "mono"],
          ]} />
        </SectionTile>
        <SectionTile title="Address" icon={MapPin} dense>
          {record.address ? (
            <div className="text-xs text-foreground/85 whitespace-pre-line leading-relaxed">{record.address}</div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No address provided</div>
          )}
        </SectionTile>
      </div>

      {Object.keys(extra).length > 0 && (
        <SectionTile title={`Additional fields (${Object.keys(extra).length})`} icon={FileText} dense>
          <DefList dense rows={Object.entries(extra).map(([k, v]) => [k, String(v ?? "—")])} />
        </SectionTile>
      )}

      <SectionTile title={`Documents (${docs.length})`} icon={ImageIcon} dense>
        {docs.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No documents uploaded</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {docs.map((d) => (
              <DocPreview key={d.label} label={d.label} url={d.url!} />
            ))}
          </div>
        )}
      </SectionTile>
    </div>
  );
}

function DocPreview({ label, url }: { label: string; url: string }) {
  const [zoom, setZoom] = useState(false);
  const isImg = /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(url) || url.startsWith("data:image");
  return (
    <>
      <div className="rounded-md border border-border/60 bg-[hsl(222_18%_6%)] overflow-hidden">
        <div className="aspect-[4/3] bg-black/40 flex items-center justify-center overflow-hidden cursor-zoom-in" onClick={() => isImg && setZoom(true)}>
          {isImg ? (
            <img src={url} alt={label} className="w-full h-full object-cover hover:scale-105 transition-transform" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground p-4 text-center">
              <FileText className="w-8 h-8" />
              <span className="text-[10px] uppercase tracking-wide">Document</span>
            </div>
          )}
        </div>
        <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 border-t border-border/60">
          <span className="text-xs text-foreground/85 truncate">{label}</span>
          <a href={url} target="_blank" rel="noreferrer" className="text-amber-300/90 hover:text-amber-200" title="Open in new tab">
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      {zoom && isImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoom(false)}
        >
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setZoom(false)}>
            <X className="w-6 h-6" />
          </button>
          <img src={url} alt={label} className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
          <div className="absolute bottom-4 text-white/80 text-sm">{label}</div>
        </div>
      )}
    </>
  );
}

function ActivityTab({ d }: { d: Dossier }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActivityStat label="Wallets" value={d.wallets.length} icon={Wallet} />
        <ActivityStat label="INR Deposits" value={d.inrDeposits.length} icon={ArrowDownToLine} />
        <ActivityStat label="Crypto Deposits" value={d.cryptoDeposits.length} icon={ArrowDownToLine} />
        <ActivityStat label="Withdrawals" value={d.inrWithdrawals.length + d.cryptoWithdrawals.length} icon={ArrowUpFromLine} />
      </div>

      <SectionTile title="Wallets" icon={Wallet} dense>
        {d.wallets.length === 0 ? <Empty /> : (
          <div className="space-y-1">
            {d.wallets.map((w) => (
              <div key={w.id} className="grid grid-cols-4 gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                <span className="capitalize"><Badge variant="outline" className="text-[10px]">{w.walletType}</Badge></span>
                <span className="text-muted-foreground">Coin #{w.coinId}</span>
                <span className="font-mono tabular-nums">{w.balance}</span>
                <span className="font-mono tabular-nums text-muted-foreground">locked: {w.locked}</span>
              </div>
            ))}
          </div>
        )}
      </SectionTile>

      <div className="grid gap-3 sm:grid-cols-2">
        <SectionTile title={`INR Deposits (${d.inrDeposits.length})`} icon={ArrowDownToLine} dense>
          <TxList rows={d.inrDeposits.slice(0, 10).map((x) => ({ amount: `₹${x.amount}`, status: x.status, when: x.createdAt }))} />
        </SectionTile>
        <SectionTile title={`Crypto Deposits (${d.cryptoDeposits.length})`} icon={ArrowDownToLine} dense>
          <TxList rows={d.cryptoDeposits.slice(0, 10).map((x) => ({ amount: x.amount, status: x.status, when: x.createdAt }))} />
        </SectionTile>
        <SectionTile title={`INR Withdrawals (${d.inrWithdrawals.length})`} icon={ArrowUpFromLine} dense>
          <TxList rows={d.inrWithdrawals.slice(0, 10).map((x) => ({ amount: `₹${x.amount}`, status: x.status, when: x.createdAt }))} />
        </SectionTile>
        <SectionTile title={`Crypto Withdrawals (${d.cryptoWithdrawals.length})`} icon={ArrowUpFromLine} dense>
          <TxList rows={d.cryptoWithdrawals.slice(0, 10).map((x) => ({ amount: x.amount, status: x.status, when: x.createdAt }))} />
        </SectionTile>
      </div>

      <SectionTile title={`Open Futures Positions (${d.futuresPositions?.length ?? 0})`} icon={TrendingUp} dense>
        {!d.futuresPositions || d.futuresPositions.length === 0 ? <Empty /> : (
          <div className="space-y-1">
            {d.futuresPositions.map((p) => {
              const pnl = Number(p.unrealizedPnl);
              return (
                <div key={p.id} className="grid grid-cols-5 gap-2 text-xs py-1 border-b border-border/40 last:border-0 items-center">
                  <span className="font-bold">{p.symbol ?? "?"}</span>
                  <span>
                    {p.side === "long"
                      ? <Badge className="bg-green-500/20 text-green-400 text-[10px] gap-1"><TrendingUp className="w-2.5 h-2.5" />long</Badge>
                      : <Badge className="bg-red-500/20 text-red-400 text-[10px] gap-1"><TrendingDown className="w-2.5 h-2.5" />short</Badge>}
                  </span>
                  <span>{p.leverage}x</span>
                  <span className="tabular-nums text-muted-foreground">@ {Number(p.entryPrice).toFixed(2)}</span>
                  <span className={"tabular-nums font-semibold " + (pnl >= 0 ? "text-green-400" : "text-red-400")}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </SectionTile>

      <SectionTile title={`Recent sessions (${d.sessions.length})`} icon={Globe} dense>
        {d.sessions.length === 0 ? <Empty /> : (
          <div className="space-y-1">
            {d.sessions.slice(0, 8).map((s) => (
              <div key={s.id} className="grid grid-cols-3 gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                <span className="font-mono">{s.ip || "—"}</span>
                <span className="truncate text-muted-foreground">{s.userAgent || "—"}</span>
                <span className="text-muted-foreground text-right">{relTime(s.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionTile>
    </div>
  );
}

function ActivityStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UserIcon }) {
  return (
    <div className="rounded-md border border-border/60 bg-[hsl(222_18%_6%)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="w-3.5 h-3.5 text-amber-300/70" />
      </div>
      <div className="text-lg font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function TxList({ rows }: { rows: Array<{ amount: string; status: string; when: string }> }) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 text-xs py-1 border-b border-border/40 last:border-0 items-center">
          <span className="font-mono tabular-nums">{r.amount}</span>
          <Badge variant="outline" className="text-[10px] w-fit">{r.status}</Badge>
          <span className="text-muted-foreground text-right">{relTime(r.when)}</span>
        </div>
      ))}
    </div>
  );
}

function SectionTile({ title, icon: Icon, children, dense }: { title: string; icon: typeof UserIcon; children: React.ReactNode; dense?: boolean }) {
  return (
    <div className={"rounded-lg border border-border/60 bg-[hsl(222_22%_6%)] " + (dense ? "p-3" : "p-4")}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-amber-300/80" />
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
      </div>
      <Separator className="mb-3 bg-border/40" />
      {children}
    </div>
  );
}

function DefList({ rows, dense }: { rows: Array<[string, string, ("mono" | undefined)?]>; dense?: boolean }) {
  return (
    <div className={"grid grid-cols-2 " + (dense ? "gap-x-4 gap-y-1.5" : "gap-x-6 gap-y-2")}>
      {rows.map(([k, v, kind], i) => (
        <div key={i} className="text-xs">
          <div className="text-muted-foreground text-[10px] uppercase tracking-wide">{k}</div>
          <div className={"text-foreground/90 truncate " + (kind === "mono" ? "font-mono" : "")}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(222_18%_8%)] border border-border/60 px-2 py-0.5 text-[10px] text-foreground/80">
      {children}
    </span>
  );
}

function Empty() { return <div className="text-xs text-muted-foreground italic">No records</div>; }
