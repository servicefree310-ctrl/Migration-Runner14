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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Megaphone, Search, Smartphone, Monitor,
  CalendarDays, Loader2, AlertTriangle, Eye, EyeOff, Image as ImageIcon, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Banner = {
  id: number; title: string; subtitle: string; bgColor: string; fgColor: string;
  icon: string; imageUrl: string; ctaLabel: string; ctaUrl: string;
  position: number; isActive: boolean; showOnMobile: boolean; showOnWeb: boolean;
  startsAt: string | null; endsAt: string | null;
};

const ICONS = ["shield", "gift", "trending-up", "award", "zap", "star", "bell", "bookmark"];
const PRESET_COLORS = ["#fcd535", "#a06af5", "#0ecb81", "#f6465d", "#5b8def", "#ff8a3d", "#00c2ff", "#14F195"];

const blank = (): Partial<Banner> => ({
  title: "", subtitle: "", bgColor: "#fcd535", fgColor: "#000000",
  icon: "shield", imageUrl: "", ctaLabel: "", ctaUrl: "",
  position: 0, isActive: true, showOnMobile: true, showOnWeb: true,
  startsAt: null, endsAt: null,
});

function isScheduled(b: Banner): boolean {
  const now = Date.now();
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return true;
  if (b.endsAt && new Date(b.endsAt).getTime() < now) return true;
  return false;
}

export default function BannersPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";

  const { data = [], isLoading } = useQuery<Banner[]>({
    queryKey: ["admin-banners"],
    queryFn: () => get<Banner[]>("/admin/banners"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Banner> | null>(null);
  const [deleteFor, setDeleteFor] = useState<Banner | null>(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  const inv = () => qc.invalidateQueries({ queryKey: ["admin-banners"] });

  const save = useMutation({
    mutationFn: async (b: Partial<Banner>) => {
      if (b.id) return patch(`/admin/banners/${b.id}`, b);
      return post("/admin/banners", b);
    },
    onSuccess: (_d, v) => {
      inv(); setOpen(false); setEditing(null);
      toast({ title: v.id ? "Banner updated" : "Banner created", description: v.title });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      patch(`/admin/banners/${id}`, { isActive }),
    onSuccess: (_d, v) => { inv(); toast({ title: v.isActive ? "Banner active" : "Banner hidden" }); },
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/banners/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Banner deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // Exclusive buckets: live = active && !scheduled, scheduled = active && scheduled, hidden = !active.
  const buckets = useMemo(() => {
    const live: Banner[] = [];
    const scheduled: Banner[] = [];
    const hidden: Banner[] = [];
    for (const b of data) {
      if (!b.isActive) hidden.push(b);
      else if (isScheduled(b)) scheduled.push(b);
      else live.push(b);
    }
    return { live, scheduled, hidden };
  }, [data]);

  const stats = useMemo(() => ({
    total: data.length,
    live: buckets.live.length,
    scheduled: buckets.scheduled.length,
    hidden: buckets.hidden.length,
    onMobile: buckets.live.filter((b) => b.showOnMobile).length,
    onWeb: buckets.live.filter((b) => b.showOnWeb).length,
  }), [data.length, buckets]);

  const counts = useMemo(() => ({
    all: data.length,
    active: buckets.live.length,
    scheduled: buckets.scheduled.length,
    hidden: buckets.hidden.length,
  }), [data.length, buckets]);

  const filtered = useMemo(() => {
    return data
      .filter((b) => {
        if (tab === "active") return b.isActive && !isScheduled(b);
        if (tab === "scheduled") return isScheduled(b);
        if (tab === "hidden") return !b.isActive;
        return true;
      })
      .filter((b) => {
        if (!search) return true;
        const hay = `${b.title} ${b.subtitle} ${b.ctaLabel}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      })
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [data, tab, search]);

  const onEdit = (b?: Banner) => { setEditing(b ? { ...b } : blank()); setOpen(true); };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Earn & CMS"
        title="Home Banners"
        description="Mobile app aur web home screen ke top par dikhne wale carousel banners. Schedule, color & CTA poori tarah customizable."
        actions={
          isAdmin && (
            <Button onClick={() => onEdit()} data-testid="button-new-banner">
              <Plus className="w-4 h-4 mr-1" />New Banner
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        <PremiumStatCard title="Total Banners" value={stats.total} icon={Megaphone} hero hint={`${stats.hidden} hidden`} />
        <PremiumStatCard title="Live" value={stats.live} icon={Eye} hint="Showing now" />
        <PremiumStatCard title="On Mobile" value={stats.onMobile} icon={Smartphone} hint="Mobile carousel" />
        <PremiumStatCard title="On Web" value={stats.onWeb} icon={Monitor} hint="Web home" />
        <PremiumStatCard title="Scheduled" value={stats.scheduled} icon={CalendarDays} hint="Time-bound" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">Live ({counts.active})</TabsTrigger>
          <TabsTrigger value="scheduled" data-testid="tab-scheduled">Scheduled ({counts.scheduled})</TabsTrigger>
          <TabsTrigger value="hidden" data-testid="tab-hidden">Hidden ({counts.hidden})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Title / subtitle / CTA…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" data-testid="input-search" />
        </div>
      </div>

      <div className="premium-card rounded-xl overflow-hidden border border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 pl-5">Preview</th>
                <th className="text-left font-medium px-4 py-3">Title</th>
                <th className="text-left font-medium px-4 py-3">CTA</th>
                <th className="text-center font-medium px-4 py-3">Pos</th>
                <th className="text-center font-medium px-4 py-3">Mobile</th>
                <th className="text-center font-medium px-4 py-3">Web</th>
                <th className="text-left font-medium px-4 py-3">Schedule</th>
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
                    icon={Megaphone}
                    title="No banners yet"
                    description={search || tab !== "all" ? "Try adjusting your filters." : "Add your first banner to display it on the home screen."}
                    action={isAdmin && tab === "all" && !search ? <Button onClick={() => onEdit()}><Plus className="w-4 h-4 mr-1" />Create banner</Button> : undefined}
                  />
                </td></tr>
              )}
              {!isLoading && filtered.map((b) => {
                const sched = isScheduled(b);
                return (
                  <tr key={b.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-banner-${b.id}`}>
                    <td className="px-4 py-3 pl-5">
                      <div
                        className="h-10 w-36 rounded-lg flex items-center px-3 text-xs font-bold shadow-sm"
                        style={{ background: b.bgColor, color: b.fgColor }}
                      >
                        <span className="truncate">{b.title.slice(0, 22) || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-semibold truncate">{b.title}</div>
                      {b.subtitle && <div className="text-[11px] text-muted-foreground truncate">{b.subtitle}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {b.ctaLabel ? (
                        <div>
                          <div className="font-medium">{b.ctaLabel}</div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]" title={b.ctaUrl}>{b.ctaUrl || "—"}</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono tabular-nums text-xs">{b.position}</td>
                    <td className="px-4 py-3 text-center">
                      {b.showOnMobile ? <Smartphone className="w-4 h-4 text-emerald-400 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {b.showOnWeb ? <Monitor className="w-4 h-4 text-emerald-400 mx-auto" /> : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {b.startsAt || b.endsAt ? (
                        <div className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {b.startsAt?.slice(0, 10) ?? "—"} → {b.endsAt?.slice(0, 10) ?? "∞"}
                        </div>
                      ) : <span>Always</span>}
                    </td>
                    <td className="px-4 py-3">
                      {sched ? (
                        <StatusPill status="scheduled" variant="info">Scheduled</StatusPill>
                      ) : b.isActive ? (
                        <StatusPill status="active" />
                      ) : (
                        <StatusPill status="inactive">Hidden</StatusPill>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 pr-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <Switch
                            checked={b.isActive}
                            onCheckedChange={(v) => toggle.mutate({ id: b.id, isActive: v })}
                            disabled={toggle.isPending && toggle.variables?.id === b.id}
                            aria-label={`Toggle banner ${b.title}`}
                            data-testid={`switch-active-${b.id}`}
                          />
                          <Button size="icon" variant="ghost" onClick={() => onEdit(b)} aria-label={`Edit banner ${b.title}`} data-testid={`button-edit-${b.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteFor(b)} aria-label={`Delete banner ${b.title}`} data-testid={`button-delete-${b.id}`}>
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
          <div>{filtered.length} of {data.length} banners</div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{stats.live} live</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" />{stats.scheduled} scheduled</span>
            <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />{stats.hidden} hidden</span>
          </div>
        </div>
      </div>

      {/* Edit / Create dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-amber-300" />
              {editing?.id ? "Edit Banner" : "New Banner"}
            </DialogTitle>
            <DialogDescription>
              Set the title, color, and CTA. Optionally add a start and end date to schedule the banner.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-5">
              {/* Live preview */}
              <div className="rounded-xl p-4 flex items-center gap-3 shadow-inner border border-border/40" style={{ background: editing.bgColor }}>
                <Sparkles className="w-5 h-5 shrink-0" style={{ color: editing.fgColor }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{ color: editing.fgColor }}>{editing.title || "Banner Title"}</div>
                  <div className="text-xs mt-0.5 truncate" style={{ color: editing.fgColor, opacity: 0.85 }}>{editing.subtitle || "Subtitle text here"}</div>
                </div>
                {editing.ctaLabel && (
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold" style={{ background: editing.fgColor, color: editing.bgColor }}>
                    {editing.ctaLabel}
                  </span>
                )}
              </div>

              <FormSection title="Content" icon={Megaphone}>
                <Grid2>
                  <Field label="Title *">
                    <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Trade BTC and earn rewards" data-testid="input-title" />
                  </Field>
                  <Field label="Position (sort order)">
                    <Input type="number" value={editing.position ?? 0} onChange={(e) => setEditing({ ...editing, position: Number(e.target.value) })} data-testid="input-position" />
                  </Field>
                </Grid2>
                <Field label="Subtitle">
                  <Input value={editing.subtitle || ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} placeholder="Up to 5% bonus on first deposit" data-testid="input-subtitle" />
                </Field>
              </FormSection>

              <FormSection title="Appearance" icon={ImageIcon}>
                <Grid2>
                  <Field label="Background color">
                    <div className="flex gap-1.5 mb-2 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={cn("h-7 w-7 rounded-lg border-2 transition-transform hover:scale-110", editing.bgColor === c ? "border-foreground shadow-md" : "border-transparent")}
                          style={{ background: c }}
                          onClick={() => setEditing({ ...editing, bgColor: c })}
                          aria-label={`Background color ${c}`}
                          aria-pressed={editing.bgColor === c}
                        />
                      ))}
                    </div>
                    <Input value={editing.bgColor || ""} onChange={(e) => setEditing({ ...editing, bgColor: e.target.value })} className="font-mono text-xs" />
                  </Field>
                  <Field label="Text color">
                    <div className="flex gap-2 mb-2">
                      <button type="button" aria-label="Black text" className={cn("h-7 w-7 rounded-lg border-2 bg-black", editing.fgColor === "#000000" ? "border-amber-400" : "border-transparent")} onClick={() => setEditing({ ...editing, fgColor: "#000000" })} />
                      <button type="button" aria-label="White text" className={cn("h-7 w-7 rounded-lg border-2 bg-white", editing.fgColor === "#ffffff" ? "border-amber-400" : "border-transparent")} onClick={() => setEditing({ ...editing, fgColor: "#ffffff" })} />
                    </div>
                    <Input value={editing.fgColor || ""} onChange={(e) => setEditing({ ...editing, fgColor: e.target.value })} className="font-mono text-xs" />
                  </Field>
                </Grid2>
                <Field label="Icon">
                  <div className="flex gap-1.5 flex-wrap">
                    {ICONS.map((ic) => (
                      <Button
                        key={ic}
                        type="button"
                        size="sm"
                        variant={editing.icon === ic ? "default" : "outline"}
                        onClick={() => setEditing({ ...editing, icon: ic })}
                        className="h-7 text-xs"
                      >
                        {ic}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field label="Image URL (optional)">
                  <Input value={editing.imageUrl || ""} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} placeholder="https://cdn.zebvix.com/banner-1.png" data-testid="input-image" />
                </Field>
              </FormSection>

              <FormSection title="Call to Action" icon={Sparkles}>
                <Grid2>
                  <Field label="CTA Label">
                    <Input value={editing.ctaLabel || ""} onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })} placeholder="Trade Now" data-testid="input-cta-label" />
                  </Field>
                  <Field label="CTA URL / Route">
                    <Input value={editing.ctaUrl || ""} onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value })} placeholder="/services/refer" data-testid="input-cta-url" />
                  </Field>
                </Grid2>
              </FormSection>

              <FormSection title="Schedule & Visibility" icon={CalendarDays}>
                <Grid2>
                  <Field label="Starts at">
                    <Input type="datetime-local" value={editing.startsAt?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value || null })} data-testid="input-starts" />
                  </Field>
                  <Field label="Ends at">
                    <Input type="datetime-local" value={editing.endsAt?.slice(0, 16) || ""} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value || null })} data-testid="input-ends" />
                  </Field>
                </Grid2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <ToggleRow
                    icon={Eye}
                    label="Active"
                    hint="Toggle visibility"
                    checked={!!editing.isActive}
                    onChange={(v) => setEditing({ ...editing, isActive: v })}
                  />
                  <ToggleRow
                    icon={Smartphone}
                    label="Mobile"
                    hint="Show in app"
                    checked={!!editing.showOnMobile}
                    onChange={(v) => setEditing({ ...editing, showOnMobile: v })}
                  />
                  <ToggleRow
                    icon={Monitor}
                    label="Web"
                    hint="Show on website"
                    checked={!!editing.showOnWeb}
                    onChange={(v) => setEditing({ ...editing, showOnWeb: v })}
                  />
                </div>
              </FormSection>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => editing && save.mutate(editing)}
              disabled={!editing?.title || save.isPending}
              data-testid="button-save"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {save.isPending ? "Saving…" : editing?.id ? "Save changes" : "Create Banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Delete Banner?</DialogTitle>
            <DialogDescription>This action is permanent. The banner will be removed from the home screen immediately.</DialogDescription>
          </DialogHeader>
          {deleteFor && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
              <div><span className="text-muted-foreground">Title:</span> <span className="font-semibold">{deleteFor.title}</span></div>
              {deleteFor.subtitle && <div><span className="text-muted-foreground">Subtitle:</span> {deleteFor.subtitle}</div>}
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

function FormSection({ title, icon: Icon, children }: { title: string; icon: typeof Megaphone; children: React.ReactNode }) {
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
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function ToggleRow({
  icon: Icon, label, hint, checked, onChange,
}: { icon: typeof Eye; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
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
