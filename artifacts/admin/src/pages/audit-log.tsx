import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  History, Filter, RefreshCw, User as UserIcon, Activity,
  ShieldAlert, Clock, Search,
} from "lucide-react";

type AuditLog = {
  id: number;
  actorId: number | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: string | null;
  createdAt: string;
  actor: { id: number; email: string; name: string | null; role: string } | null;
};

type Stats = {
  total: number;
  last_24h: number;
  distinct_actors: number;
  distinct_entities: number;
};

function relTime(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Tag the action verb so the table reads at a glance. Destructive verbs (freeze,
// force_cancel, force_logout) get a red pill; reads / passive updates stay neutral.
function actionVariant(action: string): "danger" | "warning" | "info" | "neutral" {
  if (action.includes("freeze") || action.includes("force_cancel") || action.includes("force_logout") || action.includes("disable")) return "danger";
  if (action.includes("unfreeze") || action.includes("approve") || action.includes("update")) return "warning";
  if (action.includes("create") || action.includes("add")) return "info";
  return "neutral";
}

function entityIcon(entity: string) {
  if (entity === "user") return UserIcon;
  if (entity === "order") return Activity;
  return ShieldAlert;
}

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actorIdFilter, setActorIdFilter] = useState("");
  const [entityIdFilter, setEntityIdFilter] = useState("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (actionFilter !== "all") params.set("action", actionFilter);
  if (entityFilter !== "all") params.set("entity", entityFilter);
  if (actorIdFilter.trim()) params.set("actorId", actorIdFilter.trim());
  if (entityIdFilter.trim()) params.set("entityId", entityIdFilter.trim());
  params.set("limit", "300");
  const qs = params.toString();

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<AuditLog[]>({
    queryKey: ["admin-audit-logs", qs],
    queryFn: () => get<AuditLog[]>(`/admin/audit-logs?${qs}`),
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["admin-audit-logs-stats"],
    queryFn: () => get<Stats>("/admin/audit-logs/stats"),
    refetchInterval: 10000,
  });

  // Client-side text filter on action / actor email / entityId so support can
  // narrow without spamming the backend. Backend filters handle precise drill-down.
  const visible = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.trim().toLowerCase();
    return logs.filter((l) =>
      l.action.toLowerCase().includes(q) ||
      l.entity.toLowerCase().includes(q) ||
      (l.entityId ?? "").toLowerCase().includes(q) ||
      (l.actor?.email ?? "").toLowerCase().includes(q) ||
      (l.payload ?? "").toLowerCase().includes(q)
    );
  }, [logs, search]);

  // Pull a unique sorted list of actions present in the current result set so
  // the action filter dropdown is always meaningful (no dead options).
  const knownActions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  const knownEntities = useMemo(() => {
    const set = new Set(logs.map((l) => l.entity));
    return Array.from(set).sort();
  }, [logs]);

  const reset = () => {
    setActionFilter("all"); setEntityFilter("all");
    setActorIdFilter(""); setEntityIdFilter(""); setSearch("");
  };
  const hasFilters =
    actionFilter !== "all" || entityFilter !== "all" ||
    actorIdFilter.trim() !== "" || entityIdFilter.trim() !== "" || search.trim() !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="System & Compliance"
        title="Audit Log"
        description="Tamper-evident record of every admin and operator action — freeze, force-cancel, KYC verify, role change, and more."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-audit">
            <RefreshCw className={cn("w-4 h-4 mr-1.5", isFetching && "animate-spin")} />Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <PremiumStatCard title="Total Events" value={stats?.total ?? "—"} icon={History} hero hint="All time" />
        <PremiumStatCard title="Last 24h" value={stats?.last_24h ?? "—"} icon={Clock} hint="Recent activity" />
        <PremiumStatCard title="Distinct Operators" value={stats?.distinct_actors ?? "—"} icon={UserIcon} hint="Unique actors" />
        <PremiumStatCard title="Entity Types" value={stats?.distinct_entities ?? "—"} icon={ShieldAlert} hint="Surface coverage" />
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="stat-orb w-8 h-8 rounded-md flex items-center justify-center"><Filter className="w-4 h-4 text-amber-300" /></div>
            <div>
              <h3 className="text-sm font-semibold">Filters</h3>
              <p className="text-xs text-muted-foreground">Narrow by action, entity, operator or affected record</p>
            </div>
          </div>
          {hasFilters && <Button size="sm" variant="ghost" onClick={reset} data-testid="button-reset-audit-filters">Reset</Button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger data-testid="select-audit-action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {knownActions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity</Label>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger data-testid="select-audit-entity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {knownEntities.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Actor ID</Label>
            <Input placeholder="e.g. 1" value={actorIdFilter} onChange={(e) => setActorIdFilter(e.target.value)} data-testid="input-audit-actor-id" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity ID</Label>
            <Input placeholder="e.g. 42" value={entityIdFilter} onChange={(e) => setEntityIdFilter(e.target.value)} data-testid="input-audit-entity-id" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quick search</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="email, payload, action…" className="pl-7" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-audit-search" />
            </div>
          </div>
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-[140px]">When</th>
                <th className="text-left font-medium px-4 py-3">Action</th>
                <th className="text-left font-medium px-4 py-3">Entity</th>
                <th className="text-left font-medium px-4 py-3">Actor</th>
                <th className="text-left font-medium px-4 py-3">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && visible.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-3"><EmptyState icon={History} title="No audit events" description="Adjust your filters or wait for admin actions to be recorded." /></td></tr>
              )}
              {!isLoading && visible.map((l) => {
                const Icon = entityIcon(l.entity);
                return (
                  <tr key={l.id} className="hover:bg-muted/20 transition-colors" data-testid={`audit-${l.id}`}>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums" title={new Date(l.createdAt).toLocaleString("en-IN")}>
                      {relTime(l.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill variant={actionVariant(l.action)}>{l.action}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="inline-flex items-center gap-1.5">
                        <Icon className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">{l.entity}</span>
                        {l.entityId && <span className="font-mono text-muted-foreground">#{l.entityId}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {l.actor ? (
                        <div className="flex flex-col">
                          <span className="font-mono truncate max-w-[200px]" title={l.actor.email}>{l.actor.email}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{l.actor.role}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground font-mono max-w-[420px]">
                      {l.payload ? (
                        <details>
                          <summary className="cursor-pointer hover:text-amber-300 truncate">
                            {l.payload.length > 80 ? `${l.payload.slice(0, 80)}…` : l.payload}
                          </summary>
                          <pre className="mt-1.5 whitespace-pre-wrap break-all bg-background/50 border border-border/40 rounded p-2 text-[10px]">
                            {(() => { try { return JSON.stringify(JSON.parse(l.payload), null, 2); } catch { return l.payload; } })()}
                          </pre>
                        </details>
                      ) : (
                        <span className="opacity-50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
          <div>{visible.length} {visible.length === 1 ? "event" : "events"} shown · auto-refresh 10s</div>
          {logs.length >= 300 && <span className="text-amber-400">Showing latest 300 — narrow filters for older events</span>}
        </div>
      </div>
    </div>
  );
}
