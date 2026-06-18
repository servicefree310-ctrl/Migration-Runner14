import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { get } from "@/lib/api";

export function useMarketCatalog() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["exchange-market"],
    queryFn: () => get("/exchange/market"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return useMemo(() => {
    const all = new Set<string>();
    const futures = new Set<string>();
    if (Array.isArray(data)) {
      for (const m of data) {
        if (!m?.symbol) continue;
        all.add(String(m.symbol));
        if (m?.metadata?.limits?.leverage) futures.add(String(m.symbol));
      }
    }
    return { all, futures, isLoading };
  }, [data, isLoading]);
}
