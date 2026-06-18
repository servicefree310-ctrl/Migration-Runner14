import { type ReactNode, useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, Coins as CoinsIcon, Network, ArrowLeftRight, Wallet,
  ShieldCheck, Banknote, ArrowDownToLine, ArrowUpFromLine, Bitcoin, Landmark,
  PiggyBank, FileText, Settings as SettingsIcon, Activity, MessageSquare,
  KeyRound, LogOut, Menu, Percent, Bot, ArrowDownUp, Wallet2, TrendingUp, Sigma, Globe2, Radar,
  Megaphone, Trophy, Database, Server, Search, Command as CommandIcon, Crown,
  ChevronRight, ChevronsUpDown, User as UserIcon, Bell, Code2, Cpu, History, Smartphone,
  Globe, Building2, Gem, Moon, Sun, ToggleLeft, Video, type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ZebvixMark } from "@/components/ZebvixMark";

function AdminThemeToggle() {
  const { resolved, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
    >
      {resolved === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

type Role = "support" | "finance" | "compliance" | "marketing" | "admin" | "superadmin";
type NavItem = { href: string; label: string; icon: LucideIcon; roles: Role[] };
type NavSection = { id: string; label: string; items: NavItem[] };

const ALL_STAFF: Role[] = ["support", "finance", "compliance", "marketing", "admin", "superadmin"];

const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL_STAFF },
    ],
  },
  {
    id: "users",
    label: "Users & Compliance",
    items: [
      { href: "/users",        label: "Users",          icon: Users,       roles: ["support", "compliance", "admin", "superadmin"] },
      { href: "/kyc",          label: "KYC Reviews",    icon: ShieldCheck, roles: ["support", "compliance", "admin", "superadmin"] },
      { href: "/kyc-templates",label: "KYC Templates",  icon: FileText,    roles: ["compliance", "admin", "superadmin"] },
      { href: "/banks",        label: "Bank Approvals", icon: Landmark,    roles: ["support", "finance", "compliance", "admin", "superadmin"] },
      { href: "/login-logs",   label: "Login Logs",     icon: Activity,    roles: ["support", "compliance", "admin", "superadmin"] },
    ],
  },
  {
    id: "markets",
    label: "Markets & Trading",
    items: [
      { href: "/coins",             label: "Coins",              icon: CoinsIcon,   roles: ["support", "admin", "superadmin"] },
      { href: "/networks",          label: "Networks",           icon: Network,     roles: ["support", "admin", "superadmin"] },
      { href: "/pairs",             label: "Trading Pairs",      icon: ArrowLeftRight, roles: ["support", "admin", "superadmin"] },
      { href: "/funding-rates",     label: "Funding & Risk",     icon: Percent,     roles: ["support", "admin", "superadmin"] },
      { href: "/futures-positions", label: "Futures Positions",  icon: TrendingUp,  roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/options-admin",     label: "Options",            icon: Sigma,       roles: ["admin", "superadmin"] },
      { href: "/web3-admin",        label: "Web3 / Multi-chain", icon: Globe2,      roles: ["admin", "superadmin"] },
      { href: "/listings-admin",    label: "Auto-Listings",      icon: Radar,       roles: ["admin", "superadmin"] },
      { href: "/bots",              label: "Market Bots",        icon: Bot,         roles: ["admin", "superadmin"] },
      { href: "/orders",            label: "Orders & Trades",    icon: ArrowDownUp, roles: ["support", "finance", "compliance", "admin", "superadmin"] },
      { href: "/tds-report",        label: "TDS Report",         icon: Percent,     roles: ["support", "finance", "compliance", "admin", "superadmin"] },
      { href: "/p2p",               label: "P2P Marketplace",    icon: Users,       roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/copy-trading",      label: "Copy Trading",       icon: Activity,    roles: ["support", "admin", "superadmin"] },
      { href: "/fees",              label: "Fees & VIP Tiers",   icon: Crown,       roles: ["admin", "superadmin"] },
      { href: "/trading-engine",    label: "Trading Engine",     icon: Cpu,         roles: ["admin", "superadmin"] },
    ],
  },
  {
    id: "broker",
    label: "Broker & Instruments",
    items: [
      { href: "/broker-config",       label: "Broker Config (Angel One)",       icon: Globe,    roles: ["admin", "superadmin"] as Role[] },
      { href: "/instruments-admin",   label: "Forex / Stocks / Commodities",    icon: Gem,      roles: ["admin", "superadmin"] as Role[] },
      { href: "/broker-applications", label: "Broker Applications",             icon: FileText, roles: ["admin", "superadmin"] as Role[] },
    ],
  },
  {
    id: "treasury",
    label: "Treasury",
    items: [
      { href: "/gateways",          label: "Payment Gateways",   icon: Wallet,         roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/inr-deposits",      label: "INR Deposits",       icon: ArrowDownToLine, roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/inr-withdrawals",   label: "INR Withdrawals",    icon: ArrowUpFromLine, roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/crypto-deposits",   label: "Crypto Deposits",    icon: Bitcoin,        roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/user-addresses",    label: "User Addresses",     icon: Wallet2,        roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/crypto-withdrawals",label: "Crypto Withdrawals", icon: Banknote,       roles: ["support", "finance", "admin", "superadmin"] },
      { href: "/wallet-manager",    label: "Wallet Manager",     icon: Wallet2,        roles: ["admin", "superadmin"] },
    ],
  },
  {
    id: "growth",
    label: "Earn & CMS",
    items: [
      { href: "/earn",                    label: "Earn Products",       icon: PiggyBank,   roles: ["support", "admin", "superadmin"] },
      { href: "/referral-settings",       label: "Referral Program",    icon: Gem,         roles: ["admin", "superadmin"] },
      { href: "/creator-rewards",         label: "Creator Rewards",     icon: Video,       roles: ["marketing", "admin", "superadmin"] },
      { href: "/ai-trading-plans",        label: "AI Trading Plans",    icon: Bot,         roles: ["admin", "superadmin"] },
      { href: "/auto-invest-admin",       label: "Auto Invest",         icon: PiggyBank,   roles: ["admin", "superadmin"] },
      { href: "/team",                    label: "Team Members",        icon: Users,       roles: ["marketing", "admin", "superadmin"] },
      { href: "/company-media",           label: "Company Images",      icon: Building2,   roles: ["marketing", "admin", "superadmin"] },
      { href: "/banners",                 label: "Home Banners",        icon: Megaphone,   roles: ["marketing", "admin", "superadmin"] },
      { href: "/promotions",              label: "Promotions",          icon: Trophy,      roles: ["marketing", "admin", "superadmin"] },
      { href: "/announcements",           label: "Announcements",       icon: Bell,        roles: ["marketing", "admin", "superadmin"] },
      { href: "/news",                    label: "News",                icon: FileText,    roles: ["marketing", "admin", "superadmin"] },
      { href: "/competitions",            label: "Competitions",        icon: Trophy,      roles: ["marketing", "admin", "superadmin"] },
      { href: "/broadcast-notifications", label: "Broadcast Notif.",    icon: Bell,        roles: ["marketing", "admin", "superadmin"] },
      { href: "/push-notifications",      label: "Push Notifications",  icon: Smartphone,  roles: ["marketing", "admin", "superadmin"] },
      { href: "/site-settings",           label: "Site Settings",       icon: SettingsIcon,roles: ["admin", "superadmin"] },
      { href: "/legal",                   label: "Legal CMS",           icon: FileText,    roles: ["support", "compliance", "marketing", "admin", "superadmin"] },
      { href: "/chat",                    label: "Live Chat",           icon: MessageSquare,roles: ["support", "admin", "superadmin"] },
      { href: "/support-admin",           label: "Support Tickets",     icon: MessageSquare,roles: ["support", "admin", "superadmin"] },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    items: [
      { href: "/seo",           label: "SEO Manager",        icon: Search,      roles: ["marketing", "admin", "superadmin"] as Role[] },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/api-keys",         label: "API Keys",          icon: KeyRound,     roles: ["admin", "superadmin"] },
      { href: "/redis",            label: "Redis & Engines",   icon: Database,     roles: ["admin", "superadmin"] },
      { href: "/integrations",     label: "API Integrations",  icon: Globe2,       roles: ["admin", "superadmin"] },
      { href: "/otp-providers",    label: "OTP Providers",     icon: KeyRound,     roles: ["admin", "superadmin"] },
      { href: "/settings",         label: "Settings",          icon: SettingsIcon, roles: ["admin", "superadmin"] },
      { href: "/features",          label: "Feature Flags",     icon: ToggleLeft,   roles: ["admin", "superadmin"] },
      { href: "/exchange-settings",label: "Exchange Settings", icon: SettingsIcon, roles: ["admin", "superadmin"] },
      { href: "/backend-status",   label: "Backend Status",    icon: Server,       roles: ["support", "finance", "compliance", "admin", "superadmin"] },
      { href: "/system-status",    label: "System Status",     icon: Server,       roles: ["support", "finance", "compliance", "admin", "superadmin"] },
      { href: "/audit-log",        label: "Audit Log",         icon: History,      roles: ["support", "finance", "compliance", "admin", "superadmin"] },
      { href: "/code-reference",   label: "Code Reference",    icon: Code2,        roles: ["admin", "superadmin"] },
    ],
  },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const role = (user?.role as Role) || "support";

  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((it) => it.roles.includes(role)),
      })).filter((s) => s.items.length > 0),
    [role]
  );

  const allItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const current = useMemo(
    () =>
      allItems.find((it) => it.href === location) ??
      (location === "/" ? allItems.find((it) => it.href === "/dashboard") : undefined),
    [allItems, location]
  );
  const currentSection = useMemo(
    () => sections.find((s) => s.items.some((it) => it.href === location)),
    [sections, location]
  );

  // Cmd+K / Ctrl+K command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const initials = (user?.name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-[260px] flex flex-col transition-transform border-r border-sidebar-border",
          "bg-[hsl(222_22%_5%)]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand */}
        <Link
          href="/dashboard"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 px-5 py-4 border-b border-sidebar-border hover-elevate group"
        >
          <ZebvixMark size={36} className="shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-base leading-tight gold-text tracking-wide">ZEBVIX</div>
            <div className="text-[10px] text-muted-foreground leading-tight uppercase tracking-[0.18em]">
              Admin Console
            </div>
          </div>
        </Link>

        {/* Search trigger */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-sidebar-border bg-[hsl(222_18%_8%)] text-left text-xs text-muted-foreground hover-elevate"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1">Search…</span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/40 border border-border text-[10px] font-mono">
              <CommandIcon className="w-2.5 h-2.5" /> K
            </kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 scroll-fade">
          {sections.map((section) => (
            <div key={section.id}>
              <div className="nav-section-label">{section.label}</div>
              <div className="space-y-0.5">
                {section.items.map((it) => {
                  const active = location === it.href || (location === "/" && it.href === "/dashboard");
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] hover-elevate transition-colors",
                        active
                          ? "bg-[hsla(45,100%,51%,0.08)] text-amber-200 font-medium"
                          : "text-sidebar-foreground/85"
                      )}
                    >
                      {active && <span className="nav-active-bar" />}
                      <Icon
                        className={cn(
                          "w-4 h-4 shrink-0",
                          active ? "text-amber-300" : "text-muted-foreground"
                        )}
                      />
                      <span className="truncate">{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User block */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover-elevate">
                <Avatar className="w-8 h-8 border border-amber-500/30">
                  <AvatarFallback className="gold-bg-soft text-amber-300 text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[13px] font-medium truncate text-sidebar-foreground">
                    {user?.name || user?.email}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize tracking-wide">
                    {user?.role}
                  </div>
                </div>
                <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Signed in as <span className="text-foreground font-medium">{user?.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(role === "admin" || role === "superadmin") && (
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <SettingsIcon className="w-4 h-4 mr-2" /> Settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigate("/backend-status")}>
                <Server className="w-4 h-4 mr-2" /> System Status
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-300 focus:text-red-300">
                <LogOut className="w-4 h-4 mr-2" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-4 lg:px-6 gap-3 bg-card sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)}>
            <Menu className="w-5 h-5" />
          </Button>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-sm min-w-0">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline"
            >
              Console
            </Link>
            {currentSection && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hidden sm:inline" />
                <span className="text-muted-foreground hidden md:inline">{currentSection.label}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground hidden md:inline" />
              </>
            )}
            <span className="font-semibold text-foreground truncate">
              {current?.label || "Admin"}
            </span>
          </div>

          <div className="flex-1" />

          {/* Header actions */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPaletteOpen(true)}
            className="hidden md:inline-flex gap-2 text-muted-foreground"
          >
            <Search className="w-4 h-4" />
            <span className="text-xs">Quick search</span>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/40 border border-border text-[10px] font-mono">
              ⌘K
            </kbd>
          </Button>
          <AdminThemeToggle />
          <Button variant="ghost" size="icon" title="Notifications">
            <Bell className="w-4 h-4" />
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Command palette */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Jump to a page…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {sections.map((section) => (
            <CommandGroup key={section.id} heading={section.label}>
              {section.items.map((it) => {
                const Icon = it.icon;
                return (
                  <CommandItem
                    key={it.href}
                    value={`${section.label} ${it.label}`}
                    onSelect={() => {
                      setPaletteOpen(false);
                      navigate(it.href);
                    }}
                  >
                    <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                    {it.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          <CommandGroup heading="Account">
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                logout();
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
