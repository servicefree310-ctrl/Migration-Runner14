import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Eye, User, FileText, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const API = "/api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-700 text-gray-300",
  submitted: "bg-blue-900/60 text-blue-300",
  under_review: "bg-yellow-900/60 text-yellow-300",
  approved: "bg-green-900/60 text-green-300",
  active: "bg-green-900/60 text-green-300",
  rejected: "bg-red-900/60 text-red-300",
};

const DOC_LABELS: Record<string, string> = {
  pan_card: "PAN Card",
  aadhar_front: "Aadhaar Front",
  aadhar_back: "Aadhaar Back",
  photo: "Photo",
  signature: "Signature",
  cancelled_cheque: "Cancelled Cheque",
  bank_proof: "Bank Statement",
  income_proof: "Income Proof",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-700 text-gray-300"}`}>{status.replace("_"," ").toUpperCase()}</span>;
}

export default function BrokerApplicationsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [angelClientId, setAngelClientId] = useState("");
  const [angelDemat, setAngelDemat] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-broker-applications"],
    queryFn: async () => {
      const r = await fetch(`${API}/admin/broker-applications`, { credentials: "include" });
      if (!r.ok) throw new Error("Unauthorized");
      return r.json();
    },
    refetchInterval: 10000,
  });

  const { data: detailData } = useQuery({
    queryKey: ["admin-broker-application", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const r = await fetch(`${API}/admin/broker-applications/${selected.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/admin/broker-applications/${id}/approve`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angelClientId: angelClientId || undefined, angelDemat: angelDemat || undefined }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-broker-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-broker-application", selected?.id] });
      setShowDetail(false);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/admin/broker-applications/${id}/reject`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-broker-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-broker-application", selected?.id] });
      setShowDetail(false);
      setRejectReason("");
    },
  });

  const kycMutation = useMutation({
    mutationFn: async ({ docId, status, rejectionNote }: { docId: number; status: string; rejectionNote?: string }) => {
      const r = await fetch(`${API}/admin/broker-applications/${selected?.id}/kyc/${docId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, rejectionNote }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-broker-application", selected?.id] }),
  });

  const apps: any[] = data?.applications ?? [];
  const filtered = apps.filter(a => {
    const matchSearch = !search || a.fullName?.toLowerCase().includes(search.toLowerCase()) || a.panNumber?.includes(search) || a.email?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || a.status === filter;
    return matchSearch && matchFilter;
  });

  const counts = apps.reduce((acc: Record<string, number>, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; }, {});

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <FileText className="h-5 w-5 text-amber-400" />
          <h1 className="text-2xl font-bold">Broker Applications</h1>
        </div>
        <p className="text-sm text-muted-foreground">Angel One sub-broker account applications from users.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { key: "all",         label: "Total",        count: apps.length,                               cls: "text-foreground"      },
          { key: "submitted",   label: "Submitted",    count: counts.submitted ?? 0,                     cls: "text-blue-400"        },
          { key: "under_review",label: "Under Review", count: counts.under_review ?? 0,                  cls: "text-amber-400"       },
          { key: "active",      label: "Active",       count: (counts.approved ?? 0) + (counts.active ?? 0), cls: "text-emerald-400" },
          { key: "rejected",    label: "Rejected",     count: counts.rejected ?? 0,                      cls: "text-rose-400"        },
        ].map(stat => (
          <button key={stat.key} onClick={() => setFilter(stat.key)}
            className={`rounded-xl border p-3 text-left transition-all ${filter === stat.key ? "border-amber-500/50 bg-amber-500/5" : "border-border hover:border-border/80 bg-card"}`}>
            <div className={`text-2xl font-bold ${stat.cls}`}>{stat.count}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, PAN, email…" className="max-w-xs" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              {["Name / Email", "PAN", "Mobile", "Segments", "Status", "Submitted", ""].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">No applications found</td></tr>
            ) : filtered.map((app: any) => (
              <tr key={app.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-semibold text-sm">{app.fullName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{app.email ?? "No email"}</div>
                  {app.angelClientId && <div className="text-xs text-amber-400">ID: {app.angelClientId}</div>}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{app.panNumber ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{app.mobile ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {app.segmentEquity    && <span className="text-xs bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">EQ</span>}
                    {app.segmentFno       && <span className="text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded">F&O</span>}
                    {app.segmentCommodity && <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">MCX</span>}
                    {app.segmentCurrency  && <span className="text-xs bg-purple-500/15 text-purple-400 px-1.5 py-0.5 rounded">FX</span>}
                  </div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString("en-IN") : "—"}
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => { setSelected(app); setShowDetail(true); }}
                    className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-7 text-xs">
                    <Eye size={12} className="mr-1" /> Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <User size={18} /> {selected?.fullName ?? "Application"} — <StatusBadge status={selected?.status ?? "draft"} />
            </DialogTitle>
          </DialogHeader>

          {detailData && (
            <div className="space-y-4 mt-2">
              {/* Personal Info */}
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <div className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                  <User size={14} /> Personal Details
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {[
                    ["Full Name", selected?.fullName],
                    ["DOB", selected?.dob],
                    ["Gender", selected?.gender],
                    ["Father", selected?.fatherName],
                    ["PAN", selected?.panNumber],
                    ["Aadhaar", selected?.aadharNumber ? `••••${selected.aadharNumber.slice(-4)}` : "—"],
                    ["Mobile", selected?.mobile],
                    ["Email", selected?.email],
                    ["City", selected?.city],
                    ["State", selected?.state],
                    ["PIN", selected?.pincode],
                    ["Occupation", selected?.occupation],
                    ["Annual Income", selected?.annualIncome],
                    ["Bank A/C", selected?.bankAccountNo],
                    ["IFSC", selected?.bankIfsc],
                  ].map(([label, val]) => (
                    <div key={label as string}>
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="font-medium">{val ?? "—"}</div>
                    </div>
                  ))}
                </div>
                {selected?.rejectionReason && (
                  <div className="mt-3 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-rose-400 text-sm">{selected.rejectionReason}</div>
                  </div>
                )}
              </div>

              {/* KYC Documents */}
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <div className="text-sm font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                  <FileText size={14} /> KYC Documents
                </div>
                {detailData.docs?.length === 0 ? (
                  <div className="text-muted-foreground text-sm">No documents uploaded yet</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {detailData.docs?.map((doc: any) => (
                      <div key={doc.id} className={`border rounded-xl p-3 ${
                        doc.status === "verified" ? "border-emerald-500/30 bg-emerald-500/5" :
                        doc.status === "rejected" ? "border-rose-500/30 bg-rose-500/5" :
                        "border-border"
                      }`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="text-sm font-semibold">{DOC_LABELS[doc.docType] ?? doc.docType}</div>
                            <div className="text-xs text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString("en-IN")}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            {doc.status === "verified" && <CheckCircle size={14} className="text-emerald-400" />}
                            {doc.status === "rejected" && <XCircle size={14} className="text-rose-400" />}
                            {doc.status === "pending"  && <Clock size={14} className="text-amber-400" />}
                            <span className={`text-xs font-bold ${
                              doc.status === "verified" ? "text-emerald-400" :
                              doc.status === "rejected" ? "text-rose-400" : "text-amber-400"
                            }`}>{doc.status.toUpperCase()}</span>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer"
                            className="text-xs text-amber-400 hover:underline block mb-2">View Document ↗</a>
                        )}
                        {doc.rejectionNote && <div className="text-xs text-rose-400 mb-2">{doc.rejectionNote}</div>}
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" className="text-xs text-emerald-400 hover:bg-emerald-500/10 h-7"
                            onClick={() => kycMutation.mutate({ docId: doc.id, status: "verified" })}
                            disabled={doc.status === "verified" || kycMutation.isPending}>
                            <CheckCircle size={10} className="mr-1" /> Verify
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs text-rose-400 hover:bg-rose-500/10 h-7"
                            onClick={() => kycMutation.mutate({ docId: doc.id, status: "rejected", rejectionNote: "Document unclear or invalid" })}
                            disabled={doc.status === "rejected" || kycMutation.isPending}>
                            <XCircle size={10} className="mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Approve / Reject Actions */}
              {["submitted", "under_review", "draft"].includes(selected?.status) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4">
                    <div className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                      <CheckCircle size={14} /> Approve Account
                    </div>
                    <div className="space-y-2 mb-3">
                      <Input value={angelClientId} onChange={e => setAngelClientId(e.target.value)}
                        placeholder="Angel One Client ID (auto-generated if blank)" className="text-sm h-8" />
                      <Input value={angelDemat} onChange={e => setAngelDemat(e.target.value)}
                        placeholder="Demat A/C No. (auto-generated if blank)" className="text-sm h-8" />
                    </div>
                    <Button onClick={() => approveMutation.mutate(selected.id)}
                      disabled={approveMutation.isPending}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
                      {approveMutation.isPending ? "Approving…" : "Approve & Activate"}
                    </Button>
                  </div>

                  <div className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-4">
                    <div className="text-sm font-semibold text-rose-400 mb-3 flex items-center gap-2">
                      <XCircle size={14} /> Reject Application
                    </div>
                    <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection (shown to user)…"
                      className="text-sm resize-none h-16 mb-3" />
                    <Button onClick={() => rejectMutation.mutate(selected.id)}
                      disabled={rejectMutation.isPending || !rejectReason}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white">
                      {rejectMutation.isPending ? "Rejecting…" : "Reject Application"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Active account info */}
              {(selected?.status === "active" || selected?.status === "approved") && (
                <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4">
                  <div className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                    <CheckCircle size={14} /> Account Active
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><div className="text-xs text-muted-foreground">Client ID</div><div className="text-amber-400 font-mono">{selected.angelClientId}</div></div>
                    <div><div className="text-xs text-muted-foreground">Demat</div><div className="font-mono">{selected.angelDemat}</div></div>
                    <div><div className="text-xs text-muted-foreground">Trading ID</div><div className="font-mono">{selected.angelTradingId}</div></div>
                  </div>
                </div>
              )}

              {/* Orders */}
              {detailData.orders?.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="text-sm font-semibold mb-3 text-muted-foreground">Recent Orders ({detailData.orders.length})</div>
                  <div className="divide-y divide-border/40 max-h-48 overflow-y-auto">
                    {detailData.orders.map((order: any) => (
                      <div key={order.id} className="py-2 flex items-center justify-between text-sm">
                        <div>
                          <span className={`font-bold uppercase mr-2 ${order.side === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{order.side}</span>
                          <span>{order.symbol}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{Number(order.qty)} @ {order.executedPrice ?? "—"}</span>
                        </div>
                        <span className={`text-xs ${order.status === "complete" ? "text-emerald-400" : "text-muted-foreground"}`}>{order.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
