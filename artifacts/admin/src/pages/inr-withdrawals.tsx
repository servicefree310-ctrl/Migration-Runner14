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
  ArrowUpFromLine, Search, RefreshCw, Loader2, IndianRupee, Clock, CheckCircle2,
  XCircle, AlertTriangle, Wallet, Check, X, Building2,
} from "lucide-react";

type W = {
  id: number; uid?: string; userId: number; bankId: number; amount: string; fee: string;
  refId: string; status: string; rejectReason: string | null; createdAt: string;
};
type Bank = { id: number; bankName: string; accountNo: string; ifsc: string; holderName: string };

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

export default function InrWithdrawalsPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [paidFor, setPaidFor] = useState<W | null>(null);
  const [paidUtr, setPaidUtr] = useState("");
  const [rejectFor, setRejectFor] = useState<W | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);

  useEffect(() => { if (paidFor) setPaidUtr(""); }, [paidFor]);
  useEffect(() => { if (rejectFor) setRejectReason(""); }, [rejectFor]);

  const { data: rows = [], refetch, isLoading, isFetching } = useQuery<W[]>({
    queryKey: ["/admin/inr-withdrawals"],
    queryFn: () => get<W[]>("/admin/inr-withdrawals"),
    refetchInterval: 10000,
  });
  const { data: banks = [] } = useQuery<Bank[]>({
    queryKey: ["/admin/banks"], queryFn: () => get<Bank[]>("/admin/banks"),
  });
  const bankById = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks]);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => patch(`/admin/inr-withdrawals/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/inr-withdrawals"] }); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;
    const totalVol = rows.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.amount), 0);
    const pendingVol = rows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.amount), 0);
    const feeRevenue = rows.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.fee), 0);
    return { total, pending, completed, rejected, totalVol, pendingVol, feeRevenue };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!search) return true;
      const bank = bankById.get(r.bankId);
      const hay = `${r.uid ?? ""} ${r.refId} ${r.userId} ${bank?.accountNo ?? ""} ${bank?.holderName ?? ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [rows, tab, search, bankById]);

  useEffect(() => { setPage(1); }, [tab, search, pageSize]);
  const paged = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const markPaid = () => {
    if (!paidFor) return;
    const row = paidFor;
    const bank = bankById.get(row.bankId);
    update.mutate({ id: row.id, body: { status: "completed", refId: paidUtr.trim() || row.refId } }, {
      onSuccess: () => {
        setPaidFor(null);
        setSuccessData({
          kind: "generic", iconKind: "inr_withdraw", accentColor: "#10b981",
          title: "INR Withdrawal Processed",
          subtitle: "Payment marked as sent successfully.",
          rows: [
            { label: "Amount", value: `₹${fmtINR(row.amount)}`, accent: "#10b981" },
            { label: "Account", value: bank ? `${bank.holderName} · ${bank.accountNo.slice(-4).padStart(bank.accountNo.length, "•")}` : `Bank #${row.bankId}` },
            { label: "UTR / Ref", value: paidUtr.trim() || row.refId },
            { label: "Status", value: "Completed", accent: "#10b981" },
          ],
        });
      },
    });
  };
  const reject = () => {
    if (!rejectFor || !rejectReason.trim()) return;
    const row = rejectFor;
    update.mutate({ id: row.id, body: { status: "rejected", rejectReason: rejectReason.trim() } }, {
      onSuccess: () => {
        setRejectFor(null);
        setSuccessData({
          kind: "generic", iconKind: "inr_withdraw", accentColor: "#ef4444",
          title: "Withdrawal Rejected",
          subtitle: "Funds refunded to user's INR wallet.",
          rows: [
            { label: "Amount", value: `₹${fmtINR(row.amount)}`, accent: "#ef4444" },
            { label: "User", value: row.uid ?? `#${row.userId}` },
            { label: "Reason", value: rejectReason.trim() },
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
        title="INR Withdrawals"
        description="User withdrawal requests — verify the bank account, send via IMPS/NEFT, then mark as paid. Rejected requests refund the locked funds to the user's balance."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-withdrawals">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <PremiumStatCard title="Pending" value={stats.pending} icon={Clock} hero hint={`₹${fmtINR(stats.pendingVol)} locked`} />
        <PremiumStatCard title="Completed" value={stats.completed} icon={CheckCircle2} hint="All-time paid" />
        <PremiumStatCard title="Rejected" value={stats.rejected} icon={XCircle} hint="Refunded to user" />
        <PremiumStatCard title="Total Withdrawals" value={stats.total} icon={ArrowUpFromLine} hint="All statuses" />
        <PremiumStatCard title="Paid Out Volume" value={fmtINR(stats.totalVol)} prefix="₹" icon={Wallet} hint="Sent to banks" />
        <PremiumStatCard title="Fee Revenue" value={fmtINR(stats.feeRevenue)} prefix="₹" icon={IndianRupee} hint="From completed" />
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
            placeholder="UID, ref, user, account, holder…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="pl-8" data-testid="input-search-withdrawals"
          />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">UID</th>
                <th className="text-left font-medium px-4 py-3">Ref</th>
                <th className="text-left font-medium px-4 py-3">User</th>
                <th className="text-left font-medium px-4 py-3">Bank</th>
                <th className="text-right font-medium px-4 py-3">Amount</th>
                <th className="text-right font-medium px-4 py-3">Fee</th>
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
                  <EmptyState icon={ArrowUpFromLine} title="No withdrawals"
                    description={search || tab !== "all" ? "Try adjusting your filters." : "No withdrawal requests have been submitted yet."} />
                </td></tr>
              )}
              {!isLoading && paged.map((w) => {
                const b = bankById.get(w.bankId);
                return (
                  <tr key={w.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-withdrawal-${w.id}`}>
                    <td className="px-4 py-3 pl-5 font-mono text-[10px] text-muted-foreground" title={w.uid}>{(w.uid ?? "").slice(0, 10)}…</td>
                    <td className="px-4 py-3 font-mono text-xs">{w.refId}</td>
                    <td className="px-4 py-3 text-xs">#{w.userId}</td>
                    <td className="px-4 py-3 text-xs">
                      {b ? (
                        <div>
                          <div className="font-medium flex items-center gap-1"><Building2 className="w-3 h-3 text-muted-foreground" />{b.bankName}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{b.accountNo} · {b.ifsc}</div>
                          <div className="text-[10px] text-muted-foreground">{b.holderName}</div>
                        </div>
                      ) : <span className="text-muted-foreground">#{w.bankId}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">₹{fmtINR(w.amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">₹{fmtINR(w.fee)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={w.status} />
                      {w.rejectReason && <div className="text-[10px] text-destructive mt-1 max-w-[160px] truncate" title={w.rejectReason}>{w.rejectReason}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" title={new Date(w.createdAt).toLocaleString("en-IN")}>{relTime(w.createdAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap space-x-1">
                        {w.status === "pending" && (
                          <>
                            <Button size="sm" onClick={() => setPaidFor(w)} data-testid={`button-mark-paid-${w.id}`}>
                              <Check className="w-3.5 h-3.5 mr-1" />Mark Paid
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejectFor(w)} data-testid={`button-reject-${w.id}`}>
                              <X className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} label="withdrawals" />
      </div>

      <Dialog open={!!paidFor} onOpenChange={(o) => !o && setPaidFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" />Mark withdrawal paid</DialogTitle>
            <DialogDescription>Confirm after sending the IMPS/NEFT transfer. Providing the bank UTR is optional but strongly recommended.</DialogDescription>
          </DialogHeader>
          {paidFor && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">User:</span> #{paidFor.userId}</div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">₹{fmtINR(paidFor.amount)}</span></div>
                {(() => {
                  const b = bankById.get(paidFor.bankId);
                  return b ? (
                    <>
                      <div><span className="text-muted-foreground">Bank:</span> {b.bankName} · {b.holderName}</div>
                      <div><span className="text-muted-foreground">A/c:</span> <span className="font-mono">{b.accountNo}</span> · {b.ifsc}</div>
                    </>
                  ) : null;
                })()}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bank UTR / reference (optional)</label>
                <Input value={paidUtr} onChange={(e) => setPaidUtr(e.target.value)} placeholder="UTR1234567890" data-testid="input-paid-utr" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidFor(null)}>Cancel</Button>
            <Button onClick={markPaid} disabled={update.isPending} data-testid="button-confirm-paid">
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
              Confirm paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Reject withdrawal</DialogTitle>
            <DialogDescription>The user's locked funds will be returned to their available balance. A reason is required.</DialogDescription>
          </DialogHeader>
          {rejectFor && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm space-y-1">
                <div><span className="text-muted-foreground">User:</span> #{rejectFor.userId}</div>
                <div><span className="text-muted-foreground">Amount:</span> ₹{fmtINR(rejectFor.amount)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reject reason</label>
                <Textarea
                  rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Account inactive / IFSC mismatch / Suspicious / Limit breached…"
                  data-testid="input-reject-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={update.isPending || !rejectReason.trim()} data-testid="button-confirm-reject">
              {update.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <X className="w-4 h-4 mr-1.5" />}
              Reject & refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </>
  );
}
