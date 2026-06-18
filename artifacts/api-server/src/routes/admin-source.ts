import { Router, type IRouter, type Request, type Response } from "express";
import path from "node:path";
import { promises as fs } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/audit";
import archiver from "archiver";

// Security-locked source-code browser.
// - Admin/superadmin only.
// - Hard-coded root allowlist mapped to absolute paths under the monorepo.
// - Path traversal blocked (resolved path must stay inside its root).
// - Skips noisy / large directories (node_modules, dist, build, .git, etc).
// - Hard cap on individual file size sent over the wire.

const router: IRouter = Router();

const MAX_FILE_BYTES = 1_000_000; // 1 MB cap per file
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".vite",
]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".tiff",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".mov", ".webm", ".wav", ".ogg",
  ".zip", ".gz", ".tar", ".7z", ".rar",
  ".pdf", ".jar", ".class", ".so", ".dylib", ".dll", ".exe",
]);

// api-server runs with cwd = artifacts/api-server (per its dev script).
// Repo root is two directories up.
function repoPath(relFromRepoRoot: string): string {
  return path.resolve(process.cwd(), "..", "..", relFromRepoRoot);
}

const ROOTS: Record<string, { absPath: string; label: string }> = {
  admin:         { absPath: repoPath("artifacts/admin"),       label: "artifacts/admin" },
  "user-portal": { absPath: repoPath("artifacts/user-portal"), label: "artifacts/user-portal" },
  "api-server":  { absPath: repoPath("artifacts/api-server"),  label: "artifacts/api-server" },
  "lib/db":      { absPath: repoPath("lib/db"),                label: "lib/db" },
};

function resolveRoot(rootKey: string): string | null {
  const r = ROOTS[rootKey];
  return r ? r.absPath : null;
}

function isSafeChild(rootAbs: string, candidateAbs: string): boolean {
  const rel = path.relative(rootAbs, candidateAbs);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

type TreeNode =
  | { type: "dir"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string; size: number };

async function buildTree(rootAbs: string, rel = ""): Promise<TreeNode[]> {
  const dirAbs = path.join(rootAbs, rel);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort: directories first, then files; alphabetical.
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const out: TreeNode[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env.example") continue;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const children = await buildTree(rootAbs, childRel);
      out.push({ type: "dir", name: e.name, path: childRel, children });
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      let size = 0;
      try {
        const st = await fs.stat(path.join(dirAbs, e.name));
        size = st.size;
      } catch { /* ignore */ }
      out.push({ type: "file", name: e.name, path: childRel, size });
    }
  }
  return out;
}

// All endpoints under /admin/source/* require admin/superadmin.
router.use("/admin/source", requireRole("admin", "superadmin"));

router.get("/admin/source/roots", (_req: Request, res: Response) => {
  res.json({
    roots: Object.entries(ROOTS).map(([key, r]) => ({ key, label: r.label })),
  });
});

// ---------- Live database introspection ----------

router.get("/admin/source/db/tables", async (_req: Request, res: Response) => {
  try {
    const result: any = await db.execute(sql`
      SELECT
        t.table_name AS name,
        COALESCE(s.n_live_tup, 0)::bigint AS row_count,
        pg_total_relation_size(quote_ident(t.table_name))::bigint AS size_bytes
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = 'public' AND s.relname = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    const rows: Array<{ name: string; row_count: string | number; size_bytes: string | number }> =
      Array.isArray((result as any).rows) ? (result as any).rows : (result as any);
    res.json({
      tables: rows.map((r) => ({
        name: r.name,
        rowCount: Number(r.row_count ?? 0),
        sizeBytes: Number(r.size_bytes ?? 0),
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: "tables_failed", message: e?.message ?? "" });
  }
});

function isSafeIdent(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(s);
}

function pgTypeFromInfoSchema(row: {
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}): string {
  const dt = row.data_type.toUpperCase();
  if (dt === "ARRAY") {
    // udt_name for arrays is the element type prefixed with "_" (e.g. "_text").
    const elem = (row.udt_name || "").replace(/^_/, "").toUpperCase() || "TEXT";
    return `${elem}[]`;
  }
  if (dt === "CHARACTER VARYING") {
    return row.character_maximum_length
      ? `VARCHAR(${row.character_maximum_length})`
      : "VARCHAR";
  }
  if (dt === "CHARACTER") {
    return row.character_maximum_length
      ? `CHAR(${row.character_maximum_length})`
      : "CHAR";
  }
  if (dt === "NUMERIC" && row.numeric_precision != null) {
    return row.numeric_scale != null
      ? `NUMERIC(${row.numeric_precision},${row.numeric_scale})`
      : `NUMERIC(${row.numeric_precision})`;
  }
  if (dt === "TIMESTAMP WITHOUT TIME ZONE") return "TIMESTAMP";
  if (dt === "TIMESTAMP WITH TIME ZONE") return "TIMESTAMPTZ";
  if (dt === "USER-DEFINED") return row.udt_name.toUpperCase();
  return dt;
}

// Reusable: introspect one table → { columns, pk, indexes, FKs, full DDL }.
// Returns null if the table doesn't exist. Shared by /db/table (detail view)
// and /db/download (schema dump).
type TableIntrospection = {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean; default: string | null; position: number }>;
  primaryKey: string[];
  indexes: Array<{ name: string; def: string }>;
  foreignKeys: Array<{ constraint: string; column: string; refTable: string; refColumn: string; onUpdate: string; onDelete: string }>;
  sql: string;
};

async function introspectTable(name: string): Promise<TableIntrospection | null> {
  const qualified = `public.${name}`;
  const exists: any = await db.execute(sql`
    SELECT to_regclass(${qualified}) AS oid
  `);
  const existsRows = Array.isArray(exists.rows) ? exists.rows : exists;
  if (!existsRows.length || existsRows[0].oid == null) return null;

  const colsR: any = await db.execute(sql`
    SELECT
      column_name, data_type, udt_name, is_nullable,
      column_default, character_maximum_length,
      numeric_precision, numeric_scale, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${name}
    ORDER BY ordinal_position
  `);
  const cols = Array.isArray(colsR.rows) ? colsR.rows : colsR;

  const pkR: any = await db.execute(sql`
    SELECT a.attname AS column_name, k.ord
    FROM pg_index i
    JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
    WHERE i.indrelid = to_regclass(${qualified}) AND i.indisprimary
    ORDER BY k.ord
  `);
  const pkCols: string[] = (Array.isArray(pkR.rows) ? pkR.rows : pkR).map(
    (r: any) => r.column_name,
  );

  const idxR: any = await db.execute(sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ${name}
    ORDER BY indexname
  `);
  const indexes: Array<{ name: string; def: string }> = (
    Array.isArray(idxR.rows) ? idxR.rows : idxR
  )
    .filter((r: any) => !r.indexname.endsWith("_pkey"))
    .map((r: any) => ({ name: r.indexname, def: r.indexdef }));

  const fkR: any = await db.execute(sql`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      kcu.ordinal_position AS col_pos,
      ccu.table_name  AS ref_table,
      ccu.column_name AS ref_column,
      rc.update_rule, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema   = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    JOIN information_schema.key_column_usage ccu
      ON ccu.constraint_name = rc.unique_constraint_name
     AND ccu.constraint_schema = rc.unique_constraint_schema
     AND ccu.position_in_unique_constraint = kcu.position_in_unique_constraint
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = ${name}
    ORDER BY tc.constraint_name, kcu.ordinal_position
  `);
  const fkRows: Array<any> = Array.isArray(fkR.rows) ? fkR.rows : fkR;

  type FkGrouped = {
    constraint: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
    onUpdate: string;
    onDelete: string;
  };
  const fkMap = new Map<string, FkGrouped>();
  for (const r of fkRows) {
    let g = fkMap.get(r.constraint_name);
    if (!g) {
      g = {
        constraint: r.constraint_name,
        columns: [],
        refTable: r.ref_table,
        refColumns: [],
        onUpdate: r.update_rule,
        onDelete: r.delete_rule,
      };
      fkMap.set(r.constraint_name, g);
    }
    g.columns.push(r.column_name);
    g.refColumns.push(r.ref_column);
  }
  const foreignKeysGrouped = Array.from(fkMap.values());
  const foreignKeysFlat = fkRows.map((r) => ({
    constraint: r.constraint_name,
    column: r.column_name,
    refTable: r.ref_table,
    refColumn: r.ref_column,
    onUpdate: r.update_rule,
    onDelete: r.delete_rule,
  }));

  const colLines: string[] = cols.map((c: any) => {
    const type = pgTypeFromInfoSchema(c);
    const parts = [`  "${c.column_name}" ${type}`];
    if (c.is_nullable === "NO") parts.push("NOT NULL");
    if (c.column_default) parts.push(`DEFAULT ${c.column_default}`);
    return parts.join(" ");
  });
  const tableLines: string[] = [...colLines];
  if (pkCols.length) {
    tableLines.push(
      `  PRIMARY KEY (${pkCols.map((c) => `"${c}"`).join(", ")})`,
    );
  }
  for (const fk of foreignKeysGrouped) {
    tableLines.push(
      `  CONSTRAINT "${fk.constraint}" ` +
        `FOREIGN KEY (${fk.columns.map((c) => `"${c}"`).join(", ")}) ` +
        `REFERENCES "${fk.refTable}" ` +
        `(${fk.refColumns.map((c) => `"${c}"`).join(", ")}) ` +
        `ON UPDATE ${fk.onUpdate} ON DELETE ${fk.onDelete}`,
    );
  }
  const createTable =
    `CREATE TABLE "${name}" (\n` + tableLines.join(",\n") + `\n);`;
  const createIndexes = indexes.map((i) => `${i.def};`).join("\n");
  const fullSql = [createTable, createIndexes].filter(Boolean).join("\n\n");

  return {
    name,
    columns: cols.map((c: any) => ({
      name: c.column_name,
      type: pgTypeFromInfoSchema(c),
      nullable: c.is_nullable === "YES",
      default: c.column_default ?? null,
      position: Number(c.ordinal_position),
    })),
    primaryKey: pkCols,
    indexes,
    foreignKeys: foreignKeysFlat,
    sql: fullSql,
  };
}

// Thin wrapper: just the DDL string, used by the schema-dump endpoint.
async function buildTableDdl(name: string): Promise<string | null> {
  const t = await introspectTable(name);
  return t ? t.sql : null;
}

router.get("/admin/source/db/table", async (req: Request, res: Response) => {
  const name = String(req.query.name ?? "");
  if (!isSafeIdent(name)) {
    res.status(400).json({ error: "invalid_name" });
    return;
  }

  try {
    const t = await introspectTable(name);
    if (!t) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(t);
  } catch (e: any) {
    res.status(500).json({ error: "table_failed", message: e?.message ?? "" });
  }
});

router.get("/admin/source/tree", async (req: Request, res: Response) => {
  const rootKey = String(req.query.root ?? "admin");
  const rootAbs = resolveRoot(rootKey);
  if (!rootAbs) {
    res.status(400).json({ error: "unknown_root" });
    return;
  }
  try {
    const tree = await buildTree(rootAbs);
    res.json({ root: rootKey, label: ROOTS[rootKey].label, tree });
  } catch (e: any) {
    res.status(500).json({ error: "tree_failed", message: e?.message ?? "" });
  }
});

// ---------- Source-tree ZIP download ----------
//
// Streams a ZIP of the entire allow-listed root, honouring the same
// SKIP_DIRS exclusions as the browser tree. Binary files ARE included
// (browser tree skips them, but a ZIP of source code should ship logos,
// fonts, etc). Hidden files are skipped except `.env.example`.
router.get("/admin/source/download", async (req: Request, res: Response) => {
  const rootKey = String(req.query.root ?? "");
  const root = ROOTS[rootKey];
  if (!root) {
    res.status(400).json({ error: "unknown_root" });
    return;
  }

  // Audit the download — source dumps are sensitive (may contain inline
  // secrets in dev configs). Fire-and-forget so a logging failure can't
  // block the operator from getting their archive.
  void logAdminAction(req, {
    action: "source.download",
    entity: "source",
    entityId: rootKey,
    payload: { root: rootKey, label: root.label },
  });

  const safe = rootKey.replace(/[^a-z0-9_-]+/gi, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `cryptox-${safe}-${stamp}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  res.setHeader("Cache-Control", "no-store");

  const archive = archiver("zip", { zlib: { level: 6 } });

  // Stream errors should surface to the client connection (which will simply
  // be torn down) rather than crash the process. We can't really send a JSON
  // error response once headers are flushed, so just log + destroy.
  archive.on("error", (err) => {
    req.log.error({ err, rootKey }, "source download archive error");
    if (!res.headersSent) {
      res.status(500).json({ error: "archive_failed" });
      return;
    }
    res.destroy(err);
  });
  archive.on("warning", (err) => {
    req.log.warn({ err, rootKey }, "source download archive warning");
  });

  archive.pipe(res);

  // Wrap the directory under a top-level folder named after the root so
  // unzipping doesn't splat dozens of files into the user's CWD.
  const topFolder = root.label.replace(/^artifacts\//, "");
  archive.glob(
    "**/*",
    {
      cwd: root.absPath,
      dot: false,
      ignore: [
        ...Array.from(SKIP_DIRS).flatMap((d) => [`${d}/**`, `**/${d}/**`]),
      ],
    },
    { prefix: topFolder },
  );

  // finalize() can throw synchronously on bad state; the stream-level
  // archive.on('error') handles per-entry IO errors but won't catch a
  // top-level finalize throw, so wrap it.
  try {
    await archive.finalize();
  } catch (err) {
    req.log.error({ err, rootKey }, "source download finalize failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "archive_finalize_failed" });
      return;
    }
    res.destroy(err as Error);
  }
});

// ---------- Live database SQL dump download ----------
//
// Returns a single .sql file containing CREATE TABLE + indexes for every
// public table — schema only, NO data. Built from the same introspection
// queries used by /admin/source/db/table so the output matches the table
// detail view exactly. Useful for taking a snapshot of the live schema
// without needing shell access to pg_dump.
router.get("/admin/source/db/download", async (req: Request, res: Response) => {
  void logAdminAction(req, {
    action: "source.download",
    entity: "source",
    entityId: "database",
    payload: { kind: "schema_dump" },
  });

  try {
    const tablesR: any = await db.execute(sql`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tableRows: Array<{ name: string }> =
      Array.isArray(tablesR.rows) ? tablesR.rows : tablesR;

    const parts: string[] = [
      `-- Zebvix live database schema dump`,
      `-- Generated: ${new Date().toISOString()}`,
      `-- Tables:   ${tableRows.length}`,
      `-- Source:   public schema (CREATE TABLE + indexes only, no data)`,
      ``,
    ];

    for (const t of tableRows) {
      const name = t.name;
      if (!isSafeIdent(name)) continue;
      const ddl = await buildTableDdl(name);
      if (ddl) {
        parts.push(`-- ============================================================`);
        parts.push(`-- Table: public.${name}`);
        parts.push(`-- ============================================================`);
        parts.push(ddl);
        parts.push(``);
      }
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `cryptox-database-schema-${stamp}.sql`;

    res.setHeader("Content-Type", "application/sql; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(parts.join("\n"));
  } catch (e: any) {
    res.status(500).json({ error: "schema_dump_failed", message: e?.message ?? "" });
  }
});

router.get("/admin/source/file", async (req: Request, res: Response) => {
  const rootKey = String(req.query.root ?? "admin");
  const relPath = String(req.query.path ?? "");
  const rootAbs = resolveRoot(rootKey);

  if (!rootAbs) {
    res.status(400).json({ error: "unknown_root" });
    return;
  }
  if (!relPath) {
    res.status(400).json({ error: "path_required" });
    return;
  }
  if (relPath.includes("\0")) {
    res.status(400).json({ error: "invalid_path" });
    return;
  }

  // Reject any segment that tries to escape the root.
  const normalized = path.normalize(relPath).replace(/^[/\\]+/, "");
  const absCandidate = path.resolve(rootAbs, normalized);
  if (!isSafeChild(rootAbs, absCandidate)) {
    res.status(400).json({ error: "path_traversal" });
    return;
  }

  try {
    const st = await fs.stat(absCandidate);
    if (!st.isFile()) {
      res.status(400).json({ error: "not_a_file" });
      return;
    }
    if (st.size > MAX_FILE_BYTES) {
      res.status(413).json({
        error: "file_too_large",
        size: st.size,
        maxBytes: MAX_FILE_BYTES,
      });
      return;
    }
    const ext = path.extname(absCandidate).toLowerCase();
    if (BINARY_EXT.has(ext)) {
      res.status(415).json({ error: "binary_not_supported" });
      return;
    }
    const content = await fs.readFile(absCandidate, "utf8");
    res.json({
      root: rootKey,
      path: normalized.split(path.sep).join("/"),
      size: st.size,
      content,
    });
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(500).json({ error: "read_failed", message: e?.message ?? "" });
  }
});

export default router;
