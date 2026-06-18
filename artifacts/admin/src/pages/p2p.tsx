import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, ShoppingCart, AlertTriangle, ShieldCheck, Loader2, RefreshCw,
  Check, X, Power, Search, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  useGetP2pAdminStats,
  useListP2pAdminOffers,
  useUpdateP2pAdminOffer,
  useListP2pAdminOrders,
  useListP2pAdminDisputes,
  useResolveP2pDispute,
  useListP2pMessages,
  type P2pAdminDispute,
  type P2pMessage,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Admin app shares cookies with the API server — but the generated
// `customFetch` doesn't default credentials so we must opt-in per-call.
const COOKIE_REQ = { credentials: "include" as const };

function fmtINR(n: number): string {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtCrypto(n: number, dp = 6): string {
  return Number(n).toFixed(dp).replace(/\.?0+$/, "");
}
function relTime(s: string | null | undefined): string {
  if (!s) return "—";
  const diff = Date.now() - new Date(s).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function methodLabel(m: string): string {
  const map: Record<string, string> = {
    upi: "UPI", imps: "IMPS", neft: "NEFT", bank: "Bank",
    paytm: "Paytm", phonepe: "PhonePe", gpay: "GPay",
  };
  return map[m] ?? m.toUpperCase();
}

const onErr =
  (toast: ReturnType<typeof useToast>["toast"], title: string) =>
  (e: unknown) =>
    toast({
      title,
      description: e instanceof Error ? e.message : "Request failed",
      variant: "destructive",
    });

export default function P2PAdminPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canModerate = me?.role === "admin" || me?.role === "superadmin";

  const statsQ = useGetP2pAdminStats({
    request: COOKIE_REQ,
    query: {
      queryKey: ["/admin/p2p/stats"],
      refetchInterval: 10_000,
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="P2P Moderation"
        title="P2P Marketplace"
        description="Monitor offers, deals, and resolve disputes for the peer-to-peer market."
        actions={
          <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["/admin/p2p/stats"] }); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard title="Online Offers" value={statsQ.data?.onlineOffers ?? "—"} icon={ShoppingCart} />
        <PremiumStatCard title="Active Orders" value={statsQ.data?.activeOrders ?? "—"} icon={Users} />
        <PremiumStatCard title="Open Disputes" value={statsQ.data?.openDisputes ?? "—"} icon={AlertTriangle} accent={!!statsQ.data?.openDisputes} />
        <PremiumStatCard title="Completed (all-time)" value={statsQ.data?.completedOrders ?? "—"} icon={Check} accent />
      </div>

      <Tabs defaultValue="disputes" className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-xl">
          <TabsTrigger value="disputes" data-testid="p2padmin-tab-disputes">
            Disputes {statsQ.data?.openDisputes ? <Badge className="ml-2 bg-amber-500/20 text-amber-300">{statsQ.data.openDisputes}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="p2padmin-tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="offers" data-testid="p2padmin-tab-offers">Offers</TabsTrigger>
        </TabsList>

        <TabsContent value="disputes"><DisputesTab canModerate={canModerate} toast={toast} /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="offers"><OffersTab canModerate={canModerate} toast={toast} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Disputes ──────────────────────────────────────────────────────────

function DisputeChatHistory({ orderId, buyerId, sellerId }: { orderId: number; buyerId: number; sellerId: number }) {
  const msgsQ = useListP2pMessages(orderId, {
    request: COOKIE_REQ,
    query: {
      queryKey: ["/p2p/orders", orderId, "messages"],
      refetchInterval: 8_000,
    },
  });
  if (msgsQ.isLoading) return <Skeleton className="h-32" />;
  const msgs = (msgsQ.data ?? []) as P2pMessage[];
  if (!msgs.length) return <div className="text-xs text-muted-foreground italic px-1">No chat history yet.</div>;
  const labelFor = (m: P2pMessage) => {
    if (m.senderRole === "system") return "System";
    if (m.senderRole === "admin") return "Admin";
    if (m.senderId === buyerId) return "Buyer";
    if (m.senderId === sellerId) return "Seller";
    return m.senderRole;
  };
  const colorFor = (role: string) => {
    if (role === "system") return "text-muted-foreground bg-muted/40";
    if (role === "admin") return "text-amber-300 bg-amber-500/10";
    return "text-foreground bg-card/60";
  };
  return (
    <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-md border border-border/50 bg-background/40 p-2" data-testid="p2padmin-dispute-chat">
      {msgs.map(m => (
        <div key={m.id} className={`rounded px-2 py-1.5 text-xs ${colorFor(m.senderRole)}`}>
          <div className="flex justify-between items-baseline mb-0.5">
            <span className="font-semibold">{labelFor(m)}</span>
            <span className="text-[10px] opacity-60">{relTime(m.createdAt)}</span>
          </div>
          <div className="whitespace-pre-wrap break-words">{m.body}</div>
        </div>
      ))}
    </div>
  );
}

function DisputesTab({ canModerate, toast }: { canModerate: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const qc = useQueryClient();
  const [resolveTarget, setResolveTarget] = useState<P2pAdminDispute | null>(null);
  const [action, setAction] = useState<"release" | "refund">("release");
  const [notes, setNotes] = useState("");

  const disputesQ = useListP2pAdminDisputes({
    request: COOKIE_REQ,
    query: {
      queryKey: ["/admin/p2p/disputes"],
      refetchInterval: 10_000,
    },
  });

  const resolveMut = useResolveP2pDispute({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        toast({ title: "Dispute resolved" });
        qc.invalidateQueries({ queryKey: ["/admin/p2p/disputes"] });
        qc.invalidateQueries({ queryKey: ["/admin/p2p/stats"] });
        setResolveTarget(null); setNotes("");
      },
      onError: onErr(toast, "Resolve failed"),
    },
  });

  if (disputesQ.isLoading) return <Skeleton className="h-32" />;
  const rows = (disputesQ.data ?? []) as P2pAdminDispute[];
  if (rows.length === 0) {
    return (
      <div className="premium-card rounded-xl">
        <EmptyState icon={ShieldCheck} title="No open disputes" description="Sab kuch shaant hai — buyers and sellers are happy." />
      </div>
    );
  }

  return (
    <div className="premium-card rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground border-b border-border/60">
          <tr>
            <th className="text-left p-3">Order</th>
            <th className="text-left p-3">Parties</th>
            <th className="text-right p-3">Amount</th>
            <th className="text-left p-3">Reason</th>
            <th className="text-left p-3">Evidence</th>
            <th className="text-left p-3">Opened</th>
            <th className="text-right p-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id} className="border-b border-border/40 hover:bg-muted/30" data-testid={`p2padmin-dispute-${o.id}`}>
              <td className="p-3">
                <div className="font-mono text-xs">#{o.id}</div>
                <div className="text-xs text-muted-foreground">{o.coin?.symbol}</div>
              </td>
              <td className="p-3">
                <div className="text-xs"><span className="text-muted-foreground">Buyer:</span> {o.buyer.name}</div>
                <div className="text-xs"><span className="text-muted-foreground">Seller:</span> {o.seller.name}</div>
                {o.disputeOpenedBy && (
                  <div className="text-[10px] text-amber-300 mt-1">
                    Opened by: {o.disputeOpenedBy === o.buyerId ? "Buyer" : "Seller"}
                  </div>
                )}
              </td>
              <td className="p-3 text-right tabular-nums">
                <div className="font-bold">₹{fmtINR(o.fiatAmount)}</div>
                <div className="text-xs text-muted-foreground">{fmtCrypto(o.qty)} {o.coin?.symbol}</div>
              </td>
              <td className="p-3 text-xs max-w-[260px]">
                <div className="line-clamp-3" title={o.disputeReason || ""}>{o.disputeReason || "—"}</div>
              </td>
              <td className="p-3 text-xs">
                {o.disputeEvidenceUrl ? (
                  <a
                    href={o.disputeEvidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-amber-300 hover:underline break-all"
                    data-testid={`p2padmin-dispute-evidence-${o.id}`}
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" /> View
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">none</span>
                )}
              </td>
              <td className="p-3 text-xs text-muted-foreground">{relTime(o.disputeOpenedAt)}</td>
              <td className="p-3 text-right">
                {canModerate ? (
                  <Button
                    size="sm"
                    onClick={() => { setResolveTarget(o); setAction("release"); setNotes(""); }}
                    data-testid={`p2padmin-resolve-${o.id}`}
                  >
                    Resolve
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">View only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {resolveTarget && (
        <Dialog open onOpenChange={() => setResolveTarget(null)}>
          <DialogContent data-testid="p2padmin-resolve-dialog" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Resolve Dispute #{resolveTarget.id}</DialogTitle>
              <DialogDescription>
                {resolveTarget.coin?.symbol} · ₹{fmtINR(resolveTarget.fiatAmount)} · {fmtCrypto(resolveTarget.qty)} units in escrow.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                  <div className="font-semibold mb-0.5">Buyer</div>
                  <div className="text-muted-foreground">{resolveTarget.buyer.name} · KYC L{resolveTarget.buyer.kycLevel}</div>
                </div>
                <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                  <div className="font-semibold mb-0.5">Seller</div>
                  <div className="text-muted-foreground">{resolveTarget.seller.name} · KYC L{resolveTarget.seller.kycLevel}</div>
                </div>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                <div className="font-semibold mb-1">
                  Claim by {resolveTarget.disputeOpenedBy === resolveTarget.buyerId ? "Buyer" : "Seller"}
                </div>
                <div className="text-muted-foreground whitespace-pre-wrap">{resolveTarget.disputeReason}</div>
              </div>
              {resolveTarget.disputeEvidenceUrl && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                  <div className="font-semibold mb-1 text-amber-300">Evidence submitted</div>
                  <a
                    href={resolveTarget.disputeEvidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-amber-300 hover:underline break-all"
                    data-testid="p2padmin-resolve-evidence-link"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {resolveTarget.disputeEvidenceUrl}
                  </a>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    External link supplied by the disputer — open in a new tab and review with care.
                  </p>
                </div>
              )}
              <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
                <div className="font-semibold mb-1">Payment claim</div>
                <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                  <div><span className="opacity-70">Method:</span> {methodLabel(resolveTarget.paymentMethod)}</div>
                  <div className="col-span-2 truncate">
                    <span className="opacity-70">UTR / ref:</span>{" "}
                    {resolveTarget.paymentUtr ? (
                      <span className="font-mono">{resolveTarget.paymentUtr}</span>
                    ) : (
                      <span className="italic">Buyer hasn't supplied UTR</span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1.5">Chat history</div>
                <DisputeChatHistory
                  orderId={resolveTarget.id}
                  buyerId={resolveTarget.buyerId}
                  sellerId={resolveTarget.sellerId}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Resolution</label>
                <Select value={action} onValueChange={(v) => setAction(v as "release" | "refund")}>
                  <SelectTrigger data-testid="p2padmin-resolve-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="release">Release crypto to buyer (buyer wins)</SelectItem>
                    <SelectItem value="refund">Refund crypto to seller (seller wins)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">
                  Resolution notes <span className="text-destructive">*</span>
                </label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Required: decision rationale, evidence reviewed, etc. (min 10 characters)"
                  data-testid="p2padmin-resolve-notes"
                  aria-invalid={notes.trim().length > 0 && notes.trim().length < 10}
                />
                <div className="flex justify-between mt-1 text-[11px]">
                  <span
                    className={notes.trim().length < 10 ? "text-destructive" : "text-muted-foreground"}
                    data-testid="p2padmin-resolve-notes-help"
                  >
                    {notes.trim().length < 10
                      ? `At least 10 characters required (${notes.trim().length}/10)`
                      : "Notes will be saved on the dispute and posted to the order chat for both parties."}
                  </span>
                  <span className="text-muted-foreground">{notes.length}/500</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveTarget(null)}>Cancel</Button>
              <Button
                onClick={() => resolveMut.mutate({
                  id: resolveTarget.id,
                  data: { action, notes: notes.trim() },
                })}
                disabled={resolveMut.isPending || notes.trim().length < 10 || notes.trim().length > 500}
                data-testid="p2padmin-resolve-submit"
              >
                {resolveMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Apply Resolution
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Orders ────────────────────────────────────────────────────────────

function OrdersTab() {
  const [status, setStatus] = useState("all");

  const ordersQ = useListP2pAdminOrders(
    status !== "all"
      ? { status: status as "pending" | "paid" | "released" | "cancelled" | "disputed" | "expired" }
      : undefined,
    {
      request: COOKIE_REQ,
      query: { queryKey: ["/admin/p2p/orders", status] },
    },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]" data-testid="p2padmin-orders-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="premium-card rounded-xl overflow-x-auto">
        {ordersQ.isLoading ? <Skeleton className="h-40" /> : (ordersQ.data ?? []).length === 0 ? (
          <EmptyState icon={Search} title="No orders" description="Try a different filter." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border/60">
              <tr>
                <th className="text-left p-3">Order</th>
                <th className="text-left p-3">Buyer / Seller</th>
                <th className="text-right p-3">Amount</th>
                <th className="text-left p-3">Method</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Opened</th>
              </tr>
            </thead>
            <tbody>
              {(ordersQ.data ?? []).map(o => (
                <tr key={o.id} className="border-b border-border/40" data-testid={`p2padmin-order-${o.id}`}>
                  <td className="p-3 font-mono text-xs">
                    #{o.id}
                    <div className="text-muted-foreground">{o.coin?.symbol}</div>
                  </td>
                  <td className="p-3 text-xs">
                    <div>{o.buyer.name}</div>
                    <div className="text-muted-foreground">{o.seller.name}</div>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <div className="font-semibold">₹{fmtINR(o.fiatAmount)}</div>
                    <div className="text-xs text-muted-foreground">{fmtCrypto(o.qty)} {o.coin?.symbol}</div>
                  </td>
                  <td className="p-3 text-xs">
                    {methodLabel(o.paymentMethod)}
                    <div className="text-muted-foreground">{o.paymentLabel}</div>
                  </td>
                  <td className="p-3"><StatusPill status={o.status} /></td>
                  <td className="p-3 text-xs text-muted-foreground">{relTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Offers ────────────────────────────────────────────────────────────

function OffersTab({ canModerate, toast }: { canModerate: boolean; toast: ReturnType<typeof useToast>["toast"] }) {
  const [status, setStatus] = useState("all");
  const qc = useQueryClient();

  const offersQ = useListP2pAdminOffers(
    status !== "all"
      ? { status: status as "online" | "offline" | "suspended" | "closed" }
      : undefined,
    {
      request: COOKIE_REQ,
      query: { queryKey: ["/admin/p2p/offers", status] },
    },
  );

  const setStatusMut = useUpdateP2pAdminOffer({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/admin/p2p/offers"] });
        toast({ title: "Status updated" });
      },
      onError: onErr(toast, "Update failed"),
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]" data-testid="p2padmin-offers-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="premium-card rounded-xl overflow-x-auto">
        {offersQ.isLoading ? <Skeleton className="h-40" /> : (offersQ.data ?? []).length === 0 ? (
          <EmptyState icon={Search} title="No offers" description="Try a different filter." />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border/60">
              <tr>
                <th className="text-left p-3">ID / Side</th>
                <th className="text-left p-3">Merchant</th>
                <th className="text-left p-3">Coin</th>
                <th className="text-right p-3">Price</th>
                <th className="text-right p-3">Avail.</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(offersQ.data ?? []).map(o => (
                <tr key={o.id} className="border-b border-border/40" data-testid={`p2padmin-offer-${o.id}`}>
                  <td className="p-3">
                    <div className="font-mono text-xs">#{o.id}</div>
                    <Badge className={o.side === "sell" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}>
                      {o.side.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs">
                    {o.merchant.name}
                    <div className="text-muted-foreground">KYC L{o.merchant.kycLevel}</div>
                  </td>
                  <td className="p-3 font-semibold">{o.coin?.symbol}</td>
                  <td className="p-3 text-right tabular-nums">₹{fmtINR(o.price)}</td>
                  <td className="p-3 text-right tabular-nums text-xs">
                    {fmtCrypto(o.availableQty)} / {fmtCrypto(o.totalQty)}
                  </td>
                  <td className="p-3"><StatusPill status={o.status} /></td>
                  <td className="p-3 text-right">
                    {canModerate && (
                      <div className="inline-flex gap-1">
                        {o.status !== "suspended" ? (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => { if (confirm(`Suspend offer #${o.id}? Merchant will not be able to edit.`)) setStatusMut.mutate({ id: o.id, data: { status: "suspended" } }); }}
                            disabled={setStatusMut.isPending}
                            data-testid={`p2padmin-suspend-${o.id}`}
                          >
                            <Power className="w-3 h-3 mr-1 text-rose-400" /> Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline"
                            onClick={() => setStatusMut.mutate({ id: o.id, data: { status: "online" } })}
                            disabled={setStatusMut.isPending}
                            data-testid={`p2padmin-unsuspend-${o.id}`}
                          >
                            <Check className="w-3 h-3 mr-1 text-emerald-400" /> Restore
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
