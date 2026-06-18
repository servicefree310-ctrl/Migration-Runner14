import { useMemo, useState } from "react";
import {
  BookOpen, Search, Calendar, Clock, ArrowRight, Sparkles,
  TrendingUp, Shield, Coins, GraduationCap, Megaphone, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Category = "All" | "Markets" | "Product" | "Security" | "Education" | "Announcements";

type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: Exclude<Category, "All">;
  author: string;
  date: string;
  readMin: number;
  featured?: boolean;
};

const POSTS: Post[] = [
  { slug: "zbx-l1-mainnet-genesis", title: "Zebvix L1 mainnet genesis — what shipped at block 0", excerpt: "Chain ID 8989, sub-second finality, EIP-1559 fees in ZBX, ZBX-20 standard live. A walkthrough of the genesis configuration and the validator set.", category: "Announcements", author: "Aarav Sharma", date: "22 April 2026", readMin: 7, featured: true },
  { slug: "spot-fees-cut-april-2026", title: "Spot fees cut to 0.10% across the board — and what we're not changing", excerpt: "Why we picked a single, simple number, what we kept untouched on purpose, and how this lines up with the new VIP tier table.", category: "Product", author: "Priya Iyer", date: "20 April 2026", readMin: 4 },
  { slug: "futures-100x-india-launch", title: "Perpetual futures with up to 125× leverage — now live in India", excerpt: "Risk warnings up front, then the actual product: cross + isolated margin, dual price oracle, partial liquidations, insurance fund mechanics.", category: "Product", author: "Rohan Mehta", date: "15 April 2026", readMin: 8 },
  { slug: "weekly-roundup-w16", title: "Weekly market roundup — week 16, 2026", excerpt: "BTC range-bound, ETH shows relative strength after the Pectra upgrade, INR pairs hit a new all-time-high in volume. Charts inside.", category: "Markets", author: "Ananya Rao", date: "13 April 2026", readMin: 6 },
  { slug: "what-is-utxo", title: "What is a UTXO? A 10-minute primer for first-time crypto buyers", excerpt: "Bitcoin's accounting model explained without jargon. Why your wallet shows multiple 'inputs', and what 'change' actually means.", category: "Education", author: "Kavya Nair", date: "10 April 2026", readMin: 10 },
  { slug: "phishing-2026-playbook", title: "The 2026 crypto phishing playbook — how attackers are targeting Indian users", excerpt: "Fake giveaway pages, SIM-swap, fake Telegram support, OTP harvesting. Real screenshots from real attacks, and how to defend.", category: "Security", author: "Vikram Singh", date: "07 April 2026", readMin: 9 },
  { slug: "proof-of-reserves-q1-2026", title: "Proof-of-reserves report — Q1 2026", excerpt: "Merkle-tree attestation of every customer balance, signed by an independent auditor. Reserve ratios per asset, with full methodology.", category: "Announcements", author: "Treasury Team", date: "05 April 2026", readMin: 5 },
  { slug: "earn-flexible-vs-locked", title: "Flexible vs locked savings — which one is right for you?", excerpt: "APY differences, compounding mechanics, early-redemption penalties, and an honest take on when locked savings actually make sense.", category: "Education", author: "Priya Iyer", date: "01 April 2026", readMin: 7 },
  { slug: "listing-pol-shib-pepe", title: "New listings — POL, SHIB, PEPE on the spot exchange", excerpt: "Listing date, deposit windows, trading-pair coverage, and the listing-review checklist we used. Risk disclosures included.", category: "Announcements", author: "Listings Team", date: "28 March 2026", readMin: 4 },
  { slug: "section-194s-explained", title: "Section 194S, simply explained — what 1% TDS means for your trades", excerpt: "How TDS is computed, when it's deducted, what your TDS certificate looks like, and how to claim it back at filing time.", category: "Education", author: "Tax Desk", date: "25 March 2026", readMin: 8 },
];

const CATEGORIES: { id: Category; label: string; icon: typeof BookOpen }[] = [
  { id: "All",           label: "All",           icon: BookOpen },
  { id: "Markets",       label: "Markets",       icon: TrendingUp },
  { id: "Product",       label: "Product",       icon: Sparkles },
  { id: "Security",      label: "Security",      icon: Shield },
  { id: "Education",     label: "Education",     icon: GraduationCap },
  { id: "Announcements", label: "Announcements", icon: Megaphone },
];

const CATEGORY_TINT: Record<Post["category"], string> = {
  Markets:       "from-emerald-500/20 to-emerald-500/0",
  Product:       "from-primary/20 to-primary/0",
  Security:      "from-rose-500/20 to-rose-500/0",
  Education:     "from-sky-500/20 to-sky-500/0",
  Announcements: "from-violet-500/20 to-violet-500/0",
};

export default function Blog() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("All");
  const [email, setEmail] = useState("");

  const featured = POSTS.find((p) => p.featured);
  const regular = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return POSTS.filter((p) => !p.featured)
      .filter((p) => cat === "All" || p.category === cat)
      .filter((p) => !ql || p.title.toLowerCase().includes(ql) || p.excerpt.toLowerCase().includes(ql));
  }, [q, cat]);

  const onSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }
    toast.success(`Subscribed! We'll send the weekly digest to ${email}.`);
    setEmail("");
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-blog">
      {/* Hero */}
      <section className="mb-10 max-w-3xl">
        <Badge variant="outline" className="mb-3 bg-background/50">
          <BookOpen className="h-3 w-3 mr-1.5 text-primary" /> Blog
        </Badge>
        <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
          Research, product news, and{" "}
          <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
            crypto education
          </span>{" "}
          — for India.
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          Weekly market commentary, deep product write-ups, security
          guides, and plain-language explainers from the Zebvix team.
        </p>
      </section>

      {/* Featured */}
      {featured && (
        <a
          href={`#${featured.slug}`}
          className="block rounded-2xl border border-border bg-card/40 mb-10 overflow-hidden hover:border-primary/40 transition-colors group"
          data-testid="card-blog-featured"
        >
          <div className={`relative bg-gradient-to-br ${CATEGORY_TINT[featured.category]} via-card to-card p-8 md:p-10`}>
            <div className="absolute top-4 right-4 hidden md:block">
              <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30">
                <Sparkles className="h-3 w-3 mr-1" /> Featured
              </Badge>
            </div>
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-3 text-[10px]">{featured.category}</Badge>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3 group-hover:text-primary transition-colors">
                {featured.title}
              </h2>
              <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                {featured.excerpt}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{featured.author}</span>
                <span className="opacity-50">·</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {featured.date}</span>
                <span className="opacity-50">·</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {featured.readMin} min read</span>
              </div>
            </div>
          </div>
        </a>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts…"
            className="pl-9"
            data-testid="input-blog-search"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
                cat === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card/40 text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
              }`}
              data-testid={`button-blog-cat-${c.id.toLowerCase()}`}
            >
              <c.icon className="h-3 w-3" />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
        {regular.map((p) => (
          <a
            key={p.slug}
            href={`#${p.slug}`}
            className="rounded-xl border border-border bg-card/40 p-5 hover:border-primary/40 transition-colors group flex flex-col"
            data-testid={`card-blog-${p.slug}`}
          >
            <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${CATEGORY_TINT[p.category]} mb-3 opacity-80`} />
            <Badge variant="outline" className="text-[10px] self-start mb-2">{p.category}</Badge>
            <h3 className="font-semibold text-base leading-snug mb-2 group-hover:text-primary transition-colors">
              {p.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-4 flex-1">
              {p.excerpt}
            </p>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 border-t border-border">
              <span>{p.author}</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {p.readMin} min
              </span>
            </div>
          </a>
        ))}
        {regular.length === 0 && (
          <div className="md:col-span-2 lg:col-span-3 text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No posts match your filters.</p>
          </div>
        )}
      </div>

      {/* Newsletter */}
      <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/30">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="flex items-start gap-4 max-w-xl">
              <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold text-lg mb-1">Weekly digest</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Every Friday morning — top moves, on-chain stats,
                  product launches, and one deeply-researched feature.
                  No spam, unsubscribe in one click.
                </p>
              </div>
            </div>
            <form onSubmit={onSubscribe} className="flex w-full md:w-auto gap-2 flex-shrink-0">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="md:w-64"
                data-testid="input-blog-newsletter-email"
              />
              <Button type="submit" data-testid="button-blog-subscribe" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap">
                Subscribe <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground mt-6 leading-relaxed">
        <Coins className="h-3 w-3 inline mr-1" />
        Nothing on this blog is investment advice. See our{" "}
        <a className="text-primary hover:underline" href="/legal/risk">Risk Disclosure</a>.
      </p>
    </div>
  );
}
