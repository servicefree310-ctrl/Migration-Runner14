import { Link, useLocation } from "wouter";
import {
  Home,
  TrendingUp,
  Zap,
  Wallet as WalletIcon,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const LEFT_ITEMS = [
  { href: "/",        label: "Home",    icon: Home,       exact: true  },
  { href: "/markets", label: "Markets", icon: TrendingUp, exact: false },
] as const;

const RIGHT_ITEMS = [
  { href: "/wallet",  label: "Wallet",  icon: WalletIcon, exact: false },
  { href: "/profile", label: "Account", icon: UserIcon,   exact: false },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
  isActive: boolean;
}) {
  return (
    <Link href={href}>
      <button
        type="button"
        className="relative flex flex-col items-center justify-center gap-[3px] w-full h-full px-1 active:scale-95 transition-transform duration-150"
        aria-label={label}
      >
        {isActive && (
          <span className="nav-active-bar" />
        )}
        <Icon
          className={cn(
            "h-[1.2rem] w-[1.2rem] transition-all duration-200",
            isActive ? "text-primary drop-shadow-[0_0_5px_hsla(43,95%,54%,0.6)]" : "text-muted-foreground",
          )}
          strokeWidth={isActive ? 2.5 : 1.8}
        />
        <span
          className={cn(
            "text-[10px] font-medium leading-none tracking-tight transition-colors duration-200",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </button>
    </Link>
  );
}

export function MobileBottomNav() {
  const [loc] = useLocation();
  const { user } = useAuth();

  const accountHref = user ? "/profile" : "/login";

  const isTradeActive =
    loc.startsWith("/trade") ||
    loc.startsWith("/futures") ||
    loc.startsWith("/options") ||
    loc.startsWith("/p2p") ||
    loc.startsWith("/convert") ||
    loc.startsWith("/ai-trading");

  return (
    <nav
      className="xl:hidden fixed bottom-0 left-0 right-0 z-50"
      aria-label="Mobile navigation"
    >
      <div className="relative">
        {/* ── Center Trade FAB — floats above the bar ──────────── */}
        <div className="absolute -top-[1.875rem] left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-[2px]">
          <Link href="/trade">
            <button
              type="button"
              aria-label="Trade"
              className={cn(
                "h-14 w-14 rounded-[1.125rem] flex items-center justify-center",
                "bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-black",
                "shadow-xl ring-4 ring-background",
                "active:scale-95 transition-all duration-150",
                isTradeActive
                  ? "shadow-amber-500/60 ring-amber-500/20"
                  : "shadow-amber-500/35",
              )}
            >
              <Zap
                className={cn(
                  "h-6 w-6 transition-all",
                  isTradeActive && "drop-shadow-[0_0_6px_rgba(255,255,255,0.75)]",
                )}
                strokeWidth={2.5}
              />
            </button>
          </Link>
          <span
            className={cn(
              "text-[9px] font-bold uppercase tracking-widest leading-none",
              isTradeActive ? "text-primary" : "text-muted-foreground/80",
            )}
          >
            Trade
          </span>
        </div>

        {/* ── Nav bar ───────────────────────────────────────────── */}
        <div
          className="border-t border-white/[0.07] bg-background/88 backdrop-blur-2xl"
          style={{ borderTopColor: "hsl(218 26% 12% / 0.9)" }}
        >
          <div className="flex items-stretch h-[3.75rem]">
            {/* Left items */}
            {LEFT_ITEMS.map(({ href, label, icon, exact }) => {
              const isActive = exact ? loc === href : loc.startsWith(href);
              const isHome = exact && loc === "/";
              return (
                <div key={href} className="flex-1">
                  <NavItem
                    href={href}
                    label={label}
                    icon={icon as Parameters<typeof NavItem>[0]["icon"]}
                    isActive={isActive || isHome}
                  />
                </div>
              );
            })}

            {/* Center slot — empty space under the FAB */}
            <div className="flex-1" />

            {/* Right items */}
            {RIGHT_ITEMS.map(({ href, label, icon, exact }) => {
              const resolvedHref = label === "Account" ? accountHref : href;
              const isActive = exact ? loc === resolvedHref : loc.startsWith(href);
              return (
                <div key={href} className="flex-1">
                  <NavItem
                    href={resolvedHref}
                    label={label}
                    icon={icon as Parameters<typeof NavItem>[0]["icon"]}
                    isActive={isActive}
                  />
                </div>
              );
            })}
          </div>

          {/* iOS safe-area padding */}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </div>
      </div>
    </nav>
  );
}
