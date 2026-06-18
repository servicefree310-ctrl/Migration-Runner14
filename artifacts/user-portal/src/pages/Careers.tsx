import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Briefcase, MapPin, ArrowRight, Sparkles, Shield, Globe2, HeartPulse,
  Plane, GraduationCap, Coins, Search, Users, Rocket, Code2, Filter,
  CheckCircle2, Star, TrendingUp, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Job = {
  id: string;
  title: string;
  team: "Engineering" | "Product" | "Design" | "Compliance" | "Operations" | "Marketing" | "Finance";
  location: "Bengaluru" | "Mumbai" | "Remote (India)" | "Singapore";
  type: "Full-time" | "Contract" | "Internship";
  level: "IC2" | "IC3" | "IC4" | "IC5" | "Lead" | "Manager";
  summary: string;
  hot?: boolean;
};

const JOBS: Job[] = [
  { id: "eng-001", title: "Senior Backend Engineer — Matching Engine (Go)", team: "Engineering", location: "Bengaluru", type: "Full-time", level: "IC4", hot: true, summary: "Own the in-memory orderbook and matching loop. Sub-millisecond latency, lock-free data structures, deterministic replay." },
  { id: "eng-002", title: "Senior Frontend Engineer — Trade UI", team: "Engineering", location: "Bengaluru", type: "Full-time", level: "IC4", hot: true, summary: "React + WebSocket + Lightweight Charts. Build the most responsive trading UI in India." },
  { id: "eng-003", title: "Staff SRE — Reliability & Observability", team: "Engineering", location: "Remote (India)", type: "Full-time", level: "IC5", summary: "99.99% uptime targets across exchange, futures, and INR rails. K8s, Prometheus, Loki, Tempo." },
  { id: "eng-004", title: "Smart-contract Engineer — Zebvix L1", team: "Engineering", location: "Bengaluru", type: "Full-time", level: "IC4", summary: "Solidity / Yul, ZBX-20 standard work, rollup bridges, audit coordination." },
  { id: "eng-005", title: "Mobile Engineer — Flutter", team: "Engineering", location: "Mumbai", type: "Full-time", level: "IC3", summary: "Ship pixel-perfect Flutter screens for iOS + Android with native crypto wallet integration." },
  { id: "prod-001", title: "Product Manager — Derivatives", team: "Product", location: "Bengaluru", type: "Full-time", level: "Lead", hot: true, summary: "Own the futures product line. Liquidation engine UX, leverage tiers, market-maker programs." },
  { id: "prod-002", title: "Product Manager — Earn & Staking", team: "Product", location: "Bengaluru", type: "Full-time", level: "IC4", summary: "Flexible & locked savings, staking, dual investment. Risk-adjusted yield products for Indian retail." },
  { id: "des-001", title: "Senior Product Designer", team: "Design", location: "Remote (India)", type: "Full-time", level: "IC4", summary: "Drive end-to-end design for one of trading, wallet, or onboarding. Strong systems thinking." },
  { id: "comp-001", title: "Head of Compliance — India", team: "Compliance", location: "Mumbai", type: "Full-time", level: "Manager", hot: true, summary: "PMLA / FIU-IND reporting, KYC policy, BSA partnerships, regulator engagement." },
  { id: "comp-002", title: "Compliance Analyst — Transaction Monitoring", team: "Compliance", location: "Bengaluru", type: "Full-time", level: "IC2", summary: "Investigate STR alerts, source-of-funds reviews, blockchain analytics tooling." },
  { id: "ops-001", title: "Customer Operations Lead", team: "Operations", location: "Bengaluru", type: "Full-time", level: "Lead", summary: "Build the 24×7 support org. Ticket SLAs, knowledge base, vernacular language coverage." },
  { id: "mkt-001", title: "Content Marketing Manager", team: "Marketing", location: "Remote (India)", type: "Full-time", level: "IC3", summary: "Long-form research, weekly market commentary, vernacular video scripts." },
  { id: "fin-001", title: "Treasury Manager", team: "Finance", location: "Mumbai", type: "Full-time", level: "Lead", summary: "Hot/cold wallet split, INR float optimisation, banking-partner relationships." },
  { id: "intern-001", title: "Engineering Intern (6 months)", team: "Engineering", location: "Bengaluru", type: "Internship", level: "IC2", summary: "Pair with senior engineers across backend, frontend or infra. Final-year B.Tech / B.E. preferred." },
];

const VALUES = [
  { icon: Shield,    color: "text-emerald-400 bg-emerald-400/10", title: "Security obsessed",     body: "Every line of code is reviewed with the assumption that someone is trying to break it tomorrow." },
  { icon: Sparkles,  color: "text-violet-400 bg-violet-400/10",   title: "Default to ownership",  body: "Engineers ship to production. PMs talk to users. Designers measure outcomes. Nobody waits for permission." },
  { icon: Globe2,    color: "text-blue-400 bg-blue-400/10",       title: "Built in India, for the world", body: "Indian roots, global ambition. We hire the best, regardless of where they live." },
  { icon: Rocket,    color: "text-amber-400 bg-amber-400/10",     title: "Bias for shipping",     body: "Iterate weekly, ship daily, learn hourly. Big bets, small batches." },
];

const BENEFITS = [
  { icon: Coins,        color: "text-amber-400",   title: "Top-of-market comp",      body: "Cash + ZBX equity grants, vesting over 4 years with a 1-year cliff." },
  { icon: HeartPulse,   color: "text-rose-400",    title: "Health for the family",   body: "₹10L medical cover for self, spouse, children, and parents — day one." },
  { icon: Plane,        color: "text-sky-400",     title: "Annual offsite",          body: "Whole company gathers in person twice a year. Last two: Goa + Bali." },
  { icon: GraduationCap, color: "text-violet-400", title: "Learning budget",         body: "₹50k / year for courses, books, conferences, certifications." },
  { icon: Briefcase,    color: "text-emerald-400", title: "Hybrid by default",       body: "3 days in-office (Bengaluru / Mumbai), 2 days from anywhere. Fully remote where it makes sense." },
  { icon: Users,        color: "text-blue-400",    title: "Real ownership",          body: "All full-time hires receive ZBX equity, not just leadership." },
];

const PERKS = [
  "MacBook Pro or ThinkPad — your choice",
  "Free lunch in office 5 days/week",
  "Unlimited crypto buy/sell for personal trading (policy applies)",
  "Paid parental leave — 6 months primary, 3 months secondary",
  "Mental-health support via 1-on-1 sessions",
  "₹5,000 / month home-office stipend (remote roles)",
];

const TEAMS: Job["team"][] = ["Engineering", "Product", "Design", "Compliance", "Operations", "Marketing", "Finance"];
const LOCATIONS: Job["location"][] = ["Bengaluru", "Mumbai", "Remote (India)", "Singapore"];

export default function Careers() {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<Job["team"] | "All">("All");
  const [loc, setLoc] = useState<Job["location"] | "All">("All");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return JOBS.filter((j) =>
      (team === "All" || j.team === team) &&
      (loc === "All" || j.location === loc) &&
      (!ql || j.title.toLowerCase().includes(ql) || j.summary.toLowerCase().includes(ql))
    );
  }, [q, team, loc]);

  const hotCount = JOBS.filter(j => j.hot).length;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl" data-testid="page-careers">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-8 md:p-14 mb-12 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-amber-500/5 blur-3xl pointer-events-none" />
        <div className="relative grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="bg-background/50">
                <Briefcase className="h-3 w-3 mr-1.5 text-primary" /> Careers at Zebvix
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 gap-1">
                <TrendingUp className="h-3 w-3" /> {JOBS.length} open roles
              </Badge>
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
              Build the future of finance{" "}
              <span className="bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
                from India.
              </span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-6">
              We are a small, senior team building the most trustworthy crypto exchange
              in India. If you want to do the best work of your career on systems that
              millions depend on every day — we should talk.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#open-roles">
                <Button data-testid="button-careers-view-roles" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  View {JOBS.length} open roles <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </a>
              <Link href="/about">
                <Button variant="outline" data-testid="button-careers-about">About Zebvix</Button>
              </Link>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Star,    label: "Hiring now",    value: `${hotCount} hot roles`, color: "text-amber-400" },
              { icon: Globe2,  label: "Locations",     value: "4 cities + remote",     color: "text-blue-400" },
              { icon: Zap,     label: "Team size",     value: "80–120 people",         color: "text-violet-400" },
              { icon: Coins,   label: "ZBX equity",    value: "All full-time hires",   color: "text-emerald-400" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-background/40 p-4">
                <s.icon className={`h-4 w-4 ${s.color} mb-2`} />
                <div className="text-sm font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Values ────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">How we work</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-xl border border-border bg-card/40 hover:border-primary/40 transition-colors p-5">
              <div className={`h-10 w-10 rounded-lg ${v.color} flex items-center justify-center mb-3`}>
                <v.icon className="h-5 w-5" />
              </div>
              <div className="font-semibold mb-1 text-sm">{v.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Benefits ──────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">Benefits</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border border-border bg-card/40 hover:border-primary/40 transition-colors p-5">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg bg-card/60 flex items-center justify-center flex-shrink-0`}>
                  <b.icon className={`h-5 w-5 ${b.color}`} />
                </div>
                <div>
                  <div className="font-semibold mb-1 text-sm">{b.title}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{b.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card/20 p-5">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Also included</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {PERKS.map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Open roles ────────────────────────────────────────── */}
      <section id="open-roles" className="scroll-mt-24">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Open roles</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filtered.length} of {JOBS.length} positions
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles…"
              className="pl-9" data-testid="input-careers-search" />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 mb-3 pb-1">
          <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <FilterPill active={team === "All"} onClick={() => setTeam("All")}>All teams</FilterPill>
          {TEAMS.map((t) => (
            <FilterPill key={t} active={team === t} onClick={() => setTeam(t)}>{t}</FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6 overflow-x-auto -mx-1 px-1 pb-1">
          <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <FilterPill active={loc === "All"} onClick={() => setLoc("All")}>All locations</FilterPill>
          {LOCATIONS.map((l) => (
            <FilterPill key={l} active={loc === l} onClick={() => setLoc(l)}>{l}</FilterPill>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map((j) => (
            <a key={j.id}
              href={`mailto:careers@zebvix.com?subject=Application: ${j.title} (${j.id})`}
              className="block rounded-xl border border-border bg-card/40 p-5 hover:border-primary/40 hover:bg-card/60 transition-all group"
              data-testid={`card-job-${j.id}`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge variant="outline" className="text-[10px]">{j.team}</Badge>
                    <Badge variant="outline" className="text-[10px]">{j.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{j.level}</Badge>
                    {j.hot && (
                      <Badge className="text-[10px] gap-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/10">
                        <Star className="h-2.5 w-2.5 fill-amber-400" /> Hot
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                    {j.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{j.summary}</p>
                </div>
                <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center gap-1 flex-shrink-0">
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {j.location}
                  </div>
                  <span className="inline-flex items-center text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Apply <ArrowRight className="h-3 w-3 ml-1" />
                  </span>
                </div>
              </div>
            </a>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl">
              <Code2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No roles match your filters.</p>
              <p className="text-sm mt-1">Try clearing some filters or searching something else.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Don't see your role ───────────────────────────────── */}
      <section className="mt-10">
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
          <div>
            <div className="font-semibold text-lg mb-1">Don't see the right role?</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Send us a note. If you're exceptional, we'll find a way.
              Email <a className="text-primary hover:underline" href="mailto:careers@zebvix.com">careers@zebvix.com</a>.
            </p>
          </div>
          <a href="mailto:careers@zebvix.com">
            <Button data-testid="button-careers-general" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap shrink-0">
              Get in touch <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </a>
        </div>
      </section>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card/40 text-muted-foreground border-border hover:text-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}
