import { useEffect, useState } from "react";
import { Megaphone, Sparkles, Shield, Wrench, Gift, Calendar, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { get } from "@/lib/api";

type Category = "product" | "security" | "maintenance" | "promotion";

type Announcement = {
  id: string;
  category: Category;
  title: string;
  body: string;
  date: string;
  pinned?: boolean;
  link?: { href: string; label: string };
};

const CATEGORY_META: Record<Category, { label: string; icon: typeof Sparkles; tone: string; ring: string }> = {
  product:     { label: "Product",     icon: Sparkles, tone: "text-amber-400 bg-amber-500/10 border-amber-500/30", ring: "ring-amber-500/20" },
  security:    { label: "Security",    icon: Shield,   tone: "text-sky-400 bg-sky-500/10 border-sky-500/30",       ring: "ring-sky-500/20" },
  maintenance: { label: "Maintenance", icon: Wrench,   tone: "text-violet-400 bg-violet-500/10 border-violet-500/30", ring: "ring-violet-500/20" },
  promotion:   { label: "Promotion",   icon: Gift,     tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", ring: "ring-emerald-500/20" },
};

const CURATED: Announcement[] = [
  {
    id: "creator-rewards",
    category: "promotion",
    title: "Creator Rewards — Earn USDT for every video you make",
    body: "Post videos about Zebvix on YouTube, Instagram, or TikTok and earn real USDT rewards. Get a base reward per approved video plus milestone bonuses at 1K, 5K, and 10K views.",
    date: "2026-06-18",
    pinned: true,
    link: { href: "/creator-rewards", label: "Submit your video" },
  },
  {
    id: "welcome",
    category: "promotion",
    title: "Welcome to Zebvix — Sign-up bonus 50 ZBX",
    body: "Every new account receives 50 ZBX free on sign-up. Complete your KYC verification and claim your welcome bonus.",
    date: "2026-04-25",
    pinned: true,
    link: { href: "/invite", label: "Refer & Earn more" },
  },
  {
    id: "futures-launch",
    category: "product",
    title: "USDT-M Futures launched — Up to 100× leverage",
    body: "Perpetual futures are now live on BTC, ETH, SOL and 20+ pairs. Cross & isolated margin supported with deep liquidity.",
    date: "2026-04-22",
    pinned: true,
    link: { href: "/futures", label: "Trade Futures" },
  },
  {
    id: "2fa-recommend",
    category: "security",
    title: "Enable 2FA — Secure your account",
    body: "Accounts without 2FA have reduced withdrawal limits. Set up Google Authenticator or Authy in under 30 seconds.",
    date: "2026-04-20",
    link: { href: "/settings", label: "Enable 2FA" },
  },
  {
    id: "earn-flexible",
    category: "product",
    title: "Earn module — Flexible savings live (up to 8% APY)",
    body: "Flexible and fixed staking is now live on USDT, BTC, and ETH. Earn daily rewards with anytime withdrawal on flexible plans.",
    date: "2026-04-15",
    link: { href: "/earn", label: "Start earning" },
  },
  {
    id: "maint-may",
    category: "maintenance",
    title: "Scheduled wallet maintenance: 3 May, 02:00–03:00 IST",
    body: "BTC and ETH wallets will be briefly offline for scheduled maintenance. Trading and order matching will continue normally.",
    date: "2026-04-12",
  },
  {
    id: "p2p-coming",
    category: "product",
    title: "P2P trading is coming — Join the waitlist",
    body: "Our peer-to-peer marketplace for INR ↔ USDT is launching soon. UPI, IMPS, and NEFT payment methods supported.",
    date: "2026-04-08",
    link: { href: "/p2p", label: "Learn more" },
  },
];

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AnnouncementsPage() {
  const [filter, setFilter] = useState<Category | "all">("all");
  const [items, setItems] = useState<Announcement[]>(CURATED);

  // Try to merge in live announcements from the API; fall back to curated only.
  useEffect(() => {
    let cancelled = false;
    get<unknown[]>("/content/announcements")
      .then((data) => {
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        const mapped: Announcement[] = [];
        data.forEach((raw, i) => {
          if (!raw || typeof raw !== "object") return;
          const r = raw as Record<string, unknown>;
          const catRaw = (r.category as string) || "product";
          const cat: Category = (["product", "security", "maintenance", "promotion"] as const).includes(catRaw as Category)
            ? (catRaw as Category)
            : "product";
          mapped.push({
            id: String(r.id ?? `api-${i}`),
            category: cat,
            title: String(r.title ?? "Announcement"),
            body: String(r.body ?? r.description ?? ""),
            date: String(r.publishedAt ?? r.date ?? r.createdAt ?? new Date().toISOString()),
            pinned: Boolean(r.isPinned ?? r.pinned),
            link: r.ctaLabel && r.ctaUrl
              ? { label: String(r.ctaLabel), href: String(r.ctaUrl) }
              : undefined,
          });
        });
        // Replace curated entirely if admin has published anything; otherwise keep curated copy.
        if (mapped.length) setItems(mapped);
      })
      .catch(() => {
        /* silent — keep curated */
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <PageHeader
        eyebrow="Promotion"
        title="Announcements"
        description="Latest product updates, security alerts, and platform announcements — all in one place."
        actions={<StatusPill status="active">{items.length} updates</StatusPill>}
      />

      <SectionCard className="p-3 mb-4 flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
        {(Object.keys(CATEGORY_META) as Category[]).map((c) => (
          <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {CATEGORY_META[c].label}
          </FilterChip>
        ))}
      </SectionCard>

      <div className="space-y-3">
        {sorted.map((a) => {
          const meta = CATEGORY_META[a.category];
          const Icon = meta.icon;
          return (
            <article
              key={a.id}
              className={`rounded-xl border border-border bg-card p-4 sm:p-5 transition hover:border-amber-500/30 ${
                a.pinned ? `ring-1 ${meta.ring}` : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${meta.tone}`}>
                      {meta.label}
                    </Badge>
                    {a.pinned && (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                        📌 Pinned
                      </Badge>
                    )}
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {relativeDate(a.date)}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground leading-snug">
                    {a.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {a.body}
                  </p>
                  {a.link && (
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <Link href={a.link.href}>
                        {a.link.label} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {sorted.length === 0 && (
          <SectionCard className="p-12 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No announcements in this category yet.</p>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 h-8 rounded-full text-xs font-semibold transition border ${
        active
          ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
          : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
