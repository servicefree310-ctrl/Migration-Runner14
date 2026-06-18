import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLink, KeyRound, RefreshCw, ChevronRight,
  CheckCircle2, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";

const BASE_URL = `${window.location.origin}/api`;

const ENDPOINTS = [
  { method: "GET", path: "/koinx/trades",      desc: "Spot trade history (buy/sell fills)" },
  { method: "GET", path: "/koinx/deposits",    desc: "Crypto deposit history" },
  { method: "GET", path: "/koinx/withdrawals", desc: "Crypto withdrawal history" },
];

const STEPS = [
  {
    n: 1,
    title: "Create a read-only API key on Zebvix",
    body: "Go to the API Keys tab in Settings. Create a new key with only the Read permission enabled — no Trade or Withdraw access needed.",
    cta: "Open API Keys tab",
    href: "?tab=api-keys",
  },
  {
    n: 2,
    title: "Open KoinX and add your exchange",
    body: "Log in to app.koinx.com → Portfolio → Add Wallet → Exchange → search for Zebvix.",
    cta: "Go to KoinX",
    href: "https://app.koinx.com",
    external: true,
  },
  {
    n: 3,
    title: "Enter your Zebvix API credentials",
    body: "Paste your API Key ID and the Secret (shown once at creation) into the KoinX connection form.",
  },
  {
    n: 4,
    title: "KoinX syncs your history automatically",
    body: "KoinX will pull your trades, deposits, and withdrawals and compute your P&L and tax liability under Indian VDA tax rules (Schedule VDA).",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — please copy manually");
    }
  };
  return (
    <button onClick={handle} className="p-1 rounded hover:bg-muted/60 transition text-muted-foreground">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function KoinXTab() {
  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg select-none">
            Kx
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-lg">KoinX Integration</h2>
              <Badge className="bg-amber-500/15 text-amber-400 border-transparent text-[10px]">Beta</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your Zebvix account to KoinX for automatic crypto tax reporting under Indian VDA tax rules.
              KoinX reads your trades, deposits, and withdrawals to compute P&amp;L and Schedule VDA filings.
            </p>
            <a
              href="https://koinx.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
            >
              Learn more about KoinX <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </Card>

      {/* Step-by-step guide */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" /> How to connect
        </h3>
        <div className="space-y-4">
          {STEPS.map((step, idx) => (
            <div key={step.n}>
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {step.n}
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <div className="font-medium text-sm">{step.title}</div>
                  <p className="text-xs text-muted-foreground mt-1">{step.body}</p>
                  {step.cta && (
                    step.external ? (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                      >
                        {step.cta} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <a
                        href={step.href!}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                      >
                        <KeyRound className="h-3 w-3" /> {step.cta} <ChevronRight className="h-3 w-3" />
                      </a>
                    )
                  )}
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="ml-3.5 pl-7 border-l border-border/40 h-3 mt-1" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* API reference */}
      <Card className="p-5">
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> API endpoints available to KoinX
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          These endpoints use your Zebvix API key (HMAC-SHA256 auth). KoinX automatically signs requests on your behalf.
        </p>

        <div className="mb-3">
          <div className="text-xs text-muted-foreground mb-1">Base URL</div>
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <code className="text-xs font-mono flex-1 truncate">{BASE_URL}</code>
            <CopyButton text={BASE_URL} />
          </div>
        </div>

        <Separator className="my-3" />

        <div className="space-y-2">
          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="flex items-center gap-3">
              <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[10px] font-mono shrink-0">
                {ep.method}
              </Badge>
              <code className="text-xs font-mono text-foreground/80 shrink-0">{ep.path}</code>
              <span className="text-xs text-muted-foreground hidden sm:block">— {ep.desc}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1">
          <p className="font-medium">Auth header format (for KoinX developers)</p>
          <p className="font-mono text-[11px]">X-ZBX-APIKEY: &lt;keyId&gt;</p>
          <p className="font-mono text-[11px]">X-ZBX-TIMESTAMP: &lt;unix ms&gt;</p>
          <p className="font-mono text-[11px]">X-ZBX-SIGN: hex(HMAC-SHA256(secret, timestamp + METHOD + path + body))</p>
        </div>
      </Card>

      {/* Permissions note */}
      <Card className="p-5">
        <h3 className="font-semibold mb-2 text-sm">What data does KoinX access?</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: "Spot trade history",     ok: true },
            { label: "Deposit history",         ok: true },
            { label: "Withdrawal history",      ok: true },
            { label: "Account balances",        ok: false, note: "Not shared" },
            { label: "Place or cancel orders",  ok: false, note: "Read-only key" },
            { label: "Withdraw funds",          ok: false, note: "Read-only key" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-muted-foreground">{item.label}</span>
              {item.ok ? (
                <Badge className="bg-emerald-500/15 text-emerald-400 border-transparent text-[10px]">Shared</Badge>
              ) : (
                <Badge className="bg-muted/40 text-muted-foreground border-transparent text-[10px]">{item.note}</Badge>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
