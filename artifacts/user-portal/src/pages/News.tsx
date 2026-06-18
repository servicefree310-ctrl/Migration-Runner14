import { useEffect, useState } from "react";
import { Newspaper, Star, Calendar, ExternalLink, Sparkles, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { get } from "@/lib/api";

type ApiNews = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverImageUrl: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  isFeatured: boolean;
};

const CATEGORIES = ["all", "market", "product", "insight", "tutorial", "press"] as const;
type Category = (typeof CATEGORIES)[number];

const TONE: Record<string, string> = {
  market:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  product:  "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  insight:  "text-violet-400 bg-violet-500/10 border-violet-500/30",
  tutorial: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  press:    "text-rose-400 bg-rose-500/10 border-rose-500/30",
};

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return iso; }
}

const FALLBACK: ApiNews[] = [
  {
    id: 0,
    slug: "welcome-to-zebvix-news",
    title: "Welcome to Zebvix News & Insights",
    excerpt: "We will regularly post market analysis, product launches, and trading guides here. Stay tuned!",
    category: "product",
    coverImageUrl: "",
    source: "Zebvix",
    sourceUrl: "",
    publishedAt: new Date().toISOString(),
    isFeatured: true,
  },
];

export default function NewsPage() {
  const [items, setItems] = useState<ApiNews[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Category>("all");

  useEffect(() => {
    let cancelled = false;
    get<ApiNews[]>("/content/news?limit=50")
      .then((data) => {
        if (cancelled) return;
        setItems(Array.isArray(data) && data.length ? data : FALLBACK);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setItems(FALLBACK);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = filter === "all" ? items : items.filter((n) => n.category === filter);
  const featured = filtered.find((n) => n.isFeatured) ?? filtered[0];
  const rest = featured ? filtered.filter((n) => n.id !== featured.id) : filtered;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <PageHeader
        eyebrow="Insights"
        title="News"
        description="Market updates, product launches, trading guides, and platform insights — fresh from the Zebvix desk."
        actions={<StatusPill status="active">{items.length} articles</StatusPill>}
      />

      <SectionCard className="p-3 mb-5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`px-3 h-8 rounded-full text-xs font-semibold transition border capitalize ${
              filter === c
                ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </SectionCard>

      {!loaded ? (
        <div className="h-32 grid place-items-center text-sm text-muted-foreground">Loading news…</div>
      ) : filtered.length === 0 ? (
        <SectionCard className="p-12 text-center">
          <Newspaper className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No articles in this category yet.</p>
        </SectionCard>
      ) : (
        <>
          {/* Featured hero */}
          {featured && (
            <article className="rounded-2xl overflow-hidden border border-amber-500/30 bg-gradient-to-br from-amber-500/8 via-card to-card mb-6">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="aspect-video md:aspect-auto md:min-h-[280px] bg-muted/40 relative overflow-hidden">
                  {featured.coverImageUrl ? (
                    <img src={featured.coverImageUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full grid place-items-center bg-gradient-to-br from-amber-500/20 to-orange-500/10">
                      <Newspaper className="h-16 w-16 text-amber-400/60" />
                    </div>
                  )}
                  <Badge className="absolute top-3 left-3 bg-amber-500 text-black"><Star className="h-3 w-3 mr-1" /> Featured</Badge>
                </div>
                <div className="p-6 sm:p-8 flex flex-col">
                  <Badge variant="outline" className={`w-fit text-[10px] uppercase tracking-wider ${TONE[featured.category] ?? ""}`}>
                    {featured.category}
                  </Badge>
                  <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold leading-tight">{featured.title}</h2>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-4">{featured.excerpt}</p>
                  <div className="mt-auto pt-4 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmt(featured.publishedAt)}</span>
                    <span>·</span>
                    <span>{featured.source}</span>
                  </div>
                  {featured.sourceUrl && (
                    <Button asChild className="mt-4 w-fit" size="sm">
                      <a href={featured.sourceUrl} target="_blank" rel="noreferrer noopener">
                        Read article <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </article>
          )}

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rest.map((n) => {
              const inner = (
                <>
                  <div className="aspect-video bg-muted/40 overflow-hidden">
                    {n.coverImageUrl ? (
                      <img src={n.coverImageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" loading="lazy" />
                    ) : (
                      <div className="w-full h-full grid place-items-center bg-gradient-to-br from-muted/40 to-muted/10">
                        <Sparkles className="h-8 w-8 text-amber-400/40" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${TONE[n.category] ?? ""}`}>
                      {n.category}
                    </Badge>
                    <h3 className="mt-2 text-base font-semibold leading-snug line-clamp-2">{n.title}</h3>
                    {n.excerpt && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3">{n.excerpt}</p>}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmt(n.publishedAt)}</span>
                      <span>{n.source}</span>
                    </div>
                  </div>
                </>
              );
              const className = "rounded-xl border border-border bg-card overflow-hidden hover:border-amber-500/30 transition group block";
              return n.sourceUrl ? (
                <a key={n.id} href={n.sourceUrl} target="_blank" rel="noreferrer noopener" className={className}>{inner}</a>
              ) : (
                <article key={n.id} className={className}>{inner}</article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
