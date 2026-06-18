import { Link } from "wouter";
import { ZebvixLogo } from "@/components/ZebvixLogo";
import {
  Twitter, Send, Github, Youtube, Instagram, Facebook, Linkedin,
  MessageCircle, Mail, Shield, Lock, Award, Globe2, ArrowRight,
  CheckCircle2, TrendingUp, Zap, BarChart3, Repeat2, Wallet,
  Users, Brain, Bot, PiggyBank, Layers, Smartphone, ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSiteConfig, type FooterSocial, type FooterBadge } from "@/lib/siteConfig";
import { useState } from "react";

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  twitter:   Twitter,
  telegram:  Send,
  instagram: Instagram,
  youtube:   Youtube,
  github:    Github,
  facebook:  Facebook,
  linkedin:  Linkedin,
  discord:   MessageCircle,
};

const BADGE_ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  lock:   Lock,
  award:  Award,
};

const PRODUCTS = [
  { label: "Spot Trading",      href: "/trade",       icon: TrendingUp,  desc: "0.10% maker/taker" },
  { label: "Perpetual Futures", href: "/futures",      icon: Zap,         desc: "Up to 50× leverage" },
  { label: "P2P Trading",       href: "/p2p",          icon: Repeat2,     desc: "Zero platform fee" },
  { label: "AI Trading",        href: "/ai-trading",   icon: Brain,       desc: "Automated strategies" },
  { label: "Grid & DCA Bots",   href: "/bots",         icon: Bot,         desc: "24/7 auto-trade" },
  { label: "Earn & Staking",    href: "/earn",         icon: PiggyBank,   desc: "Up to 18% APY" },
  { label: "Copy Trading",      href: "/copy-trading", icon: Users,       desc: "Follow top traders" },
  { label: "Convert",           href: "/convert",      icon: Repeat2,     desc: "Instant swaps" },
];

const TRUST_STATS = [
  { label: "Registered users",  value: "2.4M+" },
  { label: "24h volume",        value: "₹15,000 Cr" },
  { label: "Assets supported",  value: "320+" },
  { label: "Uptime SLA",        value: "99.99%" },
];

export function AppFooter() {
  const { brand, footer } = useSiteConfig();
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes("@")) { setSubscribed(true); }
  };

  return (
    <footer className="mt-auto border-t border-border/60">

      {/* ── Product showcase strip ────────────────────────────── */}
      <div className="bg-card/60 border-b border-border/50">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-5">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Our products</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {PRODUCTS.map(({ label, href, icon: Icon, desc }) => (
              <Link key={href} href={href}>
                <button className="w-full group rounded-xl border border-border/60 bg-background/40 hover:border-primary/40 hover:bg-primary/5 p-3 flex flex-col items-center text-center transition-all duration-200">
                  <div className="h-9 w-9 rounded-lg bg-muted/60 group-hover:bg-primary/10 flex items-center justify-center mb-2 transition-colors">
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-xs font-semibold leading-tight mb-0.5">{label}</div>
                  <div className="text-[10px] text-muted-foreground/70 leading-tight">{desc}</div>
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Trust stats bar ───────────────────────────────────── */}
      <div className="bg-primary/5 border-b border-border/40">
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {TRUST_STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-lg md:text-xl font-extrabold tabular-nums text-foreground">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Newsletter strip ──────────────────────────────────── */}
      <div className="bg-gradient-to-r from-primary/8 via-card to-card border-b border-border/50">
        <div className="container mx-auto px-6 py-8 flex flex-col lg:flex-row items-start lg:items-center gap-6 justify-between">
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Stay ahead of the market
            </h3>
            <p className="text-sm text-muted-foreground">
              Weekly market briefings, new listings, product updates, and exclusive ZBX airdrops — straight to your inbox.
            </p>
          </div>
          {subscribed ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
              <CheckCircle2 className="h-5 w-5" /> You're subscribed! Watch your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex w-full lg:w-auto gap-2 lg:min-w-[380px]">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-9 h-10 bg-background border-border/70 focus:border-primary/50"
                  aria-label="Email address"
                  required
                />
              </div>
              <Button type="submit" size="sm" className="h-10 px-5 gap-1.5 shrink-0">
                Subscribe <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </form>
          )}
        </div>
      </div>

      {/* ── Main columns ─────────────────────────────────────── */}
      <div className="bg-card/30">
        <div className="container mx-auto px-6 py-12 grid gap-10 lg:grid-cols-12">

          {/* Brand block */}
          <div className="lg:col-span-4 space-y-5">
            <Link href="/" className="inline-flex">
              <ZebvixLogo variant="wordmark" size={34} />
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {brand.tagline} India's most compliant crypto exchange — built on its own L1 blockchain.
            </p>

            {/* Trust badges */}
            {footer.badges.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                {footer.badges.map((b) => <TrustBadge key={b.label} badge={b} />)}
              </div>
            )}

            {/* App download */}
            <div className="pt-1 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5" /> Download the app
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://play.google.com/store"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/70 bg-background/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-xs font-medium"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-muted-foreground"><path d="M3.18 23.76c.28.16.6.24.93.24.35 0 .7-.1 1.01-.28l12.5-7.22-2.8-2.8-11.64 10.06zm-1.8-19.5C1.14 4.62 1 5.04 1 5.5v13c0 .46.14.88.38 1.24l.08.08L8.3 12 1.46 4.18l-.08.08zm19.06 8.38L17.8 10.5l-3.1 3.1 3.1 3.1 2.66-1.54c.76-.44.76-1.58 0-2.02zM4.11.52C3.8.34 3.45.24 3.1.24c-.33 0-.65.08-.93.24L13.8 10.08l2.8-2.8L4.11.52z"/></svg>
                  Google Play
                </a>
                <a
                  href="https://apps.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border/70 bg-background/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-xs font-medium"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-muted-foreground"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  App Store
                </a>
              </div>
            </div>

            {/* Socials */}
            {footer.socials.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {footer.socials.map((s) => <SocialLink key={s.label} social={s} />)}
              </div>
            )}
          </div>

          {/* Link columns */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
            {footer.columns.map((col) => (
              <div key={col.title} className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-foreground/60">
                  {col.title}
                </h4>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={`${col.title}:${l.label}`}>
                      {l.external || /^https?:\/\//.test(l.href) ? (
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1 group"
                        >
                          {l.label}
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </a>
                      ) : (
                        <Link
                          href={l.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                        >
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Compliance section ───────────────────────────────── */}
      <div className="border-t border-border/40 bg-card/20">
        <div className="container mx-auto px-6 py-5">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Shield className="h-2.5 w-2.5" /> ISO 27001
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Lock className="h-2.5 w-2.5" /> SOC 2 Type II
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Award className="h-2.5 w-2.5" /> FIU-IND (Pending)
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Wallet className="h-2.5 w-2.5" /> Proof of Reserves
              </Badge>
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              GSTIN: 09AACCZ9728R1ZH &nbsp;·&nbsp; CIN: U66190UW2026PTC251591 &nbsp;·&nbsp; Muzaffarnagar, UP
            </div>
          </div>
        </div>
      </div>

      {/* ── Risk disclaimer ─────────────────────────────────── */}
      {footer.riskWarning && (
        <div className="border-t border-border/30 bg-card/10">
          <div className="container mx-auto px-6 py-4 text-[11px] leading-relaxed text-muted-foreground/60">
            <strong className="text-muted-foreground/80 font-semibold">⚠ Risk warning: </strong>
            {footer.riskWarning}
            {" "}
            <Link href="/legal/risk" className="text-muted-foreground/70 hover:text-foreground underline underline-offset-2 transition-colors">
              Full risk disclosure →
            </Link>
          </div>
        </div>
      )}

      {/* ── Bottom bar ──────────────────────────────────────── */}
      <div className="border-t border-border/30 bg-background/60">
        <div className="container mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/55">
          <div>
            {brand.copyright
              .replace(/^©\s*/, "© ")
              .replace(/\{year\}/g, String(new Date().getFullYear()))}
          </div>
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              All systems operational
            </span>
            <a href="/status" className="hover:text-foreground transition-colors">Status</a>
            <a href="/api-status" className="hover:text-foreground transition-colors">API Status</a>
            <a href="/api-docs" className="hover:text-foreground transition-colors">API Docs</a>
            <span className="inline-flex items-center gap-1">
              <Globe2 className="h-3 w-3" />
              English (IN)
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({ social }: { social: FooterSocial }) {
  const Icon = SOCIAL_ICONS[social.kind] ?? Globe2;
  return (
    <a
      href={social.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={social.label}
      title={social.label}
      className="h-8 w-8 rounded-lg border border-border/60 bg-background/50 text-muted-foreground hover:text-primary hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center transition-all duration-150"
    >
      <Icon className="h-3.5 w-3.5" />
    </a>
  );
}

function TrustBadge({ badge }: { badge: FooterBadge }) {
  const Icon = BADGE_ICONS[badge.kind] ?? Shield;
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground/80">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
        <Icon className="h-3 w-3" />
      </span>
      <span>{badge.label}</span>
      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
    </span>
  );
}
