import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { MobileBottomNav } from "./MobileBottomNav";
import { SiteConfigProvider, useSiteConfig } from "@/lib/siteConfig";
import { useAuth } from "@/lib/auth";
import MaintenancePage from "@/pages/Maintenance";
import { VerificationGateModal } from "@/components/VerificationGateModal";
import { GeoBlockModal } from "@/components/GeoBlockModal";
import { Sparkles, X } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SiteConfigProvider>
      <ShellInner>{children}</ShellInner>
    </SiteConfigProvider>
  );
}

interface GeoState {
  countryCode: string;
  countryName: string;
  blocked: boolean;
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { maintenance, geo } = useSiteConfig();
  const [geoState, setGeoState] = useState<GeoState | null>(null);

  const isAuthPage = location === "/login" || location === "/signup";
  const isStaff = user?.role === "admin" || user?.role === "superadmin" || user?.role === "support";

  // Geo check — only for non-staff, cache in sessionStorage
  useEffect(() => {
    if (isStaff) return;

    const cached = sessionStorage.getItem("zbx_geo");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { code: string; name: string };
        const blocked = isGeoBlocked(parsed.code, geo);
        setGeoState({ countryCode: parsed.code, countryName: parsed.name, blocked });
        return;
      } catch { /* ignore bad cache */ }
    }

    // Only fetch if geo config actually restricts something
    const hasRestrictions =
      (geo.mode === "blocklist" && geo.blockedCountries.length > 0) ||
      (geo.mode === "allowlist" && geo.allowedCountries.length > 0);
    if (!hasRestrictions) return;

    fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then((data: { country_code?: string; country_name?: string }) => {
        const code = data.country_code ?? "";
        const name = data.country_name ?? code;
        if (code) {
          sessionStorage.setItem("zbx_geo", JSON.stringify({ code, name }));
          const blocked = isGeoBlocked(code, geo);
          setGeoState({ countryCode: code, countryName: name, blocked });
        }
      })
      .catch(() => { /* silently ignore — don't block on geo failure */ });
  }, [geo, isStaff]);

  // Maintenance gate — admins / superadmins / support can still access
  if (maintenance.enabled && !isStaff && !isAuthPage) {
    return <MaintenancePage />;
  }

  // Geo block gate
  if (geoState?.blocked && !isStaff) {
    return (
      <GeoBlockModal
        countryCode={geoState.countryCode}
        countryName={geoState.countryName}
      />
    );
  }

  if (isAuthPage) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <BannerStrip />
      <AppHeader />
      <main className="flex-1 flex flex-col pb-[3.75rem] xl:pb-0">{children}</main>
      <AppFooter />
      <MobileBottomNav />
      <VerificationGateModal />
    </div>
  );
}

function isGeoBlocked(
  countryCode: string,
  geo: { mode: string; blockedCountries: string[]; allowedCountries: string[] },
): boolean {
  if (!countryCode) return false;
  const code = countryCode.toUpperCase();
  if (geo.mode === "blocklist") {
    return geo.blockedCountries.map(c => c.toUpperCase()).includes(code);
  }
  if (geo.mode === "allowlist" && geo.allowedCountries.length > 0) {
    return !geo.allowedCountries.map(c => c.toUpperCase()).includes(code);
  }
  return false;
}

function BannerStrip() {
  const { bannerStrip } = useSiteConfig();
  const [dismissed, setDismissed] = useState(false);
  if (!bannerStrip.enabled || !bannerStrip.message || dismissed) return null;

  const tone =
    bannerStrip.kind === "danger"  ? "bg-rose-500/15 border-rose-500/40 text-rose-100" :
    bannerStrip.kind === "warning" ? "bg-amber-500/15 border-amber-500/40 text-amber-100" :
    bannerStrip.kind === "success" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-100" :
                                     "bg-sky-500/15 border-sky-500/40 text-sky-100";

  return (
    <div className={`border-b ${tone}`}>
      <div className="container mx-auto px-4 py-2 text-xs sm:text-sm flex items-center gap-3">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate sm:whitespace-normal">{bannerStrip.message}</span>
        {bannerStrip.ctaLabel && bannerStrip.ctaUrl && (
          <a href={bannerStrip.ctaUrl} className="font-semibold underline whitespace-nowrap hover:opacity-80">
            {bannerStrip.ctaLabel} →
          </a>
        )}
        <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="opacity-70 hover:opacity-100 shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
