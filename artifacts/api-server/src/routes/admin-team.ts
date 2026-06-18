import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, teamMembersTable, companyMediaTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
const adminOnly = requireRole("admin", "superadmin");
const supportPlus = requireRole("admin", "superadmin", "support", "marketing");

// ── Public: visible team members ──────────────────────────────────────────────
router.get("/company/team", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.isVisible, true))
    .orderBy(asc(teamMembersTable.displayOrder), asc(teamMembersTable.id));
  res.json(rows);
});

// ── Public: active company media ──────────────────────────────────────────────
router.get("/company/media", async (req, res): Promise<void> => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const q = db
    .select()
    .from(companyMediaTable)
    .where(eq(companyMediaTable.isActive, true))
    .orderBy(asc(companyMediaTable.displayOrder), asc(companyMediaTable.id));
  const rows = await q;
  const filtered = category ? rows.filter((r) => r.category === category) : rows;
  res.json(filtered);
});

// ── Admin: team CRUD ──────────────────────────────────────────────────────────
router.get("/admin/team", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(teamMembersTable)
    .orderBy(asc(teamMembersTable.displayOrder), asc(teamMembersTable.id));
  res.json(rows);
});

router.post("/admin/team", adminOnly, async (req, res): Promise<void> => {
  const { name, title, bio, avatarUrl, linkedinUrl, twitterUrl, displayOrder, isVisible } = req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" }); return;
  }
  const [row] = await db
    .insert(teamMembersTable)
    .values({
      name: String(name),
      title: String(title ?? ""),
      bio: String(bio ?? ""),
      avatarUrl: String(avatarUrl ?? ""),
      linkedinUrl: String(linkedinUrl ?? ""),
      twitterUrl: String(twitterUrl ?? ""),
      displayOrder: Number(displayOrder ?? 0),
      isVisible: isVisible !== false,
    })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/team/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  const { name, title, bio, avatarUrl, linkedinUrl, twitterUrl, displayOrder, isVisible } = req.body ?? {};
  const [row] = await db
    .update(teamMembersTable)
    .set({
      ...(name !== undefined && { name: String(name) }),
      ...(title !== undefined && { title: String(title) }),
      ...(bio !== undefined && { bio: String(bio) }),
      ...(avatarUrl !== undefined && { avatarUrl: String(avatarUrl) }),
      ...(linkedinUrl !== undefined && { linkedinUrl: String(linkedinUrl) }),
      ...(twitterUrl !== undefined && { twitterUrl: String(twitterUrl) }),
      ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
      ...(isVisible !== undefined && { isVisible: Boolean(isVisible) }),
    })
    .where(eq(teamMembersTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/team/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id));
  res.json({ ok: true });
});

// ── Admin: company media CRUD ─────────────────────────────────────────────────
router.get("/admin/company-media", supportPlus, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(companyMediaTable)
    .orderBy(asc(companyMediaTable.displayOrder), desc(companyMediaTable.createdAt));
  res.json(rows);
});

router.post("/admin/company-media", adminOnly, async (req, res): Promise<void> => {
  const { category, title, caption, url, displayOrder, isActive } = req.body ?? {};
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" }); return;
  }
  const [row] = await db
    .insert(companyMediaTable)
    .values({
      category: String(category ?? "general"),
      title: String(title ?? ""),
      caption: String(caption ?? ""),
      url: String(url),
      displayOrder: Number(displayOrder ?? 0),
      isActive: isActive !== false,
    })
    .returning();
  res.status(201).json(row);
});

router.put("/admin/company-media/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  const { category, title, caption, url, displayOrder, isActive } = req.body ?? {};
  const [row] = await db
    .update(companyMediaTable)
    .set({
      ...(category !== undefined && { category: String(category) }),
      ...(title !== undefined && { title: String(title) }),
      ...(caption !== undefined && { caption: String(caption) }),
      ...(url !== undefined && { url: String(url) }),
      ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    })
    .where(eq(companyMediaTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/company-media/:id", adminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  await db.delete(companyMediaTable).where(eq(companyMediaTable.id, id));
  res.json({ ok: true });
});

export default router;
