import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  LifeBuoy, Search, ArrowRight, ShieldCheck, Wallet, TrendingUp,
  IndianRupee, KeyRound, Coins, ChevronRight, Sparkles, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

type Category = {
  id: string;
  title: string;
  icon: typeof LifeBuoy;
  blurb: string;
  count: number;
};

const CATEGORIES: Category[] = [
  { id: "getting-started", title: "Getting started", icon: Sparkles,    blurb: "Create an account, complete KYC, place your first trade.", count: 12 },
  { id: "kyc",             title: "KYC & verification", icon: ShieldCheck, blurb: "Documents, levels, processing times, common rejections.", count: 9 },
  { id: "deposits-inr",    title: "Deposits & withdrawals (INR)", icon: IndianRupee, blurb: "UPI, IMPS, NEFT — limits, charges, troubleshooting.", count: 14 },
  { id: "deposits-crypto", title: "Deposits & withdrawals (Crypto)", icon: Wallet,    blurb: "Networks, memo/tags, missing deposits, address whitelist.", count: 16 },
  { id: "trading",         title: "Trading", icon: TrendingUp, blurb: "Order types, fees, market vs limit, futures basics.", count: 18 },
  { id: "security",        title: "Account security", icon: KeyRound,    blurb: "2FA, anti-phishing code, sessions, API keys, recovery.", count: 11 },
  { id: "earn",            title: "Earn & staking", icon: Coins,        blurb: "Flexible vs locked, APY mechanics, redemption.", count: 8 },
  { id: "tax",             title: "Tax & TDS",      icon: IndianRupee,  blurb: "1% TDS under §194S, 30% on VDA gains under §115BBH, statements.", count: 7 },
];

type FAQ = { q: string; a: string; cat: string };

const FAQS: FAQ[] = [
  { cat: "getting-started", q: "How do I create a Zebvix account?", a: "Tap Sign Up, enter your email or phone and a strong password. We'll send a one-time code to verify. Once you're in, complete KYC level 1 to start depositing INR." },
  { cat: "getting-started", q: "Do I need PAN to use Zebvix?", a: "Yes. Indian regulations require PAN (and a name match) for any KYC-verified account. Without KYC you can only browse markets — you cannot deposit, trade or withdraw." },
  { cat: "kyc",             q: "How long does KYC take to approve?", a: "Level 1 (PAN) is usually instant. Level 2 (Aadhaar + address proof) is approved within a few minutes during business hours and within 24 hours otherwise. Level 3 (selfie + extended due diligence) can take up to 2 business days." },
  { cat: "kyc",             q: "My KYC was rejected. What should I do?", a: "Open the rejection notification — it lists the exact reason (blurry image, name mismatch, expired document, etc.). Re-upload corrected documents from the KYC page. If you've been rejected twice, contact support." },
  { cat: "deposits-inr",    q: "Why is my UPI deposit not showing up?", a: "UPI deposits are usually credited within 60 seconds. If it's been longer, the most common causes are (1) you sent from a bank account whose name doesn't match your KYC name, or (2) you used a UPI ID different from the one shown on the deposit page. Open a ticket with the UTR number and we'll resolve within 24 hours." },
  { cat: "deposits-inr",    q: "What are the INR withdrawal charges?", a: "NEFT — free. IMPS — ₹10 flat. UPI — ₹15 flat. There are no percentage-based charges on INR withdrawals. See the Fee Schedule for current rates." },
  { cat: "deposits-crypto", q: "I sent crypto on the wrong network — can I recover it?", a: "Sometimes. If the destination address is one of ours and the asset is supported on multiple networks, our team can sometimes recover it. Open a ticket with the transaction hash. Recovery is best-effort, may take 7–14 days, and a fee applies." },
  { cat: "deposits-crypto", q: "Where is my BEP-20 / TRC-20 deposit?", a: "Most chains require 1–30 confirmations before crediting. Track the transaction hash on the explorer for the source network. If the transaction shows confirmed but the deposit is still pending after 1 hour, contact support with the TX hash." },
  { cat: "trading",         q: "What's the difference between market and limit orders?", a: "A market order executes immediately at the best available price (you pay the taker fee). A limit order rests on the orderbook at the price you set — it executes only if the market reaches you (you pay the maker fee, which is lower or zero)." },
  { cat: "trading",         q: "How does liquidation work on futures?", a: "Each open position has a maintenance-margin requirement. If your equity for that position falls below this threshold, the position is liquidated by the engine to protect the platform. At max leverage of 50×, a 2% adverse move is sufficient to liquidate. Always use stop-losses." },
  { cat: "security",        q: "How do I enable 2FA?", a: "Settings → Security → Two-Factor Authentication. We support TOTP authenticator apps (Google Authenticator, Authy, 1Password) and hardware keys via WebAuthn. SMS OTP is supported as a backup." },
  { cat: "security",        q: "Someone has accessed my account — what do I do?", a: "Immediately: (1) change your password, (2) revoke all other sessions from Settings → Security, (3) disable any unfamiliar API keys, (4) freeze withdrawals from Settings → Security → Emergency lock, then (5) open a high-priority ticket. Move funds only from inside the app, not from any link sent over chat or email." },
  { cat: "earn",            q: "Can I redeem locked savings before maturity?", a: "Yes, with an early-redemption penalty — typically equal to the rewards accrued so far. Your principal is always returned. Flexible savings can be redeemed any time without penalty." },
  { cat: "earn",            q: "How is APY calculated?", a: "APY is the effective annualised yield assuming daily compounding. Actual returns may differ slightly because rates float for flexible products and rewards are paid in the same asset (whose price can change)." },
  { cat: "tax",             q: "Is 1% TDS deducted automatically?", a: "Yes. For every transfer that meets the §194S threshold we deduct 1% TDS at source and remit it to the Income Tax Department against your PAN. You can download your annual TDS statement from your Profile." },
  { cat: "tax",             q: "Where can I download my tax statements?", a: "Profile → Reports → Tax statements. We provide a year-wise transaction report (CSV / PDF) and a TDS summary aligned with Form 26AS. Consult a tax adviser for filing." },
];

const POPULAR = ["How do I enable 2FA?", "Why is my UPI deposit not showing up?", "How long does KYC take to approve?", "How does liquidation work on futures?"];

export default function Help() {
  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return FAQS.filter((f) => {
      if (activeCat && f.cat !== activeCat) return false;
      if (!ql) return true;
      return f.q.toLowerCase().includes(ql) || f.a.toLowerCase().includes(ql);
    });
  }, [q, activeCat]);

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-help">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-8 md:p-12 mb-10 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl">
          <Badge variant="outline" className="mb-3 bg-background/50">
            <LifeBuoy className="h-3 w-3 mr-1.5 text-primary" /> Help Center
          </Badge>
          <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
            How can we help{" "}
            <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
              you today?
            </span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-5">
            Browse common questions, deposit / KYC troubleshooting, and
            step-by-step guides — answered by the team that builds the
            product.
          </p>

          <div className="relative max-w-xl">
            <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the help center…"
              className="pl-11 h-12 text-base bg-background/60"
              data-testid="input-help-search"
            />
          </div>

          <div className="mt-3 flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Popular:</span>
            {POPULAR.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setQ(p)}
                className="px-2 py-1 rounded-md bg-card/40 border border-border hover:border-primary/40 hover:text-foreground transition-colors"
                data-testid={`button-help-popular-${p.slice(0, 12).replace(/\s+/g, "-").toLowerCase()}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mb-12">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold tracking-tight">Browse by topic</h2>
          {activeCat && (
            <button
              type="button"
              onClick={() => setActiveCat(null)}
              className="text-xs text-primary hover:underline"
              data-testid="button-help-clear-cat"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CATEGORIES.map((c) => {
            const active = activeCat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(active ? null : c.id)}
                className={`text-left rounded-xl border p-5 transition-colors flex flex-col ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card/40 hover:border-primary/40"
                }`}
                data-testid={`card-help-cat-${c.id}`}
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${
                  active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                }`}>
                  <c.icon className="h-5 w-5" />
                </div>
                <div className="font-semibold mb-1 flex items-center justify-between">
                  <span>{c.title}</span>
                  <ChevronRight className="h-4 w-4 opacity-40" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{c.blurb}</p>
                <div className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
                  {c.count} articles
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* FAQ list */}
      <section className="mb-12">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-xl font-bold tracking-tight">
            {activeCat
              ? CATEGORIES.find((c) => c.id === activeCat)?.title
              : q
                ? "Search results"
                : "Frequently asked questions"}
          </h2>
          <span className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "article" : "articles"}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="mb-3">No articles match. Try different keywords or open a ticket.</p>
            <Link href="/support">
              <Button data-testid="button-help-empty-support">
                Contact support <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
            <Accordion type="single" collapsible className="w-full">
              {filtered.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border last:border-b-0">
                  <AccordionTrigger
                    className="px-5 py-4 hover:no-underline hover:bg-accent/20 text-left"
                    data-testid={`button-help-faq-${i}`}
                  >
                    <span className="font-medium pr-4">{f.q}</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </section>

      {/* Still need help */}
      <Card className="bg-gradient-to-br from-primary/10 to-card border-primary/30">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex items-start gap-4 max-w-xl">
              <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold text-lg mb-1">Still need help?</div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Our support team is online 24×7. Open a ticket with
                  Zara, our AI assistant, for an instant answer — or
                  escalate to a human in one tap.
                </p>
              </div>
            </div>
            <Link href="/support">
              <Button data-testid="button-help-contact-support" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap">
                Open support <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
