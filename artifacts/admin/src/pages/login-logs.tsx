import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScrollText, ShieldCheck, ShieldAlert, Clock, Search, Globe2, Activity, Monitor,
} from "lucide-react";

type Log = {
  id: number; userId: number | null; email: string | null; ip: string | null;
  userAgent: string | null; success: string; reason: string | null; createdAt: string;
};

function uaSummary(ua: string | null): string {
  if (!ua) return "—";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  if (/Postman|curl|insomnia/i.test(ua)) return "API client";
  return ua.slice(0, 40);
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function LoginLogsPage() {
  const { data = [], isLoading } = useQuery<Log[]>({
    queryKey: ["/admin/login-logs"],
    queryFn: () => get<Log[]>("/admin/login-logs"),
    refetchInterval: 30000,
  });

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const total = data.length;
    const success = data.filter(l => l.success === "true").length;
    const failed = total - success;
    const dayMs = 24 * 60 * 60 * 1000;
    const last24h = data.filter(l => Date.now() - new Date(l.createdAt).getTime() < dayMs).length;
    const uniqueIps = new Set(data.map(l => l.ip).filter(Boolean)).size;
    return { total, success, failed, last24h, uniqueIps };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((l) => {
      if (tab === "success" && l.success !== "true") return false;
      if (tab === "failed" && l.success === "true") return false;
      if (!q) return true;
      return [l.email ?? "", l.ip ?? "", l.userAgent ?? "", l.reason ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [data, search, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Security & Audit"
        title="Login Logs"
        description="Audit trail of all login attempts (success + failure). Auto-refreshes every 30s."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PremiumStatCard hero title="Total Attempts" value={stats.total} icon={ScrollText} hint={`${stats.uniqueIps} unique IPs`} />
        <PremiumStatCard title="Successful" value={stats.success} icon={ShieldCheck} accent />
        <PremiumStatCard title="Failed" value={stats.failed} icon={ShieldAlert} />
        <PremiumStatCard title="Last 24h" value={stats.last24h} icon={Clock} />
        <PremiumStatCard title="Unique IPs" value={stats.uniqueIps} icon={Globe2} />
      </div>

      <div className="premium-card rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 border-b border-border/60">
          <Tabs value={tab} onValueChange={setTab} className="w-full md:w-auto">
            <TabsList>
              <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
              <TabsTrigger value="success">Success ({stats.success})</TabsTrigger>
              <TabsTrigger value="failed">Failed ({stats.failed})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative md:ml-auto md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search email, IP, reason…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground border-b border-border/60 bg-muted/20">
              <tr>
                <th className="text-left py-2.5 px-4">When</th>
                <th className="text-left py-2.5 px-4">Email</th>
                <th className="text-left py-2.5 px-4">IP</th>
                <th className="text-left py-2.5 px-4">Device</th>
                <th className="text-left py-2.5 px-4">Result</th>
                <th className="text-left py-2.5 px-4">Reason</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground"><Activity className="w-5 h-5 mx-auto mb-2 animate-pulse" />Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={ScrollText}
                    title={search || tab !== "all" ? "No matching logs" : "No login activity yet"}
                    description={search || tab !== "all" ? "Try a different filter or search term." : "Login attempts will appear here as users sign in."}
                  />
                </td></tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0 border-border/40 hover:bg-muted/20 transition-colors">
                  <td className="py-2.5 px-4">
                    <div className="text-xs">{new Date(l.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                    <div className="text-[10px] text-muted-foreground">{relTime(l.createdAt)}</div>
                  </td>
                  <td className="py-2.5 px-4 text-xs">{l.email || <span className="text-muted-foreground">—</span>}</td>
                  <td className="py-2.5 px-4 font-mono text-[11px]">{l.ip || "—"}</td>
                  <td className="py-2.5 px-4">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={l.userAgent ?? ""}>
                      <Monitor className="w-3 h-3" />{uaSummary(l.userAgent)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusPill variant={l.success === "true" ? "success" : "danger"}>
                      {l.success === "true" ? "Success" : "Failed"}
                    </StatusPill>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-muted-foreground max-w-[260px] truncate">{l.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
