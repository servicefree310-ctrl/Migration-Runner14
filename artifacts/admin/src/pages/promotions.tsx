import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Trophy, Award, Gift, Calendar, Zap, BookOpen,
  TrendingUp, Search, CalendarDays, Sparkles, Loader2, AlertTriangle,
  Smartphone, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Promo = {
  id: number; type: string; tag: string; title: string; subtitle: string;
  description: string; color: string; icon: string; imageUrl: string;
  ctaLabel: string; ctaUrl: string; prizePool: string;
  position: number; isActive: boolean; showOnMobile: boolean;
  startsAt: string | null; endsAt: string | null;
};

const TYPES: { v: string; t: string; c: string; i: string; Icon: typeof Award }[] = [
  { v: "contest",  t: "CONTEST",     c: "#a06af5", i: "award",        Icon: Award },
  { v: "event",    t: "EVENT",       c: "#5b8def", i: "calendar",     Icon: Calendar },
  { v: "airdrop",  t: "AIRDROP",     c: "#ff8a3d", i: "gift",         Icon: Gift },
  { v: "listing",  t: "NEW LISTING", c: "#0ecb81", i: "zap",          Icon: Zap },
  { v: "guide",    t: "GUIDE",       c: "#5b8def", i: "book-open",    Icon: BookOpen },
  { v: "trending", t: "TRENDING",    c: "#F7931A", i: "trending-up",  Icon: TrendingUp },
];

const TYPE_MAP = new Map(TYPES.map((t) => [t.v, t]));

const blank = (): Partial<Promo> => ({
  type: "contest", tag: "CONTEST", title: "", subtitle: "", description: "",
  color: "#a06af5", icon: "award", imageUrl: "", ctaLabel: "Join now",
  ctaUrl: "", prizePool: "", position: 0, isActive: true, showOnMobile: true,
  startsAt: null, endsAt: null,
});

function isScheduled(p: Promo): boolean {
  const now = Date.now();
  if (p.startsAt && new Date(p.startsAt).getTime() > now) return true;
  if (p.endsAt && new Date(p.endsAt).getTime() < now) return true;
  return false;
}

export default function PromotionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const { data = [], isLoading } = useQuery<Promo[]>({
    queryKey: ["admin-promotions"],
    queryFn: () => get<Promo[]>("/admin/promotions"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Promo> | null>(null);
  const [deleteFor, setDeleteFor] = useState<Promo | null>(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const inv = () => qc.invalidateQueries({ queryKey: ["admin-promotions"] });

  const save = useMutation({
    mutationFn: async (p: Partial<Promo>) => {
      if (p.id) return patch(`/admin/promotions/${p.id}`, p);
      return post("/admin/promotions", p);
    },
    onSuccess: (_d, v) => {
      inv(); setOpen(false); setEditing(null);
      toast({ title: v.id ? "Promotion updated" : "Promotion created", description: v.title });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      patch(`/admin/promotions/${id}`, { isActive }),
    onSuccess: (_d, v) => { inv(); toast({ title: v.isActive ? "Promotion live" : "Promotion hidden" }); },
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/promotions/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Promotion deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // Exclusive buckets: live = active && !scheduled, scheduled = active && scheduled, hidden = !active.
  const buckets = useMemo(() => {
    const live: Promo[] = [];
    const scheduled: Promo[] = [];
    const hidden: Promo[] = [];
    for (const p of data) {
      if (!p.isActive) hidden.push(p);
      else if (isScheduled(p)) scheduled.push(p);
      else live.push(p);
    }
    return { live, scheduled, hidden };
  }, [data]);

  const stats = useMemo(() => {
    const contests = data.filter((p) => p.type === "contest").length;
    const airdrops = data.filter((p) => p.type === "airdrop").length;
    const totalPrize = data.reduce((sum, p) => {
      const m = (p.prizePool || "").match(/[\d,.]+/);
      return sum + (m ? Number(m[0].replace(/[^\d.]/g, "")) : 0);
    }, 0);
    return {
      total: data.length,
      live: buckets.live.length,
      scheduled: buckets.scheduled.length,
      hidden: buckets.hidden.length,
      contests,
      airdrops,
      totalPrize,
    };
  }, [data, buckets]);

  const counts = useMemo(() => ({
    all: data.length,
    live: buckets.live.length,
    scheduled: buckets.scheduled.length,
    hidden: buckets.hidden.length,
  }), [data.length, buckets]);

  const filtered = useMemo(() => {
    return data
      .filter((p) => {
        if (tab === "live") return p.isActive && !isScheduled(p);
        if (tab === "scheduled") return isScheduled(p);
        if (tab === "hidden") return !p.isActive;
        return true;
      })
      .filter((p) => typeFilter === "all" || p.type === typeFilter)
      .filter((p) => {
        if (!search) return true;
        const hay = `${p.title} ${p.subtitle} ${p.tag} ${p.prizePool}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      })
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [data, tab, typeFilter, search]);

  const onEdit = (p?: Promo) => { setEditing(p ? { ...p } : blank()); setOpen(true); };

  const applyType = (v: string) => {
    const t = TYPE_MAP.get(v);
    if (t && editing) setEditing({ ...editing, type: v, tag: t.t, color: t.c, icon: t.i });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Earn & CMS"
        title="Promotions & Contests"
        description="Trading contests, airdrops, listings, and events — these cards appear in the Discover section of the mobile app."
        actions={
          isAdmin && (
            <Button onClick={() => onEdit()} data-testid="button-new-promo">
              <Plus className="w-4 h-4 mr-1" />New Promotion
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        <PremiumStatCard title="Total" value={stats.total} icon={Trophy} hero hint={`${stats.hidden} hidden`} />
        <PremiumStatCard title="Live Now" value={stats.live} icon={Sparkles} hint="Showing today" />
        <PremiumStatCard title="Scheduled" value={stats.scheduled} icon={CalendarDays} hint="Upcoming / expired" />
        <PremiumStatCard title="Contests" value={stats.contests} icon={Award} hint={`${stats.airdrops} airdrops`} />
        <PremiumStatCard title="Prize Pool" value={stats.totalPrize > 0 ? `₹${stats.totalPrize.toLocaleString("en-IN")}` : "—"} icon={Gift} hint="Approx total" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live">Live ({counts.live})</TabsTrigger>
          <TabsTrigger value="scheduled" data-testid="tab-scheduled">Scheduled ({counts.scheduled})</TabsTrigger>
          <TabsTrigger value="hidden" data-testid="tab-hidden">Hidden ({counts.hidden})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full md:w-44" data-testid="filter-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Title / tag / prize…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search" />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">Tag</th>
                <th className="text-left font-medium px-4 py-3">Title</th>
                <th className="text-left font-medium px-4 py-3">Prize</th>
                <th className="text-left font-medium px-4 py-3">CTA</th>
                <th className="text-center font-medium px-4 py-3">Pos</th>
                <th className="text-left font-medium px-4 py-3">Schedule</th>
                <th className="text-center font-medium px-4 py-3">Mobile</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                {isAdmin && <th className="text-right font-medium px-4 py-3 pr-5">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={isAdmin ? 9 : 8} className="px-4 py-3"><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={isAdmin ? 9 : 8} className="px-4 py-3">
                  <EmptyState
                    icon={Trophy}
                    title="No promotions match"
                    description={search || tab !== "all" || typeFilter !== "all" ? "Try adjusting your filters." : "Add your first contest or airdrop to get started."}
                    action={isAdmin && tab === "all" && !search && typeFilter === "all" ? <Button onClick={() => onEdit()}><Plus className="w-4 h-4 mr-1" />Create promotion</Button> : undefined}
                  />
                </td></tr>
              )}
              {!isLoading && filtered.map((p) => {
                const sched = isScheduled(p);
                const T = TYPE_MAP.get(p.type)?.Icon ?? Trophy;
                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-promo-${p.id}`}>
                    <td className="px-4 py-3 pl-5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border"
                        style={{ background: p.color + "22", color: p.color, borderColor: p.color + "55" }}
                      >
                        <T className="w-3 h-3" />{p.tag}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-semibold truncate">{p.title}</div>
                      {p.subtitle && <div className="text-[11px] text-muted-foreground truncate">{p.subtitle}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: p.prizePool ? p.color : undefined }}>
                      {p.prizePool || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{p.ctaLabel || "—"}</div>
                      {p.ctaUrl && <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]" title={p.ctaUrl}>{p.ctaUrl}</div>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono tabular-nums text-xs">{p.position}</td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {p.startsAt || p.endsAt ? (
                        <div className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {p.startsAt?.slice(5, 10) ?? "—"} → {p.endsAt?.slice(5, 10) ?? "∞"}
                        </div>
                      ) : <span>Always</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.showOnMobile ? <Smartphone className="w-4 h-4 text-emerald-400 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {sched ? <StatusPill status="scheduled" variant="info">Scheduled</StatusPill>
                        : p.isActive ? <StatusPill status="active" />
                        : <StatusPill status="inactive">Hidden</StatusPill>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <Switch
                            checked={p.isActive}
                            onCheckedChange={(v) => toggle.mutate({ id: p.id, isActive: v })}
                            disabled={toggle.isPending && toggle.variables?.id === p.id}
                            aria-label={`Toggle promotion ${p.title}`}
                            data-testid={`switch-active-${p.id}`}
                          />
                          <Button size="icon" variant="ghost" onClick={() => onEdit(p)} aria-label={`Edit promotion ${p.title}`} data-testid={`button-edit-${p.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteFor(p)} aria-label={`Delete promotion ${p.title}`} data-testid={`button-delete-${p.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border/60 px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground bg-muted/10">
          <div>{filtered.length} of {data.length} promotions</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{stats.live} live</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />{stats.scheduled} scheduled</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />{stats.hidden} hidden</span>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-300" />
              {editing?.id ? "Edit Promotion" : "New Promotion"}
            </DialogTitle>
            <DialogDescription>
              Select a type — the tag, color, and icon will auto-fill. Adjust the details as needed.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              {/* Live preview */}
              <div className="rounded-xl p-4 border-2" style={{ borderColor: editing.color, background: editing.color + "0d" }}>
                <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold mb-2" style={{ background: editing.color + "33", color: editing.color }}>{editing.tag}</span>
                <div className="font-bold text-base">{editing.title || "Promotion title"}</div>
                <div className="text-xs text-muted-foreground mt-1">{editing.subtitle || "Catchy subtitle here"}</div>
                {editing.prizePool && (
                  <div className="text-sm font-bold mt-2 flex items-center gap-1.5" style={{ color: editing.color }}>
                    <Trophy className="w-3.5 h-3.5" />{editing.prizePool}
                  </div>
                )}
                {editing.ctaLabel && (
                  <div className="mt-3">
                    <span className="inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: editing.color, color: "#fff" }}>
                      {editing.ctaLabel}
                    </span>
                  </div>
                )}
              </div>

              <FormSection title="Type & Branding" icon={Sparkles}>
                <Grid2>
                  <Field label="Type *">
                    <Select value={editing.type} onValueChange={applyType}>
                      <SelectTrigger data-testid="dialog-type"><SelectValue /></SelectTrigger>
                      <SelectContent>{TYPES.map((t) => (
                        <SelectItem key={t.v} value={t.v}>
                          <span className="inline-flex items-center gap-2"><t.Icon className="w-3.5 h-3.5" />{t.t}</span>
                        </SelectItem>
                      ))}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Position (sort)">
                    <Input type="number" value={editing.position ?? 0} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} data-testid="dialog-position" />
                  </Field>
                </Grid2>
                <Grid2>
                  <Field label="Tag (custom)">
                    <Input value={editing.tag || ""} onChange={(e) => setEditing({ ...editing, tag: e.target.value.toUpperCase() })} data-testid="dialog-tag" />
                  </Field>
                  <Field label="Brand color">
                    <div className="flex items-center gap-2">
                      <input type="color" value={editing.color || "#a06af5"} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent" />
                      <Input value={editing.color || ""} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="font-mono text-xs flex-1" data-testid="dialog-color" />
                    </div>
                  </Field>
                </Grid2>
              </FormSection>

              <FormSection title="Content" icon={Trophy}>
                <Field label="Title *">
                  <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Trading Contest — June Edition" data-testid="dialog-title" />
                </Field>
                <Field label="Subtitle">
                  <Input value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} placeholder="Compete with top traders & win" data-testid="dialog-subtitle" />
                </Field>
                <Field label="Description (long)">
                  <Textarea rows={3} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Full rules, eligibility & rewards…" data-testid="dialog-description" />
                </Field>
                <Grid2>
                  <Field label="Prize pool">
                    <Input value={editing.prizePool || ""} onChange={(e) => setEditing({ ...editing, prizePool: e.target.value })} placeholder="Win ₹10,00,000" data-testid="dialog-prize" />
                  </Field>
                  <Field label="Icon (lucide name)">
                    <Input value={editing.icon || ""} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} placeholder="award / gift / zap" data-testid="dialog-icon" />
                  </Field>
                </Grid2>
              </FormSection>

              <FormSection title="Call to Action" icon={Sparkles}>
                <Grid2>
                  <Field label="CTA label">
                    <Input value={editing.ctaLabel || ""} onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })} placeholder="Join now" data-testid="dialog-cta-label" />
                  </Field>
                  <Field label="CTA URL / route">
                    <Input value={editing.ctaUrl || ""} onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value })} placeholder="/services/refer" data-testid="dialog-cta-url" />
                  </Field>
                </Grid2>
                <Field label="Image URL (optional)">
                  <Input value={editing.imageUrl || ""} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} placeholder="https://cdn.zebvix.com/contest.png" data-testid="dialog-image" />
                </Field>
              </FormSection>

              <FormSection title="Schedule & Visibility" icon={CalendarDays}>
                <Grid2>
                  <Field label="Starts at">
                    <Input type="datetime-local" value={editing.startsAt?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value || null })} data-testid="dialog-start" />
                  </Field>
                  <Field label="Ends at">
                    <Input type="datetime-local" value={editing.endsAt?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value || null })} data-testid="dialog-end" />
                  </Field>
                </Grid2>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <ToggleRow
                    icon={Eye}
                    label="Active"
                    hint="Show to users"
                    checked={!!editing.isActive}
                    onChange={(v) => setEditing({ ...editing, isActive: v })}
                  />
                  <ToggleRow
                    icon={Smartphone}
                    label="Mobile"
                    hint="Discover section"
                    checked={!!editing.showOnMobile}
                    onChange={(v) => setEditing({ ...editing, showOnMobile: v })}
                  />
                </div>
              </FormSection>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={!editing?.title || save.isPending} data-testid="button-save">
              {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {save.isPending ? "Saving…" : editing?.id ? "Save changes" : "Create Promotion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Delete Promotion?</DialogTitle>
            <DialogDescription>This action is permanent. The promotion will be removed from the Discover section immediately.</DialogDescription>
          </DialogHeader>
          {deleteFor && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
              <div><span className="text-muted-foreground">Title:</span> <span className="font-semibold">{deleteFor.title}</span></div>
              <div><span className="text-muted-foreground">Tag:</span> {deleteFor.tag}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteFor && remove.mutate(deleteFor.id)} disabled={remove.isPending} data-testid="button-confirm-delete">
              {remove.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormSection({ title, icon: Icon, children }: { title: string; icon: typeof Trophy; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1.5 border-b border-border/40">
        <Icon className="w-3.5 h-3.5 text-amber-300" />
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function ToggleRow({
  icon: Icon, label, hint, checked, onChange,
}: { icon: typeof Eye; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn("flex items-center justify-between gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
      checked ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/60 bg-muted/20 hover:bg-muted/30")}>
      <div className="flex items-center gap-2 min-w-0">
        {checked ? <Icon className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
        <div className="min-w-0">
          <div className="text-xs font-semibold">{label}</div>
          {hint && <div className="text-[10px] text-muted-foreground truncate">{hint}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
