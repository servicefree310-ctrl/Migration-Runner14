import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Smartphone, Monitor, Tablet, Users, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type PushStats = {
  active_tokens: string;
  total_tokens: string;
  registered_users: string;
  web_tokens: string;
  android_tokens: string;
  ios_tokens: string;
};

type DeviceToken = {
  id: number;
  user_id: number;
  name: string | null;
  email: string | null;
  platform: string;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
};

type BroadcastResult = {
  sent: number;
  failed: number;
  total: number;
};

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }); }
  catch { return d; }
}

function PlatformIcon({ p }: { p: string }) {
  if (p === "android") return <Smartphone className="h-4 w-4 text-emerald-400" />;
  if (p === "ios") return <Tablet className="h-4 w-4 text-sky-400" />;
  return <Monitor className="h-4 w-4 text-purple-400" />;
}

export default function PushNotificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useQuery<PushStats>({
    queryKey: ["/admin/push/stats"],
    queryFn: () => get<PushStats>("/admin/push/stats"),
    refetchInterval: 30000,
  });

  const { data: tokens = [], isLoading } = useQuery<DeviceToken[]>({
    queryKey: ["/admin/push/device-tokens"],
    queryFn: () => get<DeviceToken[]>("/admin/push/device-tokens"),
  });

  const [form, setForm] = useState({ title: "", body: "", imageUrl: "", platform: "all" });
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const broadcastMut = useMutation({
    mutationFn: () => post<BroadcastResult>("/admin/push/broadcast", {
      title: form.title,
      body: form.body,
      ...(form.imageUrl ? { imageUrl: form.imageUrl } : {}),
      ...(form.platform !== "all" ? { platform: form.platform } : {}),
    }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["/admin/push/stats"] });
      toast({ title: "Broadcast sent!", description: `${data.sent} delivered, ${data.failed} failed out of ${data.total}` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Broadcast failed", description: e.message }),
  });

  const activeCount = Number(stats?.active_tokens ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Push Notifications"
        description="Send FCM push notifications to registered mobile and web devices"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <PremiumStatCard title="Active Tokens" value={stats?.active_tokens ?? "—"} icon={Bell} accent />
        <PremiumStatCard title="Total Tokens" value={stats?.total_tokens ?? "—"} icon={Bell} />
        <PremiumStatCard title="Registered Users" value={stats?.registered_users ?? "—"} icon={Users} />
        <PremiumStatCard title="Web" value={stats?.web_tokens ?? "—"} icon={Monitor} />
        <PremiumStatCard title="Android" value={stats?.android_tokens ?? "—"} icon={Smartphone} />
        <PremiumStatCard title="iOS" value={stats?.ios_tokens ?? "—"} icon={Tablet} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Broadcast composer */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-amber-400" /> Send Broadcast</h3>

          {activeCount === 0 && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
              No active device tokens registered yet. Configure FCM Server Key in Admin → Settings (push.fcmKey) and ensure the mobile app registers tokens.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Platform</Label>
              <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms ({activeCount} tokens)</SelectItem>
                  <SelectItem value="web">Web ({stats?.web_tokens ?? 0})</SelectItem>
                  <SelectItem value="android">Android ({stats?.android_tokens ?? 0})</SelectItem>
                  <SelectItem value="ios">iOS ({stats?.ios_tokens ?? 0})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Title *</Label>
              <Input placeholder="e.g. New listing: PEPE/INR" value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-9" />
            </div>

            <div>
              <Label className="text-xs mb-1 block">Body *</Label>
              <Textarea placeholder="Notification body text..." value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={3} />
            </div>

            <div>
              <Label className="text-xs mb-1 block">Image URL (optional)</Label>
              <Input placeholder="https://... (banner image for rich notification)" value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="h-9" />
            </div>

            <Button
              className="w-full"
              disabled={!form.title || !form.body || broadcastMut.isPending}
              onClick={() => broadcastMut.mutate()}
            >
              {broadcastMut.isPending ? (
                <><span className="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Sending...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" /> Send to {form.platform === "all" ? activeCount : Number(stats?.[`${form.platform}_tokens` as keyof PushStats] ?? 0)} Devices</>
              )}
            </Button>

            {result && (
              <div className={cn(
                "rounded-md p-3 text-xs border flex items-start gap-2",
                result.failed === 0 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"
              )}>
                {result.failed === 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                <span>
                  Sent to <strong>{result.total}</strong> devices: <strong className="text-emerald-300">{result.sent}</strong> delivered,{" "}
                  <strong className={result.failed > 0 ? "text-rose-400" : ""}>{result.failed}</strong> failed.
                  {result.failed > 0 && " Invalid tokens were automatically deactivated."}
                </span>
              </div>
            )}
          </div>

          {/* FCM setup instructions */}
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-medium mb-2 text-muted-foreground">FCM Setup:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Go to <strong className="text-foreground">Firebase Console</strong> → Project Settings → Cloud Messaging</li>
              <li>Copy the <strong className="text-foreground">Server Key</strong> (Legacy)</li>
              <li>Paste it in <strong className="text-foreground">Admin → Settings → push.fcmKey</strong></li>
              <li>Mobile app calls <code className="bg-muted px-1 rounded">POST /api/push/register-token</code> on login</li>
            </ol>
          </div>
        </div>

        {/* Device token list */}
        <div className="rounded-lg border border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Registered Devices</h3>
            <span className="text-xs text-muted-foreground">{tokens.length} shown</span>
          </div>
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="flex-1">
              <EmptyState icon={Bell} title="No devices registered" description="Users need to allow push notifications in the app." />
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px]">
              {tokens.map(t => (
                <div key={t.id} className={cn(
                  "flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/20",
                  !t.is_active && "opacity-40"
                )}>
                  <PlatformIcon p={t.platform} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{t.name || `User #${t.user_id}`}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.email || `ID: ${t.user_id}`}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn("text-xs px-1.5 py-0.5 rounded font-medium", t.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground")}>
                      {t.is_active ? "Active" : "Inactive"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(t.last_seen_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
