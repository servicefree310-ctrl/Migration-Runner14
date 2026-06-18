import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, ChevronLeft, Send, Zap, User as UserIcon,
  Clock, CheckCircle, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Ticket {
  id: number;
  userId: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  username: string | null;
  email: string | null;
  lastMessageAt: string;
  createdAt: string;
  messages?: Message[];
}

interface Message {
  id: number;
  senderType: "user" | "admin" | "bot";
  message: string;
  createdAt: string;
}

async function apiGet<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to fetch");
  return r.json();
}

const STATUS_PILL: Record<string, string> = {
  open:        "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  resolved:    "bg-muted/60 text-muted-foreground border-border",
  closed:      "bg-muted/60 text-muted-foreground border-border",
};
const PRIORITY_CLS: Record<string, string> = {
  low: "text-muted-foreground", normal: "text-blue-400",
  high: "text-amber-400", urgent: "text-rose-400",
};

export default function SupportAdmin() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [reply, setReply] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ticketsQ = useQuery<Ticket[]>({
    queryKey: ["admin-support-tickets", filterStatus],
    queryFn: () => apiGet<Ticket[]>(
      `/api/admin/support/tickets${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`
    ),
    refetchInterval: 10_000,
  });

  const detailQ = useQuery<Ticket>({
    queryKey: ["admin-support-ticket", selected?.id],
    queryFn: () => apiGet<Ticket>(`/api/admin/support/tickets/${selected!.id}`),
    enabled: !!selected?.id,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detailQ.data?.messages]);

  const replyMut = useMutation({
    mutationFn: async ({ id, message }: { id: number; message: string }) => {
      const r = await fetch(`/api/admin/support/tickets/${id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ message }),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", selected?.id] });
    },
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/admin/support/tickets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-tickets", filterStatus] });
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", selected?.id] });
    },
  });

  const tickets = ticketsQ.data ?? [];
  const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0, ...tickets.reduce((a, t) => ({ ...a, [t.status]: (a[t.status as keyof typeof a] ?? 0) + 1 }), {} as Record<string,number>) };

  const current = detailQ.data ?? selected;

  // ── Chat view ──
  if (selected && current) {
    return (
      <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
        {/* Chat header */}
        <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(null)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{current.subject}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_PILL[current.status] ?? "bg-muted/40 text-muted-foreground border-border"}`}>
                {current.status.replace("_", " ")}
              </span>
              <span className="text-xs text-muted-foreground">{current.username ?? current.email} · #{current.id}</span>
              <span className={`text-xs font-medium capitalize ${PRIORITY_CLS[current.priority]}`}>{current.priority}</span>
            </div>
          </div>
          <Select value={current.status} onValueChange={v => statusMut.mutate({ id: current.id, status: v })}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["open", "in_progress", "resolved", "closed"].map(s => (
                <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {(current.messages ?? []).map(msg => (
            <div key={msg.id} className={`flex ${msg.senderType === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.senderType === "user"  ? "bg-card border border-border" :
                msg.senderType === "bot"   ? "bg-blue-500/10 border border-blue-500/30" :
                                             "bg-amber-500/20 border border-amber-500/30"
              }`}>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  {msg.senderType === "user"  ? <><UserIcon className="h-2.5 w-2.5" /> {current.username ?? current.email}</> :
                   msg.senderType === "bot"   ? <><Zap className="h-2.5 w-2.5 text-blue-400" /> AI Bot</> :
                                               <><CheckCircle className="h-2.5 w-2.5 text-amber-400" /> You (Admin)</>
                  }
                </div>
                <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply bar */}
        {current.status !== "closed" && (
          <div className="border-t border-border bg-card px-4 py-3 flex gap-3 shrink-0">
            <Input
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (reply.trim()) replyMut.mutate({ id: current.id, message: reply });
                }
              }}
              placeholder="Type reply… (Enter to send)"
              className="flex-1"
            />
            <Button
              onClick={() => { if (reply.trim()) replyMut.mutate({ id: current.id, message: reply }); }}
              disabled={replyMut.isPending || !reply.trim()}
              className="gap-2 shrink-0"
            >
              <Send className="h-4 w-4" />
              {replyMut.isPending ? "…" : "Reply"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Ticket list ──
  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <MessageSquare className="h-5 w-5 text-amber-400" />
            <h1 className="text-2xl font-bold">Support Tickets</h1>
          </div>
          <p className="text-sm text-muted-foreground">Manage and reply to customer support requests.</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Open",        count: counts.open,        icon: AlertCircle, cls: "text-emerald-400" },
          { label: "In Progress", count: counts.in_progress, icon: Clock,       cls: "text-blue-400"   },
          { label: "Resolved",    count: counts.resolved,    icon: CheckCircle, cls: "text-muted-foreground" },
          { label: "Total",       count: tickets.length,     icon: MessageSquare, cls: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.cls}`} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <div className={`text-2xl font-bold ${s.cls}`}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "in_progress", "resolved", "closed"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filterStatus === s ? "bg-amber-500 text-black" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Tickets table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {ticketsQ.isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Loading…</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No tickets found</td></tr>
            ) : tickets.map(t => (
              <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-xs">{t.username ?? t.email ?? `#${t.userId}`}</div>
                  <div className="text-muted-foreground text-xs">{t.email}</div>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <div className="truncate text-sm">{t.subject}</div>
                  <div className="text-xs text-muted-foreground capitalize">{t.category}</div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${STATUS_PILL[t.status] ?? "bg-muted/40 text-muted-foreground border-border"}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </td>
                <td className={`px-4 py-3 text-center text-xs font-semibold capitalize ${PRIORITY_CLS[t.priority]}`}>
                  {t.priority}
                </td>
                <td className="px-4 py-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(t.lastMessageAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-amber-400 hover:text-amber-300"
                    onClick={() => setSelected(t)}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
