import { useMemo } from "react";

interface DepthChartProps {
  bids: [number, number][];
  asks: [number, number][];
  className?: string;
}

export function DepthChart({ bids, asks, className = "w-full h-full" }: DepthChartProps) {
  const data = useMemo(() => {
    if (!bids.length && !asks.length) return null;

    const sortedBids = [...bids].sort((a, b) => b[0] - a[0]);
    const sortedAsks = [...asks].sort((a, b) => a[0] - b[0]);

    const maxDepth = 40;
    const slicedBids = sortedBids.slice(0, maxDepth);
    const slicedAsks = sortedAsks.slice(0, maxDepth);

    let cumBid = 0;
    const bidPoints = slicedBids.map(([px, qty]) => ({ px, cumQty: (cumBid += qty) }));
    let cumAsk = 0;
    const askPoints = slicedAsks.map(([px, qty]) => ({ px, cumQty: (cumAsk += qty) }));

    if (!bidPoints.length || !askPoints.length) return null;

    const minPx = bidPoints[bidPoints.length - 1]?.px ?? 0;
    const maxPx = askPoints[askPoints.length - 1]?.px ?? 1;
    const maxQty = Math.max(bidPoints[bidPoints.length - 1]?.cumQty ?? 0, askPoints[askPoints.length - 1]?.cumQty ?? 0);
    const midPx = ((bidPoints[0]?.px ?? 0) + (askPoints[0]?.px ?? 0)) / 2;

    const pxRange = maxPx - minPx || 1;
    const toX = (px: number) => ((px - minPx) / pxRange) * 100;
    const toY = (qty: number) => 100 - (qty / maxQty) * 88;

    const bidPath = buildStepPath(bidPoints.slice().reverse(), toX, toY);
    const askPath = buildStepPath(askPoints, toX, toY);

    return { bidPath, askPath, midPx, minPx, maxPx, toX };
  }, [bids, asks]);

  if (!data) {
    return (
      <div className={`${className} flex items-center justify-center text-xs text-muted-foreground`}>
        No depth data
      </div>
    );
  }

  const { bidPath, askPath, midPx, minPx, maxPx, toX } = data;

  return (
    <div className={`${className} relative select-none`}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f87171" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#f87171" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y}
            stroke="currentColor" strokeOpacity="0.04" strokeWidth="0.5" />
        ))}

        {/* Bid area */}
        <path d={bidPath.area} fill="url(#bidGrad)" />
        {/* Ask area */}
        <path d={askPath.area} fill="url(#askGrad)" />

        {/* Bid line */}
        <path d={bidPath.line} fill="none" stroke="#10b981" strokeWidth="0.7" />
        {/* Ask line */}
        <path d={askPath.line} fill="none" stroke="#f87171" strokeWidth="0.7" />

        {/* Mid price vertical line */}
        <line
          x1={toX(midPx)} y1="2" x2={toX(midPx)} y2="98"
          stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" strokeDasharray="2,2"
        />
      </svg>

      {/* Price labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pb-1 text-[9px] font-mono pointer-events-none">
        <span className="text-emerald-500/80">{fmt(minPx)}</span>
        <span className="text-muted-foreground/60">{fmt(midPx)}</span>
        <span className="text-rose-500/80">{fmt(maxPx)}</span>
      </div>

      {/* Legend */}
      <div className="absolute top-1.5 right-2 flex items-center gap-2.5 text-[9px] pointer-events-none">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 bg-emerald-500 rounded" />Bids</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-0.5 bg-rose-500 rounded" />Asks</span>
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function buildStepPath(
  points: { px: number; cumQty: number }[],
  toX: (px: number) => number,
  toY: (qty: number) => number,
): { line: string; area: string } {
  if (!points.length) return { line: "", area: "" };

  let line = "";
  let area = "";

  for (let i = 0; i < points.length; i++) {
    const { px, cumQty } = points[i];
    const x = toX(px);
    const y = toY(cumQty);

    if (i === 0) {
      line += `M ${x} ${y}`;
      area += `M ${x} 100 L ${x} ${y}`;
    } else {
      const prevX = toX(points[i - 1].px);
      line += ` L ${prevX} ${y} L ${x} ${y}`;
      area += ` L ${prevX} ${y} L ${x} ${y}`;
    }
  }

  const lastX = toX(points[points.length - 1].px);
  area += ` L ${lastX} 100 Z`;

  return { line, area };
}
