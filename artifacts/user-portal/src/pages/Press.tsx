import {
  Newspaper, Download, ExternalLink, Mail, ArrowRight, Calendar,
  Image as ImageIcon, FileText, Building2, Sparkles, Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const RELEASES = [
  { date: "22 April 2026", title: "Zebvix launches its own Layer-1 — Zebvix L1 mainnet goes live", body: "ZBX becomes the native gas token of a new high-throughput chain (chain ID 8989), with sub-second finality and EIP-1559 fees." },
  { date: "08 April 2026", title: "Zebvix crosses ₹50,000 crore in monthly trading volume", body: "Driven by record INR-pair activity, the introduction of perpetual futures, and a wave of new listings during Q1 2026." },
  { date: "15 March 2026", title: "Zebvix Futures launches with up to 125× leverage", body: "Cross / isolated margin, dual-price oracle, partial liquidations and a dedicated insurance fund — built for India." },
  { date: "01 February 2026", title: "Zebvix raises USD 90M Series B led by Lightspeed", body: "Capital earmarked for Layer-1 development, derivatives infrastructure, and expansion of compliance & engineering teams." },
  { date: "10 January 2026", title: "Zebvix becomes a registered FIU-IND reporting entity", body: "Joins the formal compliance regime for Virtual Digital Asset service providers in India under the PMLA framework." },
];

const COVERAGE = [
  { outlet: "The Economic Times", date: "23 April 2026", title: "Zebvix's Layer-1 bet — why an exchange built its own blockchain" },
  { outlet: "Mint",               date: "16 April 2026", title: "Inside India's fastest-growing crypto exchange" },
  { outlet: "Bloomberg",          date: "02 February 2026", title: "Lightspeed leads $90M into India's Zebvix" },
  { outlet: "Moneycontrol",       date: "16 March 2026", title: "Zebvix Futures launch ramps up India derivatives competition" },
  { outlet: "TechCrunch",         date: "03 February 2026", title: "Zebvix wants to be the Coinbase of India" },
  { outlet: "CoinDesk",           date: "23 April 2026", title: "Zebvix L1 launches with a $20M validator-incentive program" },
];

const FACTS = [
  { label: "Founded",        value: "2026, India" },
  { label: "Headquarters",   value: "Muzaffarnagar, Uttar Pradesh" },
  { label: "Mainnet chain",  value: "Zebvix L1 (chain ID 8989 / 0x231d)" },
  { label: "Native token",   value: "ZBX" },
  { label: "Employees",      value: "120+" },
  { label: "Registered users", value: "4M+" },
  { label: "Compliance",     value: "FIU-IND registration pending (applied)" },
  { label: "Funding",        value: "USD 90M Series B (Feb 2026)" },
];

const ASSETS = [
  { icon: ImageIcon, title: "Logos & wordmarks", body: "SVG + PNG, light and dark variants, with safe-area guidance.", note: "ZIP · 2.4 MB" },
  { icon: ImageIcon, title: "Founder & team photos", body: "High-resolution headshots and candid team images.", note: "ZIP · 18 MB" },
  { icon: FileText, title: "One-pager (English)", body: "What we do, by the numbers, leadership, contacts.", note: "PDF · 480 KB" },
  { icon: FileText, title: "One-pager (Hindi)", body: "Vernacular fact-sheet for Hindi-language outlets.", note: "PDF · 510 KB" },
  { icon: Building2, title: "Office photography", body: "Bengaluru HQ and Mumbai office interiors.", note: "ZIP · 32 MB" },
  { icon: Sparkles, title: "Product screenshots", body: "Web exchange, mobile apps, futures, and Earn.", note: "ZIP · 12 MB" },
];

export default function Press() {
  const onDownload = (label: string) => {
    toast.success(`Asset request sent — we'll email a download link for "${label}" within a few minutes.`);
  };

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-press">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-8 md:p-12 mb-12 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-3 bg-background/50">
            <Newspaper className="h-3 w-3 mr-1.5 text-primary" /> Press &amp; Media
          </Badge>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
            Press kit, news, and{" "}
            <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
              media resources.
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-5">
            Everything journalists, analysts, and partners need to write
            about Zebvix accurately. Logos, photos, fact-sheets and a
            direct line to our communications team.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#media-kit">
              <Button data-testid="button-press-kit" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Download media kit <Download className="h-4 w-4 ml-2" />
              </Button>
            </a>
            <a href="mailto:press@zebvix.com">
              <Button variant="outline" data-testid="button-press-email">
                press@zebvix.com
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="mb-14">
        <h2 className="text-xl font-bold tracking-tight mb-4">Quick facts</h2>
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {FACTS.map((f, i) => (
              <div key={f.label} className={`p-4 ${i >= 4 ? "lg:border-t lg:border-border" : ""}`}>
                <dt className="text-[11px] uppercase tracking-widest text-muted-foreground">{f.label}</dt>
                <dd className="mt-1 font-semibold text-sm">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Boilerplate */}
      <section className="mb-14">
        <h2 className="text-xl font-bold tracking-tight mb-4">Company boilerplate</h2>
        <Card className="bg-card/40">
          <CardContent className="p-6 relative">
            <Quote className="h-6 w-6 text-primary/40 absolute top-4 left-4" />
            <p className="pl-10 text-sm md:text-base text-muted-foreground leading-relaxed italic">
              "Zebvix is one of India's leading crypto-asset exchanges,
              giving more than four million Indians a secure, liquid and
              regulated venue to buy, sell, hold and trade crypto. The
              company operates a high-performance spot exchange,
              perpetual futures with up to 125× leverage, on-chain Earn
              products and Zebvix L1 — a high-throughput Layer-1
              blockchain whose native token, ZBX, powers fees and
              staking. Founded in 2026 and headquartered in Muzaffarnagar, UP,
              Zebvix has applied for FIU-IND registration as a Virtual
              Digital Asset service provider (registration pending)."
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Press releases */}
      <section className="mb-14">
        <h2 className="text-xl font-bold tracking-tight mb-4">Press releases</h2>
        <div className="space-y-3">
          {RELEASES.map((r) => (
            <div key={r.title} className="rounded-xl border border-border bg-card/40 p-5 hover:border-primary/40 transition-colors">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                <h3 className="font-semibold text-base">{r.title}</h3>
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-shrink-0">
                  <Calendar className="h-3 w-3" /> {r.date}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coverage */}
      <section className="mb-14">
        <h2 className="text-xl font-bold tracking-tight mb-4">Selected coverage</h2>
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
          <ul className="divide-y divide-border">
            {COVERAGE.map((c) => (
              <li key={c.title}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); toast.info("Coming soon — external link will open in a new tab."); }}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 hover:bg-accent/20 transition-colors"
                  data-testid={`link-coverage-${c.outlet.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider w-32 flex-shrink-0">
                      {c.outlet}
                    </span>
                    <span className="text-sm line-clamp-1 min-w-0">{c.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-shrink-0">
                    <Calendar className="h-3 w-3" /> {c.date}
                    <ExternalLink className="h-3 w-3 ml-2 opacity-50" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Media kit */}
      <section id="media-kit" className="scroll-mt-24 mb-14">
        <h2 className="text-xl font-bold tracking-tight mb-4">Media kit assets</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ASSETS.map((a) => (
            <Card key={a.title} className="bg-card/40 hover:border-primary/40 transition-colors flex flex-col">
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <a.icon className="h-5 w-5" />
                </div>
                <div className="font-semibold mb-1">{a.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">{a.body}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{a.note}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDownload(a.title)}
                    data-testid={`button-press-download-${a.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  >
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Use of Zebvix logos is permitted in editorial coverage. Modifications,
          recolouring, or use that implies endorsement is not permitted.
        </p>
      </section>

      {/* Contact */}
      <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/30">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="flex items-start gap-4 max-w-xl">
              <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold text-lg mb-1">Media contact</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  For interviews, briefings, statements and product
                  comment, please reach Aditi Kumar, Head of Communications,
                  at <a className="text-primary hover:underline" href="mailto:press@zebvix.com">press@zebvix.com</a>.
                  We aim to respond to working-press queries within 4
                  business hours.
                </p>
              </div>
            </div>
            <a href="mailto:press@zebvix.com">
              <Button data-testid="button-press-contact" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap">
                Email press desk <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
