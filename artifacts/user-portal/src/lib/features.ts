import { useQuery } from "@tanstack/react-query";

export type FeatureKey =
  | "spot_trading" | "futures" | "options" | "p2p" | "convert"
  | "ai_trading" | "trading_bots" | "copy_trading" | "earn" | "wallet"
  | "inr_payments" | "leagues" | "price_alerts" | "referrals"
  | "broker" | "smart_api" | "portfolio";

const DEFAULT_FLAGS: Record<FeatureKey, boolean> = {
  spot_trading:  true,
  futures:       true,
  options:       true,
  p2p:           true,
  convert:       true,
  ai_trading:    true,
  trading_bots:  true,
  copy_trading:  true,
  earn:          true,
  wallet:        true,
  inr_payments:  true,
  leagues:       true,
  price_alerts:  true,
  referrals:     true,
  broker:        false,
  smart_api:     false,
  portfolio:     true,
};

async function fetchFeatureFlags(): Promise<Record<FeatureKey, boolean>> {
  const res = await fetch("/api/exchange/features");
  if (!res.ok) return { ...DEFAULT_FLAGS };
  try {
    return { ...DEFAULT_FLAGS, ...(await res.json() as Partial<Record<FeatureKey, boolean>>) };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

export function useFeatureFlags() {
  const { data, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFeatureFlags,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
  });
  return {
    flags: data ?? { ...DEFAULT_FLAGS },
    isLoading,
    isEnabled: (key: FeatureKey) => (data ?? DEFAULT_FLAGS)[key] ?? true,
  };
}
