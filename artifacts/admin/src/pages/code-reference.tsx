import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { EmptyState } from "@/components/premium/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Code2, Copy, Check, FileCode2, Folder, FolderOpen, ChevronRight,
  Search, Loader2, FileText, Sparkles, Database, Table as TableIcon, Key,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FileNode = { type: "file"; name: string; path: string; size: number };
type DirNode  = { type: "dir";  name: string; path: string; children: TreeNode[] };
type TreeNode = FileNode | DirNode;

type RootInfo = { key: string; label: string };
type RootsResp = { roots: RootInfo[] };
type TreeResp  = { root: string; label: string; tree: TreeNode[] };
type FileResp  = { root: string; path: string; size: number; content: string };

type DbTablesResp = {
  tables: Array<{ name: string; rowCount: number; sizeBytes: number }>;
};
type DbColumn = {
  name: string; type: string; nullable: boolean; default: string | null; position: number;
};
type DbIndex = { name: string; def: string };
type DbForeignKey = {
  constraint: string; column: string; refTable: string;
  refColumn: string; onUpdate: string; onDelete: string;
};
type DbTableResp = {
  name: string;
  columns: DbColumn[];
  primaryKey: string[];
  indexes: DbIndex[];
  foreignKeys: DbForeignKey[];
  sql: string;
};

const DB_TAB = "__db__";

const DEFAULT_EXPANDED: Record<string, string[]> = {
  admin:         ["src", "src/pages", "src/components"],
  "user-portal": ["src", "src/pages", "src/components"],
  "api-server":  ["src", "src/routes", "src/middlewares"],
  "lib/db":      ["src", "src/schema", "migrations"],
};

const PREFERRED_FILE: Record<string, string[]> = {
  admin:         ["src/App.tsx"],
  "user-portal": ["src/App.tsx", "src/main.tsx"],
  "api-server":  ["src/index.ts", "src/routes/index.ts"],
  "lib/db":      ["src/index.ts", "src/schema/index.ts"],
};

function langOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "tsx": return "tsx";
    case "ts":  return "typescript";
    case "jsx": return "jsx";
    case "js":  case "mjs": case "cjs": return "javascript";
    case "json": return "json";
    case "css":  return "css";
    case "scss": return "scss";
    case "html": return "html";
    case "md":   return "markdown";
    case "sql":  return "sql";
    case "yml":  case "yaml": return "yaml";
    case "sh":   return "bash";
    default:     return ext || "text";
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  const needle = q.toLowerCase();
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") {
      if (n.path.toLowerCase().includes(needle)) out.push(n);
    } else {
      const kept = filterTree(n.children, needle);
      if (kept.length > 0) out.push({ ...n, children: kept });
      else if (n.path.toLowerCase().includes(needle)) out.push(n);
    }
  }
  return out;
}

function collectDirPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.type === "dir") {
        paths.push(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return paths;
}

function flattenFiles(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      if (n.type === "file") out.push(n.path);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function TreeItem({
  node, depth, expanded, onToggle, selected, onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const indent = { paddingLeft: 8 + depth * 14 };

  if (node.type === "file") {
    const isActive = selected === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        style={indent}
        className={cn(
          "w-full text-left flex items-center gap-2 py-1 pr-2 text-sm rounded-sm hover:bg-muted/60 transition-colors",
          isActive && "bg-primary/10 text-primary"
        )}
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  const isOpen = expanded.has(node.path);
  return (
    <>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        style={indent}
        className="w-full text-left flex items-center gap-1 py-1 pr-2 text-sm rounded-sm hover:bg-muted/60 transition-colors font-medium"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            isOpen && "rotate-90"
          )}
        />
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen && (
        <div>
          {node.children.map((c) => (
            <TreeItem
              key={c.path}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </>
  );
}

// =================== File-explorer subview ===================

function FileExplorer({
  rootKey, label, onSelectChange,
}: { rootKey: string; label: string; onSelectChange?: (p: string | null) => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(DEFAULT_EXPANDED[rootKey] ?? ["src"]),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const treeQ = useQuery({
    queryKey: ["admin-source-tree", rootKey],
    queryFn: () => get<TreeResp>(`/admin/source/tree?root=${encodeURIComponent(rootKey)}`),
    staleTime: 60_000,
  });

  const fileQ = useQuery({
    queryKey: ["admin-source-file", rootKey, selected],
    queryFn: () =>
      get<FileResp>(
        `/admin/source/file?root=${encodeURIComponent(rootKey)}&path=${encodeURIComponent(selected!)}`,
      ),
    enabled: !!selected,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selected || !treeQ.data?.tree) return;
    const flat = flattenFiles(treeQ.data.tree);
    const preferred =
      (PREFERRED_FILE[rootKey] ?? []).map((p) => flat.find((f) => f === p)).find(Boolean) ??
      flat.find((p) => p.endsWith("/App.tsx")) ??
      flat[0] ??
      null;
    if (preferred) setSelected(preferred);
  }, [treeQ.data, selected, rootKey]);

  useEffect(() => { onSelectChange?.(selected); }, [selected, onSelectChange]);

  const filteredTree = useMemo(() => {
    if (!treeQ.data?.tree) return [];
    return filterTree(treeQ.data.tree, query.trim());
  }, [treeQ.data, query]);

  useEffect(() => {
    if (!query.trim()) return;
    const dirs = collectDirPaths(filteredTree);
    setExpanded((prev) => {
      const next = new Set(prev);
      dirs.forEach((d) => next.add(d));
      return next;
    });
  }, [query, filteredTree]);

  const toggle = (p: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const onCopy = async () => {
    if (!fileQ.data?.content) return;
    try {
      await navigator.clipboard.writeText(fileQ.data.content);
      setCopied(true);
      toast({ title: "Copied", description: fileQ.data.path });
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const lineCount = fileQ.data?.content ? fileQ.data.content.split("\n").length : 0;
  const language = selected ? langOf(selected.split("/").pop() ?? "") : "";

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 md:col-span-4 lg:col-span-3 p-0 overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find file or folder…"
              className="pl-7 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[72vh] overflow-y-auto py-2">
          {treeQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tree…
            </div>
          ) : treeQ.isError ? (
            <div className="px-4 py-6 text-sm text-red-500">
              Couldn't load source tree.
            </div>
          ) : filteredTree.length === 0 ? (
            <EmptyState title="No matches" description="Try a different search term." icon={FileText} />
          ) : (
            filteredTree.map((n) => (
              <TreeItem
                key={n.path}
                node={n}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                selected={selected}
                onSelect={setSelected}
              />
            ))
          )}
        </div>
      </Card>

      <Card className="col-span-12 md:col-span-8 lg:col-span-9 p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-3">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <FileCode2 className="h-4 w-4 text-primary shrink-0" />
            <code className="text-sm font-medium truncate">
              {selected ? `${label}/${selected}` : "Select a file from the tree"}
            </code>
            {selected && (
              <>
                <Badge variant="outline">{language}</Badge>
                {fileQ.data && (
                  <>
                    <Badge variant="secondary">{lineCount} lines</Badge>
                    <Badge variant="secondary">{fmtBytes(fileQ.data.size)}</Badge>
                  </>
                )}
              </>
            )}
          </div>
          <Button
            size="sm" variant="outline"
            onClick={onCopy}
            disabled={!fileQ.data?.content}
          >
            {copied ? <><Check className="h-4 w-4 mr-2" /> Copied</> : <><Copy className="h-4 w-4 mr-2" /> Copy code</>}
          </Button>
        </div>

        <div className="bg-zinc-950">
          {!selected ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Pick any file on the left to view its full source.
            </div>
          ) : fileQ.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading file…
            </div>
          ) : fileQ.isError ? (
            <div className="p-6 text-sm text-red-400">
              Failed to load this file ({(fileQ.error as any)?.message ?? "error"}).
            </div>
          ) : (
            <pre className="overflow-auto p-4 text-[12.5px] leading-relaxed text-zinc-100 font-mono max-h-[72vh]">
              <code>{fileQ.data?.content}</code>
            </pre>
          )}
        </div>
      </Card>
    </div>
  );
}

// =================== Database explorer subview ===================

function DatabaseExplorer() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tablesQ = useQuery({
    queryKey: ["admin-source-db-tables"],
    queryFn: () => get<DbTablesResp>("/admin/source/db/tables"),
    staleTime: 30_000,
  });

  const tableQ = useQuery({
    queryKey: ["admin-source-db-table", selected],
    queryFn: () =>
      get<DbTableResp>(`/admin/source/db/table?name=${encodeURIComponent(selected!)}`),
    enabled: !!selected,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selected || !tablesQ.data?.tables?.length) return;
    const preferred =
      tablesQ.data.tables.find((t) => t.name === "users") ??
      tablesQ.data.tables[0];
    if (preferred) setSelected(preferred.name);
  }, [tablesQ.data, selected]);

  const filteredTables = useMemo(() => {
    const list = tablesQ.data?.tables ?? [];
    if (!query.trim()) return list;
    const needle = query.toLowerCase();
    return list.filter((t) => t.name.toLowerCase().includes(needle));
  }, [tablesQ.data, query]);

  const onCopy = async () => {
    if (!tableQ.data?.sql) return;
    try {
      await navigator.clipboard.writeText(tableQ.data.sql);
      setCopied(true);
      toast({ title: "Copied", description: tableQ.data.name });
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const pkSet = new Set(tableQ.data?.primaryKey ?? []);
  const fkByColumn = new Map<string, DbForeignKey>();
  for (const fk of tableQ.data?.foreignKeys ?? []) fkByColumn.set(fk.column, fk);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* ------------- Left: table list ------------- */}
      <Card className="col-span-12 md:col-span-4 lg:col-span-3 p-0 overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find table…"
              className="pl-7 h-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[72vh] overflow-y-auto py-2">
          {tablesQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tables…
            </div>
          ) : tablesQ.isError ? (
            <div className="px-4 py-6 text-sm text-red-500">
              Couldn't load database tables.
            </div>
          ) : filteredTables.length === 0 ? (
            <EmptyState title="No tables" description="Try a different search term." icon={TableIcon} />
          ) : (
            filteredTables.map((t) => {
              const isActive = selected === t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelected(t.name)}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm rounded-sm hover:bg-muted/60 transition-colors",
                    isActive && "bg-primary/10 text-primary",
                  )}
                >
                  <TableIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate flex-1">{t.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {fmtNum(t.rowCount)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {/* ------------- Right: table details + SQL ------------- */}
      <Card className="col-span-12 md:col-span-8 lg:col-span-9 p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-3">
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <Database className="h-4 w-4 text-primary shrink-0" />
            <code className="text-sm font-medium truncate">
              {selected ? `public.${selected}` : "Select a table from the list"}
            </code>
            {tableQ.data && (
              <>
                <Badge variant="outline">{tableQ.data.columns.length} columns</Badge>
                {tableQ.data.indexes.length > 0 && (
                  <Badge variant="secondary">{tableQ.data.indexes.length} indexes</Badge>
                )}
                {tableQ.data.foreignKeys.length > 0 && (
                  <Badge variant="secondary">{tableQ.data.foreignKeys.length} FKs</Badge>
                )}
              </>
            )}
          </div>
          <Button
            size="sm" variant="outline"
            onClick={onCopy}
            disabled={!tableQ.data?.sql}
          >
            {copied ? <><Check className="h-4 w-4 mr-2" /> Copied</> : <><Copy className="h-4 w-4 mr-2" /> Copy SQL</>}
          </Button>
        </div>

        {!selected ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Pick any table on the left to view its columns, indexes, and full CREATE TABLE SQL.
          </div>
        ) : tableQ.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading table…
          </div>
        ) : tableQ.isError ? (
          <div className="p-6 text-sm text-red-400">
            Failed to load this table ({(tableQ.error as any)?.message ?? "error"}).
          </div>
        ) : tableQ.data ? (
          <div className="space-y-0">
            {/* Column table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Column</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Nullable</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>References</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableQ.data.columns.map((c) => {
                    const isPk = pkSet.has(c.name);
                    const fk = fkByColumn.get(c.name);
                    return (
                      <TableRow key={c.name}>
                        <TableCell>
                          {isPk && <Key className="h-3.5 w-3.5 text-amber-500" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs">{c.type}</TableCell>
                        <TableCell>
                          {c.nullable ? (
                            <Badge variant="outline">NULL</Badge>
                          ) : (
                            <Badge>NOT NULL</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                          {c.default ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {fk ? `${fk.refTable}.${fk.refColumn}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Indexes */}
            {tableQ.data.indexes.length > 0 && (
              <div className="border-t p-4">
                <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                  Indexes
                </div>
                <ul className="space-y-1 font-mono text-xs">
                  {tableQ.data.indexes.map((i) => (
                    <li key={i.name} className="break-all">
                      <span className="text-amber-500 mr-2">{i.name}</span>
                      <span className="text-muted-foreground">{i.def}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generated SQL */}
            <div className="border-t bg-zinc-950">
              <div className="px-4 py-2 border-b border-zinc-800 text-xs uppercase tracking-wide font-semibold text-zinc-400">
                Full CREATE TABLE
              </div>
              <pre className="overflow-auto p-4 text-[12.5px] leading-relaxed text-zinc-100 font-mono max-h-[60vh]">
                <code>{tableQ.data.sql}</code>
              </pre>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// =================== Top-level page ===================

export default function CodeReferencePage() {
  const [rootKey, setRootKey] = useState<string>("admin");

  const rootsQ = useQuery({
    queryKey: ["admin-source-roots"],
    queryFn: () => get<RootsResp>("/admin/source/roots"),
    staleTime: 5 * 60_000,
  });

  const fileRoots: RootInfo[] = rootsQ.data?.roots?.length
    ? rootsQ.data.roots
    : [
        { key: "admin",        label: "artifacts/admin" },
        { key: "user-portal",  label: "artifacts/user-portal" },
        { key: "api-server",   label: "artifacts/api-server" },
        { key: "lib/db",       label: "lib/db" },
      ];

  const isDb = rootKey === DB_TAB;
  const activeFileRoot = fileRoots.find((r) => r.key === rootKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Code Reference"
        description="Browse the admin, user-portal, api-server, lib/db source trees and live database tables. Download any root as a ZIP or the database as a schema-only .sql file."
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {isDb ? "Live database" : (activeFileRoot?.label ?? rootKey)}
            </Badge>
            {isDb ? (
              // Download the live schema as a single .sql file. Browser sends the
              // session cookie automatically with same-origin GETs, so a plain
              // anchor works — no need for a fetch-blob-revoke dance.
              <Button asChild size="sm" variant="default" className="gap-1.5">
                <a href="/api/admin/source/db/download" download>
                  <Download className="h-4 w-4" />
                  Download schema (.sql)
                </a>
              </Button>
            ) : (
              <Button asChild size="sm" variant="default" className="gap-1.5">
                <a
                  href={`/api/admin/source/download?root=${encodeURIComponent(rootKey)}`}
                  download
                >
                  <Download className="h-4 w-4" />
                  Download {activeFileRoot?.label.replace(/^artifacts\//, "") ?? rootKey} (.zip)
                </a>
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={rootKey} onValueChange={(v) => setRootKey(v)}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 max-w-3xl">
          {fileRoots.map((r) => (
            <TabsTrigger key={r.key} value={r.key} className="gap-2">
              <Folder className="h-4 w-4 text-amber-500" />
              {r.label.replace(/^artifacts\//, "")}
            </TabsTrigger>
          ))}
          <TabsTrigger value={DB_TAB} className="gap-2">
            <Database className="h-4 w-4 text-sky-500" />
            database
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/*
        Render every FileExplorer (and the DatabaseExplorer) mounted at all times,
        and just hide the inactive ones. This preserves each tab's internal state
        (selected file, expanded folders, search query) across tab switches —
        unmounting would blow that away.
      */}
      {fileRoots.map((r) => (
        <div key={r.key} hidden={rootKey !== r.key}>
          <FileExplorer rootKey={r.key} label={r.label} />
        </div>
      ))}
      <div hidden={!isDb}>
        <DatabaseExplorer />
      </div>
    </div>
  );
}
