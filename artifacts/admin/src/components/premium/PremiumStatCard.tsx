import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function PremiumStatCard({
  title,
  value,
  icon: Icon,
  prefix,
  suffix,
  delta,
  hint,
  hero = false,
  accent = false,
  loading = false,
  onClick,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  prefix?: string;
  suffix?: string;
  delta?: number;
  hint?: string;
  hero?: boolean;
  accent?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  const display =
    typeof value === "number"
      ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : value;
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <div
      className={cn(
        "relative rounded-xl p-4 md:p-5 transition-all overflow-hidden group",
        hero ? "premium-card-hero" : "premium-card",
        onClick && "cursor-pointer hover:-translate-y-0.5"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground tracking-wide">
            {title}
          </div>
          <div
            className={cn(
              "mt-1.5 text-2xl md:text-[28px] font-bold tabular-nums leading-tight truncate",
              accent || hero ? "gold-text" : "text-foreground"
            )}
          >
            {loading ? (
              <span className="inline-block h-7 w-24 rounded bg-muted/50 animate-pulse" />
            ) : (
              <>
                {prefix ?? ""}
                {display}
                {suffix ?? ""}
              </>
            )}
          </div>
          {(delta !== undefined || hint) && !loading && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              {delta !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium tabular-nums",
                    deltaPositive
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  )}
                >
                  {deltaPositive ? (
                    <ArrowUp className="w-3 h-3" />
                  ) : (
                    <ArrowDown className="w-3 h-3" />
                  )}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
              {hint && <span className="text-muted-foreground truncate">{hint}</span>}
            </div>
          )}
        </div>
        <div className="stat-orb w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-amber-300" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
