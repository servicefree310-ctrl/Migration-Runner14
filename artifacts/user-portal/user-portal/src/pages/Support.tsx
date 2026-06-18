import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy, Search, Bot, MessageSquare, Send, Plus, Sparkles, Clock,
  CheckCircle2, X, Loader2, User as UserIcon, Shield, Landmark,
  ArrowDownCircle, ArrowUpCircle, TrendingUp, Coins, Gift, Lock,
  ChevronRight, AlertCircle, Mail, Phone, Zap, RefreshCw,
  Star, HeadphonesIcon, ExternalLink, Hash, ArrowRight, BookOpen,
  CreditCard, Smartphone, Globe, Filter, Circle,
} from "lucide-react";
import { get, post, patch, ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";

/* ─── Types ─────────────────────────────────────────────────────────────── */
type Faq       = { q: string; a: string };
type FaqCat    = { category: string; icon: string; questions: Faq[] };
type LiveMsg   = { role: "user" | "assistant"; content: string; ts: number };

type Ticket = {
  id: number; subject: string; status: string; priority: string;
  category: string; lastMessageAt: string; createdAt: string;
  messages?: TicketMsg[];
};
type TicketMsg = {
  id: number; senderType: "user" | "admin" | "bot";
  message: string; isRead: boolean; createdAt: string;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)      return "just now";
  if (s < 3600)    return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)   return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800)  return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "shield-check": Shield, landmark: Landmark,
  "arrow-down-circle": ArrowDownCircle, "arrow-up-circle": ArrowUpCircle,
  "trending-up": TrendingUp, coins: Coins, gift: Gift, lock: Lock, user: UserIcon,
};

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  KYC: Shield, Bank: Landmark, Deposit: ArrowDownCircle, Withdraw: ArrowUpCircle,
  Trading: TrendingUp, Earn: Coins, Invite: Gift, Security: Lock, Account: UserIcon,
};

const STATUS_CLS: Record<string, string> = {
  open:        "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  in_progress: "text-blue-400   bg-blue-500/10   border-blue-500/25",
  resolved:    "text-zinc-400   bg-zinc-500/10   border-zinc-500/25",
  closed:      "text-zinc-400   bg-zinc-500/10   border-zinc-500/25",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};
const PRIORITY_CLS: Record<string, string> = {
  low: "text-zinc-500", normal: "text-blue-400", high: "text-amber-400", urgent: "text-rose-400",
};

const TICKET_CATEGORIES = ["general", "kyc", "deposit", "withdrawal", "trading", "technical", "account"];

const QUICK_ACTIONS = [
  { icon: ArrowDownCircle, label: "Deposit not showing",   color: "text-green-400",  tab: "chat",   msg: "My deposit is not showing up. What should I do?" },
  { icon: ArrowUpCircle,   label: "Withdrawal stuck",      color: "text-rose-400",   tab: "chat",   msg: "My withdrawal is stuck or pending. Please help." },
  { icon: Shield,          label: "Complete KYC",          color: "text-blue-400",   tab: "help",   cat: "KYC" },
  { icon: Landmark,        label: "Bank account issue",    color: "text-amber-400",  tab: "help",   cat: "Bank" },
  { icon: Lock,            label: "Enable 2FA",            color: "text-purple-400", tab: "chat",   msg: "How do I enable 2FA on my account?" },
  { icon: CreditCard,      label: "Trading fees",          color: "text-cyan-400",   tab: "help",   cat: "Trading" },
];

const AI_SUGGESTIONS = [
  "Why is my deposit pending?",
  "How do I complete KYC Level 2?",
  "How do I add a bank account?",
  "How does the referral program work?",
  "How do I enable 2FA?",
  "What are the trading fees?",
  "How do I withdraw INR?",
  "How do I stake crypto to earn?",
];

/* ═══════════════════════════════════════════════════════════════════════════
   Main Support page
══════════════════════════════════════════════════════════════════════════ */
export default function Support() {
  const [tab, setTab] = useState<"help" | "chat" | "tickets">("help");
  const [search, setSearch] = useState("");
  const [helperCat, setHelperCat] = useState<string>("all");
  const [aiSeed, setAiSeed] = useState<string | null>(null);

  function goChat(msg?: string) { setAiSeed(msg ?? null); setTab("chat"); }
  function goHelp(cat?: string) { setHelperCat(cat ?? "all"); setTab("help"); }

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6 space-y-5">

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-background p-6 md:p-8">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-amber-400/8 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 bottom-0 w-56 h-56 rounded-full bg-orange-400/8 blur-3xl pointer-events-none" />

          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-start">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">All systems operational</span>
                <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
                  <Sparkles className="h-2.5 w-2.5 mr-1" /> 24/7 AI Support
                </Badge>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
                How can we{" "}
                <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                  help you?
                </span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-lg">
                Ask{" "}
                <span className="text-amber-300 font-semibold">Zara</span>, our AI assistant, for instant answers — or open a ticket for issues that need a human agent.
              </p>

              {/* Search */}
              <div className="mt-4 relative max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search help articles… KYC, deposit, withdraw, fees…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); if (e.target.value) setTab("help"); }}
                  className="pl-10 h-11"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Response stats */}
              <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-400" /> Avg. response: <strong className="text-foreground">~2 hours</strong></span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Resolution rate: <strong className="text-foreground">96%</strong></span>
                <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-400" /> CSAT: <strong className="text-foreground">4.8/5</strong></span>
              </div>
            </div>

            {/* Quick channel cards */}
            <div className="hidden md:flex flex-col gap-2 min-w-[220px]">
              <button
                onClick={() => goChat()}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-amber-500/40 hover:bg-amber-500/5 bg-card/50 transition-all text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold group-hover:text-amber-300 transition-colors">Chat with Zara</div>
                  <div className="text-[11px] text-muted-foreground">AI · instant reply</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-400 transition-colors" />
              </button>
              <button
                onClick={() => setTab("tickets")}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-sky-500/40 hover:bg-sky-500/5 bg-card/50 transition-all text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                  <HeadphonesIcon className="h-4 w-4 text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold group-hover:text-sky-300 transition-colors">Human Agent</div>
                  <div className="text-[11px] text-muted-foreground">Tickets · ~2h SLA</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-sky-400 transition-colors" />
              </button>
              <a
                href="mailto:support@zebvix.com"
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-border/80 hover:bg-muted/20 bg-card/50 transition-all text-left group"
              >
                <div className="h-9 w-9 rounded-lg bg-muted border border-border flex items-center justify-center">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">Email Support</div>
                  <div className="text-[11px] text-muted-foreground">support@zebvix.com</div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
              </a>
            </div>
          </div>
        </div>

        {/* ── Quick Action tiles ───────────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Common issues</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => a.msg ? goChat(a.msg) : goHelp(a.cat)}
                className="flex flex-col items-center gap-2 p-3.5 rounded-xl border border-border hover:border-border/80 bg-card/50 hover:bg-card transition-all text-center group"
              >
                <div className={`h-9 w-9 rounded-xl bg-muted/40 border border-border flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <a.icon className={`h-4 w-4 ${a.color}`} />
                </div>
                <span className="text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground transition-colors">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Main Tabs ────────────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-grid bg-card border border-border">
            <TabsTrigger value="help">
              <BookOpen className="h-4 w-4 mr-1.5" /> Help Center
            </TabsTrigger>
            <TabsTrigger value="chat">
              <Bot className="h-4 w-4 mr-1.5" /> Chat with Zara
            </TabsTrigger>
            <TabsTrigger value="tickets">
              <MessageSquare className="h-4 w-4 mr-1.5" /> My Tickets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="help" className="mt-4">
            <HelpCenter search={search} activeCat={helperCat} onCatChange={setHelperCat} />
          </TabsContent>

          <TabsContent value="chat" className="mt-4">
            <ZaraChat seed={aiSeed} onSeedConsumed={() => setAiSeed(null)} />
          </TabsContent>

          <TabsContent value="tickets" className="mt-4">
            <TicketsPanel />
          </TabsContent>
        </Tabs>

        {/* ── Contact & Community strip ─────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</div>
              <a href="mailto:support@zebvix.com" className="flex items-center gap-1.5 text-sm hover:text-amber-400 transition-colors">
                <Mail className="h-4 w-4 text-amber-400" /> support@zebvix.com
              </a>
              <div className="text-xs text-muted-foreground">24/7 · reply in ~2 h</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Helpline</div>
              <a href="tel:+911800123456" className="flex items-center gap-1.5 text-sm hover:text-amber-400 transition-colors">
                <Phone className="h-4 w-4 text-amber-400" /> 1800-123-4567
              </a>
              <div className="text-xs text-muted-foreground">Mon–Sat 9am–6pm IST</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compliance</div>
              <a href="mailto:compliance@zebvix.com" className="flex items-center gap-1.5 text-sm hover:text-amber-400 transition-colors">
                <Shield className="h-4 w-4 text-amber-400" /> compliance@zebvix.com
              </a>
              <div className="text-xs text-muted-foreground">AML / KYC / legal queries</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grievance Officer</div>
              <span className="flex items-center gap-1.5 text-sm">
                <Globe className="h-4 w-4 text-amber-400" /> As per PMLA / SEBI
              </span>
              <div className="text-xs text-muted-foreground">grievance@zebvix.com</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Help Center
══════════════════════════════════════════════════════════════════════════ */
function HelpCenter({
  search, activeCat, onCatChange,
}: { search: string; activeCat: string; onCatChange: (c: string) => void }) {
  const faqQ = useQuery<{ items: FaqCat[] }>({
    queryKey: ["/support/faqs"],
    queryFn: () => get("/support/faqs"),
    staleTime: 300_000,
  });

  const allCats = faqQ.data?.items ?? [];

  const filtered = useMemo(() => {
    let items = allCats;
    if (activeCat !== "all") items = items.filter((c) => c.category === activeCat);
    if (!search.trim()) return items;
    const term = search.toLowerCase();
    return items
      .map((c) => ({ ...c, questions: c.questions.filter((q) => q.q.toLowerCase().includes(term) || q.a.toLowerCase().includes(term)) }))
      .filter((c) => c.questions.length > 0);
  }, [allCats, activeCat, search]);

  const totalArticles = allCats.reduce((s, c) => s + c.questions.length, 0);

  if (faqQ.isLoading) {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <button
          onClick={() => onCatChange("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${activeCat === "all" ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-border text-muted-foreground hover:border-border/80"}`}
        >
          All ({totalArticles})
        </button>
        {allCats.map((c) => {
          const Icon = CATEGORY_ICONS[c.category] ?? BookOpen;
          return (
            <button
              key={c.category}
              onClick={() => onCatChange(c.category)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${activeCat === c.category ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-border text-muted-foreground hover:border-border/80"}`}
            >
              <Icon className="h-3 w-3" />
              {c.category} ({c.questions.length})
            </button>
          );
        })}
      </div>

      {/* Search result notice */}
      {search && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" />
          {filtered.reduce((s, c) => s + c.questions.length, 0)} results for "{search}"
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <Card className="p-12 text-center border-dashed">
          <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <div className="font-semibold">No articles found</div>
          <div className="text-xs text-muted-foreground mt-1 mb-4">
            Try a different search term, or ask Zara directly.
          </div>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> Ask Zara
          </Button>
        </Card>
      )}

      {/* FAQ grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((cat) => {
          const Icon = ICON_MAP[cat.icon] ?? CATEGORY_ICONS[cat.category] ?? LifeBuoy;
          return (
            <Card key={cat.category} className="overflow-hidden border-border">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
                <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-amber-400" />
                </div>
                <span className="font-semibold text-sm flex-1">{cat.category}</span>
                <Badge variant="outline" className="text-[10px] border-border">{cat.questions.length}</Badge>
              </div>
              <Accordion type="single" collapsible className="px-1">
                {cat.questions.map((q, i) => (
                  <AccordionItem key={i} value={`${cat.category}-${i}`} className="border-border/50 last:border-0 px-4">
                    <AccordionTrigger className="text-sm font-medium text-left hover:text-amber-400 transition-colors py-3 [&>svg]:text-muted-foreground">
                      {q.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-4">
                      {q.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          );
        })}
      </div>

      {/* Bottom CTA */}
      {!search && (
        <div className="rounded-xl border border-dashed border-border p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="font-semibold text-sm">Can't find what you need?</div>
              <div className="text-xs text-muted-foreground">Zara can answer custom questions about your account.</div>
            </div>
          </div>
          <Button size="sm" className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 shrink-0">
            <Sparkles className="h-3.5 w-3.5" /> Ask Zara
          </Button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Zara AI Chat
══════════════════════════════════════════════════════════════════════════ */
function ZaraChat({ seed, onSeedConsumed }: { seed: string | null; onSeedConsumed: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<LiveMsg[]>(() => [
    {
      role: "assistant",
      content: `Hi${user?.fullName ? ` ${user.fullName.split(" ")[0]}` : ""}! I'm **Zara**, your Zebvix AI assistant.\n\nI can help with KYC verification, deposits & withdrawals, bank linking, trading, fees, 2FA, referrals, and more. What can I help you with?`,
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (seed) { send(seed); onSeedConsumed(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");
    const next: LiveMsg[] = [...messages, { role: "user", content: msg, ts: Date.now() }];
    setMessages(next);
    try {
      const history = next.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const r = await post<{ reply: string }>("/support/ai-chat", { message: msg, history });
      setMessages((c) => [...c, { role: "assistant", content: r.reply, ts: Date.now() }]);
    } catch (e: unknown) {
      const errMsg = e instanceof ApiError ? (e.message) : "Network error. Please try again.";
      setMessages((c) => [...c, { role: "assistant", content: errMsg, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    setMessages([{
      role: "assistant",
      content: `Hi${user?.fullName ? ` ${user.fullName.split(" ")[0]}` : ""}! I'm Zara. How can I help you today?`,
      ts: Date.now(),
    }]);
    setInput("");
  }

  const showSuggestions = messages.length <= 1 && !sending;

  return (
    <Card className="overflow-hidden border-border">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-amber-500/8 via-amber-500/4 to-transparent">
        <div className="relative shrink-0">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Bot className="h-5 w-5 text-black" />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Zara · AI Support Assistant</div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online · typically replies in seconds
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-300 hidden sm:inline-flex">
            <Sparkles className="h-2.5 w-2.5 mr-1" /> AI Powered
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={clearChat}
            title="Clear conversation"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="h-[480px] overflow-y-auto px-4 py-4 space-y-4 bg-background/20">
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} ts={m.ts} />
        ))}
        {sending && <ChatBubble role="assistant" content="" typing />}
      </div>

      {/* Suggestions */}
      {showSuggestions && (
        <div className="px-4 py-3 border-t border-border bg-muted/10">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Suggested questions</div>
          <div className="flex flex-wrap gap-1.5">
            {AI_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={sending}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-amber-500/40 hover:bg-amber-500/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex items-end gap-2 px-4 py-3 border-t border-border bg-card/50"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="min-h-[40px] max-h-36 resize-none"
          disabled={sending}
        />
        <Button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 h-10 px-4 shrink-0"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {/* Disclaimer */}
      <div className="px-4 py-2 border-t border-border bg-muted/10 text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
        <Zap className="h-3 w-3" />
        Zara is an AI assistant — for account-specific issues requiring proof, please
        <button onClick={() => {}} className="underline hover:text-muted-foreground transition-colors">open a ticket</button>.
      </div>
    </Card>
  );
}

function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} className="h-1.5" />;
    if (t.startsWith("**") && t.endsWith("**"))
      return <div key={i} className="font-bold">{t.slice(2, -2)}</div>;
    if (t.startsWith("• ") || t.startsWith("- "))
      return (
        <div key={i} className="flex gap-2 mt-0.5">
          <span className="text-amber-400 mt-0.5 shrink-0">•</span>
          <span>{t.slice(2)}</span>
        </div>
      );
    if (/^\d+\.\s/.test(t)) {
      const dot = t.indexOf(". ");
      return (
        <div key={i} className="flex gap-2 mt-0.5">
          <span className="text-amber-400 font-semibold shrink-0">{t.slice(0, dot)}.</span>
          <span>{t.slice(dot + 2)}</span>
        </div>
      );
    }
    return <div key={i}>{line}</div>;
  });
}

function ChatBubble({ role, content, ts, typing }: { role: "user" | "assistant"; content: string; ts?: number; typing?: boolean }) {
  const isAi = role === "assistant";
  return (
    <div className={`flex gap-2.5 ${isAi ? "justify-start" : "justify-end"}`}>
      {isAi && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black shrink-0 mt-0.5 shadow shadow-amber-500/20">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isAi
            ? "bg-card border border-border text-foreground rounded-tl-sm"
            : "bg-gradient-to-br from-amber-400 to-orange-500 text-black font-medium rounded-tr-sm shadow shadow-amber-500/15"
        }`}
      >
        {typing ? (
          <span className="flex gap-1.5 py-0.5 items-center">
            <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-2 w-2 rounded-full bg-amber-400/70 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : isAi ? renderContent(content) : content}
        {ts && !typing && (
          <div className={`text-[10px] mt-1.5 ${isAi ? "text-muted-foreground/60" : "text-black/50"}`}>
            {new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      {!isAi && (
        <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-muted-foreground">
          U
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Tickets Panel
══════════════════════════════════════════════════════════════════════════ */
function TicketsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const ticketsQ = useQuery<Ticket[]>({
    queryKey: ["/support/tickets"],
    queryFn: () => get<Ticket[]>("/support/tickets"),
    enabled: !!user,
    refetchInterval: 15_000,
  });

  const tickets  = ticketsQ.data ?? [];
  const filtered = filterStatus === "all" ? tickets : tickets.filter((t) => t.status === filterStatus);
  const open     = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  if (!user) {
    return (
      <Card className="p-12 text-center border-dashed">
        <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <div className="font-semibold">Sign in to view tickets</div>
        <div className="text-xs text-muted-foreground mt-1">Log in to create and track your support tickets.</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total tickets",   value: tickets.length, icon: Hash,          color: "text-muted-foreground" },
          { label: "Open / Active",   value: open,           icon: AlertCircle,   color: "text-amber-400" },
          { label: "Resolved",        value: resolved,       icon: CheckCircle2,  color: "text-emerald-400" },
        ].map((s) => (
          <Card key={s.label} className="p-4 border-border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <div className="text-2xl font-bold">{ticketsQ.isLoading ? "—" : s.value}</div>
          </Card>
        ))}
      </div>

      {/* List + pane */}
      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        {/* Left: ticket list */}
        <Card className="border-border overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div className="font-semibold text-sm">Your tickets</div>
            <div className="flex items-center gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-7 text-xs w-[110px] border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-7 px-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 text-xs gap-1"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            </div>
          </div>

          {ticketsQ.isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center px-4">
              <div className="h-12 w-12 rounded-2xl bg-muted border border-border flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="font-semibold text-sm">{filterStatus === "all" ? "No tickets yet" : `No ${filterStatus} tickets`}</div>
              <div className="text-xs text-muted-foreground mt-1">Open one when you need human help.</div>
              {filterStatus === "all" && (
                <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> New Ticket
                </Button>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[460px]">
              <div className="divide-y divide-border/40">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/20 ${selectedId === t.id ? "bg-amber-500/5 border-l-2 border-l-amber-500" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-medium text-xs line-clamp-1 flex-1">{t.subject}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_CLS[t.status] ?? STATUS_CLS.closed}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="capitalize bg-muted/50 px-1.5 py-0.5 rounded">{t.category}</span>
                      <span className={`font-medium capitalize ${PRIORITY_CLS[t.priority] ?? ""}`}>{t.priority}</span>
                      <span className="ml-auto">{timeAgo(t.lastMessageAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>

        {/* Right: thread view */}
        <Card className="border-border min-h-[520px] overflow-hidden">
          {selectedId == null ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="h-14 w-14 rounded-2xl bg-muted border border-border flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="font-semibold">Select a ticket to view</div>
              <div className="text-xs text-muted-foreground mt-1.5 max-w-xs">
                Click any ticket on the left, or create a new one.
              </div>
              <Button
                className="mt-5 gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" /> New ticket
              </Button>
            </div>
          ) : (
            <ThreadPane
              id={selectedId}
              onClose={() => setSelectedId(null)}
              onResolved={(d) => { setSuccessData(d); qc.invalidateQueries({ queryKey: ["/support/tickets"] }); }}
            />
          )}
        </Card>
      </div>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          qc.invalidateQueries({ queryKey: ["/support/tickets"] });
          setSelectedId(id);
          setCreateOpen(false);
        }}
        onSuccess={(d) => setSuccessData(d)}
      />
      <SuccessModal open={!!successData} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}

/* ─── Thread pane ─────────────────────────────────────────────────────── */
function ThreadPane({ id, onClose, onResolved }: {
  id: number;
  onClose: () => void;
  onResolved: (d: GenericSuccess) => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const detailQ = useQuery<Ticket>({
    queryKey: ["/support/tickets", id],
    queryFn: () => get<Ticket>(`/support/tickets/${id}`),
    refetchInterval: 6_000,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [detailQ.data?.messages?.length]);

  const ticket = detailQ.data;
  const isClosed = ticket?.status === "closed" || ticket?.status === "resolved";

  async function sendMsg() {
    if (!input.trim() || sending || !ticket) return;
    setSending(true);
    try {
      await post(`/support/tickets/${ticket.id}/messages`, { message: input });
      setInput("");
      qc.invalidateQueries({ queryKey: ["/support/tickets", id] });
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function closeTicket() {
    if (!ticket) return;
    try {
      await patch(`/support/tickets/${ticket.id}/close`);
      qc.invalidateQueries({ queryKey: ["/support/tickets"] });
      qc.invalidateQueries({ queryKey: ["/support/tickets", id] });
      onResolved({
        kind: "generic", iconKind: "paid", accentColor: "#6366f1",
        title: "Ticket Closed",
        subtitle: "Your support ticket has been resolved and closed.",
        rows: [
          { label: "Ticket #", value: String(ticket.id) },
          { label: "Status",   value: "Closed", accent: "#6366f1" },
        ],
      });
    } catch {
      toast.error("Failed to close ticket");
    }
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm line-clamp-1">{ticket.subject}</div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${STATUS_CLS[ticket.status] ?? STATUS_CLS.closed}`}>
              {STATUS_LABEL[ticket.status] ?? ticket.status}
            </span>
            <span className={`text-[11px] font-medium capitalize ${PRIORITY_CLS[ticket.priority] ?? ""}`}>
              {ticket.priority} priority
            </span>
            <span className="text-[11px] text-muted-foreground capitalize">#{ticket.id} · {ticket.category}</span>
          </div>
        </div>
        {!isClosed && (
          <Button size="sm" variant="outline" className="text-xs h-7 shrink-0" onClick={closeTicket}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {(ticket.messages ?? []).length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">No messages yet. Our team will respond shortly.</div>
        )}
        {(ticket.messages ?? []).map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
              msg.senderType === "user"
                ? "bg-amber-500 text-black rounded-tr-sm"
                : msg.senderType === "bot"
                ? "bg-card border border-blue-500/30 text-foreground rounded-tl-sm"
                : "bg-card border border-border text-foreground rounded-tl-sm"
            }`}>
              {msg.senderType === "bot" && (
                <div className="flex items-center gap-1 text-[11px] text-blue-400 mb-1.5 font-semibold">
                  <Zap className="h-3 w-3" /> AI Assistant
                </div>
              )}
              {msg.senderType === "admin" && (
                <div className="text-[11px] text-amber-400 mb-1.5 font-semibold">Support Agent</div>
              )}
              <div className="whitespace-pre-wrap">{msg.message}</div>
              <div className={`text-[10px] mt-2 ${msg.senderType === "user" ? "text-black/50" : "text-muted-foreground/60"}`}>
                {new Date(msg.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply input */}
      {!isClosed ? (
        <div className="flex items-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
            placeholder="Reply to this ticket… (Enter to send)"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none flex-1"
            disabled={sending}
          />
          <Button
            onClick={sendMsg}
            disabled={sending || !input.trim()}
            className="shrink-0 gap-2 h-10"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/10 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          This ticket is {ticket.status}. Open a new ticket if you need further help.
        </div>
      )}
    </div>
  );
}

/* ─── Create ticket dialog ────────────────────────────────────────────── */
function CreateTicketDialog({
  open, onOpenChange, onCreated, onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: number) => void;
  onSuccess: (d: GenericSuccess) => void;
}) {
  const [form, setForm] = useState({ subject: "", message: "", category: "general", priority: "normal" });

  const mut = useMutation({
    mutationFn: (body: object) => post<{ id: number; subject: string }>("/support/tickets", body),
    onSuccess: (data) => {
      onCreated(data.id);
      onSuccess({
        kind: "generic", iconKind: "paid", accentColor: "#f59e0b",
        title: "Ticket Created",
        subtitle: "Our support team will respond within 2–4 hours.",
        rows: [
          { label: "Ticket #",  value: String(data.id) },
          { label: "Subject",   value: form.subject },
          { label: "Category",  value: form.category },
          { label: "Priority",  value: form.priority },
          { label: "Status",    value: "Open", accent: "#10b981" },
        ],
      });
      setForm({ subject: "", message: "", category: "general", priority: "normal" });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to create ticket"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeadphonesIcon className="h-4 w-4 text-amber-400" />
            New Support Ticket
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mut.mutate(form); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Subject <span className="text-rose-400">*</span></Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Brief description of your issue"
              required
              minLength={5}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "normal", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message <span className="text-rose-400">*</span></Label>
            <Textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Describe your issue in detail — include transaction IDs, amounts, dates…"
              rows={5}
              required
              minLength={10}
            />
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/70 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
            <span>For fastest resolution, include the txn hash, UTR number, or order ID related to your issue.</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              disabled={mut.isPending}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400"
            >
              {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</> : "Submit Ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
