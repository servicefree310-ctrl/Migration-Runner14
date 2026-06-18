import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Plus, Send, ChevronLeft, Zap, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { get, post, patch } from "@/lib/api";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";

interface Ticket {
  id: number;
  subject: string;
  status: string;
  priority: string;
  category: string;
  lastMessageAt: string;
  createdAt: string;
  messages?: Message[];
}

interface Message {
  id: number;
  senderType: "user" | "admin" | "bot";
  message: string;
  isRead: boolean;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  open:        "success",
  in_progress: "info",
  resolved:    "neutral",
  closed:      "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};

const PRIORITY_CLS: Record<string, string> = {
  low: "text-muted-foreground", normal: "text-blue-400", high: "text-amber-400", urgent: "text-rose-400",
};

const CATEGORIES = ["general", "kyc", "deposit", "withdrawal", "trading", "technical", "account"];

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [successData, setSuccessData] = useState<GenericSuccess | null>(null);
  const [msgText, setMsgText] = useState("");
  const [form, setForm] = useState({ subject: "", message: "", category: "general", priority: "normal" });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ticketsQ = useQuery<Ticket[]>({
    queryKey: ["/support/tickets"],
    queryFn: () => get<Ticket[]>("/support/tickets"),
    enabled: !!user,
  });

  const ticketDetailQ = useQuery<Ticket>({
    queryKey: ["/support/tickets", selected?.id],
    queryFn: () => get<Ticket>(`/support/tickets/${selected!.id}`),
    enabled: !!selected?.id,
    refetchInterval: 5000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticketDetailQ.data?.messages]);

  const createMut = useMutation({
    mutationFn: (body: object) => post("/support/tickets", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/support/tickets"] });
      const subj = form.subject;
      const cat = form.category;
      setShowForm(false);
      setForm({ subject: "", message: "", category: "general", priority: "normal" });
      setSuccessData({
        kind: "generic", iconKind: "paid", accentColor: "#6366f1",
        title: "Support Ticket Created",
        subtitle: "Our team will respond within 24 hours.",
        rows: [
          { label: "Subject", value: subj },
          { label: "Category", value: cat },
          { label: "Status", value: "Open", accent: "#10b981" },
        ],
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create ticket"),
  });

  const sendMut = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      post(`/support/tickets/${id}/messages`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/support/tickets", selected?.id] });
      setMsgText("");
    },
    onError: () => toast.error("Failed to send message"),
  });

  const closeMut = useMutation({
    mutationFn: async (id: number) => {
      await patch(`/support/tickets/${id}/close`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/support/tickets"] });
      qc.invalidateQueries({ queryKey: ["/support/tickets", selected?.id] });
      setSuccessData({
        kind: "generic", iconKind: "paid", accentColor: "#6366f1",
        title: "Ticket Closed",
        subtitle: "Your support ticket has been resolved and closed.",
        rows: [
          { label: "Ticket #", value: String(selected?.id ?? "") },
          { label: "Status", value: "Closed", accent: "#6366f1" },
        ],
      });
    },
  });

  const tickets = ticketsQ.data ?? [];
  const open    = tickets.filter(t => t.status === "open" || t.status === "in_progress");
  const closed  = tickets.filter(t => t.status === "resolved" || t.status === "closed");
  const selectedTicket = ticketDetailQ.data ?? selected;

  if (!user) {
    return (
      <div className="container mx-auto max-w-2xl p-4 sm:p-6">
        <EmptyState icon={MessageSquare} title="Sign in required" description="Please log in to view support tickets." />
      </div>
    );
  }

  // ── Chat view ──
  if (selected && selectedTicket) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Chat header */}
        <div className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(null)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm line-clamp-1">{selectedTicket.subject}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusPill variant={STATUS_VARIANT[selectedTicket.status] ?? "neutral"}>
                {STATUS_LABEL[selectedTicket.status] ?? selectedTicket.status}
              </StatusPill>
              <span className={`text-xs font-medium capitalize ${PRIORITY_CLS[selectedTicket.priority]}`}>
                {selectedTicket.priority} priority
              </span>
            </div>
          </div>
          {selectedTicket.status !== "closed" && selectedTicket.status !== "resolved" && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => closeMut.mutate(selectedTicket.id)}
              disabled={closeMut.isPending}
            >
              Close Ticket
            </Button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {(selectedTicket.messages ?? []).map(msg => (
            <div key={msg.id} className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.senderType === "user"  ? "bg-amber-500 text-black" :
                msg.senderType === "bot"   ? "bg-card border border-blue-500/30 text-foreground" :
                                             "bg-card border border-border text-foreground"
              }`}>
                {msg.senderType === "bot" && (
                  <div className="flex items-center gap-1 text-xs text-blue-400 mb-1 font-semibold">
                    <Zap className="h-2.5 w-2.5" /> AI Assistant
                  </div>
                )}
                {msg.senderType === "admin" && (
                  <div className="text-xs text-amber-400 mb-1 font-semibold">Support Agent</div>
                )}
                <div className="text-sm whitespace-pre-wrap">{msg.message}</div>
                <div className={`text-xs mt-1 ${msg.senderType === "user" ? "text-black/60" : "text-muted-foreground"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input */}
        {selectedTicket.status !== "closed" && (
          <div className="border-t border-border px-4 py-3 flex gap-3 bg-card shrink-0">
            <Input
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (msgText.trim()) sendMut.mutate({ id: selectedTicket.id, message: msgText });
                }
              }}
              placeholder="Type your message…"
              className="flex-1"
            />
            <Button
              onClick={() => { if (msgText.trim()) sendMut.mutate({ id: selectedTicket.id, message: msgText }); }}
              disabled={sendMut.isPending || !msgText.trim()}
              className="gap-2 shrink-0"
            >
              <Send className="h-4 w-4" />
              {sendMut.isPending ? "…" : "Send"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Ticket list view ──
  return (
    <div className="container mx-auto max-w-2xl p-4 sm:p-6 space-y-5">
      <PageHeader
        eyebrow="Help & Support"
        title="Support Tickets"
        description="Get help from our team. We typically respond within 2–4 hours."
        actions={
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Ticket
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        <PremiumStatCard
          hero
          title="Open Tickets"
          value={open.length}
          icon={MessageSquare}
          loading={ticketsQ.isLoading}
          hint="Awaiting response"
        />
        <PremiumStatCard
          title="Total Tickets"
          value={tickets.length}
          icon={AlertCircle}
          loading={ticketsQ.isLoading}
          hint="All time"
        />
        <PremiumStatCard
          title="Resolved"
          value={closed.length}
          icon={MessageSquare}
          loading={ticketsQ.isLoading}
          hint="Closed issues"
        />
      </div>

      {ticketsQ.isLoading ? (
        <SectionCard title="Tickets" icon={MessageSquare}>
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />)}
          </div>
        </SectionCard>
      ) : tickets.length === 0 ? (
        <SectionCard title="Your Tickets" icon={MessageSquare}>
          <EmptyState
            icon={MessageSquare}
            title="No support tickets yet"
            description="Create a ticket to get help from our team."
            action={<Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> New Ticket</Button>}
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {open.length > 0 && (
            <SectionCard title={`Open (${open.length})`} icon={MessageSquare} padded={false}>
              <div className="divide-y divide-border/40">
                {open.map(t => <TicketRow key={t.id} ticket={t} onClick={() => setSelected(t)} />)}
              </div>
            </SectionCard>
          )}
          {closed.length > 0 && (
            <SectionCard title={`Resolved (${closed.length})`} icon={MessageSquare} padded={false}>
              <div className="divide-y divide-border/40">
                {closed.map(t => <TicketRow key={t.id} ticket={t} onClick={() => setSelected(t)} />)}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Create ticket dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Support Ticket</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); createMut.mutate(form); }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Brief description of your issue"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low", "normal", "high", "urgent"].map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Describe your issue in detail…"
                rows={4}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Submitting…" : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SuccessModal open={successData !== null} payload={successData} onClose={() => setSuccessData(null)} />
    </div>
  );
}

function TicketRow({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm line-clamp-1">{ticket.subject}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <StatusPill variant={STATUS_VARIANT[ticket.status] ?? "neutral"}>
            {STATUS_LABEL[ticket.status] ?? ticket.status}
          </StatusPill>
          <span className="text-xs text-muted-foreground capitalize">{ticket.category}</span>
          <span className={`text-xs font-medium capitalize ${PRIORITY_CLS[ticket.priority]}`}>
            {ticket.priority}
          </span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
        {new Date(ticket.lastMessageAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
      </div>
    </button>
  );
}
