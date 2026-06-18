import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  FileText, Save, Loader2, ShieldCheck, Scale, AlertTriangle, Phone,
  CheckCircle2, FileWarning, Clock, FileCheck2,
} from "lucide-react";

type Page = { slug: string; title: string; content: string; updatedAt: string };

const SLUGS: { slug: string; label: string; icon: typeof ShieldCheck; hint: string }[] = [
  { slug: "privacy", label: "Privacy Policy", icon: ShieldCheck, hint: "User data handling, cookies, third-party sharing." },
  { slug: "terms",   label: "Terms of Service", icon: Scale, hint: "Platform usage, account terms, dispute resolution." },
  { slug: "aml",     label: "AML / KYC Policy", icon: AlertTriangle, hint: "Anti-money laundering & sanctions screening." },
  { slug: "contact", label: "Contact / Support", icon: Phone, hint: "Support hours, email, escalation process." },
];

function relTime(iso: string): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function LegalPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin" || me?.role === "superadmin";
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data = [], isLoading } = useQuery<Page[]>({
    queryKey: ["/admin/legal"],
    queryFn: () => get<Page[]>("/admin/legal"),
  });
  const save = useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: Partial<Page> }) => put(`/admin/legal/${slug}`, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["/admin/legal"] });
      toast({ title: "Page saved", description: `/${v.slug} content updated.` });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const stats = useMemo(() => {
    const configured = SLUGS.filter((s) => {
      const p = data.find((x) => x.slug === s.slug);
      return p && p.content && p.content.trim().length > 0;
    }).length;
    const empty = SLUGS.length - configured;
    const lastUpdate = data
      .map((p) => p.updatedAt ? new Date(p.updatedAt).getTime() : 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return {
      total: SLUGS.length,
      configured,
      empty,
      lastUpdateIso: lastUpdate > 0 ? new Date(lastUpdate).toISOString() : "",
    };
  }, [data]);

  const [tab, setTab] = useState(SLUGS[0].slug);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Earn & CMS"
        title="Legal CMS"
        description="Edit Privacy, Terms, AML, and Contact pages. This content is displayed at /privacy, /terms, and related routes in the user app."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <PremiumStatCard title="Total Pages" value={stats.total} icon={FileText} hero hint="Privacy / Terms / AML / Contact" />
        <PremiumStatCard title="Configured" value={stats.configured} icon={FileCheck2} hint="Content saved" />
        <PremiumStatCard title="Empty" value={stats.empty} icon={FileWarning} hint="Need content" />
        <PremiumStatCard title="Last Update" value={relTime(stats.lastUpdateIso)} icon={Clock} hint={stats.lastUpdateIso ? new Date(stats.lastUpdateIso).toLocaleDateString("en-IN") : "—"} />
      </div>

      {!isAdmin && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>Read-only mode — only admin and superadmin roles can edit legal content.</div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3"><Skeleton className="h-[400px] w-full rounded-xl" /></div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto">
            {SLUGS.map((s) => {
              const p = data.find((x) => x.slug === s.slug);
              const has = !!(p?.content?.trim());
              return (
                <TabsTrigger key={s.slug} value={s.slug} data-testid={`tab-${s.slug}`} className="gap-2">
                  <s.icon className="w-3.5 h-3.5" />
                  {s.label}
                  <span className={cn("inline-block w-1.5 h-1.5 rounded-full", has ? "bg-emerald-400" : "bg-amber-400")} />
                </TabsTrigger>
              );
            })}
          </TabsList>
          {SLUGS.map((s) => {
            const p = data.find((x) => x.slug === s.slug) || { slug: s.slug, title: "", content: "", updatedAt: "" };
            return (
              <TabsContent key={s.slug} value={s.slug} className="mt-4">
                <PageEditor
                  meta={s}
                  page={p}
                  disabled={!isAdmin || save.isPending}
                  saving={save.isPending && save.variables?.slug === s.slug}
                  onSave={(body) => save.mutate({ slug: s.slug, body })}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}

function PageEditor({
  meta, page, disabled, saving, onSave,
}: {
  meta: { slug: string; label: string; icon: typeof ShieldCheck; hint: string };
  page: Page;
  disabled: boolean;
  saving: boolean;
  onSave: (b: Partial<Page>) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);

  useEffect(() => { setTitle(page.title); setContent(page.content); }, [page.slug, page.title, page.content]);

  const dirty = title !== page.title || content !== page.content;
  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <SectionCard
      icon={meta.icon}
      title={`Edit /${meta.slug}`}
      description={meta.hint}
      actions={
        <div className="flex items-center gap-2">
          {page.updatedAt && (
            <span className="text-[11px] text-muted-foreground hidden md:inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />Updated {relTime(page.updatedAt)}
            </span>
          )}
          {dirty && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <span className="w-1 h-1 rounded-full bg-amber-300" />Unsaved
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Page Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={disabled}
            placeholder={meta.label}
            data-testid={`input-title-${meta.slug}`}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Content (Markdown supported)</Label>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {wordCount} words · {charCount.toLocaleString("en-IN")} chars
            </div>
          </div>
          <Textarea
            rows={20}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={disabled}
            className="font-mono text-xs leading-relaxed"
            placeholder={`# ${meta.label}\n\nLast updated: …\n\n## Section\n\nContent here…`}
            data-testid={`input-content-${meta.slug}`}
          />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            {dirty ? (
              <><FileWarning className="w-3.5 h-3.5 text-amber-400" />Unsaved changes</>
            ) : content.trim() ? (
              <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />Content saved</>
            ) : (
              <><FileWarning className="w-3.5 h-3.5 text-amber-400" />Empty page</>
            )}
          </div>
          {!disabled && (
            <Button
              onClick={() => onSave({ title, content })}
              disabled={saving || !dirty}
              data-testid={`button-save-${meta.slug}`}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
