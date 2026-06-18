import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, del } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Search, Globe, Share2, FileCode2, Map, FileText, ArrowRightLeft,
  BarChart3, Save, RefreshCw, Loader2, Plus, Trash2, CheckCircle2,
  ExternalLink, Copy, AlertTriangle, Info, Eye, Code2, Zap,
  Twitter, Facebook, Link2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── types ──────────────────────────────────────────────────────────────── */
interface GlobalSeo {
  titleTemplate: string;
  defaultTitle: string;
  defaultDescription: string;
  defaultKeywords: string;
  canonicalBase: string;
  language: string;
  charset: string;
  noindexAll: boolean;
  googleSiteVerification: string;
  bingSiteVerification: string;
}

interface OgSeo {
  siteName: string;
  defaultOgImage: string;
  ogType: string;
  locale: string;
  twitterHandle: string;
  twitterCard: string;
  facebookAppId: string;
}

interface PageSeoEntry {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  noindex: boolean;
  nofollow: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
}

interface SitemapConfig {
  changefreqDefault: string;
  priorityDefault: string;
  urls: Array<{
    loc: string;
    priority: string;
    changefreq: string;
    exclude: boolean;
    lastmod?: string;
  }>;
}

interface StructuredItem {
  id: string;
  name: string;
  type: string;
  json: string;
  enabled: boolean;
}

interface RedirectRule {
  id: string;
  from: string;
  to: string;
  type: "301" | "302";
  note: string;
}

interface AnalyticsCfg {
  googleAnalyticsId: string;
  googleTagManagerId: string;
  googleSearchConsole: string;
  bingWebmaster: string;
  clarityId: string;
  facebookPixelId: string;
  hotjarId: string;
  mixpanelToken: string;
}

type SeoSettings = Partial<{
  "seo.global": GlobalSeo;
  "seo.opengraph": OgSeo;
  "seo.pages": Record<string, PageSeoEntry>;
  "seo.sitemap": SitemapConfig;
  "seo.structured_data": StructuredItem[];
  "seo.redirects": RedirectRule[];
  "seo.robots": string;
  "seo.analytics": AnalyticsCfg;
}>;

/* ─── defaults ─────────────────────────────────────────────────────────────── */
const DEFAULT_GLOBAL: GlobalSeo = {
  titleTemplate: "%s | Zebvix",
  defaultTitle: "Zebvix — India's Premier Crypto Exchange",
  defaultDescription: "Trade Bitcoin, Ethereum, USDT and 200+ cryptos with INR. Spot, Futures, P2P, Copy Trading, AI Plans, Earn & more on Zebvix — India's trusted crypto exchange.",
  defaultKeywords: "crypto exchange india, bitcoin trading india, buy bitcoin with inr, usdt trading, ethereum exchange india, zebvix, crypto trading platform",
  canonicalBase: "https://zebvix.com",
  language: "en",
  charset: "utf-8",
  noindexAll: false,
  googleSiteVerification: "",
  bingSiteVerification: "",
};

const DEFAULT_OG: OgSeo = {
  siteName: "Zebvix",
  defaultOgImage: "/og-default.png",
  ogType: "website",
  locale: "en_IN",
  twitterHandle: "@zebvix",
  twitterCard: "summary_large_image",
  facebookAppId: "",
};

const ALL_PAGES = [
  { slug: "/", label: "Home" },
  { slug: "/markets", label: "Markets" },
  { slug: "/trade", label: "Spot Trade" },
  { slug: "/futures", label: "Futures" },
  { slug: "/options", label: "Options" },
  { slug: "/p2p", label: "P2P" },
  { slug: "/convert", label: "Convert" },
  { slug: "/earn", label: "Earn / Staking" },
  { slug: "/ai-trading", label: "AI Trading" },
  { slug: "/copy-trading", label: "Copy Trading" },
  { slug: "/bots", label: "Trading Bots" },
  { slug: "/wallet", label: "Wallet" },
  { slug: "/portfolio", label: "Portfolio" },
  { slug: "/orders", label: "Orders" },
  { slug: "/discover", label: "Discover" },
  { slug: "/blog", label: "Blog" },
  { slug: "/news", label: "News" },
  { slug: "/tutorials", label: "Tutorials" },
  { slug: "/help", label: "Help Center" },
  { slug: "/support", label: "Support" },
  { slug: "/terms", label: "Terms of Service" },
  { slug: "/privacy", label: "Privacy Policy" },
  { slug: "/aml", label: "AML / KYC Policy" },
  { slug: "/fees", label: "Fee Schedule" },
  { slug: "/risk", label: "Risk Disclosure" },
  { slug: "/login", label: "Login" },
  { slug: "/signup", label: "Sign Up" },
  { slug: "/kyc", label: "KYC Verification" },
  { slug: "/invite", label: "Referrals" },
];

const DEFAULT_ROBOTS = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login
Disallow: /signup
Disallow: /wallet
Disallow: /orders
Disallow: /settings
Disallow: /profile
Disallow: /kyc

User-agent: Googlebot
Allow: /

Sitemap: https://zebvix.com/sitemap.xml`;

const DEFAULT_SITEMAP: SitemapConfig = {
  changefreqDefault: "weekly",
  priorityDefault: "0.7",
  urls: [
    { loc: "/",          priority: "1.0", changefreq: "daily",   exclude: false },
    { loc: "/markets",   priority: "0.9", changefreq: "hourly",  exclude: false },
    { loc: "/trade",     priority: "0.8", changefreq: "hourly",  exclude: false },
    { loc: "/futures",   priority: "0.8", changefreq: "hourly",  exclude: false },
    { loc: "/earn",      priority: "0.7", changefreq: "daily",   exclude: false },
    { loc: "/p2p",       priority: "0.7", changefreq: "daily",   exclude: false },
    { loc: "/ai-trading",priority: "0.7", changefreq: "weekly",  exclude: false },
    { loc: "/copy-trading",priority:"0.7",changefreq: "weekly",  exclude: false },
    { loc: "/blog",      priority: "0.6", changefreq: "weekly",  exclude: false },
    { loc: "/news",      priority: "0.6", changefreq: "weekly",  exclude: false },
    { loc: "/tutorials", priority: "0.6", changefreq: "weekly",  exclude: false },
    { loc: "/help",      priority: "0.5", changefreq: "weekly",  exclude: false },
    { loc: "/terms",     priority: "0.4", changefreq: "monthly", exclude: false },
    { loc: "/privacy",   priority: "0.4", changefreq: "monthly", exclude: false },
    { loc: "/fees",      priority: "0.5", changefreq: "weekly",  exclude: false },
    { loc: "/aml",       priority: "0.4", changefreq: "monthly", exclude: false },
  ],
};

const DEFAULT_ANALYTICS: AnalyticsCfg = {
  googleAnalyticsId: "",
  googleTagManagerId: "",
  googleSearchConsole: "",
  bingWebmaster: "",
  clarityId: "",
  facebookPixelId: "",
  hotjarId: "",
  mixpanelToken: "",
};

const STRUCTURED_PRESETS = [
  {
    name: "Organization",
    type: "Organization",
    json: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Zebvix",
      "url": "https://zebvix.com",
      "logo": "https://zebvix.com/logo.png",
      "sameAs": [
        "https://twitter.com/zebvix",
        "https://www.linkedin.com/company/zebvix",
        "https://t.me/zebvix"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "email": "support@zebvix.com",
        "availableLanguage": ["English", "Hindi"]
      }
    }, null, 2),
  },
  {
    name: "WebSite + SearchAction",
    type: "WebSite",
    json: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Zebvix",
      "url": "https://zebvix.com",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://zebvix.com/markets?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      }
    }, null, 2),
  },
  {
    name: "FinancialService",
    type: "FinancialService",
    json: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FinancialService",
      "name": "Zebvix Crypto Exchange",
      "url": "https://zebvix.com",
      "description": "India's trusted cryptocurrency exchange for buying, selling and trading Bitcoin, Ethereum and 200+ digital assets.",
      "areaServed": "IN",
      "currenciesAccepted": "INR, BTC, ETH, USDT",
      "priceRange": "Free - 0.15% per trade",
      "paymentAccepted": "UPI, IMPS, NEFT"
    }, null, 2),
  },
  {
    name: "FAQ Page",
    type: "FAQPage",
    json: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How do I create a Zebvix account?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Visit zebvix.com and click Sign Up. Enter your email or phone number, set a password, verify your OTP, and complete KYC to start trading."
          }
        },
        {
          "@type": "Question",
          "name": "What is the minimum deposit on Zebvix?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The minimum INR deposit via UPI is ₹100. For crypto deposits, minimum amounts vary by asset."
          }
        }
      ]
    }, null, 2),
  },
];

/* ─── utility ─────────────────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2, 9); }

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-mono font-semibold">{value}/100</span></div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SeoPreview({ title, description, url }: { title: string; description: string; url: string }) {
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-zinc-900 p-4 space-y-1">
      <p className="text-[11px] text-green-700 dark:text-green-400 font-mono truncate">{url}</p>
      <p className="text-[15px] text-blue-700 dark:text-blue-400 font-medium leading-tight line-clamp-1">{title || "Page Title"}</p>
      <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-snug line-clamp-2">{description || "Meta description will appear here…"}</p>
    </div>
  );
}

/* ─── Tab components ─────────────────────────────────────────────────────── */
function GlobalTab({ data, onSave, saving }: { data: GlobalSeo; onSave: (v: GlobalSeo) => void; saving: boolean }) {
  const [form, setForm] = useState<GlobalSeo>(data);
  const f = <K extends keyof GlobalSeo>(k: K, v: GlobalSeo[K]) => setForm(p => ({ ...p, [k]: v }));
  const previewTitle = form.titleTemplate.replace("%s", form.defaultTitle);

  return (
    <div className="space-y-6">
      {/* Google SERP preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> Google SERP Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <SeoPreview title={previewTitle} description={form.defaultDescription} url={`${form.canonicalBase}/`} />
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title Template</Label>
          <Input value={form.titleTemplate} onChange={e => f("titleTemplate", e.target.value)} placeholder="%s | Zebvix" />
          <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">%s</code> as placeholder for page-specific title</p>
        </div>
        <div className="space-y-2">
          <Label>Default Page Title</Label>
          <Input value={form.defaultTitle} onChange={e => f("defaultTitle", e.target.value)} />
          <p className="text-xs text-muted-foreground">Used on homepage and pages without custom titles</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Default Meta Description <span className="text-muted-foreground text-xs ml-1">{form.defaultDescription.length}/160</span></Label>
        <Textarea value={form.defaultDescription} onChange={e => f("defaultDescription", e.target.value)} rows={3} className="resize-none" />
        {form.defaultDescription.length > 160 && (
          <p className="text-xs text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Description too long — Google truncates at ~160 chars</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Default Keywords</Label>
        <Input value={form.defaultKeywords} onChange={e => f("defaultKeywords", e.target.value)} placeholder="crypto exchange india, bitcoin trading..." />
        <p className="text-xs text-muted-foreground">Comma-separated. Note: Google largely ignores this meta tag, but Bing still uses it.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Canonical Base URL</Label>
          <Input value={form.canonicalBase} onChange={e => f("canonicalBase", e.target.value)} placeholder="https://zebvix.com" />
        </div>
        <div className="space-y-2">
          <Label>Language (lang attribute)</Label>
          <Input value={form.language} onChange={e => f("language", e.target.value)} placeholder="en" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Google Site Verification</Label>
          <Input value={form.googleSiteVerification} onChange={e => f("googleSiteVerification", e.target.value)} placeholder="google-site-verification content value" />
        </div>
        <div className="space-y-2">
          <Label>Bing Site Verification</Label>
          <Input value={form.bingSiteVerification} onChange={e => f("bingSiteVerification", e.target.value)} placeholder="msvalidate.01 content value" />
        </div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
        <div>
          <Label className="text-sm">Global noindex</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Prevent ALL pages from being indexed. Use during development only.</p>
        </div>
        <Switch checked={form.noindexAll} onCheckedChange={v => f("noindexAll", v)} />
      </div>
      {form.noindexAll && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Global noindex is ON — your site will not appear in search results!</span>
        </div>
      )}

      <Button onClick={() => onSave(form)} disabled={saving} className="bg-primary text-primary-foreground">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Global SEO
      </Button>
    </div>
  );
}

function OgTab({ data, onSave, saving }: { data: OgSeo; onSave: (v: OgSeo) => void; saving: boolean }) {
  const [form, setForm] = useState<OgSeo>(data);
  const f = <K extends keyof OgSeo>(k: K, v: OgSeo[K]) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      {/* Social preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> Twitter / Facebook Card Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden max-w-sm">
            <div className="aspect-[1200/630] bg-gradient-to-br from-amber-500/20 to-zinc-900 flex items-center justify-center">
              {form.defaultOgImage ? (
                <img src={form.defaultOgImage} alt="OG" className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = "none")} />
              ) : (
                <div className="text-zinc-500 text-sm">OG Image Preview</div>
              )}
            </div>
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase">{form.siteName}</p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Zebvix — India's Premier Crypto Exchange</p>
              <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">Trade Bitcoin, Ethereum and 200+ cryptos with INR.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>OG Site Name</Label>
          <Input value={form.siteName} onChange={e => f("siteName", e.target.value)} placeholder="Zebvix" />
        </div>
        <div className="space-y-2">
          <Label>OG Type</Label>
          <select
            value={form.ogType}
            onChange={e => f("ogType", e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {["website", "article", "product", "profile"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Default OG Image URL</Label>
        <Input value={form.defaultOgImage} onChange={e => f("defaultOgImage", e.target.value)} placeholder="https://zebvix.com/og-default.png" />
        <p className="text-xs text-muted-foreground">Recommended: 1200×630px. Used when a page has no custom OG image.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>OG Locale</Label>
          <Input value={form.locale} onChange={e => f("locale", e.target.value)} placeholder="en_IN" />
        </div>
        <div className="space-y-2">
          <Label>Facebook App ID</Label>
          <div className="relative"><Facebook className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={form.facebookAppId} onChange={e => f("facebookAppId", e.target.value)} placeholder="123456789012345" />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Twitter Handle</Label>
          <div className="relative"><Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={form.twitterHandle} onChange={e => f("twitterHandle", e.target.value)} placeholder="@zebvix" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Twitter Card Type</Label>
          <select
            value={form.twitterCard}
            onChange={e => f("twitterCard", e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {["summary", "summary_large_image", "app", "player"].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <Button onClick={() => onSave(form)} disabled={saving} className="bg-primary text-primary-foreground">
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Open Graph Settings
      </Button>
    </div>
  );
}

function PagesTab({ data, onSave, saving }: { data: Record<string, PageSeoEntry>; onSave: (v: Record<string, PageSeoEntry>) => void; saving: boolean }) {
  const [pages, setPages] = useState<Record<string, PageSeoEntry>>(data);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = ALL_PAGES.filter(p => p.label.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase()));

  const getEntry = (slug: string): PageSeoEntry => pages[slug] ?? { title: "", description: "", keywords: "", canonical: "", noindex: false, nofollow: false, ogTitle: "", ogDescription: "", ogImage: "" };
  const setEntry = (slug: string, patch: Partial<PageSeoEntry>) => setPages(p => ({ ...p, [slug]: { ...getEntry(slug), ...patch } }));

  const hasCustom = (slug: string) => {
    const e = pages[slug];
    return e && (e.title || e.description || e.noindex || e.canonical);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search pages…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => onSave(pages)} disabled={saving} className="bg-primary text-primary-foreground ml-auto">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save All Pages
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {filtered.map(page => {
          const entry = getEntry(page.slug);
          const open = expanded === page.slug;
          const custom = hasCustom(page.slug);

          return (
            <div key={page.slug}>
              <button
                type="button"
                onClick={() => setExpanded(open ? null : page.slug)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors"
              >
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{page.label}</span>
                    {custom && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Custom</Badge>}
                    {entry.noindex && <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30">noindex</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{page.slug}</span>
                </div>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {open && (
                <div className="px-4 pb-4 pt-2 bg-accent/5 border-t border-border space-y-4">
                  {/* SERP Preview */}
                  <SeoPreview
                    title={entry.title || "(using default title template)"}
                    description={entry.description || "(using default meta description)"}
                    url={`https://zebvix.com${page.slug}`}
                  />
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Page Title <span className="text-muted-foreground">{entry.title.length}/60</span></Label>
                      <Input value={entry.title} onChange={e => setEntry(page.slug, { title: e.target.value })} placeholder="Leave blank to use template" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Canonical URL</Label>
                      <Input value={entry.canonical} onChange={e => setEntry(page.slug, { canonical: e.target.value })} placeholder={`https://zebvix.com${page.slug}`} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Meta Description <span className="text-muted-foreground">{entry.description.length}/160</span></Label>
                    <Textarea value={entry.description} onChange={e => setEntry(page.slug, { description: e.target.value })} rows={2} className="resize-none text-sm" placeholder="Leave blank to use default" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Keywords</Label>
                    <Input value={entry.keywords} onChange={e => setEntry(page.slug, { keywords: e.target.value })} placeholder="comma,separated,keywords" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">OG Title (Social)</Label>
                      <Input value={entry.ogTitle} onChange={e => setEntry(page.slug, { ogTitle: e.target.value })} placeholder="Overrides title for social shares" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">OG Image URL</Label>
                      <Input value={entry.ogImage} onChange={e => setEntry(page.slug, { ogImage: e.target.value })} placeholder="https://..." />
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch checked={entry.noindex} onCheckedChange={v => setEntry(page.slug, { noindex: v })} />
                      <Label className="text-sm">noindex</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={entry.nofollow} onCheckedChange={v => setEntry(page.slug, { nofollow: v })} />
                      <Label className="text-sm">nofollow</Label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StructuredDataTab({ data, onSave, saving }: { data: StructuredItem[]; onSave: (v: StructuredItem[]) => void; saving: boolean }) {
  const [items, setItems] = useState<StructuredItem[]>(data);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addPreset = (preset: typeof STRUCTURED_PRESETS[0]) => {
    const item: StructuredItem = { id: uid(), name: preset.name, type: preset.type, json: preset.json, enabled: true };
    setItems(p => [...p, item]);
    setExpandedId(item.id);
  };

  const update = (id: string, patch: Partial<StructuredItem>) => setItems(p => p.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id: string) => setItems(p => p.filter(i => i.id !== id));

  const isValidJson = (j: string) => { try { JSON.parse(j); return true; } catch { return false; } };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">JSON-LD Schemas</h3>
          <p className="text-xs text-muted-foreground">Structured data injected in &lt;head&gt; as application/ld+json scripts</p>
        </div>
        <Button onClick={() => onSave(items)} disabled={saving} className="bg-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>

      {/* Presets */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Add from presets</p>
        <div className="flex flex-wrap gap-2">
          {STRUCTURED_PRESETS.map(p => (
            <Button key={p.name} variant="outline" size="sm" onClick={() => addPreset(p)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> {p.name}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => {
            const item: StructuredItem = { id: uid(), name: "Custom Schema", type: "Custom", json: '{\n  "@context": "https://schema.org",\n  "@type": ""\n}', enabled: true };
            setItems(p => [...p, item]);
            setExpandedId(item.id);
          }}>
            <Code2 className="h-3.5 w-3.5 mr-1.5" /> Custom
          </Button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
          No structured data schemas yet. Add one from the presets above.
        </div>
      )}

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Switch checked={item.enabled} onCheckedChange={v => update(item.id, { enabled: v })} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{item.name}</span>
                  <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                  {!isValidJson(item.json) && <Badge className="text-[10px] bg-red-500/20 text-red-400 border-0">Invalid JSON</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                {expandedId === item.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(item.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {expandedId === item.id && (
              <div className="px-4 pb-4 border-t border-border space-y-3 bg-accent/5">
                <div className="grid sm:grid-cols-2 gap-3 pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Schema name</Label>
                    <Input value={item.name} onChange={e => update(item.id, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Schema @type</Label>
                    <Input value={item.type} onChange={e => update(item.id, { type: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">JSON-LD</Label>
                  <Textarea
                    value={item.json}
                    onChange={e => update(item.id, { json: e.target.value })}
                    rows={12}
                    className={cn("font-mono text-xs resize-none", !isValidJson(item.json) && "border-red-500/50 focus-visible:ring-red-500")}
                  />
                  {!isValidJson(item.json) && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Invalid JSON — fix before saving</p>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SitemapTab({ data, onSave, saving }: { data: SitemapConfig; onSave: (v: SitemapConfig) => void; saving: boolean }) {
  const [cfg, setCfg] = useState<SitemapConfig>(data);
  const [previewXml, setPreviewXml] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const updateUrl = (loc: string, patch: Partial<SitemapConfig["urls"][0]>) =>
    setCfg(p => ({ ...p, urls: p.urls.map(u => u.loc === loc ? { ...u, ...patch } : u) }));

  const addUrl = () => setCfg(p => ({ ...p, urls: [...p.urls, { loc: "/new-page", priority: "0.5", changefreq: "weekly", exclude: false }] }));
  const removeUrl = (loc: string) => setCfg(p => ({ ...p, urls: p.urls.filter(u => u.loc !== loc) }));

  const generatePreview = () => {
    const now = new Date().toISOString().split("T")[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${cfg.urls.filter(u => !u.exclude).map(u => `  <url>
    <loc>https://zebvix.com${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
    setPreviewXml(xml);
    setShowPreview(true);
  };

  const FREQ_OPTIONS = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];
  const PRIORITY_OPTIONS = ["1.0", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Sitemap.xml Configuration</h3>
          <p className="text-xs text-muted-foreground">Available at <a href="/sitemap.xml" target="_blank" className="text-primary hover:underline">/sitemap.xml <ExternalLink className="inline h-3 w-3" /></a></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generatePreview}><Eye className="h-4 w-4 mr-1.5" /> Preview XML</Button>
          <Button onClick={() => onSave(cfg)} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {showPreview && (
        <div className="rounded-xl border border-border bg-zinc-900 p-4 relative">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-muted-foreground">sitemap.xml preview</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(previewXml); toast.success("Copied!"); }}>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowPreview(false)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
          <pre className="text-[11px] font-mono text-green-400 overflow-auto max-h-64 whitespace-pre">{previewXml}</pre>
        </div>
      )}

      {/* Submit to search engines */}
      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { name: "Google", url: "https://search.google.com/search-console/sitemaps", color: "text-blue-400" },
          { name: "Bing", url: "https://www.bing.com/webmasters/sitemaps", color: "text-sky-400" },
          { name: "Yandex", url: "https://webmaster.yandex.com/site/", color: "text-red-400" },
        ].map(se => (
          <a key={se.name} href={se.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/40 transition-colors">
            <ExternalLink className={`h-4 w-4 ${se.color}`} />
            <div>
              <div className="text-xs font-medium">Submit to {se.name}</div>
              <div className="text-[10px] text-muted-foreground">Open Search Console</div>
            </div>
          </a>
        ))}
      </div>

      {/* URL table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-accent/20">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">URL Path</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Priority</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Change Freq</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Include</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cfg.urls.map((url, i) => (
              <tr key={i} className={cn("hover:bg-accent/10", url.exclude && "opacity-50")}>
                <td className="px-4 py-2">
                  <Input className="h-7 text-xs font-mono" value={url.loc} onChange={e => updateUrl(url.loc, { loc: e.target.value })} />
                </td>
                <td className="px-4 py-2">
                  <select value={url.priority} onChange={e => updateUrl(url.loc, { priority: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs w-16">
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select value={url.changefreq} onChange={e => updateUrl(url.loc, { changefreq: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs w-24">
                    {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <Switch checked={!url.exclude} onCheckedChange={v => updateUrl(url.loc, { exclude: !v })} />
                </td>
                <td className="px-4 py-2">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeUrl(url.loc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={addUrl}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add URL</Button>
        </div>
      </div>
    </div>
  );
}

function RobotsTab({ data, onSave, saving }: { data: string; onSave: (v: string) => void; saving: boolean }) {
  const [txt, setTxt] = useState(data);

  const PRESETS = [
    { name: "Allow All", value: "User-agent: *\nAllow: /\n\nSitemap: https://zebvix.com/sitemap.xml" },
    { name: "Block All (Dev)", value: "User-agent: *\nDisallow: /\n" },
    { name: "Block Admin Only", value: "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: https://zebvix.com/sitemap.xml" },
    { name: "Standard (Zebvix)", value: DEFAULT_ROBOTS },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">robots.txt Editor</h3>
          <p className="text-xs text-muted-foreground">Available at <a href="/robots.txt" target="_blank" className="text-primary hover:underline">/robots.txt <ExternalLink className="inline h-3 w-3" /></a></p>
        </div>
        <Button onClick={() => onSave(txt)} disabled={saving} className="bg-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save robots.txt
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Quick presets:</span>
        {PRESETS.map(p => (
          <Button key={p.name} variant="outline" size="sm" onClick={() => setTxt(p.value)}>{p.name}</Button>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-accent/10 border-b border-border">
          <span className="text-xs font-mono text-muted-foreground">robots.txt</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(txt); toast.success("Copied!"); }}>
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </div>
        <Textarea
          value={txt}
          onChange={e => setTxt(e.target.value)}
          rows={16}
          className="rounded-none border-0 font-mono text-xs resize-none focus-visible:ring-0"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-blue-400" /> robots.txt Quick Reference</h4>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-xs text-muted-foreground font-mono">
          {[
            ["User-agent: *", "Apply rule to all bots"],
            ["User-agent: Googlebot", "Apply rule to Google only"],
            ["Allow: /", "Allow crawling this path"],
            ["Disallow: /admin/", "Block crawling this path"],
            ["Crawl-delay: 10", "Wait 10s between requests"],
            ["Sitemap: https://...", "Point to sitemap location"],
          ].map(([code, desc]) => (
            <div key={code} className="flex gap-2">
              <code className="text-primary">{code}</code>
              <span>— {desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RedirectsTab({ data, onSave, saving }: { data: RedirectRule[]; onSave: (v: RedirectRule[]) => void; saving: boolean }) {
  const [rules, setRules] = useState<RedirectRule[]>(data);
  const add = () => setRules(p => [...p, { id: uid(), from: "/old-page", to: "/new-page", type: "301", note: "" }]);
  const update = (id: string, patch: Partial<RedirectRule>) => setRules(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) => setRules(p => p.filter(r => r.id !== id));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">301 / 302 Redirects</h3>
          <p className="text-xs text-muted-foreground">{rules.length} redirect{rules.length !== 1 ? "s" : ""} configured</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1.5" /> Add Redirect</Button>
          <Button onClick={() => onSave(rules)} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
          No redirects yet. Add one to get started.
        </div>
      )}

      <div className="space-y-2">
        {rules.map(rule => (
          <div key={rule.id} className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card">
            <div className="flex-1 grid grid-cols-[1fr,auto,1fr,auto,80px,1fr] items-center gap-2">
              <Input className="h-8 text-xs font-mono" value={rule.from} onChange={e => update(rule.id, { from: e.target.value })} placeholder="/from" />
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input className="h-8 text-xs font-mono" value={rule.to} onChange={e => update(rule.id, { to: e.target.value })} placeholder="/to" />
              <Badge variant="outline" className="cursor-pointer text-xs whitespace-nowrap" onClick={() => update(rule.id, { type: rule.type === "301" ? "302" : "301" })}>
                {rule.type}
              </Badge>
              <Input className="h-8 text-xs" value={rule.note} onChange={e => update(rule.id, { note: e.target.value })} placeholder="Note" />
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => remove(rule.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">301 vs 302</p>
        <p><strong>301</strong> — Permanent redirect. Passes ~90% of link equity. Use for renamed/moved pages.</p>
        <p><strong>302</strong> — Temporary redirect. No link equity transfer. Use for A/B tests, temporary maintenance pages.</p>
      </div>
    </div>
  );
}

function AnalyticsTab({ data, onSave, saving }: { data: AnalyticsCfg; onSave: (v: AnalyticsCfg) => void; saving: boolean }) {
  const [form, setForm] = useState<AnalyticsCfg>(data);
  const f = <K extends keyof AnalyticsCfg>(k: K, v: AnalyticsCfg[K]) => setForm(p => ({ ...p, [k]: v }));

  const fields: Array<{ key: keyof AnalyticsCfg; label: string; placeholder: string; desc: string; docsUrl: string }> = [
    { key: "googleAnalyticsId",   label: "Google Analytics 4 (GA4)", placeholder: "G-XXXXXXXXXX", desc: "Measurement ID from GA4 property settings", docsUrl: "https://analytics.google.com/" },
    { key: "googleTagManagerId",  label: "Google Tag Manager",        placeholder: "GTM-XXXXXXX",  desc: "Container ID from GTM workspace",           docsUrl: "https://tagmanager.google.com/" },
    { key: "googleSearchConsole", label: "Google Search Console",    placeholder: "verification-token", desc: "HTML tag meta content value",           docsUrl: "https://search.google.com/search-console" },
    { key: "bingWebmaster",       label: "Bing Webmaster Tools",      placeholder: "bing-verification-token", desc: "BingSiteAuth msvalidate.01 value", docsUrl: "https://www.bing.com/webmasters" },
    { key: "clarityId",           label: "Microsoft Clarity",         placeholder: "xxxxxxxxxx",   desc: "Project ID from Clarity dashboard",          docsUrl: "https://clarity.microsoft.com/" },
    { key: "facebookPixelId",     label: "Facebook Pixel",            placeholder: "123456789012345", desc: "Pixel ID from Meta Events Manager",        docsUrl: "https://business.facebook.com/events_manager" },
    { key: "hotjarId",            label: "Hotjar",                    placeholder: "1234567",      desc: "Site ID from Hotjar settings",                docsUrl: "https://www.hotjar.com/" },
    { key: "mixpanelToken",       label: "Mixpanel",                  placeholder: "your-project-token", desc: "Project token from Mixpanel settings", docsUrl: "https://mixpanel.com/" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Analytics & Tracking Codes</h3>
          <p className="text-xs text-muted-foreground">Injected automatically into &lt;head&gt; on every page</p>
        </div>
        <Button onClick={() => onSave(form)} disabled={saving} className="bg-primary text-primary-foreground">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Analytics
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {fields.map(field => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{field.label}</Label>
              <a href={field.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                Dashboard <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
            <Input
              value={form[field.key]}
              onChange={e => f(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
            <p className="text-[11px] text-muted-foreground">{field.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300 space-y-1">
        <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> User Privacy Note (India DPDP Act 2023)</p>
        <p>Ensure your cookie consent banner is configured and analytics only activate after user consent. Implement a cookie banner before enabling tracking pixels in production.</p>
      </div>
    </div>
  );
}

/* ─── SEO Health Score ──────────────────────────────────────────────────────── */
function SeoScore({ settings }: { settings: SeoSettings }) {
  const g = settings["seo.global"];
  const og = settings["seo.opengraph"];
  const pages = settings["seo.pages"] ?? {};
  const robots = settings["seo.robots"];
  const sd = settings["seo.structured_data"] ?? [];
  const analytics = settings["seo.analytics"];

  const scores = {
    global:      g ? (g.defaultTitle ? 25 : 10) + (g.defaultDescription ? 25 : 0) + (g.canonicalBase ? 25 : 0) + (g.googleSiteVerification ? 25 : 0) : 0,
    opengraph:   og ? (og.siteName ? 30 : 0) + (og.defaultOgImage ? 40 : 0) + (og.twitterHandle ? 30 : 0) : 0,
    pages:       Math.min(100, Object.keys(pages).length * 5),
    structured:  Math.min(100, sd.filter(s => s.enabled).length * 33),
    analytics:   analytics ? ((analytics.googleAnalyticsId ? 50 : 0) + (analytics.googleSearchConsole ? 25 : 0) + (analytics.googleTagManagerId ? 25 : 0)) : 0,
    robots:      robots ? 100 : 0,
  };

  const avg = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length);
  const color = avg >= 80 ? "bg-emerald-500" : avg >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> SEO Health Score</CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white", color)}>{avg}</div>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-3 gap-x-8 gap-y-3">
          <ScoreBar label="Global Meta" value={scores.global} color={scores.global >= 80 ? "bg-emerald-500" : scores.global >= 50 ? "bg-amber-500" : "bg-red-500"} />
          <ScoreBar label="Open Graph" value={scores.opengraph} color={scores.opengraph >= 80 ? "bg-emerald-500" : scores.opengraph >= 50 ? "bg-amber-500" : "bg-red-500"} />
          <ScoreBar label="Page SEO" value={scores.pages} color={scores.pages >= 80 ? "bg-emerald-500" : scores.pages >= 50 ? "bg-amber-500" : "bg-red-500"} />
          <ScoreBar label="Structured Data" value={scores.structured} color={scores.structured >= 80 ? "bg-emerald-500" : scores.structured >= 50 ? "bg-amber-500" : "bg-red-500"} />
          <ScoreBar label="Analytics" value={scores.analytics} color={scores.analytics >= 80 ? "bg-emerald-500" : scores.analytics >= 50 ? "bg-amber-500" : "bg-red-500"} />
          <ScoreBar label="Robots.txt" value={scores.robots} color={scores.robots >= 80 ? "bg-emerald-500" : "bg-red-500"} />
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function SeoPage() {
  const qc = useQueryClient();

  const { data: rawSettings = {}, isLoading } = useQuery<SeoSettings>({
    queryKey: ["admin-seo"],
    queryFn: () => get<SeoSettings>("/admin/seo"),
  });

  const [savingKey, setSavingKey] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      put<unknown>(`/admin/seo/${key.replace("seo.", "")}`, { value }),
    onSuccess: (_data, vars) => {
      toast.success("Saved", { description: vars.key });
      qc.invalidateQueries({ queryKey: ["admin-seo"] });
    },
    onError: (e: Error) => toast.error("Save failed", { description: e.message }),
    onSettled: () => setSavingKey(null),
  });

  const save = useCallback((key: string, value: unknown) => {
    setSavingKey(key);
    saveMutation.mutate({ key, value });
  }, [saveMutation]);

  const global = rawSettings["seo.global"] ?? DEFAULT_GLOBAL;
  const og     = rawSettings["seo.opengraph"] ?? DEFAULT_OG;
  const pages  = rawSettings["seo.pages"] ?? {};
  const sitemap= rawSettings["seo.sitemap"] ?? DEFAULT_SITEMAP;
  const sd     = rawSettings["seo.structured_data"] ?? [];
  const robots = rawSettings["seo.robots"] ?? DEFAULT_ROBOTS;
  const redirects = rawSettings["seo.redirects"] ?? [];
  const analytics = rawSettings["seo.analytics"] ?? DEFAULT_ANALYTICS;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-seo">
      <PageHeader
        title="SEO Manager"
        description="Manage all SEO settings — meta tags, Open Graph, structured data, sitemap, robots.txt, redirects and analytics."
        eyebrow="Marketing"
        actions={
          <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" /> View Sitemap
            </Button>
          </a>
        }
      />

      <SeoScore settings={rawSettings} />

      <Tabs defaultValue="global">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="global"        className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Global</TabsTrigger>
          <TabsTrigger value="pages"         className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Pages</TabsTrigger>
          <TabsTrigger value="opengraph"     className="gap-1.5"><Share2 className="h-3.5 w-3.5" /> Open Graph</TabsTrigger>
          <TabsTrigger value="structured"    className="gap-1.5"><FileCode2 className="h-3.5 w-3.5" /> Structured Data</TabsTrigger>
          <TabsTrigger value="sitemap"       className="gap-1.5"><Map className="h-3.5 w-3.5" /> Sitemap</TabsTrigger>
          <TabsTrigger value="robots"        className="gap-1.5"><Search className="h-3.5 w-3.5" /> Robots.txt</TabsTrigger>
          <TabsTrigger value="redirects"     className="gap-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Redirects</TabsTrigger>
          <TabsTrigger value="analytics"     className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Analytics</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="global">
            <GlobalTab data={global} onSave={v => save("seo.global", v)} saving={savingKey === "seo.global"} />
          </TabsContent>
          <TabsContent value="pages">
            <PagesTab data={pages} onSave={v => save("seo.pages", v)} saving={savingKey === "seo.pages"} />
          </TabsContent>
          <TabsContent value="opengraph">
            <OgTab data={og} onSave={v => save("seo.opengraph", v)} saving={savingKey === "seo.opengraph"} />
          </TabsContent>
          <TabsContent value="structured">
            <StructuredDataTab data={sd} onSave={v => save("seo.structured_data", v)} saving={savingKey === "seo.structured_data"} />
          </TabsContent>
          <TabsContent value="sitemap">
            <SitemapTab data={sitemap} onSave={v => save("seo.sitemap", v)} saving={savingKey === "seo.sitemap"} />
          </TabsContent>
          <TabsContent value="robots">
            <RobotsTab data={robots} onSave={v => save("seo.robots", v)} saving={savingKey === "seo.robots"} />
          </TabsContent>
          <TabsContent value="redirects">
            <RedirectsTab data={redirects} onSave={v => save("seo.redirects", v)} saving={savingKey === "seo.redirects"} />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab data={analytics} onSave={v => save("seo.analytics", v)} saving={savingKey === "seo.analytics"} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
