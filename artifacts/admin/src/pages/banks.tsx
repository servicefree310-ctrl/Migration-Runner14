import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch, post, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Landmark, Search, Settings2, Clock, CheckCircle2, XCircle, ShieldAlert,
  RefreshCw, Eye, Copy, Check, Hash, User as UserIcon, Mail,
  AlertTriangle, FileText, Loader2, X, Edit3, Trash2, History,
  ShieldCheck, Sparkles,
} from "lucide-react";

type NameMatch = "match" | "partial" | "mismatch" | "unknown";

type Bank = {
  id: number; userId: number; bankName: string; accountNumber: string; ifsc: string;
  holderName: string; status: string; isPrimary: boolean;
  rejectReason: string | null; verifiedAt: string | null; reviewedBy: number | null;
  editCount: number;
  nameMatch: NameMatch | null;
  nameMatchScore: number | null;
  createdAt: string; updatedAt: string;
  user: {
    id: number; uid: string; email: string; name: string;
    kycLevel: number; status: string;
  } | null;
  kycName: string | null;
  nameMatchLive: NameMatch;
  nameMatchScoreLive: number;
};

type Policy = { maxPerUser: number; maxEdits: number; maxDeletes: number };
type Stats = { total: number; pending: number; verified: number; rejected: number; mismatches: number };
type RecheckResp = { kycName: string | null; holderName: string; score: number; label: NameMatch; record: Bank };
type Dossier = {
  bank: Bank;
  user: Bank["user"];
  kycName: string | null;
  nameMatch: { score: number; label: NameMatch };
  allBanks: Bank[];
  policy: Policy;
  counters: { banks: number; verifiedBanks: number; totalEdits: number };
};

const TABS = [
  { value: "under_review", label: "Pending", icon: Clock },
  { value: "verified", label: "Verified", icon: CheckCircle2 },
  { value: "rejected", label: "Rejected", icon: XCircle },
  { value: "mismatch", label: "Name Mismatch", icon: ShieldAlert },
  { value: "all", label: "All", icon: FileText },
] as const;

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
function initials(name: string | null | undefined, email: string | undefined) {
  const src = (name && name.trim()) || email || "?";
  return src.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}
function maskAcct(v: string) {
  if (!v) return "—";
  if (v.length <= 4) return v;
  return v.slice(0, 2) + "•".repeat(Math.max(0, v.length - 6)) + v.slice(-4);
}

function MatchPill({ label, score }: { label: NameMatch; score: number | null }) {
  const map: Record<NameMatch, { variant: "success" | "warning" | "danger" | "neutral"; text: string; icon: typeof Check }> = {
    match: { variant: "success", text: "Match", icon: Check },
    partial: { variant: "warning", text: "Partial", icon: AlertTriangle },
    mismatch: { variant: "danger", text: "Mismatch", icon: X },
    unknown: { variant: "neutral", text: "No KYC", icon: ShieldAlert },
  };
  const m = map[label];
  const Icon = m.icon;
  return (
    <StatusPill variant={m.variant} dot={false}>
      <span className="inline-flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {m.text}
        {label !== "unknown" && score !== null ? <span className="opacity-80 tabular-nums"> · {score}%</span> : null}
      </span>
    </StatusPill>
  );
}

export default function BanksPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState<string>("under_review");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [rejectFor, setRejectFor] = useState<Bank | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [aiReasons, setAiReasons] = useState<string[]>([]);
  const [aiHint, setAiHint] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const closeRejectDialog = () => {
    setRejectFor(null);
    setRejectReason("");
    setAiReasons([]);
    setAiHint("");
  };

  const { data: banks = [], isLoading, refetch } = useQuery<Bank[]>({
    queryKey: ["/admin/banks", "all"],
    queryFn: () => get<Bank[]>("/admin/banks"),
  });
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/admin/banks/stats"],
    queryFn: () => get<Stats>("/admin/banks/stats"),
  });
  const { data: policy } = useQuery<Policy>({
    queryKey: ["/admin/banks/policy"],
    queryFn: () => get<Policy>("/admin/banks/policy"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return banks.filter((b) => {
      if (tab !== "all") {
        if (tab === "mismatch") {
          if (b.nameMatchLive !== "mismatch") return false;
        } else if (b.status !== tab) return false;
      }
      if (!q) return true;
      const fields = [
        b.holderName, b.bankName, b.accountNumber, b.ifsc,
        b.kycName ?? "", b.user?.email ?? "", b.user?.uid ?? "", b.user?.name ?? "",
        String(b.userId),
      ].join(" ").toLowerCase();
      return fields.includes(q);
    });
  }, [banks, tab, search]);

  const verifyMut = useMutation({
    mutationFn: (id: number) => patch(`/admin/banks/${id}`, { status: "verified" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/banks", "all"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/stats"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/full"] });
      toast({ title: "Bank verified" });
    },
    onError: (e: Error) => toast({ title: "Verify failed", description: e.message, variant: "destructive" }),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      patch(`/admin/banks/${id}`, { status: "rejected", rejectReason: reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/banks", "all"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/stats"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/full"] });
      setRejectFor(null);
      setRejectReason("");
      toast({ title: "Bank rejected" });
    },
    onError: (e: Error) => toast({ title: "Reject failed", description: e.message, variant: "destructive" }),
  });
  const aiReasonsMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      post<{ reasons: string[] }>(`/admin/banks/${id}/suggest-reject-reasons`, note ? { note } : {}),
    onSuccess: (data) => {
      setAiReasons(data.reasons ?? []);
      if (!data.reasons?.length) {
        toast({ title: "AI returned no reasons", variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "AI suggestion failed", description: e.message, variant: "destructive" }),
  });

  const recheckMut = useMutation({
    mutationFn: (id: number) => post<RecheckResp>(`/admin/banks/${id}/recheck-name`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/admin/banks", "all"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/stats"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/full"] });
      toast({
        title: `Name match: ${data.label} (${data.score}%)`,
        description: data.kycName ? `KYC: ${data.kycName} vs Holder: ${data.holderName}` : "No approved KYC name on file",
      });
    },
    onError: (e: Error) => toast({ title: "Recheck failed", description: e.message, variant: "destructive" }),
  });

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk · Compliance"
        title="Bank Approvals"
        description="Review user-submitted bank accounts, verify holder identity against KYC, and configure platform-wide bank policies."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["/admin/banks/stats"] }); }}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setPolicyOpen(true)} data-testid="button-open-policy">
                <Settings2 className="w-4 h-4 mr-1.5" /> Limits & Policy
              </Button>
            )}
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <PremiumStatCard
          title="Pending Review" value={stats?.pending ?? 0} icon={Clock} hero
          hint={policy ? `Cap: ${policy.maxPerUser} / user` : undefined}
        />
        <PremiumStatCard title="Verified" value={stats?.verified ?? 0} icon={CheckCircle2} accent />
        <PremiumStatCard title="Rejected" value={stats?.rejected ?? 0} icon={XCircle} />
        <PremiumStatCard
          title="Name Mismatch" value={stats?.mismatches ?? 0} icon={ShieldAlert}
          hint="Holder ≠ KYC name"
        />
        <PremiumStatCard title="Total Banks" value={stats?.total ?? 0} icon={Landmark} />
      </div>

      {/* Filters */}
      <SectionCard padded={false}>
        <div className="px-4 md:px-5 py-3 border-b border-border/60 flex flex-col md:flex-row md:items-center gap-3">
          <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
            <TabsList className="h-9">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1.5">
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative flex-1 md:max-w-sm md:ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search holder, KYC name, UID, account, IFSC…"
              className="pl-8 h-9"
              data-testid="input-search-banks"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No bank accounts"
              description={search ? "Try a different search term." : "Nothing in this status bucket right now."}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                  <th className="text-left px-3 py-2.5 font-medium">Holder vs KYC</th>
                  <th className="text-left px-3 py-2.5 font-medium">Bank</th>
                  <th className="text-left px-3 py-2.5 font-medium">Account / IFSC</th>
                  <th className="text-left px-3 py-2.5 font-medium">Status</th>
                  <th className="text-left px-3 py-2.5 font-medium">Submitted</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-border/40 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setOpenId(b.id)}
                    data-testid={`row-bank-${b.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarFallback className="text-[11px] gold-bg-soft text-amber-300">
                            {initials(b.user?.name, b.user?.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{b.user?.name || b.user?.email || `User #${b.userId}`}</div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">{b.user?.uid ?? `#${b.userId}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="font-medium text-foreground truncate" title={b.holderName}>{b.holderName}</div>
                        <div className="text-[11px] text-muted-foreground truncate" title={b.kycName ?? undefined}>
                          KYC: {b.kycName ?? <span className="italic">none</span>}
                        </div>
                        <MatchPill label={b.nameMatchLive} score={b.nameMatchScoreLive} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-foreground truncate">{b.bankName}</div>
                      {b.editCount > 0 && (
                        <div className="text-[11px] text-amber-300/80 mt-0.5">Edited {b.editCount}×</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-[12px] text-foreground">{maskAcct(b.accountNumber)}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{b.ifsc}</div>
                    </td>
                    <td className="px-3 py-3"><StatusPill status={b.status} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{relTime(b.createdAt)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setOpenId(b.id)} data-testid={`button-view-${b.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {isAdmin && b.status === "under_review" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => verifyMut.mutate(b.id)}
                              disabled={verifyMut.isPending}
                              data-testid={`button-verify-${b.id}`}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />Verify
                            </Button>
                            <Button
                              size="sm" variant="destructive"
                              onClick={() => { setRejectFor(b); setRejectReason(""); }}
                              data-testid={`button-reject-${b.id}`}
                            >
                              <X className="w-3.5 h-3.5 mr-1" />Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionCard>

      {/* Dossier sheet */}
      <BankDossierSheet
        bankId={openId}
        onClose={() => setOpenId(null)}
        isAdmin={isAdmin}
        onVerify={(id) => verifyMut.mutate(id)}
        onRejectClick={(b) => { setRejectFor(b); setRejectReason(""); }}
        onRecheck={(id) => recheckMut.mutate(id)}
        verifying={verifyMut.isPending}
        rechecking={recheckMut.isPending}
        copy={copy}
        copied={copied}
      />

      {/* Reject reason dialog */}
      <Dialog
        open={!!rejectFor}
        onOpenChange={(o) => { if (!o) closeRejectDialog(); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reject bank account</DialogTitle>
            <DialogDescription>
              {rejectFor && `${rejectFor.holderName} · ${rejectFor.bankName} · ${maskAcct(rejectFor.accountNumber)}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* AI suggestion panel */}
            <div className="relative overflow-hidden rounded-xl border border-violet-500/30 dark:border-violet-400/20 bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-950 dark:from-slate-950 dark:via-violet-950 dark:to-indigo-950 p-3.5 space-y-2.5 shadow-[0_8px_30px_-12px_rgba(124,58,237,0.45)]">
              {/* Decorative glow orbs */}
              <div className="pointer-events-none absolute -top-10 -right-8 w-40 h-40 rounded-full bg-violet-500/30 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-10 w-44 h-44 rounded-full bg-indigo-500/25 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]" />

              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-violet-400 to-fuchsia-500 shadow-lg shadow-violet-500/40 ring-1 ring-white/20">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[13px] font-semibold text-white">AI-suggested reasons</span>
                    <span className="text-[10px] text-violet-200/70">Powered by gpt-5-mini · context-aware</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs font-medium border-0 bg-white text-violet-900 hover:bg-violet-50 shadow-md shadow-black/20"
                  disabled={!rejectFor || aiReasonsMut.isPending}
                  onClick={() => rejectFor && aiReasonsMut.mutate({ id: rejectFor.id, note: aiHint.trim() || undefined })}
                  data-testid="button-ai-suggest-reasons"
                >
                  {aiReasonsMut.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                  )}
                  {aiReasons.length > 0 ? "Regenerate" : "Generate with AI"}
                </Button>
              </div>

              <div className="relative">
                <Input
                  placeholder="Optional hint for AI (e.g. 'name spelling looks edited')"
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  className="h-9 text-xs bg-white/10 border-white/15 text-white placeholder:text-violet-200/50 focus-visible:ring-violet-400/60 focus-visible:border-violet-400/60 backdrop-blur-sm"
                  data-testid="input-ai-hint"
                />
              </div>

              {aiReasonsMut.isPending && aiReasons.length === 0 && (
                <div className="relative text-xs text-violet-100 flex items-center gap-2 py-1.5 px-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-fuchsia-500" />
                  </span>
                  Generating polite, contextual reasons…
                </div>
              )}

              {aiReasons.length > 0 && (
                <div className="relative flex flex-wrap gap-1.5 pt-1">
                  {aiReasons.map((r, i) => {
                    const selected = rejectReason === r;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRejectReason(r)}
                        className={cn(
                          "group text-left text-xs px-3 py-1.5 rounded-lg border transition-all duration-150",
                          "backdrop-blur-sm",
                          selected
                            ? "bg-white text-violet-900 border-white shadow-lg shadow-violet-900/30 ring-2 ring-fuchsia-400/60"
                            : "bg-white/10 text-violet-50 border-white/15 hover:bg-white/20 hover:border-white/30 hover:-translate-y-0.5",
                        )}
                        data-testid={`chip-ai-reason-${i}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {selected && <Check className="w-3 h-3 text-fuchsia-600" />}
                          {r}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {aiReasons.length === 0 && !aiReasonsMut.isPending && (
                <p className="relative text-[11px] text-violet-200/80">
                  Click <span className="text-white font-medium">Generate</span> to get 4–5 polite reasons tailored to this account.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason (visible to user)</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Holder name does not match KYC; please re-submit with correct details."
                rows={4}
                data-testid="textarea-reject-reason"
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: pick an AI suggestion above, then edit if needed.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeRejectDialog}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMut.isPending}
              onClick={() => rejectFor && rejectMut.mutate({ id: rejectFor.id, reason: rejectReason.trim() })}
              data-testid="button-confirm-reject"
            >
              {rejectMut.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Reject account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Policy dialog */}
      {isAdmin && policy && (
        <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} initial={policy} />
      )}
    </div>
  );
}

// ───── Dossier sheet ──────────────────────────────────────────────────────
function BankDossierSheet({
  bankId, onClose, isAdmin, onVerify, onRejectClick, onRecheck, verifying, rechecking, copy, copied,
}: {
  bankId: number | null;
  onClose: () => void;
  isAdmin: boolean;
  onVerify: (id: number) => void;
  onRejectClick: (b: Bank) => void;
  onRecheck: (id: number) => void;
  verifying: boolean;
  rechecking: boolean;
  copy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const open = bankId !== null;
  const { data, isLoading } = useQuery<Dossier>({
    queryKey: ["/admin/banks/full", bankId],
    queryFn: () => get<Dossier>(`/admin/banks/${bankId}/full`),
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b border-border/60 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Landmark className="w-4 h-4 text-amber-300" />
            Bank Dossier
            {data && <StatusPill status={data.bank.status} className="ml-2" />}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading || !data ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : (
            <>
              {/* User */}
              <SectionCard title="Account holder" icon={UserIcon}>
                <div className="flex items-start gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="gold-bg-soft text-amber-300">
                      {initials(data.user?.name, data.user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-base font-semibold text-foreground">
                      {data.user?.name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" />{data.user?.email}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Hash className="w-3 h-3" /><span className="font-mono">{data.user?.uid}</span>
                      <span>·</span>
                      <span>KYC L{data.user?.kycLevel ?? 0}</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Name match analysis */}
              <SectionCard
                title="Name match analysis" icon={ShieldCheck}
                description="Bank holder name compared against the user's most recent approved KYC name."
                actions={
                  <Button
                    size="sm" variant="outline"
                    onClick={() => onRecheck(data.bank.id)}
                    disabled={rechecking}
                    data-testid="button-recheck-name"
                  >
                    {rechecking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Re-check
                  </Button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <NameCompareRow label="Bank holder name" value={data.bank.holderName} />
                  <NameCompareRow label="KYC full name" value={data.kycName ?? "—"} muted={!data.kycName} />
                </div>
                <div className="mt-4 flex items-center gap-3 flex-wrap">
                  <MatchPill label={data.nameMatch.label} score={data.kycName ? data.nameMatch.score : null} />
                  {data.kycName && (
                    <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            data.nameMatch.label === "match" && "bg-emerald-400",
                            data.nameMatch.label === "partial" && "bg-amber-400",
                            data.nameMatch.label === "mismatch" && "bg-red-400",
                          )}
                          style={{ width: `${Math.max(2, data.nameMatch.score)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{data.nameMatch.score}%</span>
                    </div>
                  )}
                </div>
                {data.nameMatch.label === "mismatch" && data.kycName && (
                  <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    Holder name differs significantly from KYC. Recommend rejection or re-KYC.
                  </div>
                )}
                {!data.kycName && (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    User has no approved KYC name on file. Verify only after KYC approval.
                  </div>
                )}
              </SectionCard>

              {/* Bank details */}
              <SectionCard title="Bank details" icon={Landmark}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DetailRow label="Bank name" value={data.bank.bankName} />
                  <DetailRow label="Holder name" value={data.bank.holderName} />
                  <DetailRow
                    label="Account number"
                    value={data.bank.accountNumber}
                    mono
                    copyable={{ key: `acct-${data.bank.id}`, copy, copied }}
                  />
                  <DetailRow
                    label="IFSC"
                    value={data.bank.ifsc}
                    mono
                    copyable={{ key: `ifsc-${data.bank.id}`, copy, copied }}
                  />
                  <DetailRow label="Primary?" value={data.bank.isPrimary ? "Yes" : "No"} />
                  <DetailRow label="Edits used" value={`${data.bank.editCount} of ${data.policy.maxEdits}`} />
                  <DetailRow label="Submitted" value={fmtDate(data.bank.createdAt)} />
                  <DetailRow label="Last update" value={fmtDate(data.bank.updatedAt)} />
                  <DetailRow label="Verified at" value={fmtDate(data.bank.verifiedAt)} />
                  {data.bank.rejectReason && (
                    <div className="md:col-span-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Reject reason</div>
                      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                        {data.bank.rejectReason}
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* User policy usage */}
              <SectionCard title="Policy usage" icon={Settings2} description="How this user is tracking against current platform limits.">
                <div className="grid grid-cols-3 gap-3">
                  <PolicyMeter label="Banks" used={data.counters.banks} max={data.policy.maxPerUser} />
                  <PolicyMeter label="Edits" used={data.counters.totalEdits} max={data.policy.maxEdits} />
                  <PolicyMeter
                    label="Deletes"
                    used={data.allBanks.filter((b) => b.status === "deleted").length}
                    max={data.policy.maxDeletes}
                  />
                </div>
              </SectionCard>

              {/* All banks history */}
              <SectionCard
                title="All banks for this user" icon={History}
                description={`${data.allBanks.length} record${data.allBanks.length === 1 ? "" : "s"}`}
                padded={false}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Bank</th>
                        <th className="text-left px-3 py-2 font-medium">Account</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Edits</th>
                        <th className="text-left px-3 py-2 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.allBanks.map((b) => (
                        <tr
                          key={b.id}
                          className={cn(
                            "border-t border-border/40",
                            b.id === data.bank.id && "bg-amber-500/5",
                          )}
                        >
                          <td className="px-4 py-2">
                            <div className="font-medium text-foreground">{b.bankName}</div>
                            <div className="text-[11px] text-muted-foreground">{b.holderName}</div>
                          </td>
                          <td className="px-3 py-2 font-mono">{maskAcct(b.accountNumber)}</td>
                          <td className="px-3 py-2"><StatusPill status={b.status} dot={false} /></td>
                          <td className="px-3 py-2 tabular-nums">{b.editCount}</td>
                          <td className="px-3 py-2 text-muted-foreground">{fmtShort(b.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}
        </div>

        {/* Footer actions */}
        {data && isAdmin && (
          <div className="border-t border-border/60 px-5 py-3 flex items-center justify-end gap-2 shrink-0 bg-background/60 backdrop-blur">
            {data.bank.status === "under_review" ? (
              <>
                <Button variant="destructive" onClick={() => onRejectClick(data.bank)}>
                  <X className="w-4 h-4 mr-1.5" />Reject
                </Button>
                <Button onClick={() => onVerify(data.bank.id)} disabled={verifying}>
                  {verifying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                  Verify account
                </Button>
              </>
            ) : data.bank.status === "verified" ? (
              <Button variant="outline" onClick={() => onRejectClick(data.bank)}>
                <X className="w-4 h-4 mr-1.5" />Revoke / reject
              </Button>
            ) : (
              <Button onClick={() => onVerify(data.bank.id)} disabled={verifying}>
                {verifying ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                Approve anyway
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NameCompareRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium mt-0.5 break-words", muted ? "text-muted-foreground italic" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function DetailRow({
  label, value, mono, copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: { key: string; copy: (text: string, key: string) => void; copied: string | null };
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 mt-0.5">
        <div className={cn("text-sm text-foreground truncate", mono && "font-mono")}>{value}</div>
        {copyable && (
          <Button
            size="icon" variant="ghost" className="h-6 w-6 shrink-0"
            onClick={() => copyable.copy(value, copyable.key)}
            data-testid={`button-copy-${copyable.key}`}
          >
            {copyable.copied === copyable.key ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function PolicyMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, max > 0 ? Math.round((used * 100) / max) : 0);
  const danger = used >= max;
  const warn = !danger && pct >= 75;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xs tabular-nums">
          <span className={cn("font-semibold", danger && "text-red-400", warn && "text-amber-300")}>{used}</span>
          <span className="text-muted-foreground"> / {max}</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            danger ? "bg-red-400" : warn ? "bg-amber-400" : "bg-emerald-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ───── Policy dialog ──────────────────────────────────────────────────────
function PolicyDialog({
  open, onOpenChange, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Policy;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [maxPerUser, setMaxPerUser] = useState(String(initial.maxPerUser));
  const [maxEdits, setMaxEdits] = useState(String(initial.maxEdits));
  const [maxDeletes, setMaxDeletes] = useState(String(initial.maxDeletes));

  // Reset values when dialog opens with fresh `initial`
  useEffect(() => {
    if (open) {
      setMaxPerUser(String(initial.maxPerUser));
      setMaxEdits(String(initial.maxEdits));
      setMaxDeletes(String(initial.maxDeletes));
    }
  }, [open, initial.maxPerUser, initial.maxEdits, initial.maxDeletes]);

  const save = useMutation({
    mutationFn: (body: Policy) => put<Policy>("/admin/banks/policy", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/banks/policy"] });
      qc.invalidateQueries({ queryKey: ["/admin/banks/full"] });
      toast({ title: "Bank policy updated" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function submit() {
    const body: Policy = {
      maxPerUser: Math.max(1, Math.min(20, Number(maxPerUser) || 1)),
      maxEdits: Math.max(0, Math.min(50, Number(maxEdits) || 0)),
      maxDeletes: Math.max(0, Math.min(50, Number(maxDeletes) || 0)),
    };
    save.mutate(body);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-amber-300" />
            Bank limits & policy
          </DialogTitle>
          <DialogDescription>
            These limits apply to every user across the platform. Existing accounts are not removed if you lower a limit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PolicyField
            id="maxPerUser" icon={Landmark}
            label="Max bank accounts per user"
            help="Total active (non-deleted) bank accounts a single user may have."
            value={maxPerUser} setValue={setMaxPerUser} min={1} max={20}
          />
          <PolicyField
            id="maxEdits" icon={Edit3}
            label="Max edits (lifetime, per user)"
            help="Combined edits across all of the user's bank accounts."
            value={maxEdits} setValue={setMaxEdits} min={0} max={50}
          />
          <PolicyField
            id="maxDeletes" icon={Trash2}
            label="Max removals (lifetime, per user)"
            help="Number of bank accounts a user can remove before contacting support."
            value={maxDeletes} setValue={setMaxDeletes} min={0} max={50}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="button-save-policy">
            {save.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyField({
  id, label, help, icon: Icon, value, setValue, min, max,
}: {
  id: string;
  label: string;
  help: string;
  icon: typeof Landmark;
  value: string;
  setValue: (v: string) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-3">
      <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="w-4 h-4 text-amber-300" />
        {label}
      </Label>
      <p className="text-xs text-muted-foreground mt-1">{help}</p>
      <Input
        id={id} type="number" min={min} max={max}
        value={value} onChange={(e) => setValue(e.target.value)}
        className="mt-2 h-9 max-w-[120px] tabular-nums"
        data-testid={`input-policy-${id}`}
      />
    </div>
  );
}
