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
  Plus, Pencil, Trash2, Newspaper, Star, Eye, EyeOff, AlertTriangle, Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NewsItem = {
  id: number; slug: string; title: string; excerpt: string; body: string;
  category: string; coverImageUrl: string; source: string; sourceUrl: string;
  publishedAt: string; isPublished: boolean; isFeatured: boolean; position: number;
};

const CATS = ["market", "product", "insight", "tutorial", "press"];

const blank = (): Partial<NewsItem> => ({
  slug: "", title: "", excerpt: "", body: "", category: "market", coverImageUrl: "",
  source: "Zebvix", sourceUrl: "", isPublished: true, isFeatured: false, position: 0,
});

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" }); } catch { return d; }
}

export default function NewsCmsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: ["/admin/news"],
    queryFn: () => get<NewsItem[]>("/admin/news"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<NewsItem> | null>(null);
  const [tab, setTab] = useState("all");
  const [deleteFor, setDeleteFor] = useState<NewsItem | null>(null);

  const inv = () => qc.invalidateQueries({ queryKey: ["/admin/news"] });

  const save = useMutation({
    mutationFn: (n: Partial<NewsItem>) => n.id ? patch(`/admin/news/${n.id}`, n) : post("/admin/news", n),
    onSuccess: (_d, v) => { inv(); setOpen(false); setEditing(null); toast({ title: v.id ? "Updated" : "Created", description: v.title }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => patch(`/admin/news/${id}`, body),
    onSuccess: () => inv(),
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/news/${id}`),
    onSuccess: () => { inv(); setDeleteFor(null); toast({ title: "Deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => ({
    total: data.length,
    live: data.filter(n => n.isPublished).length,
    featured: data.filter(n => n.isFeatured).length,
    hidden: data.filter(n => !n.isPublished).length,
  }), [data]);

  const filtered = useMemo(() => {
    if (tab === "all") return data;
    if (tab === "live") return data.filter(n => n.isPublished);
    if (tab === "featured") return data.filter(n => n.isFeatured);
    if (tab === "hidden") return data.filter(n => !n.isPublished);
    return data.filter(n => n.category === tab);
  }, [data, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CMS"
        title="News"
        description="Long-form market & product articles published at /news in the user-portal."
        actions={<Button onClick={() => { setEditing(blank()); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1.5" /> New article</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="Total" value={stats.total} icon={Newspaper} />
        <PremiumStatCard title="Published" value={stats.live} icon={Eye} accent />
        <PremiumStatCard title="Featured" value={stats.featured} icon={Star} />
        <PremiumStatCard title="Drafts" value={stats.hidden} icon={EyeOff} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All ({data.length})</TabsTrigger>
          <TabsTrigger value="live">Published ({stats.live})</TabsTrigger>
          <TabsTrigger value="featured">Featured ({stats.featured})</TabsTrigger>
          <TabsTrigger value="hidden">Drafts ({stats.hidden})</TabsTrigger>
          {CATS.map(c => <TabsTrigger key={c} value={c} className="capitalize">{c}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="grid gap-3">
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div>
        : filtered.length === 0 ? <EmptyState icon={Newspaper} title="No articles" description="Click 'New article' to publish your first piece." />
        : filtered.map(n => (
          <div key={n.id} className={cn("premium-card rounded-xl p-4 flex gap-4", !n.isPublished && "opacity-60")}>
            <div className="w-24 h-20 rounded-lg overflow-hidden bg-muted/40 border border-border/60 shrink-0 flex items-center justify-center">
              {n.coverImageUrl ? <img src={n.coverImageUrl} className="w-full h-full object-cover" alt="" />
                : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill variant="gold" className="capitalize">{n.category}</StatusPill>
                {n.isFeatured && <StatusPill variant="warning"><Star className="w-2.5 h-2.5 mr-1" />Featured</StatusPill>}
                {!n.isPublished && <StatusPill variant="neutral">Draft</StatusPill>}
                <span className="text-[11px] text-muted-foreground ml-auto">{fmtDate(n.publishedAt)} · {n.source}</span>
              </div>
              <div className="font-semibold mt-1.5 line-clamp-1">{n.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">/{n.slug}</div>
              {n.excerpt && <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.excerpt}</div>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Switch checked={n.isPublished} onCheckedChange={(b) => toggle.mutate({ id: n.id, body: { isPublished: b } })} aria-label="Publish" />
              <div className="flex">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle.mutate({ id: n.id, body: { isFeatured: !n.isFeatured } })} title={n.isFeatured ? "Unfeature" : "Feature"}>
                  <Star className={cn("w-3.5 h-3.5", n.isFeatured && "fill-amber-300 text-amber-300")} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(n); setOpen(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-300" onClick={() => setDeleteFor(n)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit article" : "New article"}</DialogTitle>
            <DialogDescription>Long-form post that appears at /news. Slug auto-generated from title if blank.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Title *</Label>
                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Bitcoin halving — what it means for traders" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Slug (URL)</Label>
                  <Input value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="bitcoin-halving-2026" className="font-mono text-xs" />
                </div>
                <div>
                  <Label>Category</Label>
                  <select className="w-full h-10 rounded-md border border-border bg-background px-2 text-sm capitalize" value={editing.category || "market"} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                    {CATS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>Cover image URL</Label>
                  <Input value={editing.coverImageUrl || ""} onChange={(e) => setEditing({ ...editing, coverImageUrl: e.target.value })} placeholder="https://…" />
                </div>
                <div>
                  <Label>Source</Label>
                  <Input value={editing.source || ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="Zebvix" />
                </div>
                <div>
                  <Label>Source URL (external)</Label>
                  <Input value={editing.sourceUrl || ""} onChange={(e) => setEditing({ ...editing, sourceUrl: e.target.value })} placeholder="https://…" />
                </div>
              </div>
              <div>
                <Label>Excerpt (1-2 lines)</Label>
                <Textarea rows={2} value={editing.excerpt || ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
              </div>
              <div>
                <Label>Body (markdown / HTML)</Label>
                <Textarea rows={10} value={editing.body || ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} className="font-mono text-xs" />
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm"><Switch checked={!!editing.isFeatured} onCheckedChange={(b) => setEditing({ ...editing, isFeatured: b })} /> Featured</label>
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
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-300" />Delete article?</DialogTitle>
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
