import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IndianRupee, ArrowDownToLine, ArrowUpFromLine, Clock,
  CheckCircle, XCircle, CreditCard, Copy, Check,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { get, post } from "@/lib/api";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";

interface INRTx {
  id: number;
  type: "deposit" | "withdrawal";
  amountInr: number;
  usdAmount: number | null;
  method: string;
  upiId: string | null;
  utrNumber: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

interface INRBalance {
  balance: number;
  available: number;
}

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI", bank_transfer: "Bank Transfer", neft: "NEFT", rtgs: "RTGS", imps: "IMPS",
};

interface BankDetails {
  upiId?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolder?: string;
  note?: string;
}

function statusVariant(s: string): "success" | "warning" | "danger" | "neutral" {
  const v = s.toLowerCase();
  if (v === "completed") return "success";
  if (v === "pending" || v === "processing") return "warning";
  if (v === "failed" || v === "rejected") return "danger";
  return "neutral";
}

export default function INRPayments() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    amountInr: "", method: "upi", upiId: "", utrNumber: "",
    bankName: "", accountNumber: "", ifscCode: "", accountHolder: "",
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  const bankDetailsQ = useQuery<BankDetails>({
    queryKey: ["/payments/inr/bank-details"],
    queryFn: () => get<BankDetails>("/payments/inr/bank-details"),
    staleTime: 5 * 60 * 1000,
  });
  const payDet = bankDetailsQ.data;

  const historyQ = useQuery<INRTx[]>({
    queryKey: ["/payments/inr/history"],
    queryFn: () => get<INRTx[]>("/payments/inr/history"),
    enabled: !!user,
  });
  const balanceQ = useQuery<INRBalance>({
    queryKey: ["/payments/inr/balance"],
    queryFn: () => get<INRBalance>("/payments/inr/balance"),
    enabled: !!user,
  });

  const depositMut = useMutation({
    mutationFn: (body: object) => post("/payments/inr/deposit", body),
    onSuccess: () => {
      const amt = form.amountInr ? `₹${Number(form.amountInr).toLocaleString("en-IN")}` : "—";
      setGenericSuccess({
        kind: "generic",
        accentColor: "#10B981",
        iconKind: "inr_deposit",
        title: "Deposit Submitted!",
        subtitle: "INR Deposit Request",
        rows: [
          { label: "Amount",  value: amt, accent: "text-emerald-400" },
          { label: "Method",  value: form.method.toUpperCase() },
          { label: "Status",  value: "Under Review", accent: "text-amber-300" },
          { label: "ETA",     value: "Within 30 minutes", accent: "text-muted-foreground" },
        ],
        primaryLabel: "Got it",
      });
      qc.invalidateQueries({ queryKey: ["/payments/inr/history"] });
      qc.invalidateQueries({ queryKey: ["/payments/inr/balance"] });
      setForm({ amountInr: "", method: "upi", upiId: "", utrNumber: "", bankName: "", accountNumber: "", ifscCode: "", accountHolder: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Deposit failed"),
  });

  const withdrawMut = useMutation({
    mutationFn: (body: object) => post("/payments/inr/withdraw", body),
    onSuccess: () => {
      const amt = form.amountInr ? `₹${Number(form.amountInr).toLocaleString("en-IN")}` : "—";
      setGenericSuccess({
        kind: "generic",
        accentColor: "#F87171",
        iconKind: "inr_withdraw",
        title: "Withdrawal Submitted!",
        subtitle: "INR Withdrawal Request",
        rows: [
          { label: "Amount",  value: amt, accent: "text-rose-400" },
          { label: "Method",  value: form.method.toUpperCase() },
          { label: "Status",  value: "Processing", accent: "text-amber-300" },
          { label: "ETA",     value: "4–6 hours", accent: "text-muted-foreground" },
        ],
        primaryLabel: "Got it",
      });
      qc.invalidateQueries({ queryKey: ["/payments/inr/history"] });
      qc.invalidateQueries({ queryKey: ["/payments/inr/balance"] });
      setForm({ amountInr: "", method: "upi", upiId: "", utrNumber: "", bankName: "", accountNumber: "", ifscCode: "", accountHolder: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Withdrawal failed"),
  });

  const copyField = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success("Copied!");
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };

  const buildBody = () => {
    const body: any = { amountInr: parseFloat(form.amountInr), method: form.method };
    if (form.upiId)         body.upiId         = form.upiId;
    if (form.utrNumber)     body.utrNumber     = form.utrNumber;
    if (form.bankName)      body.bankName      = form.bankName;
    if (form.accountNumber) body.accountNumber = form.accountNumber;
    if (form.ifscCode)      body.ifscCode      = form.ifscCode;
    if (form.accountHolder) body.accountHolder = form.accountHolder;
    return body;
  };

  const balance = balanceQ.data;
  const history = historyQ.data ?? [];

  if (!user) {
    return (
      <div className="container mx-auto max-w-2xl p-4 sm:p-6">
        <EmptyState icon={IndianRupee} title="Sign in required" description="Please log in to use INR payments." />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Fiat Gateway"
        title="INR Payments"
        description="Deposit and withdraw Indian Rupees via UPI, NEFT, RTGS, or IMPS."
      />

      <div className="grid grid-cols-2 gap-3">
        <PremiumStatCard
          hero
          title="INR Balance"
          value={balance ? `₹${balance.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
          icon={IndianRupee}
          loading={balanceQ.isLoading}
          hint="Total balance"
        />
        <PremiumStatCard
          title="Available"
          value={balance ? `₹${balance.available.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
          icon={CreditCard}
          loading={balanceQ.isLoading}
          hint="Withdrawable"
        />
      </div>

      <Tabs defaultValue="deposit" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="deposit"><ArrowDownToLine className="h-4 w-4 mr-1.5" />Deposit</TabsTrigger>
          <TabsTrigger value="withdraw"><ArrowUpFromLine className="h-4 w-4 mr-1.5" />Withdraw</TabsTrigger>
          <TabsTrigger value="history"><Clock className="h-4 w-4 mr-1.5" />History</TabsTrigger>
        </TabsList>

        {/* ── Deposit ── */}
        <TabsContent value="deposit" className="space-y-4">
          <SectionCard title="Our Payment Details" icon={CreditCard}>
            <div className="space-y-2">
              {[
                ["UPI ID",  payDet?.upiId         ?? "zebvix@ybl"],
                ["Bank",    payDet?.bankName       ?? "—"],
                ["Account", payDet?.accountNumber  ?? "—"],
                ["IFSC",    payDet?.ifscCode       ?? "—"],
                ["Name",    payDet?.accountHolder  ?? "Zebvix Exchange Pvt Ltd"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">{value}</span>
                    <button
                      type="button"
                      onClick={() => copyField(value, label)}
                      className="text-muted-foreground hover:text-amber-400 transition-colors"
                    >
                      {copiedField === label ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-1">Pay to the above details and fill in the UTR/reference number below. Min: ₹100</p>
            </div>
          </SectionCard>

          <SectionCard title="Submit Deposit Request" icon={ArrowDownToLine}>
            <PaymentForm
              tab="deposit"
              form={form}
              setForm={setForm}
              onSubmit={e => { e.preventDefault(); depositMut.mutate(buildBody()); }}
              isPending={depositMut.isPending}
            />
          </SectionCard>
        </TabsContent>

        {/* ── Withdraw ── */}
        <TabsContent value="withdraw">
          <SectionCard title="Submit Withdrawal Request" icon={ArrowUpFromLine}>
            <PaymentForm
              tab="withdraw"
              form={form}
              setForm={setForm}
              onSubmit={e => { e.preventDefault(); withdrawMut.mutate(buildBody()); }}
              isPending={withdrawMut.isPending}
            />
          </SectionCard>
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history">
          <SectionCard title="Transaction History" icon={Clock} padded={false}>
            {historyQ.isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="p-6">
                <EmptyState icon={Clock} title="No INR transactions yet" description="Your deposit and withdrawal history will appear here." />
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {history.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tx.type === "deposit" ? "bg-emerald-500/20" : "bg-rose-500/20"}`}>
                      {tx.type === "deposit"
                        ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-400" />
                        : <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium capitalize">{tx.type} via {METHOD_LABELS[tx.method] ?? tx.method}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {tx.utrNumber && <div className="text-xs text-muted-foreground">UTR: {tx.utrNumber}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold tabular-nums ${tx.type === "deposit" ? "text-emerald-400" : "text-rose-400"}`}>
                        {tx.type === "deposit" ? "+" : "-"}₹{tx.amountInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <StatusPill variant={statusVariant(tx.status)} status={tx.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <SuccessModal
        open={genericSuccess !== null}
        onClose={() => setGenericSuccess(null)}
        payload={genericSuccess}
      />
    </div>
  );
}

function PaymentForm({ tab, form, setForm, onSubmit, isPending }: {
  tab: "deposit" | "withdraw";
  form: any;
  setForm: any;
  onSubmit: React.FormEventHandler;
  isPending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Amount (₹)</Label>
        <Input
          type="number"
          value={form.amountInr}
          onChange={e => setForm((f: any) => ({ ...f, amountInr: e.target.value }))}
          min={tab === "deposit" ? 100 : 500}
          placeholder={tab === "deposit" ? "Min ₹100" : "Min ₹500"}
          className="font-mono"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label>Payment Method</Label>
        <Select value={form.method} onValueChange={v => setForm((f: any) => ({ ...f, method: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(METHOD_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {form.method === "upi" && (
        <>
          <div className="space-y-1.5">
            <Label>Your UPI ID {tab === "deposit" ? "(optional)" : "(required)"}</Label>
            <Input
              value={form.upiId}
              onChange={e => setForm((f: any) => ({ ...f, upiId: e.target.value }))}
              placeholder="yourname@bank"
              className="font-mono"
              required={tab === "withdraw"}
            />
          </div>
          {tab === "deposit" && (
            <div className="space-y-1.5">
              <Label>UTR / Transaction ID</Label>
              <Input
                value={form.utrNumber}
                onChange={e => setForm((f: any) => ({ ...f, utrNumber: e.target.value }))}
                placeholder="12-digit UTR number"
                className="font-mono"
              />
            </div>
          )}
        </>
      )}

      {form.method !== "upi" && (
        <>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bank Name</Label>
              <Input value={form.bankName} onChange={e => setForm((f: any) => ({ ...f, bankName: e.target.value }))} placeholder="HDFC Bank" />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input value={form.accountNumber} onChange={e => setForm((f: any) => ({ ...f, accountNumber: e.target.value }))} placeholder="Account number" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>IFSC Code</Label>
              <Input value={form.ifscCode} onChange={e => setForm((f: any) => ({ ...f, ifscCode: e.target.value }))} placeholder="HDFC0001234" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Account Holder</Label>
              <Input value={form.accountHolder} onChange={e => setForm((f: any) => ({ ...f, accountHolder: e.target.value }))} placeholder="Full name" />
            </div>
            {tab === "deposit" && (
              <div className="space-y-1.5 col-span-2">
                <Label>UTR Number</Label>
                <Input value={form.utrNumber} onChange={e => setForm((f: any) => ({ ...f, utrNumber: e.target.value }))} placeholder="Bank transaction reference" className="font-mono" />
              </div>
            )}
          </div>
        </>
      )}

      <Button type="submit" disabled={isPending} className="w-full gap-2">
        {tab === "deposit" ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
        {isPending ? "Processing…" : tab === "deposit" ? "Submit Deposit Request" : "Submit Withdrawal Request"}
      </Button>
    </form>
  );
}
