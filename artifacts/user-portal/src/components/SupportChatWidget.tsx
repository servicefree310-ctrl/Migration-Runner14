import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import {
  Bot, Send, Loader2, X, Sparkles, MessageSquare,
  ExternalLink, ChevronDown, RotateCcw, Copy, Check,
  Minimize2, Maximize2, Zap,
} from "lucide-react";
import { post, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Msg = {
  role: "user" | "assistant";
  content: string;
  ts: number;
  id: string;
  error?: boolean;
};

const QUICK_REPLIES = [
  "How do I complete KYC?",
  "My deposit is pending",
  "Withdrawal not received",
  "How to add bank account?",
  "What are trading fees?",
  "How referrals work?",
];

let _msgCounter = 0;
function uid() { return `m${++_msgCounter}_${Date.now()}`; }

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function renderContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ")) {
      return (
        <div key={i} className="flex gap-1.5 mt-0.5">
          <span className="text-amber-400 mt-0.5 flex-shrink-0">•</span>
          <span>{trimmed.slice(2)}</span>
        </div>
      );
    }
    if (/^\d+\.\s/.test(trimmed)) {
      const [num, ...rest] = trimmed.split(". ");
      return (
        <div key={i} className="flex gap-1.5 mt-0.5">
          <span className="text-amber-400 flex-shrink-0 font-semibold">{num}.</span>
          <span>{rest.join(". ")}</span>
        </div>
      );
    }
    if (trimmed === "") return <div key={i} className="h-1.5" />;
    return <div key={i}>{line}</div>;
  });
}

export default function SupportChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user || messages.length > 0) return;
    const firstName = user.fullName?.split(" ")[0] || "there";
    setMessages([{
      role: "assistant",
      content: `Hi ${firstName}! I'm Zara, your Zebvix AI assistant.\n\nI can help with KYC, deposits, withdrawals, bank accounts, trading fees, referrals, and more. What can I help you with today?`,
      ts: Date.now(),
      id: uid(),
    }]);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    setHasUnread(false);
    setUnreadCount(0);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    }, 80);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }
  }, [messages, sending, open]);

  const copyMsg = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast.error("Copy failed"));
  }, []);

  const clearChat = useCallback(() => {
    if (!user) return;
    const firstName = user.fullName?.split(" ")[0] || "there";
    setMessages([{
      role: "assistant",
      content: `Hi ${firstName}! Chat cleared. How can I help you?`,
      ts: Date.now(),
      id: uid(),
    }]);
  }, [user]);

  if (!user) {
    return (
      <>
        <button
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-black shadow-2xl shadow-amber-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 group"
          aria-label="Open AI support chat"
        >
          <Bot className="h-6 w-6 group-hover:rotate-12 transition-transform duration-200" />
        </button>
        {open && (
          <div className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-amber-500/15 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black shadow-lg">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-foreground leading-none mb-0.5">Zara · AI Support</div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1 leading-none">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online
                  </div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground/80 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-6 text-center">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                <Bot className="h-6 w-6 text-amber-400" />
              </div>
              <p className="text-sm text-foreground/80 font-medium mb-1">Sign in to chat with Zara</p>
              <p className="text-xs text-muted-foreground mb-4">Get instant AI support for KYC, deposits, withdrawals, and more.</p>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-black text-sm font-semibold px-4 py-2 rounded-xl hover:from-amber-300 hover:to-orange-400 transition-all"
              >
                Sign in to continue
              </Link>
            </div>
          </div>
        )}
      </>
    );
  }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");
    const userMsg: Msg = { role: "user", content: msg, ts: Date.now(), id: uid() };
    const next = [...messages, userMsg];
    setMessages(next);
    try {
      const history = next.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const r = await post<{ reply: string; configured?: boolean }>("/support/ai-chat", { message: msg, history });
      const reply: Msg = { role: "assistant", content: r.reply, ts: Date.now(), id: uid() };
      setMessages((curr) => [...curr, reply]);
      if (!open) {
        setHasUnread(true);
        setUnreadCount((n) => n + 1);
      }
    } catch (e: any) {
      let errText = "Network error. Please try again.";
      if (e instanceof ApiError) {
        if (e.status === 401 || e.status === 403) {
          errText = "Your session has expired. Please sign in again to continue chatting.";
        } else {
          errText = e.data?.reply || e.data?.error || e.message || "Something went wrong.";
        }
      }
      setMessages((curr) => [...curr, { role: "assistant", content: errText, ts: Date.now(), id: uid(), error: true }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const panelW = expanded ? "w-[520px]" : "w-[380px]";
  const panelH = expanded ? "h-[680px]" : "h-[540px]";

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-black shadow-2xl shadow-amber-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 group"
          aria-label="Open AI support chat"
          data-testid="floating-chat-button"
        >
          <Bot className="h-6 w-6 group-hover:rotate-12 transition-transform duration-200" />
          {hasUnread && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-rose-500 border-2 border-background text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10 flex flex-col overflow-hidden transition-all duration-200",
            panelW, panelH,
          )}
          data-testid="floating-chat-panel"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black shadow-lg shadow-amber-500/30">
                  <Bot className="h-5 w-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground leading-none mb-0.5">Zara · AI Support</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 leading-none">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online · typically replies instantly
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <div className="hidden sm:flex items-center gap-1 mr-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                <Zap className="h-2.5 w-2.5 text-amber-400" />
                <span className="text-[9px] font-semibold text-amber-400 uppercase tracking-wide">AI</span>
              </div>
              <button
                onClick={clearChat}
                className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground/80 transition-colors"
                title="Clear chat"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="h-7 w-7 rounded-md hover:bg-muted/60 hidden sm:flex items-center justify-center text-muted-foreground hover:text-foreground/80 transition-colors"
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground/80 transition-colors"
                aria-label="Close chat"
                data-testid="floating-chat-close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
            data-testid="floating-chat-scroll"
          >
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                copied={copiedId === m.id}
                onCopy={() => copyMsg(m.id, m.content)}
              />
            ))}
            {sending && <TypingIndicator />}

            {/* Scroll anchor */}
            <div className="h-1" />
          </div>

          {/* Quick replies */}
          {messages.length <= 1 && !sending && (
            <div className="px-3 pb-2 flex-shrink-0">
              <div className="text-[9px] uppercase tracking-widest text-zinc-600 mb-1.5 font-semibold">Quick questions</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REPLIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-amber-500/50 hover:bg-amber-500/8 hover:text-amber-300 text-muted-foreground transition-all duration-150"
                    data-testid={`floating-quick-${q.slice(0, 8)}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 border-t border-border/50 bg-card/90 px-3 py-2.5">
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-end gap-2"
            >
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                }}
                placeholder="Ask anything…"
                rows={1}
                className="min-h-[36px] max-h-28 resize-none bg-card/80 border-border text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-500/30 focus-visible:border-amber-500/40 rounded-xl"
                disabled={sending}
                data-testid="floating-chat-input"
              />
              <Button
                type="submit"
                disabled={sending || !input.trim()}
                className="bg-gradient-to-r from-amber-400 to-orange-500 text-black hover:from-amber-300 hover:to-orange-400 h-9 w-9 p-0 rounded-xl flex-shrink-0 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:shadow-none"
                data-testid="floating-chat-send"
              >
                {sending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[9px] text-zinc-700">Enter to send · Shift+Enter for new line</span>
              <Link
                href="/support"
                className="text-[9px] text-zinc-600 hover:text-amber-400 flex items-center gap-1 transition-colors"
                onClick={() => setOpen(false)}
                data-testid="floating-chat-fullpage"
              >
                <MessageSquare className="h-2.5 w-2.5" /> Open tickets
                <ExternalLink className="h-2.5 w-2.5" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({ msg, copied, onCopy }: { msg: Msg; copied: boolean; onCopy: () => void }) {
  const isAi = msg.role === "assistant";
  return (
    <div className={cn("group flex gap-2", isAi ? "justify-start" : "justify-end")} data-testid={`floating-bubble-${msg.role}`}>
      {isAi && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black flex-shrink-0 mt-0.5 shadow-md shadow-amber-500/20">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div className={cn("max-w-[82%] flex flex-col", isAi ? "items-start" : "items-end")}>
        <div
          className={cn(
            "px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed",
            isAi
              ? cn(
                  "bg-card border rounded-tl-sm text-zinc-100",
                  msg.error ? "border-rose-500/30 bg-rose-950/20" : "border-border",
                )
              : "bg-gradient-to-br from-amber-400 to-orange-500 text-black font-medium rounded-tr-sm shadow-md shadow-amber-500/10",
          )}
        >
          {isAi ? renderContent(msg.content) : msg.content}
        </div>
        <div className={cn("flex items-center gap-2 mt-1 px-0.5", isAi ? "flex-row" : "flex-row-reverse")}>
          <span className="text-[9px] text-zinc-700">{formatTime(msg.ts)}</span>
          {isAi && (
            <button
              onClick={onCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-muted-foreground"
              title="Copy"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>
      {!isAi && (
        <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold text-muted-foreground">
          U
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2 items-end" data-testid="floating-typing">
      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-black flex-shrink-0 shadow-md shadow-amber-500/20">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center">
          <span className="h-2 w-2 rounded-full bg-amber-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 rounded-full bg-amber-400/60 animate-bounce" style={{ animationDelay: "160ms" }} />
          <span className="h-2 w-2 rounded-full bg-amber-400/60 animate-bounce" style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </div>
  );
}
