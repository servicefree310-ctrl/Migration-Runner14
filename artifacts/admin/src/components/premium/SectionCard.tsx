import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={cn("premium-card rounded-xl", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="stat-orb w-8 h-8 rounded-md flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-amber-300" />
              </div>
            )}
            <div className="min-w-0">
              {title && <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>}
              {description && (
                <p className="text-xs text-muted-foreground truncate">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "p-4 md:p-5")}>{children}</div>
    </div>
  );
}
