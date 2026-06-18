import { useEffect, useState, useRef, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronRight, FileText, Printer, ArrowUp, Shield, Lock,
  BookOpen, AlertTriangle, Cookie, Copy, Check, Clock,
  ExternalLink, Hash, ChevronDown, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export interface LegalShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  effectiveDate: string;
  version: string;
  sections: LegalSection[];
  jurisdictionNote?: string;
}

const LEGAL_DOCS = [
  { href: "/legal/terms",   label: "Terms of Service",  short: "Terms",   icon: FileText },
  { href: "/legal/privacy", label: "Privacy Policy",    short: "Privacy", icon: Lock },
  { href: "/legal/risk",    label: "Risk Disclosure",   short: "Risk",    icon: AlertTriangle },
  { href: "/legal/aml",     label: "AML / KYC Policy",  short: "AML",     icon: Shield },
  { href: "/legal/cookies", label: "Cookies Policy",    short: "Cookies", icon: Cookie },
];

function estimateReadTime(sections: LegalSection[]): string {
  const words = sections.reduce((acc, s) => {
    const el = document.createElement("div");
    el.innerHTML = String(s.title) + " " + String(s.content);
    return acc + (el.innerText || el.textContent || "").split(/\s+/).length;
  }, 0);
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

function CopyLinkButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  };
  return (
    <button
      onClick={handle}
      aria-label="Copy link"
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-muted-foreground hover:text-primary"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Hash className="h-3.5 w-3.5" />}
    </button>
  );
}

export function LegalShell({
  eyebrow,
  title,
  subtitle,
  effectiveDate,
  version,
  sections,
  jurisdictionNote,
}: LegalShellProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const [showTop, setShowTop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [readTime, setReadTime] = useState("–");
  const articleRef = useRef<HTMLElement>(null);
  const [location] = useLocation();

  useEffect(() => {
    setReadTime(estimateReadTime(sections));
  }, [sections]);

  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > 600);

      // Progress bar
      const el = articleRef.current;
      if (el) {
        const { top, height } = el.getBoundingClientRect();
        const pct = Math.min(100, Math.max(0, ((-top) / (height - window.innerHeight)) * 100));
        setProgress(pct);
      }

      // Active section
      const fromTop = window.scrollY + 160;
      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el2 = document.getElementById(s.id);
        if (el2 && el2.offsetTop <= fromTop) current = s.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const currentDoc = LEGAL_DOCS.find(d => d.href === location || d.href === `/${location.replace(/^\//, "")}`);

  return (
    <>
      {/* Reading progress bar */}
      <div
        className="fixed top-0 left-0 z-50 h-0.5 bg-primary transition-all duration-100"
        style={{ width: `${progress}%` }}
      />

      <div className="min-h-screen">
        {/* Legal hub nav */}
        <div className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mr-2 shrink-0 flex items-center gap-1">
                <Scale className="h-3 w-3" /> Legal
              </span>
              {LEGAL_DOCS.map(({ href, label, short, icon: Icon }) => {
                const active = location === href || location === href.replace("/legal", "");
                return (
                  <Link key={href} href={href}>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      <span className="hidden sm:inline">{label}</span>
                      <span className="sm:hidden">{short}</span>
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-7xl">
          {/* Hero */}
          <div className="relative rounded-2xl overflow-hidden border border-border mb-10">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-card to-card/60" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />

            <div className="relative p-8 md:p-12">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary mb-4">
                    {currentDoc
                      ? <currentDoc.icon className="h-3.5 w-3.5" />
                      : <FileText className="h-3.5 w-3.5" />
                    }
                    {eyebrow}
                  </div>
                  <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-3 leading-tight">{title}</h1>
                  <p className="text-base md:text-lg text-muted-foreground max-w-3xl leading-relaxed">{subtitle}</p>

                  <div className="flex flex-wrap items-center gap-2 mt-6">
                    <Badge variant="secondary" className="font-medium gap-1">
                      <Clock className="h-3 w-3" /> Effective {effectiveDate}
                    </Badge>
                    <Badge variant="outline" className="font-medium">v{version}</Badge>
                    {jurisdictionNote && (
                      <Badge variant="outline" className="font-medium">{jurisdictionNote}</Badge>
                    )}
                    <Badge variant="outline" className="font-medium gap-1">
                      <BookOpen className="h-3 w-3" /> {readTime}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Print / Save PDF
                  </Button>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 sm:grid-cols-3 gap-4 mt-8 pt-6 border-t border-border/60">
                <div>
                  <div className="text-2xl font-bold tabular-nums">{sections.length}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Sections</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{effectiveDate.split(" ").slice(-1)[0]}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Year</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{readTime.replace(" read", "")}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Read time</div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile TOC toggle */}
          <div className="lg:hidden mb-6">
            <button
              onClick={() => setTocOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card/60 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" /> On this page
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", tocOpen && "rotate-180")} />
            </button>
            {tocOpen && (
              <div className="mt-2 rounded-xl border border-border bg-card/60 p-3">
                <ol className="space-y-0.5">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        onClick={() => setTocOpen(false)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                      >
                        <span className="text-xs tabular-nums opacity-50 w-5">{String(i + 1).padStart(2, "0")}</span>
                        <span>{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Sticky sidebar */}
            <aside className="hidden lg:block lg:col-span-3 lg:sticky lg:top-24 lg:self-start">
              {/* TOC */}
              <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                  <BookOpen className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">On this page</span>
                </div>
                {/* Progress indicator */}
                <div className="h-0.5 bg-muted">
                  <div
                    className="h-0.5 bg-primary transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <nav className="p-2">
                  <ol className="space-y-0.5">
                    {sections.map((s, i) => {
                      const active = activeId === s.id;
                      return (
                        <li key={s.id}>
                          <a
                            href={`#${s.id}`}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-all",
                              active
                                ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary pl-[6px]"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                            )}
                          >
                            <span className="text-xs tabular-nums opacity-50 w-5 shrink-0">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="truncate leading-tight">{s.title}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              </div>

              {/* Need help card */}
              <div className="rounded-xl border border-border bg-card/50 p-4 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-semibold">Questions?</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Our compliance team is happy to clarify any part of this document.
                </p>
                <Link href="/support">
                  <Button variant="outline" size="sm" className="w-full text-xs gap-1">
                    Contact Support <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
                <a
                  href="mailto:legal@zebvix.com"
                  className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  legal@zebvix.com <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {/* Other legal docs */}
              <div className="rounded-xl border border-border bg-card/50 p-4 mt-4">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Other documents</div>
                <div className="space-y-1">
                  {LEGAL_DOCS.filter(d => d.href !== location && d.href !== location.replace("/legal", "")).map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href}>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors text-left">
                        <Icon className="h-3 w-3 shrink-0" />
                        {label}
                      </button>
                    </Link>
                  ))}
                </div>
              </div>
            </aside>

            {/* Article */}
            <article ref={articleRef} className="lg:col-span-9 space-y-8">
              {sections.map((s, i) => (
                <section
                  id={s.id}
                  key={s.id}
                  className="scroll-mt-32 rounded-xl border border-border/60 bg-card/30 hover:bg-card/50 transition-colors p-6 md:p-8"
                >
                  <div className="flex items-start gap-3 mb-4 group">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold tabular-nums text-primary">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <h2 className="text-lg md:text-xl font-bold tracking-tight">{s.title}</h2>
                        <CopyLinkButton id={s.id} />
                      </div>
                    </div>
                  </div>
                  <div className="prose prose-sm md:prose-base max-w-none text-foreground/85
                    [&_p]:my-3 [&_p]:leading-relaxed
                    [&_ul]:my-3 [&_ul]:space-y-1.5
                    [&_ol]:my-3 [&_ol]:space-y-1.5
                    [&_li]:leading-relaxed
                    [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40 [&_a:hover]:decoration-primary
                    [&_strong]:text-foreground [&_strong]:font-semibold
                    [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-foreground
                    [&_ul]:list-disc [&_ul]:pl-5
                    [&_ol]:list-decimal [&_ol]:pl-5
                    [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2">
                    {s.content}
                  </div>
                </section>
              ))}

              {/* Footer note */}
              <div className="rounded-xl border border-dashed border-border/60 bg-card/20 p-6 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <FileText className="h-4 w-4 mt-0.5 text-primary/60 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground/80 mb-1">About this document</p>
                    <p>
                      This document is published for transparency. We may update it from time
                      to time; material changes are announced in-app and via email at least
                      <strong> 14 days</strong> before they take effect. Version {version} —
                      effective {effectiveDate}.
                    </p>
                  </div>
                </div>
              </div>

              {/* Related documents */}
              <div>
                <div className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Also in our legal hub</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {LEGAL_DOCS.filter(d => d.href !== location && d.href !== location.replace("/legal", "")).map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href}>
                      <button className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/40 transition-all text-left group">
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{label}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </button>
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>

      {/* Back to top */}
      {showTop && (
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-6 right-6 shadow-lg z-40 gap-1"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp className="h-3.5 w-3.5" /> Top
        </Button>
      )}
    </>
  );
}

export default LegalShell;
