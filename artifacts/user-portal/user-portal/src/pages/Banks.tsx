import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Trash2, Shield, Loader2, AlertCircle, CheckCircle2,
  ExternalLink, Info, Clock, XCircle, Star,
} from "lucide-react";
import { get, post, del, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

type Bank = {
  id: number;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
  status: "under_review" | "verified" | "rejected";
  isPrimary: boolean;
  rejectReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  under_review: { label: "Under Review", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
  verified: { label: "Verified", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: XCircle },
};

function fmtAcc(n: string) {
  if (!n) return "—";
  if (n.length <= 4) return n;
  return "••••" + n.slice(-4);
}

export default function Banks() {
  const qc = useQueryClient();
  const banksQ = useQuery<Bank[]>({
    queryKey: ["/banks"],
    queryFn: () => get<Bank[]>("/banks"),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Bank | null>(null);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  const banks = banksQ.data ?? [];
  const verified = banks.filter((b) => b.status === "verified");
  const hasVerified = verified.length > 0;

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-amber-400" /> Bank Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verified bank accounts are required for INR (₹) withdrawals.
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          disabled={hasVerified}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold"
          data-testid="button-add-bank"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Bank Account
        </Button>
      </div>

      {/* Notices */}
      {hasVerified && (
        <Card className="p-3 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-start gap-2 text-sm">
            <Shield className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-emerald-400">You have a verified bank.</span>
              <span className="text-muted-foreground"> To add a different account, remove the verified one first.</span>
            </div>
          </div>
        </Card>
      )}
      {!hasVerified && banks.length === 0 && (
        <Card className="p-3 border-sky-500/30 bg-sky-500/5">
          <div className="flex items-start gap-2 text-sm">
            <Info className="h-4 w-4 text-sky-400 mt-0.5 flex-shrink-0" />
            <div className="text-muted-foreground">
              Add your bank to enable INR withdrawals. Verification typically takes <span className="text-foreground font-medium">2–24 hours</span>. Your name on the bank account must match your KYC name.
            </div>
          </div>
        </Card>
      )}

      {/* List */}
      {banksQ.isLoading ? (
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </Card>
      ) : banksQ.isError ? (
        <Card className="p-4 border-rose-500/30 bg-rose-500/5">
          <div className="flex items-center gap-3 text-rose-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load bank accounts.</span>
            <Button size="sm" variant="outline" onClick={() => banksQ.refetch()}>Retry</Button>
          </div>
        </Card>
      ) : banks.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="text-lg font-semibold mb-1">No bank accounts yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first bank account to start INR withdrawals.</p>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-first-bank">
            <Plus className="h-4 w-4 mr-1.5" /> Add Bank Account
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {banks.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.under_review;
            const StatusIcon = meta.icon;
            return (
              <Card key={b.id} className="p-4 sm:p-5 border-border/60" data-testid={`bank-card-${b.id}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-amber-400">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-base">{b.bankName}</span>
                      {b.isPrimary && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                          <Star className="h-2.5 w-2.5 mr-0.5" /> Primary
                        </Badge>
                      )}
                      <Badge className={`${meta.cls} border text-[10px] font-bold uppercase`}>
                        <StatusIcon className="h-2.5 w-2.5 mr-0.5" /> {meta.label}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono">{fmtAcc(b.accountNumber)}</span>
                      <span className="mx-1.5">·</span>
                      <span className="font-mono">{b.ifsc}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {b.holderName} · Added {new Date(b.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                    {b.status === "rejected" && b.rejectReason && (
                      <p className="text-xs text-rose-400 mt-1">Reason: {b.rejectReason}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmDel(b)} className="text-rose-400 hover:text-rose-300" data-testid={`button-delete-bank-${b.id}`}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Helper card */}
      <Card className="p-4 border-border/60 bg-muted/20">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground mb-1">How verification works</p>
            <ul className="space-y-0.5 list-disc list-inside marker:text-muted-foreground/40">
              <li>Submit your bank details — they go into <span className="text-foreground">Under Review</span>.</li>
              <li>We send a small refundable test deposit (penny-drop) to confirm ownership.</li>
              <li>Once verified you can withdraw to this account. Only one verified bank at a time.</li>
              <li>Need to change banks? Remove the verified one first, then add a new one.</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Add Bank Dialog */}
      <AddBankDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["/banks"] });
          setAddOpen(false);
          setGenericSuccess({ kind: "generic", iconKind: "deposit", accentColor: "emerald", title: "Bank Account Added!", subtitle: "Your bank account is now under review. Verification usually completes within 2–24 hours.", rows: [{ label: "Status", value: "Under Review" }, { label: "Next step", value: "We'll notify you once verified" }], primaryLabel: "Done" });
        }}
      />

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDel} onOpenChange={() => setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.bankName} · {fmtAcc(confirmDel?.accountNumber ?? "")}
              <br />
              You won't be able to withdraw INR to this account anymore. You can re-add it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDel) return;
                try {
                  await del(`/banks/${confirmDel.id}`);
                  qc.invalidateQueries({ queryKey: ["/banks"] });
                  setConfirmDel(null);
                  setGenericSuccess({ kind: "generic", iconKind: "withdraw", accentColor: "rose", title: "Bank Removed", subtitle: "Your bank account has been removed. You can add a new one anytime.", rows: [{ label: "Bank", value: confirmDel?.bankName ?? "" }, { label: "Account", value: confirmDel?.accountNumber ? "••••" + confirmDel.accountNumber.slice(-4) : "" }], primaryLabel: "Done" });
                } catch (e: any) {
                  toast.error(e?.data?.error || e?.message || "Failed to remove bank — try again");
                }
              }}
              className="bg-rose-500 hover:bg-rose-400"
              data-testid="button-confirm-delete-bank"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </div>
  );
}

function AddBankDialog({
  open, onOpenChange, onSuccess,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const [bankName, setBankName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setBankName(""); setHolderName(""); setAccountNumber("");
    setConfirmAccount(""); setIfsc(""); setSubmitting(false);
  };

  const ifscValid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
  const accountsMatch = accountNumber === confirmAccount;
  const acctValid = /^\d{6,20}$/.test(accountNumber.replace(/\s+/g, ""));

  const validation =
    !bankName.trim() ? "Enter your bank's name"
    : !holderName.trim() ? "Account holder name required"
    : !acctValid ? "Account number must be 6-20 digits"
    : !accountsMatch ? "Account numbers don't match"
    : !ifscValid ? "Invalid IFSC code (e.g. SBIN0001234)"
    : null;

  const submit = async () => {
    if (validation) return;
    setSubmitting(true);
    try {
      await post("/banks", {
        bankName: bankName.trim(),
        accountNumber: accountNumber.replace(/\s+/g, ""),
        ifsc: ifsc.toUpperCase(),
        holderName: holderName.trim(),
      });
      reset();
      onSuccess();
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message || "Try again";
      toast.error(msg || "Failed to add bank account");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-400" /> Add Bank Account
          </DialogTitle>
          <DialogDescription>Indian bank accounts only. Name must match your KYC.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="bn">Bank Name</Label>
            <Input id="bn" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. State Bank of India" data-testid="input-bank-name" />
          </div>
          <div>
            <Label htmlFor="hn">Account Holder Name (as per bank)</Label>
            <Input id="hn" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Full name" data-testid="input-holder-name" />
          </div>
          <div>
            <Label htmlFor="an">Account Number</Label>
            <Input id="an" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} placeholder="11 digit account number" data-testid="input-account-number" />
          </div>
          <div>
            <Label htmlFor="anc">Confirm Account Number</Label>
            <Input id="anc" value={confirmAccount} onChange={(e) => setConfirmAccount(e.target.value.replace(/\D/g, ""))} placeholder="Re-enter account number" data-testid="input-account-confirm" />
          </div>
          <div>
            <Label htmlFor="ifsc">IFSC Code</Label>
            <Input id="ifsc" value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" maxLength={11} className="font-mono" data-testid="input-ifsc" />
          </div>

          <Separator />
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200/90 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>We'll send a small refundable test deposit (₹1) to verify ownership. Once verified, this becomes your primary withdrawal account.</span>
          </div>

          {validation && (
            <div className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {validation}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!!validation || submitting} data-testid="button-submit-bank">
            {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add Bank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
