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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Megaphone, Pin, PinOff, Eye, EyeOff, AlertTriangle,
  Sparkles, Wrench, Shield, Gift, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Announcement = {
  id: number; title: string; body: string; category: string;
  ctaLabel: string; ctaUrl: string; isPinned: boolean; isPublished: boolean;
  publishedAt: string; expiresAt: string | null; position: number;
};

const CATS = [
  { id: "product",     label: "Product",     icon: Sparkles },
  { id: "promotion",   label: "Promotion",   icon: Gift },
  { id: "security",    label: "Security",    icon: Shield },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "listing",     label: "Listing",     icon: ListChecks },
];

const blank = (): Partial<Announcement> => ({
  title: "", body: "", category: "product", ctaLabel: "", ctaUrl: "",
  isPinned: false, isPublished: true, position: 0, expiresAt: null,
});

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch { return d; }
}

function toLocalInputValue(d: string | null): string {
  if (!d) return "";
  try {
    const dt = new Date(d);
    const tz = dt.getTimezoneOffset() * 60000;
    return new Date(dt.getTime() - tz).toISOString().slice(0, 16);
  } catch { return ""; }
}

export default function AnnouncementsCmsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["/admin/announcements"],
    queryFn: () => get<Announcement[]>("/admin/announcements"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [tab, setTab] = useState("all");
  const [deleteFor, setDeleteFor] = useState<Announcement | null>(null);

  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/announcements"] });

  const save = useMutation({
    mutationFn: (a: Partial<Announcement>) => a.id ? patch(`/admin/announcements/${a.id}`, a) : post("/admin/announcements", a),
    onSuccess: (_d, v) => { inv(); setOpen(false); setEditing(null); toast({ title: v.id ? "Updated" : "Created", description: v.title }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(`/admin/announcements/${id}`, body),
    onSuccess: () => inv(),
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/announcements/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => ({
    total: data.length,
    live: data.filter(a => a.isPublished).length,
    pinned: data.filter(a => a.isPinned).length,
    hidden: data.filter(a => !a.isPublished).length,
  }), [data]);

  const filtered = useMemo(() => {
    if (tab === "all") return data;
    if (tab === "live") return data.filter(a => a.isPublished);
    if (tab === "hidden") return data.filter(a => !a.isPublished);
    if (tab === "pinned") return data.filter(a => a.isPinned);
    return data.filter(a => a.category === tab);
  }, [data, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CMS"
        title="Announcements"
        description="Product, security, maintenance & promo updates that appear on user-portal /announcements page."
        actions={
          <Button onClick={() => { setEditing(blank()); setOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New announcement
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="Total" value={stats.total} icon={Megaphone} />
        <PremiumStatCard title="Live" value={stats.live} icon={Eye} accent />
        <PremiumStatCard title="Pinned" value={stats.pinned} icon={Pin} />
        <PremiumStatCard title="Hidden" value={stats.hidden} icon={EyeOff} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All ({data.length})</TabsTrigger>
          <TabsTrigger value="live">Live ({stats.live})</TabsTrigger>
          <TabsTrigger value="pinned">Pinned ({stats.pinned})</TabsTrigger>
          <TabsTrigger value="hidden">Hidden ({stats.hidden})</TabsTrigger>
          {CATS.map(c => <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements" description="Click 'New announcement' to publish your first update." />
        ) : filtered.map(a => {
          const cat = CATS.find(c => c.id === a.category) ?? CATS[0];
          const Icon = cat.icon;
          return (
            <div key={a.id} className={cn("premium-card rounded-xl p-4", !a.isPublished && "opacity-60")}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-amber-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill variant="gold">{cat.label}</StatusPill>
                    {a.isPinned && <StatusPill variant="warning"><Pin className="w-2.5 h-2.5 mr-1" />Pinned</StatusPill>}
                    {!a.isPublished && <StatusPill variant="neutral"><EyeOff className="w-2.5 h-2.5 mr-1" />Hidden</StatusPill>}
                    <span className="text-[11px] text-muted-foreground ml-auto">{fmtDate(a.publishedAt)}</span>
                  </div>
                  <div className="font-semibold text-base mt-1.5">{a.title}</div>
                  {a.body && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.body}</div>}
                  {a.ctaLabel && <div className="text-xs text-amber-300 mt-2">→ {a.ctaLabel}{a.ctaUrl && <span className="text-muted-foreground ml-1">({a.ctaUrl})</span>}</div>}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <div className="flex items-center gap-1">
                    <Switch checked={a.isPublished} onCheckedChange={(b) => toggle.mutate({ id: a.id, body: { isPublished: b } })} aria-label="Publish toggle" />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle.mutate({ id: a.id, body: { isPinned: !a.isPinned } })} title={a.isPinned ? "Unpin" : "Pin"}>
                      {a.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(a); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-300" onClick={() => setDeleteFor(a)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {a.expiresAt && <span className="text-[10px] text-muted-foreground text-right">Expires: {fmtDate(a.expiresAt)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit announcement" : "New announcement"}</DialogTitle>
            <DialogDescription>Appears at /announcements in the user-portal. Pin to keep at top.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title *</Label>
                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="USDT-M Futures live — up to 100× leverage" />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea rows={4} value={editing.body || ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="Detailed copy for the announcement card." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <select className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm" value={editing.category || "product"} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                    {CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Position (sort)</Label>
                  <Input type="number" value={editing.position ?? 0} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>CTA label</Label>
                  <Input value={editing.ctaLabel || ""} onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })} placeholder="Trade Futures" />
                </div>
                <div>
                  <Label>CTA URL</Label>
                  <Input value={editing.ctaUrl || ""} onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value })} placeholder="/futures" />
                </div>
                <div>
                  <Label>Expires at (optional)</Label>
                  <Input type="datetime-local" value={toLocalInputValue(editing.expiresAt ?? null)} onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value || null })} />
                </div>
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.isPinned} onCheckedChange={(b) => setEditing({ ...editing, isPinned: b })} /> Pin</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.isPublished !== false} onCheckedChange={(b) => setEditing({ ...editing, isPublished: b })} /> Published</label>
              </div>
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
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-300" />Delete announcement?</DialogTitle>
            <DialogDescription>"{deleteFor?.title}" will be removed permanently.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteFor && remove.mutate(deleteFor.id)} disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
