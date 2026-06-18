import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "gold";

const VARIANT_CLASS: Record<Variant, string> = {
  success: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  warning: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  danger: "bg-red-500/15 text-red-300 border-red-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  neutral: "bg-muted/40 text-muted-foreground border-border",
  gold: "gold-bg-soft text-amber-300 border-amber-500/30",
};

const STATUS_MAP: Record<string, Variant> = {
  approved: "success",
  verified: "success",
  active: "success",
  enabled: "success",
  completed: "success",
  succeeded: "success",
  ok: "success",
  online: "success",
  healthy: "success",
  pending: "warning",
  processing: "warning",
  review: "warning",
  under_review: "warning",
  rejected: "danger",
  failed: "danger",
  disabled: "danger",
  blocked: "danger",
  banned: "danger",
  offline: "danger",
  unhealthy: "danger",
  inactive: "neutral",
  draft: "neutral",
  locked: "neutral",
  available: "info",
  premium: "gold",
  vip: "gold",
};

export function StatusPill({
  status,
  variant,
  children,
  className,
  dot = true,
}: {
  status?: string;
  variant?: Variant;
  children?: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const norm = (status || "").toLowerCase().trim();
  const v: Variant = variant ?? STATUS_MAP[norm] ?? "neutral";
  const label = children ?? (status ? prettify(status) : "—");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border tabular-nums",
        VARIANT_CLASS[v],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            v === "success" && "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
            v === "warning" && "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]",
            v === "danger" && "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]",
            v === "info" && "bg-sky-400",
            v === "neutral" && "bg-muted-foreground/60",
            v === "gold" && "bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.7)]"
          )}
        />
      )}
      {label}
    </span>
  );
}

function prettify(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
