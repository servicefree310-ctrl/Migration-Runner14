import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Bell, AlertTriangle, Info, AlertCircle, CheckCircle2, XCircle, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Broadcast = {
  id: number; title: string; body: string; kind: string;
  ctaLabel: string; ctaUrl: string; audience: string; isActive: boolean;
  startsAt: string | null; endsAt: string | null; createdAt: string;
};

const KIND_META: Record<string, { icon: any; cls: string; label: string }> = {
  info:    { icon: Info,        cls: "bg-sky-500/15 border-sky-500/40 text-sky-200",        label: "Info" },
  success: { icon: CheckCircle2,cls: "bg-emerald-500/15 border-emerald-500/40 text-emerald-200", label: "Success" },
  warning: { icon: AlertCircle, cls: "bg-amber-500/15 border-amber-500/40 text-amber-200",  label: "Warning" },
  danger:  { icon: XCircle,     cls: "bg-rose-500/15 border-rose-500/40 text-rose-200",     label: "Danger" },
};

const blank = (): Partial<Broadcast> => ({
  title: "", body: "", kind: "info", ctaLabel: "", ctaUrl: "",
  audience: "all", isActive: true, startsAt: null, endsAt: null,
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch { return d; }
}
function toLocalInputValue(d: string | null): string {
  if (!d) return "";
  try { const dt = new Date(d); return new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16); } catch { return ""; }
}

export default function NotificationsBroadcastPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery<Broadcast[]>({
    queryKey: ["/admin/broadcast-notifications"],
    queryFn: () => get<Broadcast[]>("/admin/broadcast-notifications"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Broadcast> | null>(null);
  const [deleteFor, setDeleteFor] = useState<Broadcast | null>(null);

  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/broadcast-notifications"] });
  const save = useMutation({
    mutationFn: (b: Partial<Broadcast>) => b.id ? patch(`/admin/broadcast-notifications/${b.id}`, b) : post("/admin/broadcast-notifications", b),
    onSuccess: (_d, v) => { inv(); setOpen(false); setEditing(null); toast({ title: v.id ? "Updated" : "Sent live", description: v.title }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(`/admin/broadcast-notifications/${id}`, body),
    onSuccess: () => inv(),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/broadcast-notifications/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Deleted" }); },
  });

  const stats = useMemo(() => ({
    total: data.length,
    active: data.filter(b => b.isActive).length,
    inactive: data.filter(b => !b.isActive).length,
  }), [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CMS"
        title="Notifications (Broadcast)"
        description="Push platform-wide notifications to user-portal header bell + in-app banners. Active items are shown to all matching audience members live."
        actions={<Button onClick={() => { setEditing(blank()); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1.5" />New broadcast</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <PremiumStatCard hero title="Total" value={stats.total} icon={Bell} />
        <PremiumStatCard title="Active" value={stats.active} icon={Eye} accent />
        <PremiumStatCard title="Inactive" value={stats.inactive} icon={EyeOff} />
      </div>

      <div className="grid gap-3">
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div>
        : data.length === 0 ? <EmptyState icon={Bell} title="No broadcasts yet" description="Click 'New broadcast' to send a platform-wide notification." />
        : data.map(b => {
          const meta = KIND_META[b.kind] ?? KIND_META.info;
          const Icon = meta.icon;
          return (
            <div key={b.id} className={cn("premium-card rounded-xl p-4", !b.isActive && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border", meta.cls)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill variant={b.kind === "danger" ? "danger" : b.kind === "warning" ? "warning" : b.kind === "success" ? "success" : "info"}>{meta.label}</StatusPill>
                    <StatusPill variant="neutral">audience: {b.audience}</StatusPill>
                    {!b.isActive && <StatusPill variant="neutral">Inactive</StatusPill>}
                    <span className="text-[11px] text-muted-foreground ml-auto">{fmtDate(b.createdAt)}</span>
                  </div>
                  <div className="font-semibold mt-1.5">{b.title}</div>
                  {b.body && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{b.body}</div>}
                  {b.ctaLabel && <div className="text-xs text-amber-300 mt-2">→ {b.ctaLabel}{b.ctaUrl && <span className="text-muted-foreground ml-1">({b.ctaUrl})</span>}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">Window: {fmtDate(b.startsAt)} → {fmtDate(b.endsAt)}</div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Switch checked={b.isActive} onCheckedChange={(v) => toggle.mutate({ id: b.id, body: { isActive: v } })} aria-label="Active" />
                  <div className="flex">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(b); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-300" onClick={() => setDeleteFor(b)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit broadcast" : "New broadcast"}</DialogTitle>
            <DialogDescription>Sent to user-portal bell + banner. Limit windows so they auto-expire.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title *</Label>
                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Scheduled maintenance — 2 AM IST" />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea rows={3} value={editing.body || ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="Trading paused for 30 min during database upgrade." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kind</Label>
                  <select className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="danger">Danger</option>
                  </select>
                </div>
                <div>
                  <Label>Audience</Label>
                  <select className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm" value={editing.audience} onChange={(e) => setEditing({ ...editing, audience: e.target.value })}>
                    <option value="all">All visitors</option>
                    <option value="auth">Logged-in only</option>
                    <option value="guest">Guests only</option>
                  </select>
                </div>
                <div>
                  <Label>CTA label</Label>
                  <Input value={editing.ctaLabel || ""} onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })} />
                </div>
                <div>
                  <Label>CTA URL</Label>
                  <Input value={editing.ctaUrl || ""} onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value })} />
                </div>
                <div>
                  <Label>Starts at</Label>
                  <Input type="datetime-local" value={toLocalInputValue(editing.startsAt ?? null)} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value || null })} />
                </div>
                <div>
                  <Label>Ends at</Label>
                  <Input type="datetime-local" value={toLocalInputValue(editing.endsAt ?? null)} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value || null })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm pt-1"><Switch checked={editing.isActive !== false} onCheckedChange={(b) => setEditing({ ...editing, isActive: b })} /> Active</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.title || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-300" />Delete broadcast?</DialogTitle>
            <DialogDescription>"{deleteFor?.title}" will be removed permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteFor && remove.mutate(deleteFor.id)} disabled={remove.isPending}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
