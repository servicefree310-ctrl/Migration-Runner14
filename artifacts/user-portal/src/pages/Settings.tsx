import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings as SettingsIcon, Shield, Lock, Bell, Globe, KeyRound, Loader2,
  Smartphone, Monitor, AlertCircle, CheckCircle2, ShieldAlert, Sun, Moon,
  RefreshCw, Mail, Save, ChevronRight, Trash2, User as UserIcon,
} from "lucide-react";
import ApiKeysTab from "@/components/settings/ApiKeysTab";
import KoinXTab from "@/components/settings/KoinXTab";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { get, post, put, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

type SecurityResp = {
  twoFaEnabled: boolean;
  activeSessions: number;
  sessions: Array<{
    id: number;
    createdAt: string;
    expiresAt: string;
    ip: string | null;
    userAgent: string | null;
  }>;
};

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

function parseUA(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: "Unknown device", browser: "" };
  let device = "Desktop";
  if (/iPhone|iPad|iPod/i.test(ua)) device = "iOS";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Mac OS X/i.test(ua)) device = "macOS";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/Linux/i.test(ua)) device = "Linux";
  let browser = "";
  if (/Chrome\/[\d.]+/i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  return { device, browser };
}

export default function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const securityQ = useQuery<SecurityResp>({
    queryKey: ["/security/me"],
    queryFn: () => get<SecurityResp>("/security/me"),
  });

  // 2FA dialogs
  const [twofaDialog, setTwofaDialog] = useState<null | "enable" | "disable">(null);
  const [pwDialog, setPwDialog] = useState(false);
  const [revokeDialog, setRevokeDialog] = useState(false);

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-amber-400" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account, security, notifications and preferences.
        </p>
      </div>

      <Tabs defaultValue="security" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full lg:w-auto lg:inline-grid">
          <TabsTrigger value="account" data-testid="tab-account"><UserIcon className="h-4 w-4 mr-1.5" />Account</TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security"><Shield className="h-4 w-4 mr-1.5" />Security</TabsTrigger>
          <TabsTrigger value="api-keys" data-testid="tab-api-keys"><KeyRound className="h-4 w-4 mr-1.5" />API keys</TabsTrigger>
          <TabsTrigger value="notifications" data-testid="tab-notifications"><Bell className="h-4 w-4 mr-1.5" />Notifications</TabsTrigger>
          <TabsTrigger value="preferences" data-testid="tab-preferences"><Globe className="h-4 w-4 mr-1.5" />Preferences</TabsTrigger>
          <TabsTrigger value="koinx" data-testid="tab-koinx">
            <span className="font-bold text-[11px] mr-1.5 leading-none">Kx</span>KoinX
          </TabsTrigger>
        </TabsList>

        {/* ─────────────── ACCOUNT ─────────────── */}
        <TabsContent value="account" className="space-y-4 mt-0">
          <Card className="p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><UserIcon className="h-4 w-4" /> Account information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <div className="font-medium mt-1 flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {user?.email ?? "—"}
                  {user?.email && (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[9px]">Verified</Badge>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <div className="font-medium mt-1">{(user as any)?.phone ?? "—"}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">User ID</Label>
                <div className="font-mono text-sm mt-1">{user?.id ?? "—"}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Account type</Label>
                <div className="font-medium mt-1 capitalize">{user?.role ?? "user"}</div>
              </div>
            </div>
            <Separator className="my-4" />
            <p className="text-xs text-muted-foreground">
              Need to change your name, phone, or address? Head over to your <a href="/profile" className="text-amber-400 hover:underline">Profile</a> page.
            </p>
          </Card>

          <Card className="p-5 border-rose-500/20">
            <h2 className="font-semibold mb-3 flex items-center gap-2 text-rose-400"><AlertCircle className="h-4 w-4" /> Danger zone</h2>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Close account</div>
                <p className="text-xs text-muted-foreground mt-0.5">Permanently disable your Zebvix account. All open positions must be closed first.</p>
              </div>
              <Button variant="outline" disabled className="text-rose-400 border-rose-500/30">
                Contact support
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* ─────────────── SECURITY ─────────────── */}
        <TabsContent value="security" className="space-y-4 mt-0">
          {/* 2FA */}
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              <div className={`h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 ${securityQ.data?.twoFaEnabled ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                {securityQ.data?.twoFaEnabled ? <Shield className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">Two-Factor Authentication</h3>
                  {securityQ.data?.twoFaEnabled ? (
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[10px]">ENABLED</Badge>
                  ) : (
                    <Badge className="bg-rose-500/15 text-rose-400 border-transparent text-[10px]">OFF</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Adds an extra step at login by sending a one-time code to your email.
                  Strongly recommended for accounts holding any funds.
                </p>
              </div>
              <Button
                variant={securityQ.data?.twoFaEnabled ? "outline" : "default"}
                onClick={() => setTwofaDialog(securityQ.data?.twoFaEnabled ? "disable" : "enable")}
                className={!securityQ.data?.twoFaEnabled ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 font-semibold" : ""}
                data-testid="button-toggle-2fa"
              >
                {securityQ.data?.twoFaEnabled ? "Disable 2FA" : "Enable 2FA"}
              </Button>
            </div>
          </Card>

          {/* Password */}
          <Card className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
              <div className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-sky-500/15 text-sky-400">
                <Lock className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">Password</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Use a unique password that's at least 8 characters long with a mix of letters, numbers and symbols.
                </p>
              </div>
              <Button variant="outline" onClick={() => setPwDialog(true)} data-testid="button-change-password">
                <KeyRound className="h-4 w-4 mr-1.5" /> Change password
              </Button>
            </div>
          </Card>

          {/* Sessions */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4" /> Active sessions
                  <Badge variant="outline" className="text-[10px]">{securityQ.data?.activeSessions ?? 0}</Badge>
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Devices currently signed into your account.</p>
              </div>
              {(securityQ.data?.sessions?.length ?? 0) > 1 && (
                <Button variant="outline" size="sm" onClick={() => setRevokeDialog(true)} data-testid="button-revoke-sessions">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke other devices
                </Button>
              )}
            </div>

            {securityQ.isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : securityQ.isError ? (
              <p className="text-sm text-rose-400 py-2">Failed to load sessions. <Button variant="link" size="sm" onClick={() => securityQ.refetch()}>Retry</Button></p>
            ) : (
              <div className="space-y-2">
                {(securityQ.data?.sessions ?? []).map((s, idx) => {
                  const ua = parseUA(s.userAgent);
                  const Icon = ua.device === "iOS" || ua.device === "Android" ? Smartphone : Monitor;
                  return (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/40" data-testid={`session-${s.id}`}>
                      <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="font-medium flex items-center gap-2">
                          {ua.device} {ua.browser && `· ${ua.browser}`}
                          {idx === 0 && (
                            <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[9px]">THIS DEVICE</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.ip ?? "Unknown IP"} · Signed in {new Date(s.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(securityQ.data?.sessions ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No active sessions.</p>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ─────────────── API KEYS ─────────────── */}
        <TabsContent value="api-keys" className="space-y-4 mt-0">
          <ApiKeysTab />
        </TabsContent>

        {/* ─────────────── NOTIFICATIONS ─────────────── */}
        <TabsContent value="notifications" className="space-y-4 mt-0">
          <NotificationsTab />
        </TabsContent>

        {/* ─────────────── PREFERENCES ─────────────── */}
        <TabsContent value="preferences" className="space-y-4 mt-0">
          <PreferencesTab />
        </TabsContent>

        {/* ─────────────── KOINX ─────────────── */}
        <TabsContent value="koinx" className="space-y-4 mt-0">
          <KoinXTab />
        </TabsContent>
      </Tabs>

      {/* 2FA dialog */}
      <TwoFaDialog
        mode={twofaDialog}
        email={user?.email ?? ""}
        onOpenChange={(v) => { if (!v) setTwofaDialog(null); }}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["/security/me"] });
          setTwofaDialog(null);
        }}
      />

      {/* Change password dialog */}
      <ChangePasswordDialog open={pwDialog} onOpenChange={setPwDialog} />

      {/* Revoke sessions dialog */}
      <RevokeSessionsDialog
        open={revokeDialog}
        onOpenChange={setRevokeDialog}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["/security/me"] });
          setRevokeDialog(false);
        }}
      />
    </div>
  );
}

// ───────────────── 2FA Dialog (OTP flow) ─────────────────
function TwoFaDialog({
  mode, email, onOpenChange, onSuccess,
}: { mode: null | "enable" | "disable"; email: string; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const [step, setStep] = useState<"send" | "verify">("send");
  const [otpId, setOtpId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  useEffect(() => {
    if (mode === null) {
      setStep("send"); setOtpId(null); setCode(""); setDevCode(null); setLoading(false);
    }
  }, [mode]);

  const sendOtp = async () => {
    setLoading(true);
    try {
      const r = await post<{ otpId: number; devCode?: string; delivered: boolean; message: string }>("/otp/send", {
        channel: "email", purpose: "2fa", recipient: email,
      });
      setOtpId(r.otpId);
      setDevCode(r.devCode ?? null);
      setStep("verify");
      toast.success(r.delivered ? "Code sent to your email" : `Code generated (dev mode): ${r.message}`);
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message;
      toast.error(msg || "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndApply = async () => {
    if (!otpId || !code || code.length !== 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      // 1. Verify OTP
      await post("/otp/verify", { otpId, code });
      // 2. Enable / disable
      const path = mode === "enable" ? "/security/2fa/enable" : "/security/2fa/disable";
      await post(path, { otpId });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: mode === "enable" ? "emerald" : "rose", title: mode === "enable" ? "2FA Enabled!" : "2FA Disabled", subtitle: mode === "enable" ? "Your account is now protected with two-factor authentication. You'll be asked for a code on every sign-in." : "Two-factor authentication has been turned off. Enable it again anytime for extra security.", rows: [], primaryLabel: "Done" });
      onSuccess();
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.error || e.message) : e?.message;
      toast.error(msg || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "enable" ? <Shield className="h-5 w-5 text-emerald-400" /> : <ShieldAlert className="h-5 w-5 text-rose-400" />}
            {mode === "enable" ? "Enable 2FA" : "Disable 2FA"}
          </DialogTitle>
          <DialogDescription>
            {mode === "enable"
              ? "We'll send a 6-digit code to your email to confirm. Enter it below to enable two-factor authentication."
              : "Turning 2FA off lowers your account security. Enter the code we send to confirm."}
          </DialogDescription>
        </DialogHeader>

        {step === "send" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/30 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="font-medium">{email}</div>
            </div>
            <Button onClick={sendOtp} disabled={loading} className="w-full" data-testid="button-send-otp">
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              Send verification code
            </Button>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-3">
            {devCode && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-200/90">
                <span className="font-semibold">Dev code:</span> <span className="font-mono">{devCode}</span> (no SMS/email provider configured)
              </div>
            )}
            <div>
              <Label htmlFor="otp">6-digit code</Label>
              <Input
                id="otp"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="text-center text-2xl font-mono tracking-[0.5em] tabular-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                data-testid="input-otp-code"
              />
            </div>
            <Button variant="link" size="sm" className="w-full" onClick={() => { setStep("send"); setCode(""); setOtpId(null); setDevCode(null); }}>
              <RefreshCw className="h-3 w-3 mr-1" /> Resend code
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step === "verify" && (
            <Button onClick={verifyAndApply} disabled={loading || code.length !== 6} data-testid="button-verify-2fa">
              {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              {mode === "enable" ? "Enable" : "Disable"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}

// ───────────────── Change password dialog ─────────────────
function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);

  useEffect(() => { if (!open) { setCurrent(""); setNext(""); setConfirm(""); setLoading(false); } }, [open]);

  const valid =
    !current ? "Current password required"
    : next.length < 6 ? "New password must be at least 6 characters"
    : next === current ? "New password must differ from current"
    : next !== confirm ? "Passwords don't match"
    : null;

  const submit = async () => {
    if (valid) return;
    setLoading(true);
    try {
      await post("/auth/change-password", { currentPassword: current, newPassword: next });
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "emerald", title: "Password Changed!", subtitle: "Your new password is now active. Use it the next time you sign in.", rows: [], primaryLabel: "Done" });
      onOpenChange(false);
    } catch (e: any) {
      const msg = e instanceof ApiError ? (e.data?.message || e.data?.error || e.message) : e?.message;
      toast.error(msg || "Change failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-amber-400" /> Change Password</DialogTitle>
          <DialogDescription>Enter your current password and a new one.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cur">Current Password</Label>
            <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="input-current-password" />
          </div>
          <div>
            <Label htmlFor="np">New Password</Label>
            <Input id="np" type="password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="input-new-password" />
          </div>
          <div>
            <Label htmlFor="np2">Confirm New Password</Label>
            <Input id="np2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="input-confirm-password" />
          </div>

          {valid && current && next && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> {valid}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!!valid || loading} data-testid="button-submit-password">
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Change Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}

// ───────────────── Revoke sessions dialog ─────────────────
function RevokeSessionsDialog({
  open, onOpenChange, onSuccess,
}: { open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [genericSuccess, setGenericSuccess] = useState<GenericSuccess | null>(null);
  const submit = async () => {
    setLoading(true);
    try {
      const r = await post<{ removed: number }>("/security/sessions/revoke-others", {});
      setGenericSuccess({ kind: "generic", iconKind: "paid", accentColor: "rose", title: "Sessions Revoked!", subtitle: `You've been signed out of ${r.removed} other device${r.removed === 1 ? "" : "s"}. Only your current session remains active.`, rows: [{ label: "Devices removed", value: String(r.removed) }], primaryLabel: "Done" });
      onSuccess();
    } catch (e: any) {
      toast.error(e?.message || "Failed — please try again");
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-rose-400" /> Revoke other devices?</DialogTitle>
          <DialogDescription>
            This will sign out every device except the one you're using right now. Anyone else logged in will need to sign in again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="bg-rose-500 hover:bg-rose-400" data-testid="button-confirm-revoke">
            {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Revoke other sessions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <SuccessModal open={genericSuccess !== null} payload={genericSuccess} onClose={() => setGenericSuccess(null)} />
    </>
  );
}

// ───────────────── Notifications tab (local-storage backed) ─────────────────
function NotificationsTab() {
  const KEY = "zebvix:notif-prefs";
  const defaults = {
    emailLogin: true,
    emailOrders: true,
    emailDeposits: true,
    emailWithdrawals: true,
    emailMarketing: false,
    pushOrders: true,
    pushAlerts: true,
  };
  type Prefs = typeof defaults;
  const [prefs, setPrefs] = useState<Prefs>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...defaults, ...JSON.parse(raw) });
    } catch {/* noop */}
  }, []);

  const update = (k: keyof Prefs, v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {/* noop */}
    toast.success("Preferences saved");
  };

  const Row = ({ k, label, desc }: { k: keyof Prefs; label: string; desc: string }) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={prefs[k]} onCheckedChange={(v) => update(k, v)} data-testid={`switch-${k}`} />
    </div>
  );

  return (
    <Card className="p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-1"><Bell className="h-4 w-4" /> Notification Preferences</h2>
      <p className="text-xs text-muted-foreground mb-4">Saved on this device.</p>

      <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mt-2">Email</div>
      <Separator className="mt-2" />
      <Row k="emailLogin" label="Login alerts" desc="Get an email each time your account is signed into from a new device." />
      <Separator />
      <Row k="emailOrders" label="Order fills" desc="Notify me when my orders fully or partially fill." />
      <Separator />
      <Row k="emailDeposits" label="Deposits" desc="Email confirmation for incoming crypto and INR deposits." />
      <Separator />
      <Row k="emailWithdrawals" label="Withdrawals" desc="Email confirmation for every withdrawal request." />
      <Separator />
      <Row k="emailMarketing" label="Promos & news" desc="Occasional updates about new features and offers." />

      <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mt-6">In-app push</div>
      <Separator className="mt-2" />
      <Row k="pushOrders" label="Order updates" desc="Show in-app toasts when an order status changes." />
      <Separator />
      <Row k="pushAlerts" label="Price alerts" desc="Triggered when a price alert you set is hit." />
    </Card>
  );
}

// ───────────────── Preferences tab ─────────────────
function PreferencesTab() {
  const [language, setLanguage] = useState<string>(() => {
    try { return localStorage.getItem("zebvix:lang") || "en"; } catch { return "en"; }
  });
  const { theme, setTheme } = useTheme();
  const [currency, setCurrency] = useState<string>(() => {
    try { return localStorage.getItem("zebvix:currency") || "INR"; } catch { return "INR"; }
  });

  useEffect(() => { try { localStorage.setItem("zebvix:lang", language); } catch {/* noop */} }, [language]);
  useEffect(() => { try { localStorage.setItem("zebvix:currency", currency); } catch {/* noop */} }, [currency]);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><Globe className="h-4 w-4" /> Display Preferences</h2>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">Language</div>
              <p className="text-xs text-muted-foreground mt-0.5">Used across the interface.</p>
            </div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="sm:w-[200px]" data-testid="select-language"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">Quote currency</div>
              <p className="text-xs text-muted-foreground mt-0.5">Used to display estimated values.</p>
            </div>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="sm:w-[200px]" data-testid="select-currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INR">₹ INR</SelectItem>
                <SelectItem value="USD">$ USD</SelectItem>
                <SelectItem value="EUR">€ EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">Theme</div>
              <p className="text-xs text-muted-foreground mt-0.5">Light theme is experimental.</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                data-testid="button-theme-dark"
              ><Moon className="h-3.5 w-3.5 mr-1" /> Dark</Button>
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                data-testid="button-theme-light"
              ><Sun className="h-3.5 w-3.5 mr-1" /> Light</Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                data-testid="button-theme-system"
              ><Monitor className="h-3.5 w-3.5 mr-1" /> System</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1">Quick links</h2>
        <p className="text-xs text-muted-foreground mb-3">Other common settings live elsewhere in the app.</p>
        <div className="space-y-1">
          {[
            { href: "/profile", label: "Edit profile", icon: <UserIcon className="h-4 w-4" /> },
            { href: "/kyc", label: "KYC verification", icon: <Shield className="h-4 w-4" /> },
            { href: "/banks", label: "Bank accounts", icon: <SettingsIcon className="h-4 w-4" /> },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition group"
              data-testid={`link-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className="flex items-center gap-2.5 text-sm">{l.icon} {l.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
