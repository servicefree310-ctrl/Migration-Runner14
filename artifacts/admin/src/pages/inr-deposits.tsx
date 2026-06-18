import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "@/lib/api";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ArrowDownToLine, Search, RefreshCw, Loader2, IndianRupee, Clock, CheckCircle2,
  XCircle, AlertTriangle, Wallet, Check, X, FileText,
} from "lucide-react";

type Dep = {
  id: number; uid?: string; userId: number; gatewayId: number; amount: string; fee: string;
  refId: string; utr: string | null; status: string; notes: string | null; createdAt: string;
};
type Gateway = { id: number; code: string; name: string };

function fmtINR(n: string | number): string {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
}
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function InrDepositsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [approveFor, setApproveFor] = useState<Dep | null>(null);
  const [rejectFor, setRejectFor] = useState<Dep | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  useEffect(() => { if (rejectFor) setRejectNotes(""); }, [rejectFor]);

  const { data: deposits = [], refetch, isLoading, isFetching } = useQuery<Dep[]>({
    queryKey: ["/admin/inr-deposits"],
    queryFn: () => get<Dep[]>("/admin/inr-deposits"),
    refetchInterval: 10000,
  });
  const { data: gateways = [] } = useQuery<Gateway[]>({
    queryKey: ["/admin/gateways"], queryFn: () => get<Gateway[]>("/admin/gateways"),
  });
  const gwById = useMemo(() => new Map(gateways.map((g) => [g.id, g])), [gateways]);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => patch(`/admin/inr-deposits/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/inr-deposits"] }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const total = deposits.length;
    const pending = deposits.filter((d) => d.status === "pending").length;
    const completed = deposits.filter((d) => d.status === "completed").length;
    const rejected = deposits.filter((d) => d.status === "rejected").length;
    const totalVol = deposits.filter((d) => d.status === "completed").reduce((s, d) => s + Number(d.amount), 0);
    const pendingVol = deposits.filter((d) => d.status === "pending").reduce((s, d) => s + Number(d.amount), 0);
    return { total, pending, completed, rejected, totalVol, pendingVol };
  }, [deposits]);

  const filtered = useMemo(() => {
    return deposits.filter((d) => {
      if (tab !== "all" && d.status !== tab) return false;
      if (!search) return true;
      const hay = `${d.uid ?? ""} ${d.refId} ${d.userId} ${d.utr ?? ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [deposits, tab, search]);

  useEffect(() => { setPage(1); }, [tab, search, pageSize]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const approve = () => {
    if (!approveFor) return;
    const row = approveFor;
    update.mutate({ id: row.id, body: { status: "completed" } }, {
      onSuccess: () => {
        setApproveFor(null);
        setSuccessData({
          kind: "generic", iconKind: "inr_deposit", accentColor: "#10b981",
          title: "INR Deposit Approved",
          subtitle: "Funds have been credited to user's wallet.",
          rows: [
            { label: "Amount", value: `₹${fmtINR(row.amount)}`, accent: "#10b981" },
            { label: "User", value: row.uid ?? `#${row.userId}` },
            { label: "UTR", value: row.utr || row.refId },
            { label: "Status", value: "Credited", accent: "#10b981" },
          ],
        });
      },
    });
  };
  const reject = () => {
    if (!rejectFor || !rejectNotes.trim()) return;
    const row = rejectFor;
    update.mutate({ id: row.id, body: { status: "rejected", notes: rejectNotes.trim() } }, {
      onSuccess: () => {
        setRejectFor(null);
        setSuccessData({
          kind: "generic", iconKind: "inr_deposit", accentColor: "#ef4444",
          title: "INR Deposit Rejected",
          subtitle: "Deposit marked as rejected.",
          rows: [
            { label: "Amount", value: `₹${fmtINR(row.amount)}`, accent: "#ef4444" },
            { label: "User", value: row.uid ?? `#${row.userId}` },
            { label: "Reason", value: rejectNotes.trim() },
          ],
        });
      },
    });
  };

  return (
    <>
    <div className="space-y-6">
      <PageHeader
        eyebrow="Treasury"
        title="INR Deposits"
        description="INR deposits via bank transfer or UPI — verify the UTR and approve manually. Deposits from auto-credit gateways are handled here as a fallback."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-deposits">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Pending" value={stats.pending} icon={Clock} hero hint="Approval awaited" />
        <PremiumStatCard title="Completed" value={stats.completed} icon={CheckCircle2} hint="All-time approved" />
        <PremiumStatCard title="Rejected" value={stats.rejected} icon={XCircle} hint="UTR mismatch" />
        <PremiumStatCard title="Total Deposits" value={stats.total} icon={ArrowDownToLine} hint="All statuses" />
        <PremiumStatCard title="Approved Volume" value={fmtINR(stats.totalVol)} prefix="₹" icon={Wallet} hint="Credited to users" />
        <PremiumStatCard title="Pending Volume" value={fmtINR(stats.pendingVol)} prefix="₹" icon={IndianRupee} hint="Awaiting review" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">Completed ({stats.completed})</TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected ({stats.rejected})</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All ({stats.total})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="UID, ref, user, UTR…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8" data-testid="input-search-deposits"
          />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">UID</th>
                <th className="text-left font-medium px-4 py-3">Ref ID</th>
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Gateway</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-left font-medium px-4 py-3">UTR</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Date</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td className="px-4 py-3" colSpan={isAdmin ? 9 : 8}><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-3">
                  <EmptyState icon={ArrowDownToLine} title="No deposits"
                    description={search || tab !== "all" ? "Try adjusting your filters." : "No INR deposit requests have been submitted yet."} />
                </td></tr>
              )}
              {!isLoading && paged.map((d) => {
                const gw = gwById.get(d.gatewayId);
                return (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-deposit-${d.id}`}>
                    <td className="px-4 py-3 pl-5 font-mono text-[10px] text-muted-foreground" title={d.uid}>{(d.uid ?? "").slice(0, 10)}…</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.refId}</td>
                    <td className="px-4 py-3 text-xs">#{d.userId}</td>
                    <td className="px-4 py-3 text-xs">{gw?.name ?? `#${d.gatewayId}`}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">₹{fmtINR(d.amount)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.utr || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(d.createdAt).toLocaleString("en-IN")}>{relTime(d.createdAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap space-x-1">
                        {d.status === "pending" ? (
                          <>
                            <Button size="sm" onClick={() => setApproveFor(d)} data-testid={`button-approve-${d.id}`}>
                              <Check className="w-3.5 h-3.5 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejectFor(d)} data-testid={`button-reject-${d.id}`}>
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </>
                        ) : d.notes ? (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[160px] inline-block" title={d.notes}>
                            <FileText className="w-3 h-3 inline mr-0.5" />{d.notes}
                          </span>
                        ) : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} label="deposits" />
      </div>

      <Dialog open={!!approveFor} onOpenChange={(o) => !o && setApproveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" />Approve deposit</DialogTitle>
            <DialogDescription>User ko amount turant credit ho jayega. Confirm before approving.</DialogDescription>
          </DialogHeader>
          {approveFor && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">User:</span> #{approveFor.userId}</div>
              <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">₹{fmtINR(approveFor.amount)}</span></div>
              <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono text-xs">{approveFor.refId}</span></div>
              <div><span className="text-muted-foreground">UTR:</span> <span className="font-mono text-xs">{approveFor.utr || "—"}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveFor(null)}>Cancel</Button>
            <Button onClick={approve} disabled={update.isPending} data-testid="button-confirm-approve">
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
              Approve & credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Reject deposit</DialogTitle>
            <DialogDescription>The user will be notified with the reason provided. This deposit will not be credited.</DialogDescription>
          </DialogHeader>
          {rejectFor && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">User:</span> #{rejectFor.userId}</div>
                <div><span className="text-muted-foreground">Amount:</span> ₹{fmtINR(rejectFor.amount)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reason</label>
                <Textarea
                  rows={3} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="UTR mismatch / Already credited / Suspicious source…"
                  data-testid="input-reject-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={update.isPending || !rejectNotes.trim()} data-testid="button-confirm-reject">
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <X className="w-4 h-4 mr-1.5" />}
              Reject deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </>
  );
}
