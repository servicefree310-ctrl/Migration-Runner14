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
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Linkedin, Twitter, Users } from "lucide-react";

type TeamMember = {
  id: number;
  name: string;
  title: string;
  bio: string;
  avatarUrl: string;
  linkedinUrl: string;
  twitterUrl: string;
  displayOrder: number;
  isVisible: boolean;
};

const BLANK: Omit<TeamMember, "id"> = {
  name: "", title: "", bio: "", avatarUrl: "",
  linkedinUrl: "", twitterUrl: "", displayOrder: 0, isVisible: true,
};

export default function TeamPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["admin", "team"],
    queryFn: () => get<TeamMember[]>("/admin/team"),
  });

  const [editing, setEditing] = useState<Partial<TeamMember> | null>(null);
  const [deleting, setDeleting] = useState<TeamMember | null>(null);
  const isNew = editing && !editing.id;

  const save = useMutation({
    mutationFn: (data: Partial<TeamMember>) =>
      data.id ? put(`/admin/team/${data.id}`, data) : post("/admin/team", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "team"] });
      setEditing(null);
      toast({ title: isNew ? "Team member added" : "Team member updated" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/team/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "team"] });
      setDeleting(null);
      toast({ title: "Team member removed" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <>
      <PageHeader
        title="Team Members"
        description="Add and manage team members shown on the About page."
        actions={
          <Button size="sm" onClick={() => setEditing({ ...BLANK })}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Member
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Add your first team member to show them on the About page."
          action={<Button onClick={() => setEditing({ ...BLANK })}><Plus className="w-4 h-4 mr-1.5" />Add Member</Button>}
        />
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/60">
              <Avatar className="w-12 h-12 shrink-0">
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.name} />}
                <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                  {m.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.title}</span>
                  {!m.isVisible && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                </div>
                {m.bio && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{m.bio}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] text-muted-foreground">Order: {m.displayOrder}</span>
                  {m.linkedinUrl && <Linkedin className="w-3 h-3 text-muted-foreground" />}
                  {m.twitterUrl && <Twitter className="w-3 h-3 text-muted-foreground" />}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => setEditing({ ...m })}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(m)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Team Member" : "Edit Team Member"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Full Name *</Label>
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Job Title</Label>
                  <Input
                    value={editing.title ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Chief Executive Officer"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Bio</Label>
                  <Textarea
                    value={editing.bio ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, bio: e.target.value }))}
                    placeholder="Short bio about this team member…"
                    rows={3}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Photo URL</Label>
                  <Input
                    value={editing.avatarUrl ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, avatarUrl: e.target.value }))}
                    placeholder="https://…/photo.jpg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={editing.linkedinUrl ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, linkedinUrl: e.target.value }))}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Twitter / X URL</Label>
                  <Input
                    value={editing.twitterUrl ?? ""}
                    onChange={(e) => setEditing((p) => ({ ...p, twitterUrl: e.target.value }))}
                    placeholder="https://x.com/…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={editing.displayOrder ?? 0}
                    onChange={(e) => setEditing((p) => ({ ...p, displayOrder: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <Switch
                    checked={editing.isVisible !== false}
                    onCheckedChange={(v) => setEditing((p) => ({ ...p, isVisible: v }))}
                  />
                  <Label>Visible on website</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={save.isPending || !editing?.name?.trim()}
              onClick={() => editing && save.mutate(editing)}
            >
              {save.isPending ? "Saving…" : isNew ? "Add Member" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleting?.name}</strong> from the team page.
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
