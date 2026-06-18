import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  Video, Upload, Link2, Bot, CheckCircle2, Star, Trophy,
  Play, Youtube, Instagram, Twitter, Facebook, ExternalLink,
  TrendingUp, Users, Coins, ChevronRight, Eye, Clock,
  AlertCircle, Send, Award, Zap, Flame, Crown,
  Shield, Info, ArrowRight, BarChart3, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────
type Submission = {
  id: number;
  platform: string;
  videoUrl: string;
  title: string;
  views: number;
  status: "pending" | "approved" | "rejected" | "reviewing";
  reward: number;
  createdAt: string;
};

type LeaderEntry = {
  rank: number;
  username: string;
  videos: number;
  totalViews: number;
  totalRewards: number;
};

type ProgramSettings = {
  programEnabled: boolean;
  baseRewardUsdt: number;
  referralRewardUsdt: number;
  bonus1kUsdt: number;
  bonus100kUsdt: number;
  bonus1mUsdt: number;
  minVideoDurationSec: number;
  maxSubmissionsPerUser: number;
};

const STEPS = [
  { icon: Video,       color: "from-amber-500 to-yellow-400",   title: "Create Video",        body: "Record a short video (≥ 15 sec) about Zebvix — trading, features, or your experience." },
  { icon: Upload,      color: "from-emerald-500 to-green-400",  title: "Upload to Social",    body: "Post it publicly on YouTube Shorts, Instagram Reels, Facebook Reels, or X." },
  { icon: Link2,       color: "from-blue-500 to-sky-400",       title: "Submit Video Link",   body: "Paste the video URL into the form below and fill in the details." },
  { icon: Bot,         color: "from-violet-500 to-purple-400",  title: "AI Review",           body: "Our AI + manual review team checks content quality and authenticity within 48 hours." },
  { icon: CheckCircle2,color: "from-amber-400 to-yellow-300",   title: "Reward Approved",     body: "USDT credited directly to your spot wallet. Bonus rewards unlocked as views grow." },
];

const DEFAULT_MILESTONES = [
  { views: 1_000,       bonus: 1,    icon: TrendingUp, label: "1K views" },
  { views: 100_000,     bonus: 100,  icon: Zap,        label: "100K views" },
  { views: 1_000_000,   bonus: 1000, icon: Flame,       label: "1M views" },
];

const PLATFORMS = [
  { value: "youtube",   label: "YouTube Shorts",   icon: Youtube,   color: "text-red-500" },
  { value: "instagram", label: "Instagram Reels",  icon: Instagram, color: "text-pink-500" },
  { value: "facebook",  label: "Facebook Reels",   icon: Facebook,  color: "text-blue-500" },
  { value: "x",         label: "X (Twitter)",      icon: Twitter,   color: "text-sky-400" },
];

const RULES = [
  "Minimum 15 seconds long",
  "Original content only — no reposts or AI-generated voiceovers",
  "Video must be public (not private or unlisted)",
  'Must mention "Zebvix" verbally or in on-screen text',
  "No duplicate submissions — each URL can only be submitted once",
  "One approval reward per video link",
  "AI + manual review before any reward is issued",
  "Zebvix reserves the right to reject any misleading or low-quality content",
];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  reviewing: { label: "Reviewing", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  approved:  { label: "Approved",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rejected:  { label: "Rejected",  cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

// ── Animated counter ───────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const raf = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const pct = Math.min(elapsed / duration, 1);
      setValue(Math.round(pct * pct * target));
      if (pct < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

function StatCounter({ label, target, prefix = "", suffix = "" }: {
  label: string; target: number; prefix?: string; suffix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.3 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const val = useCountUp(target, 1600, visible);
  const display = target >= 1000
    ? val >= 1000 ? `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}K` : val.toString()
    : val.toString();
  return (
    <div ref={ref} className="flex flex-col items-center gap-1">
      <span className="text-3xl md:text-4xl font-black tabular-nums bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
        {prefix}{display}{suffix}
      </span>
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ── Platform icon helper ───────────────────────────────────────────────────────
function PlatformIcon({ platform, size = 4 }: { platform: string; size?: number }) {
  const p = PLATFORMS.find((x) => x.value === platform.toLowerCase());
  if (!p) return <Globe className={`h-${size} w-${size} text-muted-foreground`} />;
  return <p.icon className={`h-${size} w-${size} ${p.color}`} />;
}

function fmtViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

// ── Glowing card wrapper ───────────────────────────────────────────────────────
function GlowCard({ children, className, gold = false }: { children: React.ReactNode; className?: string; gold?: boolean }) {
  return (
    <div className={cn(
      "relative rounded-2xl border p-px transition-all duration-300",
      gold
        ? "border-amber-500/40 bg-gradient-to-br from-amber-500/20 via-card to-card shadow-[0_0_24px_rgba(245,158,11,0.12)] hover:shadow-[0_0_36px_rgba(245,158,11,0.22)]"
        : "border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-card shadow-[0_0_20px_rgba(16,185,129,0.08)] hover:shadow-[0_0_32px_rgba(16,185,129,0.18)]",
      className,
    )}>
      <div className="rounded-2xl h-full">{children}</div>
    </div>
  );
}

// ── Rank medal ─────────────────────────────────────────────────────────────────
function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-400" />;
  if (rank === 2) return <Trophy className="h-4 w-4 text-foreground/70" />;
  if (rank === 3) return <Award className="h-4 w-4 text-orange-400" />;
  return <span className="text-xs font-bold text-muted-foreground w-4 text-center">#{rank}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CreatorRewards() {
  const { user } = useAuth();
  const [platform, setPlatform] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState<GenericSuccess | null>(null);

  const { data: settings } = useQuery<ProgramSettings>({
    queryKey: ["creator-rewards-settings"],
    queryFn: () => get<ProgramSettings>("/creator-rewards/settings"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: leaderboard = [], isLoading: lbLoading } = useQuery<LeaderEntry[]>({
    queryKey: ["creator-rewards-leaderboard"],
    queryFn: () => get<LeaderEntry[]>("/creator-rewards/leaderboard?limit=10"),
    staleTime: 5 * 60 * 1000,
  });

  const REWARD_MILESTONES = settings ? [
    { views: 1_000,     bonus: settings.bonus1kUsdt,   icon: TrendingUp, label: "1K views" },
    { views: 100_000,   bonus: settings.bonus100kUsdt, icon: Zap,        label: "100K views" },
    { views: 1_000_000, bonus: settings.bonus1mUsdt,   icon: Flame,      label: "1M views" },
  ] : DEFAULT_MILESTONES;

  const { data: submissions, isLoading: subLoading, refetch } = useQuery<Submission[]>({
    queryKey: ["creator-rewards", "submissions", user?.id],
    queryFn: () => get<Submission[]>("/creator-rewards/submissions"),
    enabled: !!user,
    retry: 1,
  });

  const submitMutation = useMutation({
    mutationFn: () => post("/creator-rewards/submit", {
      platform,
      videoUrl: videoUrl.trim(),
      title: title.trim(),
      description: description.trim(),
      ...(screenshotUrl.trim() ? { screenshotUrl: screenshotUrl.trim() } : {}),
    }),
    onSuccess: () => {
      setSubmitSuccess({
        kind: "generic", iconKind: "paid", accentColor: "amber",
        title: "Submission Received!",
        subtitle: "Your video is under review. We'll verify it within 48 hours and credit your reward upon approval.",
        rows: [
          { label: "Platform", value: platform.charAt(0).toUpperCase() + platform.slice(1) },
          { label: "Video URL", value: videoUrl.trim().slice(0, 40) + (videoUrl.length > 40 ? "…" : "") },
          { label: "Status", value: "Under Review" },
        ],
        primaryLabel: "Got it",
      });
      setPlatform(""); setVideoUrl(""); setTitle(""); setDescription(""); setScreenshotUrl("");
      refetch();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to submit. Please try again."),
  });

  const canSubmit = platform && videoUrl.trim() && title.trim() && description.trim().length >= 20;

  const totalRewards  = submissions?.filter((s) => s.status === "approved").reduce((a, s) => a + s.reward, 0) ?? 0;
  const approvedCount = submissions?.filter((s) => s.status === "approved").length ?? 0;
  const pendingCount  = submissions?.filter((s) => s.status === "pending" || s.status === "reviewing").length ?? 0;

  return (
    <div
      className="min-h-screen bg-background text-foreground"
    >

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-amber-500/15">
        {/* radial glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/4 h-[420px] w-[420px] rounded-full bg-amber-500/10 blur-[120px]" />
          <div className="absolute top-20 right-0 h-[320px] w-[320px] rounded-full bg-emerald-500/8 blur-[100px]" />
          <div className="absolute -bottom-20 left-0 h-[240px] w-[240px] rounded-full bg-amber-500/6 blur-[80px]" />
        </div>
        {/* grid overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(rgba(245,158,11,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }}
        />

        <div className="relative container mx-auto max-w-6xl px-4 py-16 md:py-24 text-center">
          <Badge className="mb-5 border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs px-4 py-1.5 font-semibold tracking-widest uppercase">
            🎥 Creator Rewards Program
          </Badge>
          <h1 className="text-3xl md:text-6xl font-black tracking-tight mb-5 leading-tight">
            Create.{" "}
            <span className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_32px_rgba(245,158,11,0.5)]">
              Share.
            </span>{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-green-300 bg-clip-text text-transparent drop-shadow-[0_0_32px_rgba(16,185,129,0.4)]">
              Earn
            </span>{" "}
            with Zebvix.
          </h1>
          <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
            Record a short video about Zebvix, post it on YouTube Shorts, Instagram Reels, Facebook Reels, or X,
            then submit the link — and earn USDT after approval.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {PLATFORMS.map((p) => (
              <div key={p.value} className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm font-medium">
                <p.icon className={`h-4 w-4 ${p.color}`} />
                {p.label}
              </div>
            ))}
          </div>

          {/* stat counters */}
          <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto">
            <StatCounter label="Total Rewards Paid" target={14820} prefix="$" />
            <StatCounter label="Approved Videos"    target={1247} />
            <StatCounter label="Top Creators"       target={342} />
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="container mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-xl font-bold text-center mb-10">
          How it{" "}
          <span className="bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">works</span>
        </h2>
        <div className="relative">
          {/* connector line */}
          <div className="absolute top-[42px] left-[10%] right-[10%] h-px bg-gradient-to-r from-amber-500/10 via-amber-500/40 to-emerald-500/20 hidden md:block" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {STEPS.map((step, i) => (
              <div key={i} className="relative flex flex-col items-center text-center gap-3">
                <div className={`relative h-[84px] w-[84px] rounded-2xl bg-gradient-to-br ${step.color} p-[1px] flex-shrink-0 shadow-lg`}>
                  <div className="h-full w-full rounded-2xl bg-card flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-foreground" />
                  </div>
                  <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-muted border border-border text-[10px] font-bold text-foreground/70 flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground mb-1">{step.title}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{step.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reward cards ────────────────────────────────────────────────── */}
      <section className="container mx-auto max-w-6xl px-4 pb-14">
        <h2 className="text-xl font-bold text-center mb-8">
          What you{" "}
          <span className="bg-gradient-to-r from-emerald-400 to-green-300 bg-clip-text text-transparent">earn</span>
        </h2>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Creator reward */}
          <GlowCard gold>
            <div className="p-6 rounded-2xl flex items-center gap-5">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(245,158,11,0.4)]">
                <Video className="h-8 w-8 text-black" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Creator Reward</div>
                <div className="text-4xl font-black text-amber-400 drop-shadow-[0_0_16px_rgba(245,158,11,0.6)]">{settings?.baseRewardUsdt ?? 10} USDT</div>
                <div className="text-xs text-muted-foreground mt-1">Per approved video</div>
              </div>
            </div>
          </GlowCard>

          {/* Referral reward */}
          <GlowCard>
            <div className="p-6 rounded-2xl flex items-center gap-5">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center shrink-0 shadow-[0_0_24px_rgba(16,185,129,0.4)]">
                <Users className="h-8 w-8 text-black" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-1">Referral Reward</div>
                <div className="text-4xl font-black text-emerald-400 drop-shadow-[0_0_16px_rgba(16,185,129,0.6)]">{settings?.referralRewardUsdt ?? 15} USDT</div>
                <div className="text-xs text-muted-foreground mt-1">Per referred user who completes KYC + first trade</div>
              </div>
            </div>
          </GlowCard>
        </div>

        {/* Bonus milestones */}
        <div className="rounded-2xl border border-border/80 bg-card/50 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Flame className="h-5 w-5 text-amber-400" />
            <span className="font-bold">Bonus Rewards — as views grow</span>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                Bonuses are paid once per milestone per video, credited automatically when our system detects the view count crossing the threshold.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {REWARD_MILESTONES.map((m, i) => (
              <div key={i} className={cn(
                "rounded-xl border p-4 text-center transition-all",
                i === 0 ? "border-amber-500/25 bg-amber-500/5" :
                i === 1 ? "border-yellow-500/25 bg-yellow-500/5" :
                          "border-emerald-500/25 bg-emerald-500/5",
              )}>
                <m.icon className={cn(
                  "h-6 w-6 mx-auto mb-2",
                  i === 0 ? "text-amber-400" : i === 1 ? "text-yellow-300" : "text-emerald-400",
                )} />
                <div className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wider">{m.label}</div>
                <div className={cn(
                  "text-2xl font-black",
                  i === 0 ? "text-amber-400" : i === 1 ? "text-yellow-300" : "text-emerald-400",
                )}>+{m.bonus} USDT</div>
              </div>
            ))}
          </div>
          {/* progress bar illustration */}
          <div className="mt-5">
            <div className="flex justify-between text-[10px] text-muted-foreground/60 mb-1.5">
              <span>0</span><span>1K</span><span>100K</span><span>1M views</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-500 animate-pulse"
                style={{ width: "62%" }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-1 text-center">View count tracked daily via platform APIs</div>
          </div>
        </div>
      </section>

      {/* ── Main content — Tabs ──────────────────────────────────────────── */}
      <section className="container mx-auto max-w-6xl px-4 pb-16">
        <Tabs defaultValue="submit">
          <TabsList className="bg-card border border-border p-1 rounded-xl mb-8 grid grid-cols-3 max-w-lg">
            <TabsTrigger value="submit"  className="rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-black font-semibold text-sm">
              <Send className="h-3.5 w-3.5 mr-1.5" /> Submit
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-black font-semibold text-sm">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> My Submissions
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="rounded-lg data-[state=active]:bg-amber-500 data-[state=active]:text-black font-semibold text-sm">
              <Trophy className="h-3.5 w-3.5 mr-1.5" /> Leaderboard
            </TabsTrigger>
          </TabsList>

          {/* ── Submit tab ──────────────────────────────────────────────── */}
          <TabsContent value="submit">
            <div className="grid lg:grid-cols-[1fr_380px] gap-8">
              {/* Form */}
              <div className="rounded-2xl border border-border/80 bg-card/50 p-7 space-y-6">
                <div className="flex items-center gap-3 mb-1">
                  <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shrink-0">
                    <Send className="h-4 w-4 text-black" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base">Submit Your Video</h2>
                    <p className="text-xs text-muted-foreground">All fields required. Review takes up to 48 hours.</p>
                  </div>
                </div>

                {!user && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-300/90">
                      <strong>Sign in required.</strong> Please{" "}
                      <Link href="/login" className="underline hover:text-amber-400">log in</Link>{" "}
                      or{" "}
                      <Link href="/signup" className="underline hover:text-amber-400">create an account</Link>{" "}
                      to submit a video and receive rewards.
                    </div>
                  </div>
                )}

                {/* Platform */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Video Platform *</Label>
                  <Select value={platform} onValueChange={setPlatform} disabled={!user}>
                    <SelectTrigger className="bg-muted/60 border-border text-foreground rounded-xl h-11">
                      <SelectValue placeholder="Select platform…" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-xl">
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="cursor-pointer focus:bg-muted">
                          <div className="flex items-center gap-2">
                            <p.icon className={`h-4 w-4 ${p.color}`} />
                            {p.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Video URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Video URL *</Label>
                  <Input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/shorts/…"
                    disabled={!user}
                    className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl h-11"
                  />
                  <p className="text-[11px] text-muted-foreground/60">Paste the direct public link to your video post.</p>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Video Title *</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Zebvix trading journey…"
                    maxLength={120}
                    disabled={!user}
                    className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl h-11"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Description *</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Briefly describe what your video covers… (min 20 characters)"
                    rows={3}
                    maxLength={500}
                    disabled={!user}
                    className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl resize-none"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground/60">
                    <span>{description.length < 20 ? `${20 - description.length} more chars needed` : "✓ Good"}</span>
                    <span>{description.length}/500</span>
                  </div>
                </div>

                {/* Screenshot URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Screenshot URL
                    <span className="ml-1 text-muted-foreground/60 normal-case font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={screenshotUrl}
                    onChange={(e) => setScreenshotUrl(e.target.value)}
                    placeholder="https://i.imgur.com/your-screenshot.jpg"
                    disabled={!user}
                    className="bg-muted/60 border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl h-11"
                  />
                  <p className="text-[11px] text-muted-foreground/60">Upload your thumbnail/screenshot to Imgur or any image host and paste the link.</p>
                </div>

                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={!user || !canSubmit || submitMutation.isPending}
                  className={cn(
                    "w-full h-12 text-sm font-bold rounded-xl transition-all",
                    canSubmit && user
                      ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-black hover:from-amber-400 hover:to-yellow-300 shadow-[0_0_24px_rgba(245,158,11,0.4)] hover:shadow-[0_0_36px_rgba(245,158,11,0.55)]"
                      : "bg-muted text-muted-foreground/60 cursor-not-allowed",
                  )}
                >
                  {submitMutation.isPending ? (
                    <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-black/40 border-t-black animate-spin" />Submitting…</span>
                  ) : (
                    <span className="flex items-center gap-2"><Send className="h-4 w-4" />Submit for Review</span>
                  )}
                </Button>
              </div>

              {/* Rules + sidebar */}
              <div className="space-y-5">
                {/* User stats if logged in */}
                {user && (
                  <div className="rounded-2xl border border-border/80 bg-card/50 p-5 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Star className="h-4 w-4 text-amber-400" /> Your Stats
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-2xl font-black text-amber-400">{totalRewards}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">USDT earned</div>
                      </div>
                      <div>
                        <div className="text-2xl font-black text-emerald-400">{approvedCount}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Approved</div>
                      </div>
                      <div>
                        <div className="text-2xl font-black text-blue-400">{pendingCount}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pending</div>
                      </div>
                    </div>
                    {approvedCount > 0 && (
                      <Progress value={Math.min((totalRewards / 500) * 100, 100)} className="h-1.5 bg-muted" />
                    )}
                  </div>
                )}

                {/* Rules */}
                <div className="rounded-2xl border border-border/80 bg-card/50 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                    <Shield className="h-4 w-4 text-emerald-400" /> Submission Rules
                  </div>
                  <ul className="space-y-2.5">
                    {RULES.map((rule, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Quick tips */}
                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-3">
                    <Zap className="h-4 w-4" /> Pro tips
                  </div>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2"><ChevronRight className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />Use good lighting & clear audio for faster approval</li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />Include your referral link in the video description</li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />Trending formats: tutorials, P&L reveals, feature walkthroughs</li>
                    <li className="flex items-start gap-2"><ChevronRight className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />Reels ≥ 30 sec tend to get more views — bigger bonuses</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Submission history ───────────────────────────────────────── */}
          <TabsContent value="history">
            {!user ? (
              <div className="rounded-2xl border border-border/80 bg-card/50 p-12 text-center">
                <Video className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <div className="font-semibold text-muted-foreground mb-2">Sign in to view your submissions</div>
                <div className="text-sm text-muted-foreground/60 mb-6">Your submission history and reward status will appear here.</div>
                <Link href="/login"><Button className="bg-amber-500 hover:bg-amber-400 text-black font-bold">Log in</Button></Link>
              </div>
            ) : subLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl bg-muted" />)}
              </div>
            ) : !submissions || submissions.length === 0 ? (
              <div className="rounded-2xl border border-border/80 bg-card/50 p-12 text-center">
                <Play className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <div className="font-semibold text-muted-foreground mb-1">No submissions yet</div>
                <div className="text-sm text-muted-foreground/60">Create your first video and submit it to start earning!</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/80 bg-card/50 overflow-hidden">
                <div className="p-5 border-b border-border flex items-center justify-between">
                  <span className="font-semibold text-sm">{submissions.length} submission{submissions.length !== 1 ? "s" : ""}</span>
                  <span className="text-xs text-muted-foreground">Total earned: <strong className="text-amber-400">{totalRewards} USDT</strong></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left px-5 py-3 font-semibold">Platform</th>
                        <th className="text-left px-5 py-3 font-semibold">Video</th>
                        <th className="text-right px-5 py-3 font-semibold">Views</th>
                        <th className="text-center px-5 py-3 font-semibold">Status</th>
                        <th className="text-right px-5 py-3 font-semibold">Reward</th>
                        <th className="text-right px-5 py-3 font-semibold">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {submissions.map((s) => {
                        const st = STATUS_MAP[s.status] ?? STATUS_MAP.pending;
                        return (
                          <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-5 py-4">
                              <PlatformIcon platform={s.platform} />
                            </td>
                            <td className="px-5 py-4 max-w-[200px]">
                              <a href={s.videoUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-foreground/70 hover:text-amber-400 transition-colors font-medium truncate text-xs">
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                {s.title}
                              </a>
                            </td>
                            <td className="px-5 py-4 text-right text-muted-foreground font-mono text-xs">
                              <span className="flex items-center justify-end gap-1">
                                <Eye className="h-3 w-3" />{fmtViews(s.views)}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-center">
                              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border ${st.cls}`}>
                                {st.label}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-bold text-xs">
                              {s.reward > 0 ? (
                                <span className="text-emerald-400">+{s.reward} USDT</span>
                              ) : (
                                <span className="text-muted-foreground/60">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right text-muted-foreground/60 text-xs">
                              <span className="flex items-center justify-end gap-1">
                                <Clock className="h-3 w-3" />{fmtDate(s.createdAt)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Leaderboard ──────────────────────────────────────────────── */}
          <TabsContent value="leaderboard">
            <div className="rounded-2xl border border-border/80 bg-card/50 overflow-hidden">
              <div className="p-6 border-b border-border bg-gradient-to-r from-amber-500/5 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-400 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                    <Crown className="h-5 w-5 text-black" />
                  </div>
                  <div>
                    <h2 className="font-bold">Top Creators This Month</h2>
                    <p className="text-xs text-muted-foreground">Rankings reset on 1st of each month · June 2026</p>
                  </div>
                </div>
              </div>

              {/* Top 3 podium */}
              {lbLoading ? (
                <div className="p-6 border-b border-border/50 grid grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl bg-muted" />)}
                </div>
              ) : leaderboard.length >= 3 ? (
                <div className="grid grid-cols-3 gap-4 p-6 border-b border-border/50">
                  {[leaderboard[1], leaderboard[0], leaderboard[2]].map((entry, i) => {
                    const podiumH = i === 1 ? "h-24" : "h-16";
                    const colors  = i === 0 ? "from-muted/60 to-muted/20 border-border/40" :
                                    i === 1 ? "from-amber-500/30 to-amber-600/10 border-amber-500/40" :
                                              "from-orange-500/25 to-orange-600/10 border-orange-500/30";
                    const label   = i === 1 ? "🥇 1st" : i === 0 ? "🥈 2nd" : "🥉 3rd";
                    if (!entry) return null;
                    return (
                      <div key={entry.rank} className="flex flex-col items-center gap-2">
                        <div className={`w-full rounded-xl border bg-gradient-to-b ${colors} ${podiumH} flex items-center justify-center`}>
                          <span className="text-xs font-bold text-foreground/70">{label}</span>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-bold text-foreground">{entry.username}</div>
                          <div className="text-[11px] text-amber-400 font-semibold">{entry.totalRewards} USDT</div>
                          <div className="text-[10px] text-muted-foreground/60">{fmtViews(entry.totalViews)} views</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Full table */}
              {lbLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg bg-muted" />)}
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="p-12 text-center">
                  <Trophy className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                  <div className="text-sm text-muted-foreground">No approved videos yet — be the first on the leaderboard!</div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-center px-5 py-3 font-semibold w-14">Rank</th>
                        <th className="text-left px-5 py-3 font-semibold">Creator</th>
                        <th className="text-right px-5 py-3 font-semibold">Videos</th>
                        <th className="text-right px-5 py-3 font-semibold">Total Views</th>
                        <th className="text-right px-5 py-3 font-semibold">Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {leaderboard.map((entry) => (
                        <tr
                          key={entry.rank}
                          className={cn(
                            "transition-colors",
                            entry.rank === 1 ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-muted/30",
                          )}
                        >
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex items-center justify-center"><Medal rank={entry.rank} /></div>
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-foreground/90">{entry.username}</td>
                          <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums">{entry.videos}</td>
                          <td className="px-5 py-3.5 text-right text-muted-foreground tabular-nums font-mono text-xs">
                            <span className="flex items-center justify-end gap-1">
                              <Eye className="h-3 w-3" />{fmtViews(entry.totalViews)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold tabular-nums">
                            <span className={entry.rank <= 3 ? "text-amber-400" : "text-emerald-400"}>
                              {entry.totalRewards} USDT
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="p-4 text-center text-[11px] text-muted-foreground/60 border-t border-border">
                Usernames partially masked for privacy · Rankings refresh every 24 hours
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-amber-500/10 bg-gradient-to-b from-transparent to-amber-500/5">
        <div className="container mx-auto max-w-4xl px-4 py-14 text-center">
          <h2 className="text-2xl md:text-4xl font-black mb-4">
            Ready to start{" "}
            <span className="bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
              creating?
            </span>
          </h2>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
            Join hundreds of creators already earning USDT by sharing their Zebvix experience with the world.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {!user ? (
              <>
                <Link href="/signup">
                  <Button className="h-12 px-8 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold hover:from-amber-400 hover:to-yellow-300 rounded-xl shadow-[0_0_24px_rgba(245,158,11,0.35)] hover:shadow-[0_0_36px_rgba(245,158,11,0.5)] transition-all">
                    Create Free Account <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" className="h-12 px-8 border-border text-foreground/70 hover:border-amber-500/50 hover:text-amber-400 rounded-xl font-semibold transition-all">
                    Log in
                  </Button>
                </Link>
              </>
            ) : (
              <Button
                onClick={() => document.querySelector<HTMLButtonElement>('[data-state="inactive"][value="submit"]')?.click()}
                className="h-12 px-8 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold hover:from-amber-400 hover:to-yellow-300 rounded-xl shadow-[0_0_24px_rgba(245,158,11,0.35)] transition-all"
              >
                Submit Your Video Now <Send className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </section>

      <SuccessModal open={submitSuccess !== null} payload={submitSuccess} onClose={() => setSubmitSuccess(null)} />
    </div>
  );
}
