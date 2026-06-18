import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Globe, Key, Shield, CheckCircle2, AlertTriangle, RefreshCw, LogIn,
  Eye, EyeOff, Zap, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BrokerConfig = {
  id: number; broker: string; apiKey: string | null; clientId: string | null;
  enabled: boolean; sandboxMode: boolean; lastLoginAt: string | null;
  jwtExpiresAt: string | null; createdAt: string;
};

export default function BrokerConfigPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ config: BrokerConfig | null }>({
    queryKey: ["admin-broker-config"],
    queryFn: () => get("/admin/broker-config"),
  });

  const config = data?.config ?? null;

  const [form, setForm] = useState({
    broker: "angelone",
    apiKey: "",
    clientId: "",
    totpSecret: "",
    enabled: false,
    sandboxMode: true,
  });
  const [showSecret, setShowSecret] = useState(false);
  const [loginForm, setLoginForm] = useState({ password: "", totp: "" });
  const [showLoginPanel, setShowLoginPanel] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (body: object) => post("/admin/broker-config", body),
    onSuccess: () => {
      toast({ title: "Broker config saved" });
      qc.invalidateQueries({ queryKey: ["admin-broker-config"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const loginMutation = useMutation({
    mutationFn: (body: object) => post("/admin/broker-config/login", body),
    onSuccess: (d: { message: string; expiresAt: string }) => {
      toast({ title: "Logged in to Angel One", description: `Token valid until ${new Date(d.expiresAt).toLocaleString()}` });
      setShowLoginPanel(false);
      setLoginForm({ password: "", totp: "" });
      qc.invalidateQueries({ queryKey: ["admin-broker-config"] });
    },
    onError: (e: Error) => toast({ title: "Login failed", description: e.message, variant: "destructive" }),
  });

  const isTokenValid = config?.jwtExpiresAt && new Date(config.jwtExpiresAt) > new Date();

  const handleSave = () => {
    const payload: Record<string, unknown> = { broker: form.broker, enabled: form.enabled, sandboxMode: form.sandboxMode };
    if (form.apiKey) payload.apiKey = form.apiKey;
    if (form.clientId) payload.clientId = form.clientId;
    if (form.totpSecret) payload.totpSecret = form.totpSecret;
    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Broker Configuration"
        description="Angel One SmartAPI — Forex, Stocks & Commodities integration"
      />

      {/* Status card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={cn("rounded-xl border p-4 flex items-start gap-3",
          config?.enabled ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/3")}>
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            config?.enabled ? "bg-emerald-500/20" : "bg-white/10")}>
            {config?.enabled ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
          </div>
          <div>
            <div className="text-sm font-semibold">Integration Status</div>
            <div className={cn("text-xs mt-0.5", config?.enabled ? "text-emerald-400" : "text-amber-400")}>
              {config?.enabled ? "Active" : "Disabled"}
            </div>
            {config?.sandboxMode && <Badge variant="outline" className="border-blue-400/40 text-blue-400 text-[10px] mt-1">Sandbox Mode</Badge>}
          </div>
        </div>

        <div className={cn("rounded-xl border p-4 flex items-start gap-3",
          isTokenValid ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/3")}>
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            isTokenValid ? "bg-emerald-500/20" : "bg-white/10")}>
            <Key className={cn("w-4 h-4", isTokenValid ? "text-emerald-400" : "text-muted-foreground")} />
          </div>
          <div>
            <div className="text-sm font-semibold">JWT Token</div>
            {isTokenValid ? (
              <div className="text-xs text-emerald-400 mt-0.5">
                Valid until {new Date(config!.jwtExpiresAt!).toLocaleString()}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-0.5">Not authenticated</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/3 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">Last Login</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {config?.lastLoginAt ? new Date(config.lastLoginAt).toLocaleString() : "Never"}
            </div>
          </div>
        </div>
      </div>

      {/* Config form */}
      <div className="rounded-xl border border-white/10 bg-[#0d1117] p-6 space-y-5">
        <div className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-400" />
          Angel One SmartAPI Credentials
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            For Angel One SmartAPI: register at <strong>smartapi.angelbroking.com</strong>.
            Provide your API Key, Client ID, and TOTP Secret. In production mode, live orders will be executed.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Broker</Label>
            <select
              value={form.broker}
              onChange={(e) => setForm((f) => ({ ...f, broker: e.target.value }))}
              className="w-full bg-white/5 border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
            >
              <option value="angelone">Angel One SmartAPI</option>
              <option value="zerodha">Zerodha Kite (coming soon)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client ID</Label>
            <Input
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
              placeholder={config?.clientId ? "••••••••" : "e.g. A123456"}
              className="bg-white/5 border-white/20 text-sm h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder={config?.apiKey ? "••••••••••••••••" : "API Key from Angel One console"}
              className="bg-white/5 border-white/20 text-sm h-9 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">TOTP Secret (for auto-login)</Label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                value={form.totpSecret}
                onChange={(e) => setForm((f) => ({ ...f, totpSecret: e.target.value }))}
                placeholder="TOTP base32 secret"
                className="bg-white/5 border-white/20 text-sm h-9 font-mono pr-9"
              />
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
            <Label className="text-sm cursor-pointer">Enable Broker Integration</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.sandboxMode}
              onCheckedChange={(v) => setForm((f) => ({ ...f, sandboxMode: v }))}
            />
            <Label className="text-sm cursor-pointer">
              Sandbox Mode <span className="text-xs text-muted-foreground">(simulated orders, no real execution)</span>
            </Label>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-amber-500 hover:bg-amber-600 text-black font-bold">
            {saveMutation.isPending ? "Saving..." : "Save Config"}
          </Button>
          <Button variant="outline" onClick={() => setShowLoginPanel(!showLoginPanel)} className="border-white/20">
            <LogIn className="w-4 h-4 mr-2" />
            Login to Angel One
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Login panel */}
        {showLoginPanel && (
          <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 space-y-3">
            <div className="text-sm font-semibold text-amber-400">Angel One Login</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Trading Password</Label>
                <Input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Angel One password"
                  className="bg-white/5 border-white/20 text-sm h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Current TOTP Code</Label>
                <Input
                  value={loginForm.totp}
                  onChange={(e) => setLoginForm((f) => ({ ...f, totp: e.target.value }))}
                  placeholder="6-digit TOTP"
                  className="bg-white/5 border-white/20 text-sm h-9 font-mono"
                />
              </div>
            </div>
            <Button
              onClick={() => loginMutation.mutate(loginForm)}
              disabled={loginMutation.isPending || !loginForm.password || !loginForm.totp}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
            >
              {loginMutation.isPending ? "Logging in..." : "Authenticate"}
            </Button>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-white/10 bg-[#0d1117] p-6 space-y-4">
        <div className="text-sm font-semibold text-white/80">Setup Guide</div>
        <ol className="space-y-3 text-sm text-muted-foreground">
          {[
            "Create an Angel One account at smartapi.angelbroking.com",
            "Create an app in Developer Console to get your API Key",
            "Enable TOTP 2FA and copy the Secret key",
            "Fill in your Client ID, API Key, and TOTP Secret in the form above",
            "Save, then authenticate using 'Login to Angel One'",
            "Turn Sandbox Mode OFF when you are ready for live trading",
            "Admin → Forex / Stocks / Commodities — all instruments will connect automatically",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
