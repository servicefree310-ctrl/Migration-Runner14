import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, Circle, ChevronRight, ChevronLeft, Upload, AlertCircle,
  Clock, XCircle, User, Building2, CreditCard, FileText, Shield,
  Link2, Unlink, RefreshCw, Eye, EyeOff, Wifi, WifiOff, Zap,
} from "lucide-react";

const API = "/api";
const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh"];
const OCCUPATIONS = ["Salaried","Self Employed","Business","Professional","Retired","Student","Housewife","Other"];
const INCOME_RANGES = ["Below 1 Lakh","1-5 Lakh","5-10 Lakh","10-25 Lakh","25-50 Lakh","50 Lakh - 1 Crore","Above 1 Crore"];

const STEPS = [
  { id: 1, label: "Personal Info", icon: User },
  { id: 2, label: "Contact & Address", icon: Building2 },
  { id: 3, label: "Bank Details", icon: CreditCard },
  { id: 4, label: "KYC Documents", icon: FileText },
  { id: 5, label: "Segments & Nominee", icon: Shield },
];

const KYC_DOCS = [
  { type: "pan_card", label: "PAN Card", required: true, hint: "Clear photo of PAN card" },
  { type: "aadhar_front", label: "Aadhaar Front", required: true, hint: "Front side of Aadhaar card" },
  { type: "aadhar_back", label: "Aadhaar Back", required: true, hint: "Back side of Aadhaar card" },
  { type: "photo", label: "Passport Photo", required: true, hint: "Recent passport size photo" },
  { type: "signature", label: "Signature", required: true, hint: "Signature on white paper" },
  { type: "cancelled_cheque", label: "Cancelled Cheque", required: true, hint: "Cancelled cheque of your bank account" },
  { type: "bank_proof", label: "Bank Statement", required: false, hint: "Last 3 months bank statement (optional)" },
  { type: "income_proof", label: "Income Proof", required: false, hint: "Salary slip / ITR (optional, required for F&O)" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; icon: any }> = {
    draft: { color: "text-muted-foreground bg-muted", label: "Draft", icon: Circle },
    submitted: { color: "text-blue-400 bg-blue-900/30", label: "Under Review", icon: Clock },
    under_review: { color: "text-yellow-400 bg-yellow-900/30", label: "Under Review", icon: Clock },
    approved: { color: "text-green-400 bg-green-900/30", label: "Approved", icon: CheckCircle },
    active: { color: "text-green-400 bg-green-900/30", label: "Active", icon: CheckCircle },
    rejected: { color: "text-red-400 bg-red-900/30", label: "Rejected", icon: XCircle },
  };
  const s = map[status] ?? map.draft;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${s.color}`}>
      <Icon size={12} /> {s.label}
    </span>
  );
}

// ─── Connect Existing Account Panel ──────────────────────────────────────────
function ConnectExistingAccount({ account, onConnected }: { account: any; onConnected: () => void }) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState(account?.angelClientId ?? "");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fullName, setFullName] = useState(account?.fullName ?? "");
  const [mobile, setMobile] = useState(account?.mobile ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [panNumber, setPanNumber] = useState(account?.panNumber ?? "");

  const isConnected = account?.status === "active" && account?.angelClientId;

  const connectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/broker/account/connect`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, password, totp: totp || undefined, apiKey: apiKey || undefined, fullName, mobile, email, panNumber }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Connection failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broker-account"] });
      onConnected();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/broker/account/disconnect`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broker-account"] });
      setPassword("");
      setTotp("");
    },
  });

  const { data: tokenData, refetch: refreshToken } = useQuery({
    queryKey: ["broker-token-status"],
    enabled: isConnected,
    queryFn: async () => {
      const r = await fetch(`${API}/broker/account/refresh-token`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  if (isConnected) {
    const simulated = tokenData?.simulated ?? true;
    return (
      <div className="space-y-4">
        {/* Connected status card */}
        <div className="bg-green-900/20 border border-green-700/40 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-900/40 flex items-center justify-center">
                <Link2 size={18} className="text-green-400" />
              </div>
              <div>
                <div className="text-green-400 font-bold text-sm flex items-center gap-2">
                  Angel One Account Connected
                  {simulated
                    ? <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Simulated</span>
                    : <span className="text-xs font-normal text-green-300 bg-green-900/30 px-2 py-0.5 rounded-full flex items-center gap-1"><Wifi size={10} />Live</span>}
                </div>
                <div className="text-foreground font-semibold mt-0.5">{account.fullName ?? "Account Holder"}</div>
              </div>
            </div>
            <button onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 border border-red-800/40 hover:border-red-700 px-3 py-1.5 rounded-lg transition-all">
              <Unlink size={12} /> {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Client ID", value: account.angelClientId },
              { label: "Demat A/C", value: account.angelDemat },
              { label: "Trading ID", value: account.angelTradingId },
              { label: "Token", value: tokenData?.tokenValid ? "Valid" : "Expiring", color: tokenData?.tokenValid ? "text-green-400" : "text-yellow-400" },
            ].map(item => (
              <div key={item.label} className="bg-black/30 rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                <div className={`text-sm font-bold font-mono ${item.color ?? "text-primary"}`}>{item.value ?? "—"}</div>
              </div>
            ))}
          </div>

          {tokenData && (
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>
                Token expires: {tokenData.expiresAt ? new Date(tokenData.expiresAt).toLocaleString("en-IN") : "—"}
                {tokenData.expiresInMinutes > 0 && ` (${Math.floor(tokenData.expiresInMinutes / 60)}h ${tokenData.expiresInMinutes % 60}m)`}
              </span>
              <button onClick={() => refreshToken()} className="flex items-center gap-1 text-primary hover:text-primary/80">
                <RefreshCw size={10} /> Refresh
              </button>
            </div>
          )}
        </div>

        {/* Mode info */}
        {simulated && (
          <div className="bg-yellow-900/15 border border-yellow-800/40 rounded-xl p-4 flex items-start gap-3">
            <WifiOff size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-yellow-300 font-semibold text-sm">Running in Simulated Mode</div>
              <div className="text-muted-foreground text-xs mt-1">
                Orders are filled using live price data but not sent to Angel One. To enable live trading,
                provide your Angel One SmartAPI key below and reconnect.
              </div>
              <button onClick={() => setShowAdvanced(true)} className="text-primary text-xs hover:underline mt-1.5 inline-block">
                Add API Key for Live Trading →
              </button>
            </div>
          </div>
        )}

        {simulated && showAdvanced && (
          <div className="bg-background border border-border rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold text-foreground mb-2">Reconnect with SmartAPI Key</div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">SmartAPI Key <span className="text-muted-foreground/60">(from smartapi.angelbroking.com)</span></label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Your Angel One SmartAPI key"
                className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">MPIN / Password</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Angel One MPIN or password"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none pr-10" />
                <button onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">TOTP <span className="text-muted-foreground/60">(if 2FA enabled)</span></label>
              <input value={totp} onChange={e => setTotp(e.target.value)} placeholder="6-digit TOTP code"
                maxLength={6} className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
            </div>
            <button onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending || !password}
              className="w-full bg-primary text-black py-2.5 rounded-xl font-bold text-sm hover:bg-primary/80 disabled:opacity-50">
              {connectMutation.isPending ? "Reconnecting..." : "Reconnect with Live Trading"}
            </button>
            {connectMutation.isError && (
              <div className="text-red-400 text-xs">{(connectMutation.error as Error).message}</div>
            )}
          </div>
        )}

        {/* Quick links */}
        <div className="flex gap-3 pt-2">
          <Link href="/broker/dashboard" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-black font-bold text-sm hover:bg-primary/80">
            <Zap size={14} /> Go to Dashboard
          </Link>
          <Link href="/forex" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-card text-foreground font-semibold text-sm hover:bg-muted">
            Start Trading →
          </Link>
        </div>
      </div>
    );
  }

  // ── Not yet connected — show connect form ──────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="bg-blue-900/15 border border-blue-800/40 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-blue-300 text-xs">
          Enter your existing Angel One Client ID and MPIN to link your account instantly.
          You can start trading in simulated mode even without an API key.
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Angel One Client ID <span className="text-red-400">*</span></label>
          <input value={clientId} onChange={e => setClientId(e.target.value.toUpperCase())}
            placeholder="e.g. A123456"
            className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none uppercase" />
          <div className="text-xs text-muted-foreground mt-1">Find your Client ID on the Angel One app → Profile → My Account</div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">MPIN / Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Your Angel One MPIN or password"
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none pr-10" />
            <button onClick={() => setShowPass(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/80">
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">TOTP Code <span className="text-muted-foreground">(if 2FA is enabled on your account)</span></label>
          <input value={totp} onChange={e => setTotp(e.target.value)}
            placeholder="6-digit code from authenticator app"
            maxLength={6}
            className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
        </div>

        {/* Profile prefill */}
        <div className="border-t border-border pt-4">
          <button onClick={() => setShowAdvanced(s => !s)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
            <ChevronRight size={12} className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} />
            Profile &amp; API Key (optional)
          </button>
          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">SmartAPI Key</label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)}
                  placeholder="For live order execution"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-xs font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Full Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="As per Angel One KYC"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Mobile</label>
                <input value={mobile} onChange={e => setMobile(e.target.value)}
                  placeholder="Registered mobile"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Registered email"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">PAN Number</label>
                <input value={panNumber} onChange={e => setPanNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. ABCDE1234F"
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-xs font-mono focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending || !clientId || !password}
        className="w-full bg-primary text-black py-3.5 rounded-xl font-bold text-sm hover:bg-primary/80 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
        <Link2 size={16} />
        {connectMutation.isPending ? "Connecting..." : "Connect Angel One Account"}
      </button>

      {connectMutation.isError && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
          <XCircle size={14} /> {(connectMutation.error as Error).message}
        </div>
      )}

      {connectMutation.isSuccess && (
        <div className="bg-green-900/20 border border-green-800/40 rounded-xl p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle size={14} /> {connectMutation.data?.message}
        </div>
      )}

      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="text-xs font-semibold text-foreground/80 mb-2 flex items-center gap-2">
          <AlertCircle size={12} className="text-primary" /> Where to find your credentials
        </div>
        <ul className="text-xs text-muted-foreground space-y-1.5">
          <li>• <b className="text-foreground/80">Client ID</b>: Angel One app → Profile icon → My Account Details</li>
          <li>• <b className="text-foreground/80">MPIN</b>: 4-digit MPIN used to log in to Angel One app</li>
          <li>• <b className="text-foreground/80">TOTP</b>: 6-digit code from Google Authenticator (if enabled)</li>
          <li>• <b className="text-foreground/80">SmartAPI Key</b>: <a href="https://smartapi.angelbroking.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">smartapi.angelbroking.com</a> → Create App</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Main BrokerOnboarding Component ─────────────────────────────────────────
export default function BrokerOnboarding() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"choose" | "new" | "connect">("choose");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, any>>({
    segmentEquity: true, segmentFno: false, segmentCommodity: true, segmentCurrency: false,
  });
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["broker-account"],
    queryFn: async () => {
      const r = await fetch(`${API}/broker/account`, { credentials: "include" });
      if (!r.ok) throw new Error("Unauthorized");
      return r.json();
    },
  });

  useEffect(() => {
    if (data?.account) {
      const a = data.account;
      setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null)) }));
      // Auto-pick mode based on account status
      if (a.status === "active" || a.status === "submitted" || a.status === "under_review") {
        if (a.angelClientId) setMode("connect"); // connected account
        else setMode("new"); // submitted via onboarding form
      }
    }
    if (data?.kyc) {
      const status: Record<string, string> = {};
      for (const doc of data.kyc) status[doc.docType] = doc.status;
      setUploadStatus(status);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const r = await fetch(`${API}/broker/account`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-account"] }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/broker/account/submit`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Submit failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broker-account"] }),
  });

  const kycMutation = useMutation({
    mutationFn: async ({ docType, fileUrl }: { docType: string; fileUrl: string }) => {
      const r = await fetch(`${API}/broker/account/kyc`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, fileUrl }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      return r.json();
    },
    onSuccess: (_, { docType }) => {
      setUploadStatus(s => ({ ...s, [docType]: "pending" }));
      qc.invalidateQueries({ queryKey: ["broker-account"] });
    },
  });

  function set(key: string, val: any) { setForm(f => ({ ...f, [key]: val })); }
  function inp(key: string, placeholder?: string, type = "text") {
    return (
      <input type={type} value={form[key] ?? ""} onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none" />
    );
  }
  function sel(key: string, opts: string[], placeholder = "Select") {
    return (
      <select value={form[key] ?? ""} onChange={e => set(key, e.target.value)}
        className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none">
        <option value="">{placeholder}</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  function lbl(text: string, required = false) {
    return <label className="block text-xs text-muted-foreground mb-1">{text}{required && <span className="text-red-400 ml-1">*</span>}</label>;
  }

  async function handleFileUpload(docType: string, file: File) {
    setUploadStatus(s => ({ ...s, [docType]: "uploading" }));
    const reader = new FileReader();
    reader.onloadend = () => {
      const fileUrl = reader.result as string;
      kycMutation.mutate({ docType, fileUrl });
    };
    reader.readAsDataURL(file);
  }

  async function handleNext() {
    await saveMutation.mutateAsync(form);
    setStep(s => Math.min(s + 1, STEPS.length));
  }

  const account = data?.account;
  const isReadonly = account?.status && !["draft", "rejected"].includes(account.status);
  const isActive = account?.status === "active";

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-background px-4 py-3 flex items-center gap-3">
        <Link href="/forex" className="text-muted-foreground hover:text-foreground text-sm">← Trading</Link>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-sm font-semibold text-primary">Angel One Account</span>
        {account && <StatusBadge status={account.status} />}
        {mode !== "choose" && account?.status === "draft" && (
          <button onClick={() => setMode("choose")} className="ml-auto text-xs text-muted-foreground hover:text-foreground/80">
            ← Back to options
          </button>
        )}
      </div>

      {/* Active Account Banner */}
      {isActive && account?.angelClientId && (
        <div className="bg-green-900/20 border-b border-green-800/40 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="text-green-400" size={16} />
            <div className="text-green-300 text-sm font-semibold">
              Connected: <span className="text-primary">{account.angelClientId}</span>
              {account.angelDemat && <> · Demat: <span className="text-foreground">{account.angelDemat}</span></>}
            </div>
          </div>
          <Link href="/broker/dashboard" className="bg-primary text-black px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-primary/80">
            Dashboard →
          </Link>
        </div>
      )}

      {/* Rejected Banner */}
      {account?.status === "rejected" && account.rejectionReason && (
        <div className="bg-red-900/20 border-b border-red-800/40 px-6 py-3 flex items-center gap-3">
          <XCircle className="text-red-400" size={16} />
          <div className="text-red-300 text-sm"><b>Rejected:</b> {account.rejectionReason}</div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* ── MODE CHOOSER ─────────────────────────────────────────────────── */}
        {mode === "choose" && (
          <div>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
                <img src="https://www.angelone.in/favicon.ico" alt="Angel One" className="w-7 h-7" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Angel One Sub-broker</h1>
              <p className="text-muted-foreground text-sm mt-2">Trade Stocks, Forex &amp; Commodities via your Angel One account</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Connect existing */}
              <button onClick={() => setMode("connect")}
                className="group p-6 bg-background border border-primary/40 hover:border-primary rounded-2xl text-left transition-all hover:bg-primary/5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-all">
                  <Link2 size={20} className="text-primary" />
                </div>
                <div className="text-foreground font-bold mb-1">Connect Existing Account</div>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  Already have an Angel One demat account? Link it instantly using your Client ID and MPIN.
                  Start trading in minutes.
                </div>
                <div className="mt-4 flex items-center gap-1 text-primary text-xs font-semibold">
                  Connect now <ChevronRight size={12} />
                </div>
              </button>

              {/* Open new */}
              <button onClick={() => setMode("new")}
                className="group p-6 bg-background border border-border hover:border-border rounded-2xl text-left transition-all hover:bg-card">
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center mb-4 group-hover:bg-muted transition-all">
                  <FileText size={20} className="text-foreground/80" />
                </div>
                <div className="text-foreground font-bold mb-1">Open New Account</div>
                <div className="text-muted-foreground text-xs leading-relaxed">
                  New to Angel One? Open a demat account through us as your Authorized Person (AP).
                  Takes 2-3 business days.
                </div>
                <div className="mt-4 flex items-center gap-1 text-muted-foreground text-xs font-semibold group-hover:text-foreground transition-all">
                  Start application <ChevronRight size={12} />
                </div>
              </button>
            </div>

            {/* Benefits strip */}
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs font-semibold text-foreground/80 mb-3">What you get after connecting</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: "📈", label: "Equity Trading", desc: "NSE/BSE stocks" },
                  { icon: "💱", label: "Forex CFDs", desc: "USD/INR, EUR/USD+" },
                  { icon: "🥇", label: "Commodities", desc: "Gold, Silver, Oil" },
                  { icon: "📊", label: "F&O Trading", desc: "Futures & Options" },
                ].map(b => (
                  <div key={b.label} className="text-center">
                    <div className="text-2xl mb-1">{b.icon}</div>
                    <div className="text-xs font-semibold text-foreground">{b.label}</div>
                    <div className="text-xs text-muted-foreground">{b.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CONNECT EXISTING ACCOUNT ─────────────────────────────────────── */}
        {mode === "connect" && (
          <div className="bg-background border border-border rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-5 flex items-center gap-2">
              <Link2 size={18} className="text-primary" /> Connect Existing Angel One Account
            </h2>
            <ConnectExistingAccount account={account} onConnected={() => {}} />
          </div>
        )}

        {/* ── NEW ACCOUNT APPLICATION ──────────────────────────────────────── */}
        {mode === "new" && (
          <div>
            {/* Progress Steps */}
            <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = step > s.id || (isReadonly && account?.status !== "draft");
                const active = step === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => !isReadonly && setStep(s.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${active ? "bg-primary text-black" : done ? "bg-green-900/30 text-green-400" : "bg-card text-muted-foreground"}`}>
                      <Icon size={12} />
                      {s.label}
                      {done && !active && <CheckCircle size={10} />}
                    </button>
                    {i < STEPS.length - 1 && <ChevronRight size={14} className="text-muted-foreground/50 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>

            <div className="bg-background border border-border rounded-2xl p-6">
              {step === 1 && (
                <div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><User size={18} className="text-primary" /> Personal Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">{lbl("Full Name (as per PAN)", true)}{inp("fullName", "e.g. Rahul Kumar")}</div>
                    <div>{lbl("Date of Birth", true)}{inp("dob", "YYYY-MM-DD", "date")}</div>
                    <div>{lbl("Gender", true)}{sel("gender", ["male","female","other"], "Select Gender")}</div>
                    <div>{lbl("Father's Name", true)}{inp("fatherName", "Father's full name")}</div>
                    <div>{lbl("Mother's Name")}{inp("motherName", "Mother's full name")}</div>
                    <div>{lbl("Marital Status")}{sel("maritalStatus", ["single","married","divorced","widowed"], "Select")}</div>
                    <div>{lbl("Occupation", true)}{sel("occupation", OCCUPATIONS, "Select Occupation")}</div>
                    <div>{lbl("Annual Income")}{sel("annualIncome", INCOME_RANGES, "Select Range")}</div>
                    <div>{lbl("PAN Number", true)}{inp("panNumber", "e.g. ABCDE1234F")}</div>
                    <div>{lbl("Aadhaar Number", true)}{inp("aadharNumber", "12-digit Aadhaar number")}</div>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><Building2 size={18} className="text-primary" /> Contact & Address</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>{lbl("Mobile Number", true)}{inp("mobile", "10-digit mobile number")}</div>
                    <div>{lbl("Email Address", true)}{inp("email", "your@email.com", "email")}</div>
                    <div className="md:col-span-2">
                      {lbl("Residential Address", true)}
                      <textarea value={form.address ?? ""} onChange={e => set("address", e.target.value)}
                        placeholder="Full address"
                        className="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 focus:outline-none resize-none h-20" />
                    </div>
                    <div>{lbl("City", true)}{inp("city", "e.g. Mumbai")}</div>
                    <div>{lbl("State", true)}{sel("state", STATES, "Select State")}</div>
                    <div>{lbl("PIN Code", true)}{inp("pincode", "6-digit PIN")}</div>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><CreditCard size={18} className="text-primary" /> Bank Account Details</h2>
                  <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-3 mb-5 flex items-center gap-2">
                    <AlertCircle size={14} className="text-blue-400 flex-shrink-0" />
                    <p className="text-blue-300 text-xs">Bank account must match your KYC name. Funds will be settled to this account.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>{lbl("Account Number", true)}{inp("bankAccountNo", "Bank account number")}</div>
                    <div>{lbl("IFSC Code", true)}{inp("bankIfsc", "e.g. HDFC0001234")}</div>
                    <div>{lbl("Bank Name", true)}{inp("bankName", "e.g. HDFC Bank")}</div>
                    <div>{lbl("Account Type")}{sel("bankAccountType", ["savings","current"], "Select")}</div>
                  </div>
                </div>
              )}
              {step === 4 && (
                <div>
                  <h2 className="text-lg font-bold mb-2 flex items-center gap-2"><FileText size={18} className="text-primary" /> KYC Documents</h2>
                  <p className="text-muted-foreground text-xs mb-6">Upload clear photos. Max 5MB each. JPG, PNG, PDF accepted.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {KYC_DOCS.map(doc => {
                      const st = uploadStatus[doc.type];
                      const existingDoc = data?.kyc?.find((d: any) => d.docType === doc.type);
                      return (
                        <div key={doc.type} className={`border rounded-xl p-4 ${st === "verified" ? "border-green-700 bg-green-900/10" : st === "rejected" ? "border-red-700 bg-red-900/10" : st === "pending" || existingDoc ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{doc.label} {doc.required && <span className="text-red-400">*</span>}</div>
                              <div className="text-xs text-muted-foreground">{doc.hint}</div>
                            </div>
                            {st === "verified" && <CheckCircle size={14} className="text-green-400 flex-shrink-0" />}
                            {st === "rejected" && <XCircle size={14} className="text-red-400 flex-shrink-0" />}
                            {(st === "pending" || (existingDoc && !st)) && <Clock size={14} className="text-yellow-400 flex-shrink-0" />}
                          </div>
                          {existingDoc?.rejectionNote && <div className="text-red-400 text-xs mb-2">Rejected: {existingDoc.rejectionNote}</div>}
                          {!isReadonly && (
                            <label className="cursor-pointer">
                              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${st === "uploading" ? "bg-gray-700 text-muted-foreground" : "bg-card hover:bg-muted text-foreground/80"}`}>
                                <Upload size={12} />
                                {st === "uploading" ? "Uploading..." : existingDoc ? "Re-upload" : "Upload File"}
                              </div>
                              <input type="file" className="hidden" accept="image/*,.pdf"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(doc.type, f); }} />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {step === 5 && (
                <div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2"><Shield size={18} className="text-primary" /> Trading Segments & Nominee</h2>
                  <div className="mb-6">
                    <div className="text-sm font-semibold text-foreground mb-3">Select Trading Segments</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: "segmentEquity", label: "Equity (Stocks)", desc: "NSE/BSE cash" },
                        { key: "segmentFno", label: "F&O", desc: "Futures & Options" },
                        { key: "segmentCommodity", label: "Commodity", desc: "MCX Gold/Silver/Oil" },
                        { key: "segmentCurrency", label: "Currency", desc: "Forex USD/INR etc." },
                      ].map(seg => (
                        <button key={seg.key} onClick={() => !isReadonly && set(seg.key, !form[seg.key])}
                          className={`p-3 rounded-xl border text-left transition-all ${form[seg.key] ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                          <div className={`w-4 h-4 rounded border mb-2 flex items-center justify-center ${form[seg.key] ? "bg-primary border-primary" : "border-gray-600"}`}>
                            {form[seg.key] && <span className="text-black text-xs">✓</span>}
                          </div>
                          <div className="text-xs font-semibold text-foreground">{seg.label}</div>
                          <div className="text-xs text-muted-foreground">{seg.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-border pt-5">
                    <div className="text-sm font-semibold text-foreground mb-3">Nominee Details (Optional)</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>{lbl("Nominee Name")}{inp("nomineeName", "Full name")}</div>
                      <div>{lbl("Relationship")}{sel("nomineeRelation", ["Spouse","Father","Mother","Son","Daughter","Brother","Sister","Other"], "Select")}</div>
                      <div>{lbl("Nominee DOB")}{inp("nomineeDob", "YYYY-MM-DD", "date")}</div>
                    </div>
                  </div>
                  {!isReadonly && (
                    <div className="mt-6 bg-card rounded-xl p-4">
                      <div className="text-xs text-muted-foreground mb-3">By submitting, you agree to Angel One's terms and authorize us to act as your Authorized Person (AP).</div>
                      {submitMutation.isSuccess ? (
                        <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                          <CheckCircle size={16} /> Application submitted! Review takes 2-3 business days.
                        </div>
                      ) : (
                        <button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}
                          className="w-full bg-primary text-black py-3 rounded-xl font-bold text-sm hover:bg-primary/80 disabled:opacity-50">
                          {submitMutation.isPending ? "Submitting..." : "Submit Application for Review"}
                        </button>
                      )}
                      {submitMutation.isError && <div className="mt-2 text-red-400 text-xs">{(submitMutation.error as Error).message}</div>}
                    </div>
                  )}
                  {account?.status === "submitted" && (
                    <div className="mt-4 bg-blue-900/20 border border-blue-800/40 rounded-xl p-4 flex items-center gap-3">
                      <Clock size={20} className="text-blue-400 flex-shrink-0" />
                      <div>
                        <div className="text-blue-300 font-semibold text-sm">Application Under Review</div>
                        <div className="text-muted-foreground text-xs">Verifying your documents. Typically 2-3 business days. You'll be notified via email.</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
                <button onClick={() => step === 1 ? setMode("choose") : setStep(s => Math.max(1, s - 1))}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card text-foreground/80 text-sm font-semibold hover:bg-muted">
                  <ChevronLeft size={14} /> {step === 1 ? "Back" : "Previous"}
                </button>
                {step < STEPS.length ? (
                  <button onClick={handleNext} disabled={saveMutation.isPending || !!isReadonly}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-black text-sm font-bold hover:bg-primary/80 disabled:opacity-50">
                    {saveMutation.isPending ? "Saving..." : "Save & Continue"} <ChevronRight size={14} />
                  </button>
                ) : (
                  <Link href="/forex" className="px-5 py-2 rounded-lg bg-card text-foreground/80 text-sm font-semibold hover:bg-muted">
                    Go to Trading →
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
