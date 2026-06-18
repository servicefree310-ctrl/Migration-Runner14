import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageCircle, MessageSquare, Send, Search, CircleDot, CheckCircle2, User as UserIcon,
  ShieldCheck, Inbox, Clock, Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Thread = { id: number; userId: number; subject: string; status: string; assigneeId: number | null; lastMessageAt: string };
type Message = { id: number; threadId: number; senderId: number; senderRole: string; message: string; createdAt: string };

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

export default function ChatPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: threads = [], isLoading } = useQuery<Thread[]>({
    queryKey: ["/admin/chat-threads"],
    queryFn: () => get<Thread[]>("/admin/chat-threads"),
    refetchInterval: 5000,
  });
  const [active, setActive] = useState<number | null>(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");

  const { data: msgs = [] } = useQuery<Message[]>({
    queryKey: ["/admin/chat-threads", active, "messages"],
    queryFn: () => active ? get<Message[]>(`/admin/chat-threads/${active}/messages`) : Promise.resolve([]),
    enabled: !!active,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) => post(`/admin/chat-threads/${id}/messages`, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/chat-threads", active, "messages"] }),
    onError: (e: any) => toast({ title: "Send failed", description: e?.message, variant: "destructive" }),
  });
  const closeThread = useMutation({
    mutationFn: (id: number) => patch(`/admin/chat-threads/${id}`, { status: "closed" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/chat-threads"] }); toast({ title: "Thread closed" }); },
  });
  const reopenThread = useMutation({
    mutationFn: (id: number) => patch(`/admin/chat-threads/${id}`, { status: "open" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/chat-threads"] }); toast({ title: "Thread reopened" }); },
  });

  const stats = useMemo(() => {
    const total = threads.length;
    const open = threads.filter(t => t.status === "open").length;
    const closed = threads.filter(t => t.status === "closed").length;
    const dayMs = 24 * 60 * 60 * 1000;
    const todays = threads.filter(t => Date.now() - new Date(t.lastMessageAt).getTime() < dayMs).length;
    return { total, open, closed, todays };
  }, [threads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads
      .filter((t) => {
        if (tab === "open" && t.status !== "open") return false;
        if (tab === "closed" && t.status !== "closed") return false;
        if (!q) return true;
        return [String(t.userId), t.subject ?? ""].some((s) => s.toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [threads, tab, search]);

  const activeThread = useMemo(() => threads.find(t => t.id === active) || null, [threads, active]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs.length, active]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Chat & Tickets"
        description="Live conversation with users. Auto-refreshes every 5s. Reply or close threads."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard hero title="Total Threads" value={stats.total} icon={MessageCircle} hint={`${stats.open} open now`} />
        <PremiumStatCard title="Open" value={stats.open} icon={CircleDot} accent />
        <PremiumStatCard title="Closed" value={stats.closed} icon={CheckCircle2} />
        <PremiumStatCard title="Active Today" value={stats.todays} icon={Clock} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-22rem)] min-h-[480px]">
        {/* Thread list */}
        <div className="premium-card rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border/60 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search threads…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-3 w-full h-8">
                <TabsTrigger value="all" className="text-xs">All ({stats.total})</TabsTrigger>
                <TabsTrigger value="open" className="text-xs">Open ({stats.open})</TabsTrigger>
                <TabsTrigger value="closed" className="text-xs">Closed ({stats.closed})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && filtered.length === 0 && (
              <EmptyState
                icon={Inbox}
                title={search || tab !== "all" ? "No matching threads" : "Inbox is empty"}
                description={search || tab !== "all" ? "Try another filter or search." : "User support requests will appear here."}
              />
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors border",
                  active === t.id
                    ? "bg-amber-500/10 border-amber-500/30 shadow-sm"
                    : "border-transparent hover:bg-muted/40",
                )}
                data-testid={`thread-${t.id}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="flex items-center gap-1.5 font-medium text-sm">
                    <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />User #{t.userId}
                  </span>
                  <StatusPill variant={t.status === "open" ? "success" : "neutral"} className="!py-0">{t.status}</StatusPill>
                </div>
                <div className="text-xs text-muted-foreground truncate">{t.subject || "(no subject)"}</div>
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />{relTime(t.lastMessageAt)}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation pane */}
        <div className="lg:col-span-2 premium-card rounded-xl flex flex-col overflow-hidden">
          {activeThread ? (
            <>
              <div className="flex items-center justify-between p-3 border-b border-border/60">
                <div className="min-w-0">
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-amber-300" /> User #{activeThread.userId}
                    <StatusPill variant={activeThread.status === "open" ? "success" : "neutral"}>{activeThread.status}</StatusPill>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{activeThread.subject || "(no subject)"}</div>
                </div>
                {activeThread.status === "open" ? (
                  <Button variant="outline" size="sm" onClick={() => closeThread.mutate(activeThread.id)} data-testid="button-close-thread">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Close thread
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => reopenThread.mutate(activeThread.id)}>
                    <CircleDot className="w-3.5 h-3.5 mr-1.5" /> Reopen
                  </Button>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/5">
                {msgs.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">No messages yet</div>
                )}
                {msgs.map((m) => {
                  const isSupport = m.senderRole === "support" || m.senderRole === "admin";
                  return (
                    <div key={m.id} className={cn("flex gap-2 max-w-[80%]", isSupport ? "ml-auto flex-row-reverse" : "")}>
                      <div className={cn(
                        "w-7 h-7 rounded-full shrink-0 flex items-center justify-center",
                        isSupport ? "bg-amber-500/20 text-amber-300" : "bg-muted text-muted-foreground",
                      )}>
                        {isSupport ? <Headphones className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                      </div>
                      <div className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                        isSupport
                          ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-tr-sm"
                          : "bg-card border border-border/60 rounded-tl-sm",
                      )}>
                        <div className={cn("text-[10px] mb-0.5 flex items-center gap-1", isSupport ? "text-white/80" : "text-muted-foreground")}>
                          {isSupport ? <ShieldCheck className="w-2.5 h-2.5" /> : null}
                          {m.senderRole} · {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{m.message}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                className="flex gap-2 p-3 border-t border-border/60 bg-card/60"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim() && activeThread.status === "open") {
                    send.mutate({ id: activeThread.id, message: text.trim() });
                    setText("");
                  }
                }}
              >
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={activeThread.status === "open" ? "Type a reply…" : "Thread is closed"}
                  disabled={activeThread.status !== "open"}
                  data-testid="input-chat-reply"
                />
                <Button type="submit" disabled={!text.trim() || activeThread.status !== "open" || send.isPending} data-testid="button-send-reply">
                  <Send className="w-4 h-4 mr-1" /> Send
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Select a thread"
                description="Choose a conversation from the left to view messages and reply."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
