// Live site configuration for the user-portal. Pulls from the public
// /content/site-config endpoint with sane defaults so the app keeps working
// even before any admin has saved a config row.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";

export type FooterLink = { label: string; href: string; external?: boolean };
export type FooterColumn = { title: string; links: FooterLink[] };
export type FooterSocial = { label: string; href: string; kind: "twitter" | "telegram" | "instagram" | "youtube" | "github" | "discord" | "facebook" | "linkedin" | string };
export type FooterBadge = { label: string; kind: "shield" | "lock" | "award" | string };

export type Brand = {
  name: string;
  tagline: string;
  copyright: string;
  supportEmail: string;
};

export type Maintenance = {
  enabled: boolean;
  message: string;
  eta: string;
};

export type FeatureFlags = {
  showFutures: boolean;
  showP2P: boolean;
  showConvert: boolean;
  showEarn: boolean;
  showLeagues: boolean;
  showNews: boolean;
  showAnnouncements: boolean;
  showDex: boolean;
  showTools: boolean;
  showSignup: boolean;
  showLogin: boolean;
  signupBonusZbx: number;
};

export type FooterConfig = {
  columns: FooterColumn[];
  socials: FooterSocial[];
  badges: FooterBadge[];
  riskWarning: string;
};

export type BannerStrip = {
  enabled: boolean;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  kind: "info" | "success" | "warning" | "danger";
};

export type GeoConfig = {
  mode: "blocklist" | "allowlist";
  blockedCountries: string[];
  allowedCountries: string[];
};

export type SiteConfig = {
  brand: Brand;
  maintenance: Maintenance;
  features: FeatureFlags;
  footer: FooterConfig;
  bannerStrip: BannerStrip;
  geo: GeoConfig;
};

const DEFAULT_BRAND: Brand = {
  name: "Zebvix",
  tagline: "India's pro-grade crypto exchange.",
  copyright: "© {year} Zebvix Technologies Pvt Ltd. All rights reserved.",
  supportEmail: "support@zebvix.com",
};

const DEFAULT_MAINTENANCE: Maintenance = {
  enabled: false,
  message: "We are currently undergoing scheduled maintenance. We'll be back shortly.",
  eta: "",
};

const DEFAULT_FEATURES: FeatureFlags = {
  showFutures: true,
  showP2P: true,
  showConvert: true,
  showEarn: true,
  showLeagues: true,
  showNews: true,
  showAnnouncements: true,
  showDex: true,
  showTools: true,
  showSignup: true,
  showLogin: true,
  signupBonusZbx: 50,
};

const DEFAULT_FOOTER: FooterConfig = {
  columns: [
    {
      title: "Products",
      links: [
        { label: "Spot trading",       href: "/trade" },
        { label: "Perpetual futures",  href: "/futures" },
        { label: "P2P trading",        href: "/p2p" },
        { label: "AI trading bots",    href: "/ai-trading" },
        { label: "Grid & DCA bots",    href: "/bots" },
        { label: "Earn & staking",     href: "/earn" },
        { label: "Copy trading",       href: "/copy-trading" },
        { label: "Convert",            href: "/convert" },
        { label: "Markets",            href: "/markets" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About Zebvix",       href: "/about" },
        { label: "Careers",            href: "/careers" },
        { label: "Blog",               href: "/blog" },
        { label: "Press",              href: "/press" },
        { label: "Announcements",      href: "/announcements" },
        { label: "Contact",            href: "/contact" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Help centre",        href: "/help" },
        { label: "Submit a request",   href: "/support" },
        { label: "Fee schedule",       href: "/fees" },
        { label: "Tutorials",          href: "/tutorials" },
      ],
    },
    {
      title: "Developers",
      links: [
        { label: "API documentation",  href: "/api-docs" },
        { label: "API status",         href: "/api-status" },
        { label: "System status",      href: "/status" },
        { label: "Changelog",          href: "/announcements" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms of service",   href: "/legal/terms" },
        { label: "Privacy policy",     href: "/legal/privacy" },
        { label: "Risk disclosure",    href: "/legal/risk" },
        { label: "AML / KYC policy",   href: "/legal/aml" },
        { label: "Cookies",            href: "/legal/cookies" },
      ],
    },
  ],
  socials: [
    { label: "Twitter / X", href: "https://twitter.com/zebvix",   kind: "twitter" },
    { label: "Telegram",    href: "https://t.me/zebvix",          kind: "telegram" },
    { label: "Instagram",   href: "https://instagram.com/zebvix", kind: "instagram" },
    { label: "YouTube",     href: "https://youtube.com/@zebvix",  kind: "youtube" },
    { label: "GitHub",      href: "https://github.com/zebvix",    kind: "github" },
    { label: "LinkedIn",    href: "https://linkedin.com/company/zebvix", kind: "linkedin" },
  ],
  badges: [
    { label: "ISO 27001 certified",         kind: "shield" },
    { label: "SOC 2 Type II",               kind: "lock" },
    { label: "FIU-IND registration pending", kind: "award" },
  ],
  riskWarning:
    "Crypto-asset trading is subject to high market risk and price volatility. The value of your investment can go down as well as up, and you may not get back the amount you invested. Trading derivatives such as perpetual futures carries additional risk and can result in the loss of all of your collateral. Past performance of any bot or trading strategy is not indicative of future results.",
};

const DEFAULT_BANNER_STRIP: BannerStrip = {
  enabled: false,
  message: "",
  ctaLabel: "",
  ctaUrl: "",
  kind: "info",
};

const DEFAULT_GEO: GeoConfig = {
  mode: "blocklist",
  blockedCountries: [],
  allowedCountries: [],
};

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  brand: DEFAULT_BRAND,
  maintenance: DEFAULT_MAINTENANCE,
  features: DEFAULT_FEATURES,
  footer: DEFAULT_FOOTER,
  bannerStrip: DEFAULT_BANNER_STRIP,
  geo: DEFAULT_GEO,
};

export function useGeoConfig(): GeoConfig {
  return useSiteConfig().geo;
}

const SiteConfigContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG);

function deepMerge<T>(base: T, override: Partial<T> | undefined | null): T {
  if (!override) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const v = (override as any)[key];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      out[key] = v;
    } else if (typeof v === "object" && typeof (base as any)[key] === "object" && !Array.isArray((base as any)[key])) {
      out[key] = deepMerge((base as any)[key], v);
    } else {
      out[key] = v;
    }
  }
  return out as T;
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<Partial<SiteConfig>>({
    queryKey: ["/content/site-config"],
    queryFn: () => get<Partial<SiteConfig>>("/content/site-config"),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const merged = useMemo<SiteConfig>(() => deepMerge(DEFAULT_SITE_CONFIG, data), [data]);

  return <SiteConfigContext.Provider value={merged}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig(): SiteConfig {
  return useContext(SiteConfigContext);
}

export function useFeatures(): FeatureFlags {
  return useSiteConfig().features;
}
