import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, put, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, ImageIcon } from "lucide-react";

type CompanyMedia = {
  id: number;
  category: string;
  title: string;
  caption: string;
  url: string;
  displayOrder: number;
  isActive: boolean;
};

const CATEGORIES = ["general", "office", "team", "culture", "product", "event"];

const BLANK: Omit<CompanyMedia, "id"> = {
  category: "general", title: "", caption: "", url: "", displayOrder: 0, isActive: true,
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-slate-500/15 text-slate-300",
  office: "bg-blue-500/15 text-blue-300",
  team: "bg-amber-500/15 text-amber-300",
  culture: "bg-emerald-500/15 text-emerald-300",
  product: "bg-purple-500/15 text-purple-300",
  event: "bg-pink-500/15 text-pink-300",
};

export default function CompanyMediaPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: all = [], isLoading } = useQuery<CompanyMedia[]>({
    queryKey: ["admin", "company-media"],
    queryFn: () => get<CompanyMedia[]>("/admin/company-media"),
  });

  const [tab, setTab] = useState("all");
  const [editing, setEditing] = useState<Partial<CompanyMedia> | null>(null);
  const [deleting, setDeleting] = useState<CompanyMedia | null>(null);
  const isNew = editing && !editing.id;

  const items = tab === "all" ? all : all.filter((m) => m.category === tab);

  const save = useMutation({
    mutationFn: (data: Partial<CompanyMedia>) =>
      data.id ? put(`/admin/company-media/${data.id}`, data) : post("/admin/company-media", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "company-media"] });
      setEditing(null);
      toast({ title: isNew ? "Image added" : "Image updated" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/company-media/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "company-media"] });
      setDeleting(null);
      toast({ title: "Image removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <>
      <PageHeader
        title="Company Images"
        description="Upload and manage company photos shown on the About and Press pages."
        actions={
          <Button size="sm" onClick={() => setEditing({ ...BLANK })}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Image
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          {CATEGORIES.map((c) => {
            const count = all.filter((m) => m.category === c).length;
            return count > 0 ? (
              <TabsTrigger key={c} value={c} className="capitalize">
                {c} ({count})
              </TabsTrigger>
            ) : null;
          })}
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-video rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="No images yet"
          description="Add your first company image to display on the website."
          action={<Button onClick={() => setEditing({ ...BLANK })}><Plus className="w-4 h-4 mr-1.5" />Add Image</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((m) => (
            <div key={m.id} className="group relative rounded-xl overflow-hidden border border-border bg-card/40">
              <div className="aspect-video bg-muted/30 overflow-hidden">
                <img
                  src={m.url}
                  alt={m.title || m.category}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="p-2.5">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs font-medium line-clamp-1">{m.title || "(No title)"}</p>
                    {m.caption && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{m.caption}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing({ ...m })}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleting(m)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium ${CATEGORY_COLORS[m.category] ?? "bg-muted/30 text-muted-foreground"}`}>
                    {m.category}
                  </span>
                  {!m.isActive && <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Hidden</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Image" : "Edit Image"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Image URL *</Label>
                <Input
                  value={editing.url ?? ""}
                  onChange={(e) => setEditing((p) => ({ ...p, url: e.target.value }))}
                  placeholder="https://…/photo.jpg"
                />
                {editing.url && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-border aspect-video bg-muted/20">
                    <img src={editing.url} alt="preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={editing.category ?? "general"}
                  onValueChange={(v) => setEditing((p) => ({ ...p, category: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Muzaffarnagar Office"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Caption</Label>
                <Input
                  value={editing.caption ?? ""}
                  onChange={(e) => setEditing((p) => ({ ...p, caption: e.target.value }))}
                  placeholder="Short description…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={editing.displayOrder ?? 0}
                    onChange={(e) => setEditing((p) => ({ ...p, displayOrder: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch
                    checked={editing.isActive !== false}
                    onCheckedChange={(v) => setEditing((p) => ({ ...p, isActive: v }))}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={save.isPending || !editing?.url?.trim()}
              onClick={() => editing && save.mutate(editing)}
            >
              {save.isPending ? "Saving…" : isNew ? "Add Image" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove image?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this image from the company gallery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
