/**
 * Support Tickets
 * User:  GET/POST /api/support/tickets, GET /api/support/tickets/:id
 *        POST /api/support/tickets/:id/messages
 * Admin: GET/PUT  /api/admin/support/tickets, POST /api/admin/support/tickets/:id/messages
 */
import { Router, type IRouter } from "express";
import { db, supportTicketsTable, ticketMessagesTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function serTicket(t: any, msgs?: any[]) {
  return {
    id:            t.id,
    userId:        t.userId,
    subject:       t.subject,
    status:        t.status,
    priority:      t.priority,
    category:      t.category,
    agentId:       t.agentId,
    lastMessageAt: t.lastMessageAt instanceof Date ? t.lastMessageAt.toISOString() : t.lastMessageAt,
    createdAt:     t.createdAt  instanceof Date ? t.createdAt.toISOString()  : t.createdAt,
    resolvedAt:    t.resolvedAt instanceof Date ? t.resolvedAt.toISOString() : t.resolvedAt,
    messages:      msgs?.map(serMsg),
  };
}

function serMsg(m: any) {
  return {
    id:         m.id,
    ticketId:   m.ticketId,
    senderId:   m.senderId,
    senderType: m.senderType,
    message:    m.message,
    isRead:     m.isRead,
    createdAt:  m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

const CreateTicketSchema = z.object({
  subject:  z.string().min(5).max(200),
  message:  z.string().min(10).max(2000),
  category: z.enum(["general", "kyc", "deposit", "withdrawal", "trading", "technical", "account"]).default("general"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

const AddMessageSchema = z.object({ message: z.string().min(1).max(2000) });

/* ── USER ROUTES ──────────────────────────────────────────────────────────── */

router.get("/support/tickets", requireAuth, async (req: any, res): Promise<void> => {
  const tickets = await db.select().from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, req.user!.id))
    .orderBy(desc(supportTicketsTable.lastMessageAt));
  res.json(tickets.map(t => serTicket(t)));
});

router.post("/support/tickets", requireAuth, async (req: any, res): Promise<void> => {
  const parsed = CreateTicketSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { subject, message, category, priority } = parsed.data;

  const [ticket] = await db.insert(supportTicketsTable).values({
    userId: req.user!.id, subject, category, priority,
  }).returning();

  await db.insert(ticketMessagesTable).values({
    ticketId: ticket.id, senderId: req.user!.id,
    senderType: "user", message,
  });

  res.status(201).json(serTicket(ticket));
});

router.get("/support/tickets/:id", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [ticket] = await db.select().from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.user!.id)));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  const msgs = await db.select().from(ticketMessagesTable)
    .where(eq(ticketMessagesTable.ticketId, id)).orderBy(ticketMessagesTable.createdAt);
  await db.update(ticketMessagesTable).set({ isRead: true })
    .where(and(eq(ticketMessagesTable.ticketId, id), eq(ticketMessagesTable.senderType, "admin")));
  res.json(serTicket(ticket, msgs));
});

router.post("/support/tickets/:id/messages", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = AddMessageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Message required" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable)
    .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.user!.id)));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (ticket.status === "closed") { res.status(400).json({ error: "Ticket is closed" }); return; }

  const [msg] = await db.insert(ticketMessagesTable).values({
    ticketId: id, senderId: req.user!.id, senderType: "user", message: parsed.data.message,
  }).returning();
  await db.update(supportTicketsTable).set({ lastMessageAt: new Date(), status: "open" })
    .where(eq(supportTicketsTable.id, id));
  res.status(201).json(serMsg(msg));
});

router.patch("/support/tickets/:id/close", requireAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.update(supportTicketsTable).set({ status: "closed", resolvedAt: new Date() })
    .where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, req.user!.id)));
  res.json({ success: true });
});

/* ── ADMIN ROUTES ─────────────────────────────────────────────────────────── */

const adminAuth = requireRole("admin", "superadmin");

router.get("/admin/support/tickets", adminAuth, async (req, res): Promise<void> => {
  const status   = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const limit    = Math.min(100, parseInt((req.query.limit as string) ?? "50", 10) || 50);
  const offset   =               parseInt((req.query.offset as string) ?? "0",  10) || 0;

  let q = db.select({
    ticket:   supportTicketsTable,
    username: usersTable.name,
    email:    usersTable.email,
  }).from(supportTicketsTable)
    .leftJoin(usersTable, eq(supportTicketsTable.userId, usersTable.id))
    .orderBy(desc(supportTicketsTable.lastMessageAt))
    .$dynamic();

  if (status && status !== "all") q = q.where(eq(supportTicketsTable.status, status as any));
  if (priority && priority !== "all") q = q.where(eq(supportTicketsTable.priority, priority as any));

  const rows = await q.limit(limit).offset(offset);
  res.json(rows.map(r => ({ ...serTicket(r.ticket), username: r.username, email: r.email })));
});

router.get("/admin/support/tickets/:id", adminAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  const msgs = await db.select().from(ticketMessagesTable)
    .where(eq(ticketMessagesTable.ticketId, id)).orderBy(ticketMessagesTable.createdAt);
  res.json(serTicket(ticket, msgs));
});

router.post("/admin/support/tickets/:id/messages", adminAuth, async (req: any, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const parsed = AddMessageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Message required" }); return; }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const [msg] = await db.insert(ticketMessagesTable).values({
    ticketId: id, senderId: req.user!.id, senderType: "admin", message: parsed.data.message,
  }).returning();
  await db.update(supportTicketsTable).set({
    lastMessageAt: new Date(), status: "in_progress",
    agentId: req.user!.id,
  }).where(eq(supportTicketsTable.id, id));
  res.status(201).json(serMsg(msg));
});

router.patch("/admin/support/tickets/:id", adminAuth, async (req, res): Promise<void> => {
  const id     = parseInt(req.params.id as string, 10);
  const status   = req.body.status as string | undefined;
  const priority = req.body.priority as string | undefined;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (status)   { updates.status = status; if (status === "resolved" || status === "closed") updates.resolvedAt = new Date(); }
  if (priority) updates.priority = priority;

  const [row] = await db.update(supportTicketsTable).set(updates)
    .where(eq(supportTicketsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(serTicket(row));
});

export default router;
