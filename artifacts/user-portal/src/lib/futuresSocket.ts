import { useEffect, useRef, useState } from "react";
import { marketSocket, type NormalizedOrderbook } from "./marketSocket";

/**
 * Subscribe to live futures orderbook updates via the Node API WebSocket.
 * The Node API bridges Go's `futures.orderbook:{pairId}` channel to
 * `futures.orderbook:{symbol}` so the frontend only needs one WS connection.
 *
 * `snapshot` is the REST-fetched initial book; it is used until the first
 * live WS frame arrives, at which point the WS data fully takes over.
 */
export function useFuturesOrderbook(
  symbol: string | undefined,
  snapshot: NormalizedOrderbook | undefined,
): NormalizedOrderbook {
  const [book, setBook] = useState<NormalizedOrderbook>({ bids: [], asks: [] });
  const seeded = useRef(false);

  useEffect(() => {
    if (snapshot && !seeded.current) {
      seeded.current = true;
      setBook(snapshot);
    }
  }, [snapshot]);

  useEffect(() => {
    if (!symbol || !marketSocket) return;
    return marketSocket.subscribe(
      { type: "futures.orderbook", symbol },
      (data: NormalizedOrderbook) => {
        seeded.current = true;
        setBook(data);
      },
    );
  }, [symbol]);

  return book;
}
