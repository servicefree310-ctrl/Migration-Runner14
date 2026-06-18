import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Time,
  type MouseEventParams,
  type LineData,
  type SeriesType,
  LineStyle,
} from "lightweight-charts";
import {
  CandlestickChart,
  LineChart as LineIcon,
  AreaChart,
  BarChart3,
  Maximize2,
  Minimize2,
  RotateCcw,
  RefreshCw,
  Settings2,
  Camera,
  Check,
  TrendingUp,
  MousePointer2,
  Minus,
  Bell,
  Eraser,
  TrendingUp as TrendLine,
  Trash2,
} from "lucide-react";
import { get } from "@/lib/api";
import { useOhlcv, marketSocket, type Candle, type NormalizedTrade } from "@/lib/marketSocket";
import { rsi, macd, bollinger, ema as calcEma, vwap as calcVwap, stochastic } from "@/lib/indicators";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

// ── Intervals ─────────────────────────────────────────────────────
const INTERVAL_GROUPS: { label: string; items: string[] }[] = [
  { label: "Minutes", items: ["1m", "3m", "5m", "15m", "30m"] },
  { label: "Hours",   items: ["1h", "2h", "4h", "6h", "12h"] },
  { label: "Days",    items: ["1d", "3d", "1w"] },
];
const QUICK_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
type Interval = string;

const INTERVAL_SEC: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "2h": 7200, "4h": 14400, "6h": 21600, "12h": 43200,
  "1d": 86400, "3d": 259200, "1w": 604800,
};

// ── Chart types ───────────────────────────────────────────────────
type ChartKind = "candles" | "heikinashi" | "line" | "area" | "bars";
const CHART_KINDS: { id: ChartKind; label: string; icon?: typeof CandlestickChart; text?: string }[] = [
  { id: "candles",    label: "Candles",      icon: CandlestickChart },
  { id: "heikinashi", label: "Heikin Ashi",  text: "HA" },
  { id: "line",       label: "Line",         icon: LineIcon },
  { id: "area",       label: "Area",         icon: AreaChart },
  { id: "bars",       label: "Bars",         icon: BarChart3 },
];

// ── Moving average defs ────────────────────────────────────────────
const SMA_DEFS = [
  { id: "ma7"  as const, period: 7,   color: "#facc15", label: "SMA 7"   },
  { id: "ma25" as const, period: 25,  color: "#60a5fa", label: "SMA 25"  },
  { id: "ma99" as const, period: 99,  color: "#f472b6", label: "SMA 99"  },
];
const EMA_DEFS = [
  { id: "ema9"   as const, period: 9,   color: "#c084fc", label: "EMA 9"   },
  { id: "ema21"  as const, period: 21,  color: "#22d3ee", label: "EMA 21"  },
  { id: "ema50"  as const, period: 50,  color: "#fb923c", label: "EMA 50"  },
  { id: "ema200" as const, period: 200, color: "#f87171", label: "EMA 200" },
];
// Legacy alias so existing code using MA_DEFS still works for the legend
const MA_DEFS = [...SMA_DEFS, ...EMA_DEFS];

// ── Indicator state ───────────────────────────────────────────────
type IndicatorState = {
  ma7: boolean; ma25: boolean; ma99: boolean;
  ema9: boolean; ema21: boolean; ema50: boolean; ema200: boolean;
  volume: boolean; vwap: boolean;
  bb: boolean; rsi: boolean; macd: boolean; stoch: boolean;
};
const DEFAULT_INDICATORS: IndicatorState = {
  ma7: true, ma25: true, ma99: false,
  ema9: false, ema21: true, ema50: false, ema200: false,
  volume: true, vwap: false,
  bb: false, rsi: true, macd: false, stoch: false,
};

// ── Pane indices ──────────────────────────────────────────────────
const RSI_PANE   = 1;
const MACD_PANE  = 2;
const STOCH_PANE = 3;

// ── Colours ───────────────────────────────────────────────────────
const BB_COLORS = { upper: "#a78bfa", middle: "#c084fc", lower: "#a78bfa" };

// ── Drawing tools ─────────────────────────────────────────────────
type DrawTool = "cursor" | "hline" | "trendline" | "alert" | "eraser";
const DRAW_TOOLS: { id: DrawTool; icon: typeof MousePointer2; label: string }[] = [
  { id: "cursor",    icon: MousePointer2, label: "Select / Pan" },
  { id: "hline",     icon: Minus,         label: "Horizontal Line" },
  { id: "trendline", icon: TrendLine,     label: "Trend Line" },
  { id: "alert",     icon: Bell,          label: "Price Alert" },
  { id: "eraser",    icon: Eraser,        label: "Remove Lines" },
];
interface HLineEntry { id: string; price: number; label: string; color: string; }
interface TLEntry    { id: string; time1: number; price1: number; time2: number; price2: number; color: string; }

// ── Persistence keys ─────────────────────────────────────────────
const INDICATOR_KEY = "zebvix:chart:indicators";
const KIND_KEY      = "zebvix:chart:kind";

// ── Helpers ───────────────────────────────────────────────────────
function sma(values: { time: number; close: number }[], period: number): LineData[] {
  if (values.length < period) return [];
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i].close;
    if (i >= period) sum -= values[i - period].close;
    if (i >= period - 1) out.push({ time: values[i].time as Time, value: sum / period });
  }
  return out;
}

/** Compute Heikin Ashi bars from raw OHLCV data. */
function computeHA(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const ha: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen  = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
    ha.push({
      time:   c.time,
      open:   haOpen,
      high:   Math.max(c.high, haOpen, haClose),
      low:    Math.min(c.low,  haOpen, haClose),
      close:  haClose,
      volume: c.volume,
    });
  }
  return ha;
}

function fmtPrice(n: number, quote: string): string {
  if (!isFinite(n) || n === 0) return "—";
  const inr    = quote === "INR";
  const digits = inr ? 2 : n < 1 ? 6 : n < 100 ? 4 : 2;
  const prefix = inr ? "₹" : "";
  const suffix = !inr && quote ? ` ${quote}` : "";
  return prefix + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) + suffix;
}
function fmtCompact(n: number, prefix = ""): string {
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return prefix + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return prefix + (n / 1e3).toFixed(2) + "K";
  return prefix + n.toFixed(2);
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════
export function PriceChart({
  symbol,
  mode = "spot",
  openOrders,
  myTrades,
}: {
  symbol: string;
  mode?: "spot" | "futures";
  openOrders?: Array<{ id?: string | number; price?: number | string; side?: string; type?: string }>;
  myTrades?: Array<{ price: number; side: string; ts: number }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  // ── Series refs ────────────────────────────────────────────────
  const mainSeriesRef   = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const smaSeriesRef    = useRef<Record<string, ISeriesApi<"Line">>>({});
  const emaSeriesRef    = useRef<Record<string, ISeriesApi<"Line">>>({});
  const bbSeriesRef     = useRef<{ upper: ISeriesApi<"Line">; middle: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> } | null>(null);
  const vwapSeriesRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiObRef        = useRef<IPriceLine | null>(null);
  const rsiOsRef        = useRef<IPriceLine | null>(null);
  const macdHistRef     = useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdLineRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSigRef      = useRef<ISeriesApi<"Line"> | null>(null);
  const stochKRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef       = useRef<ISeriesApi<"Line"> | null>(null);
  const stochObRef      = useRef<IPriceLine | null>(null);
  const stochOsRef      = useRef<IPriceLine | null>(null);
  const priceLineRef    = useRef<IPriceLine | null>(null);
  const orderLinesRef   = useRef<Map<string, IPriceLine>>(new Map());
  const tradeMarkersRef = useRef<IPriceLine[]>([]);
  // Always-current ref so series-creation effect can draw order lines without
  // needing openOrders in its dependency array (which would re-create the series).
  const openOrdersRef   = useRef(openOrders);
  openOrdersRef.current = openOrders; // keep in sync on every render
  const lastTimeRef     = useRef<number>(0);
  const candlesRef      = useRef<Candle[]>([]);
  const atRightEdgeRef  = useRef<boolean>(true); // track if user has scrolled away from latest bar

  // ── Drawing state ─────────────────────────────────────────────
  const [drawTool, setDrawTool]   = useState<DrawTool>("cursor");
  const [hlines, setHlines]       = useState<HLineEntry[]>([]);
  const [trendLines, setTrendLines] = useState<TLEntry[]>([]);
  const hlinePriceRefs   = useRef<Map<string, IPriceLine>>(new Map());
  const trendLinesRef    = useRef<TLEntry[]>([]);
  const drawingStateRef  = useRef<{ step: number; time1?: number; price1?: number } | null>(null);
  const overlayRef       = useRef<SVGSVGElement>(null);
  const previewLineRef2  = useRef<SVGLineElement | null>(null);
  const drawToolRef      = useRef<DrawTool>("cursor");
  // Keep refs in sync with state so effects can read latest without re-subscribing
  useEffect(() => { trendLinesRef.current = trendLines; }, [trendLines]);
  useEffect(() => { drawToolRef.current = drawTool; }, [drawTool]);

  // ── State ──────────────────────────────────────────────────────
  const [interval, setInterval] = useState<Interval>("1h");
  const [kind, setKind] = useState<ChartKind>(() => {
    try { return (window.localStorage.getItem(KIND_KEY) as ChartKind) || "candles"; } catch { return "candles"; }
  });
  const [indicators, setIndicators] = useState<IndicatorState>(() => {
    try {
      const raw = window.localStorage.getItem(INDICATOR_KEY);
      if (raw) return { ...DEFAULT_INDICATORS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_INDICATORS;
  });
  const [seedLoaded, setSeedLoaded] = useState(false);
  const [hover, setHover] = useState<{ candle: Candle; pct: number } | null>(null);
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const liveCandles  = useOhlcv(symbol, interval);
  const quote = useMemo(() => symbol.split("/")[1] || "USDT", [symbol]);
  const base  = useMemo(() => symbol.split("/")[0] || symbol,  [symbol]);

  // Persist UI state
  useEffect(() => { try { window.localStorage.setItem(KIND_KEY, kind); } catch { /* */ } }, [kind]);
  useEffect(() => { try { window.localStorage.setItem(INDICATOR_KEY, JSON.stringify(indicators)); } catch { /* */ } }, [indicators]);

  // ── Init chart ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background:  { color: "#0d1117" },
        textColor:   "#8b949e",
        fontFamily:  "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize:    11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.025)" },
        horzLines: { color: "rgba(255,255,255,0.025)" },
      },
      rightPriceScale: {
        borderColor:   "rgba(255,255,255,0.06)",
        scaleMargins:  { top: 0.06, bottom: 0.22 },
        autoScale:     true,
      },
      timeScale: {
        borderColor:    "rgba(255,255,255,0.06)",
        timeVisible:    true,
        secondsVisible: false,
        rightOffset:    12,
        barSpacing:     9,
        minBarSpacing:  2,
      },
      handleScale: {
        mouseWheel:  true,
        pinch:       true,
        axisPressedMouseMove: { time: true, price: true },
      },
      crosshair: {
        mode:     1,
        vertLine: { color: "rgba(255,255,255,0.18)", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#1c2433" },
        horzLine: { color: "rgba(255,255,255,0.18)", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#1c2433" },
      },
      autoSize: true,
    });
    chartRef.current = chart;

    // Track whether user is at the right edge so live updates can auto-scroll
    const onRangeChange = () => {
      try {
        const range = chart.timeScale().getVisibleLogicalRange();
        if (!range) return;
        const total = candlesRef.current.length;
        // "at right edge" = rightmost visible bar is within 5 bars of the latest candle
        atRightEdgeRef.current = range.to >= total - 5;
      } catch { /* */ }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange); } catch { /* */ }
      try { chart.remove(); } catch { /* */ }
      chartRef.current   = null;
      mainSeriesRef.current  = null;
      volumeSeriesRef.current = null;
      smaSeriesRef.current   = {};
      emaSeriesRef.current   = {};
      bbSeriesRef.current    = null;
      vwapSeriesRef.current  = null;
      rsiSeriesRef.current   = null;
      rsiObRef.current       = null;
      rsiOsRef.current       = null;
      macdHistRef.current    = null;
      macdLineRef.current    = null;
      macdSigRef.current     = null;
      stochKRef.current      = null;
      stochDRef.current      = null;
      stochObRef.current     = null;
      stochOsRef.current     = null;
      priceLineRef.current   = null;
    orderLinesRef.current  = new Map();
    tradeMarkersRef.current = [];
    };
  }, []);

  // autoScale: true is set in chart creation — no manual subscription needed.

  // ── Crosshair hover + drawing preview ────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: MouseEventParams) => {
      if (!param.time || !param.point) {
        setHover(null);
        if (previewLineRef2.current) previewLineRef2.current.style.display = "none";
        return;
      }
      const t = Number(param.time);
      const c = candlesRef.current.find((x) => x.time === t);
      if (c) {
        const pct = c.open > 0 ? ((c.close - c.open) / c.open) * 100 : 0;
        setHover({ candle: c, pct });
      }
      // Preview second point of trend line while hovering
      if (drawToolRef.current === "trendline" && drawingStateRef.current?.step === 1) {
        const ds = drawingStateRef.current;
        const series = mainSeriesRef.current;
        if (ds.time1 != null && ds.price1 != null && series && param.point) {
          const x1 = chart.timeScale().timeToCoordinate(ds.time1 as Time) ?? 0;
          const y1 = series.priceToCoordinate(ds.price1) ?? 0;
          const pl = previewLineRef2.current;
          if (pl) {
            pl.setAttribute("x1", String(x1));
            pl.setAttribute("y1", String(y1));
            pl.setAttribute("x2", String(param.point.x));
            pl.setAttribute("y2", String(param.point.y));
            pl.style.display = "block";
          }
        }
      } else if (previewLineRef2.current) {
        previewLineRef2.current.style.display = "none";
      }
    };
    chart.subscribeCrosshairMove(handler);
    return () => { try { chart.unsubscribeCrosshairMove(handler); } catch { /* */ } };
  }, []);

  // ── Drawing: click handler ────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: MouseEventParams) => {
      const tool  = drawToolRef.current;
      if (tool === "cursor") return;
      if (!param.point || !mainSeriesRef.current) return;
      const price = mainSeriesRef.current.coordinateToPrice(param.point.y);
      const time  = chart.timeScale().coordinateToTime(param.point.x);
      if (price == null) return;

      if (tool === "hline") {
        const id = `h_${Date.now()}`;
        const pl = mainSeriesRef.current.createPriceLine({ price, color: "#60a5fa", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
        hlinePriceRefs.current.set(id, pl);
        setHlines((prev) => [...prev, { id, price, label: "", color: "#60a5fa" }]);
        setDrawTool("cursor");
      } else if (tool === "alert") {
        const id = `a_${Date.now()}`;
        const pl = mainSeriesRef.current.createPriceLine({ price, color: "#f59e0b", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "⚑" });
        hlinePriceRefs.current.set(id, pl);
        setHlines((prev) => [...prev, { id, price, label: "⚑ Alert", color: "#f59e0b" }]);
        setDrawTool("cursor");
        toast.success(`Alert set at ${price.toFixed(4)}`);
      } else if (tool === "trendline") {
        if (!drawingStateRef.current || drawingStateRef.current.step !== 1) {
          drawingStateRef.current = { step: 1, time1: Number(time), price1: price };
        } else {
          const { time1, price1 } = drawingStateRef.current;
          if (time1 != null && price1 != null && time != null) {
            const id = `tl_${Date.now()}`;
            setTrendLines((prev) => [...prev, { id, time1, price1, time2: Number(time), price2: price, color: "#a78bfa" }]);
          }
          drawingStateRef.current = null;
          if (previewLineRef2.current) previewLineRef2.current.style.display = "none";
          setDrawTool("cursor");
        }
      } else if (tool === "eraser") {
        // Remove closest H-line to clicked price
        setHlines((prev) => {
          if (prev.length === 0) return prev;
          let closest = prev[0]; let minD = Math.abs(closest.price - price);
          for (const h of prev) { const d = Math.abs(h.price - price); if (d < minD) { minD = d; closest = h; } }
          const pl = hlinePriceRefs.current.get(closest.id);
          if (pl && mainSeriesRef.current) { try { mainSeriesRef.current.removePriceLine(pl); } catch { /* */ } }
          hlinePriceRefs.current.delete(closest.id);
          return prev.filter((h) => h.id !== closest.id);
        });
      }
    };
    chart.subscribeClick(handler);
    return () => { try { chart.unsubscribeClick(handler); } catch { /* */ } };
  }, []);

  // ── RAF loop: sync SVG trend lines with chart coordinates ────
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const chart  = chartRef.current;
      const series = mainSeriesRef.current;
      const svg    = overlayRef.current;
      if (chart && series && svg) {
        for (const tl of trendLinesRef.current) {
          const el = svg.querySelector<SVGLineElement>(`[data-tlid="${tl.id}"]`);
          if (!el) continue;
          const x1 = chart.timeScale().timeToCoordinate(tl.time1 as Time) ?? -9999;
          const y1 = series.priceToCoordinate(tl.price1) ?? -9999;
          const x2 = chart.timeScale().timeToCoordinate(tl.time2 as Time) ?? -9999;
          const y2 = series.priceToCoordinate(tl.price2) ?? -9999;
          el.setAttribute("x1", String(x1)); el.setAttribute("y1", String(y1));
          el.setAttribute("x2", String(x2)); el.setAttribute("y2", String(y2));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Recreate main series on kind change ──────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      try { chart.removeSeries(mainSeriesRef.current); } catch { /* */ }
      mainSeriesRef.current = null;
      priceLineRef.current  = null;
    }
    let s: ISeriesApi<SeriesType>;
    switch (kind) {
      case "line":
        s = chart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        break;
      case "area":
        s = chart.addSeries(AreaSeries, {
          lineColor:   "#2962ff",
          topColor:    "rgba(41,98,255,0.28)",
          bottomColor: "rgba(41,98,255,0.00)",
          lineWidth:   2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        break;
      case "bars":
        s = chart.addSeries(BarSeries, {
          upColor:     "#089981",
          downColor:   "#f23645",
          openVisible: true,
          thinBars:    false,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        break;
      case "heikinashi":
      case "candles":
      default:
        s = chart.addSeries(CandlestickSeries, {
          // Solid TradingView-style candles — fully visible bodies
          upColor:         "#089981",   // solid teal/green body
          downColor:       "#f23645",   // solid red body
          borderUpColor:   "#089981",   // green border
          borderDownColor: "#f23645",   // red border
          wickUpColor:     "#089981",   // green wick
          wickDownColor:   "#f23645",   // red wick
          borderVisible:   true,
          priceLineVisible: false,      // disable built-in line; we use our own from trades
          lastValueVisible: false,
        });
        break;
    }
    mainSeriesRef.current = s;
    // Immediately apply any open orders that were already fetched before the
    // series was (re)created — openOrders effect won't re-run on its own
    // because its dep hasn't changed when only the series ref was swapped.
    orderLinesRef.current.forEach((pl) => { try { s.removePriceLine(pl); } catch { /* */ } });
    orderLinesRef.current = new Map();
    for (const o of (openOrdersRef.current ?? [])) {
      const px = Number(o.price ?? 0);
      if (!px) continue;
      const isBuyOL = String(o.side ?? "").toLowerCase() === "buy";
      try {
        const pl = s.createPriceLine({ price: px, color: isBuyOL ? "#10b981" : "#f43f5e", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: isBuyOL ? "BUY" : "SELL" } as any);
        orderLinesRef.current.set(String(o.id ?? px), pl);
      } catch { /* */ }
    }
    if (candlesRef.current.length > 0) {
      const displayCandles = kind === "heikinashi" ? computeHA(candlesRef.current) : candlesRef.current;
      applyCandlesToMain(displayCandles, kind, s);
      const last = displayCandles[displayCandles.length - 1];
      ensurePriceLine(s, last.close, last.close >= last.open);
    }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Order price lines (open orders passed from parent) ───────
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;
    // Remove stale lines
    orderLinesRef.current.forEach((pl) => { try { series.removePriceLine(pl); } catch { /* */ } });
    orderLinesRef.current = new Map();
    // Draw fresh lines
    for (const o of (openOrders ?? [])) {
      const px = Number(o.price ?? 0);
      if (!px) continue;
      const isBuy = String(o.side ?? "").toLowerCase() === "buy";
      const color = isBuy ? "#10b981" : "#f43f5e";
      const label = `${isBuy ? "BUY" : "SELL"}`;
      const key = String(o.id ?? Math.random());
      try {
        const pl = series.createPriceLine({
          price: px,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: label,
        } as any);
        orderLinesRef.current.set(key, pl);
      } catch { /* */ }
    }
  }, [openOrders, kind]); // re-run when kind changes (series recreated)

  // ── Execution markers (filled trades from parent) ─────────────
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;
    // Remove stale markers
    tradeMarkersRef.current.forEach((pl) => { try { series.removePriceLine(pl); } catch { /* */ } });
    tradeMarkersRef.current = [];
    // Draw latest 5 fills as price lines (avoids setMarkers API differences)
    for (const t of (myTrades ?? []).slice(0, 5)) {
      const px = Number(t.price ?? 0);
      if (!px) continue;
      const isBuy = String(t.side ?? "").toLowerCase() === "buy";
      try {
        const pl = series.createPriceLine({
          price: px,
          color: isBuy ? "rgba(16,185,129,0.55)" : "rgba(244,63,94,0.55)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: isBuy ? "▲ Fill" : "▼ Fill",
        } as any);
        tradeMarkersRef.current.push(pl);
      } catch { /* */ }
    }
  }, [myTrades, kind]); // re-run when kind changes (series recreated)

  // ── Volume ────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.volume) {
      if (!volumeSeriesRef.current) {
        const v = chart.addSeries(HistogramSeries, {
          priceFormat:  { type: "volume" },
          priceScaleId: "volume",
          color:        "rgba(34,197,94,0.45)",
        });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
        volumeSeriesRef.current = v;
        if (candlesRef.current.length > 0) applyVolume(candlesRef.current, v);
      }
    } else if (volumeSeriesRef.current) {
      try { chart.removeSeries(volumeSeriesRef.current); } catch { /* */ }
      volumeSeriesRef.current = null;
    }
  }, [indicators.volume]);

  // ── SMA overlays ──────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const def of SMA_DEFS) {
      const enabled  = indicators[def.id];
      const existing = smaSeriesRef.current[def.id];
      if (enabled && !existing) {
        const s = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        smaSeriesRef.current[def.id] = s;
        if (candlesRef.current.length > 0)
          s.setData(sma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), def.period));
      } else if (!enabled && existing) {
        try { chart.removeSeries(existing); } catch { /* */ }
        delete smaSeriesRef.current[def.id];
      }
    }
  }, [indicators.ma7, indicators.ma25, indicators.ma99]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── EMA overlays ──────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const def of EMA_DEFS) {
      const enabled  = indicators[def.id];
      const existing = emaSeriesRef.current[def.id];
      if (enabled && !existing) {
        const s = chart.addSeries(LineSeries, { color: def.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        emaSeriesRef.current[def.id] = s;
        if (candlesRef.current.length > 0) {
          const pts = calcEma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), def.period);
          s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
        }
      } else if (!enabled && existing) {
        try { chart.removeSeries(existing); } catch { /* */ }
        delete emaSeriesRef.current[def.id];
      }
    }
  }, [indicators.ema9, indicators.ema21, indicators.ema50, indicators.ema200]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bollinger Bands ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.bb) {
      if (!bbSeriesRef.current) {
        const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        const upper  = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.upper });
        const middle = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.middle, lineStyle: LineStyle.Dashed });
        const lower  = chart.addSeries(LineSeries, { ...common, color: BB_COLORS.lower });
        bbSeriesRef.current = { upper, middle, lower };
        if (candlesRef.current.length > 0) applyBollinger(candlesRef.current, bbSeriesRef.current);
      }
    } else if (bbSeriesRef.current) {
      try { chart.removeSeries(bbSeriesRef.current.upper);  } catch { /* */ }
      try { chart.removeSeries(bbSeriesRef.current.middle); } catch { /* */ }
      try { chart.removeSeries(bbSeriesRef.current.lower);  } catch { /* */ }
      bbSeriesRef.current = null;
    }
  }, [indicators.bb]);

  // ── VWAP overlay ─────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.vwap) {
      if (!vwapSeriesRef.current) {
        const s = chart.addSeries(LineSeries, {
          color: "#e879f9", lineWidth: 2, lineStyle: LineStyle.Dashed,
          priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        });
        vwapSeriesRef.current = s;
        if (candlesRef.current.length > 0) applyVwap(candlesRef.current, s);
      }
    } else if (vwapSeriesRef.current) {
      try { chart.removeSeries(vwapSeriesRef.current); } catch { /* */ }
      vwapSeriesRef.current = null;
    }
  }, [indicators.vwap]);

  // ── RSI pane ─────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.rsi) {
      if (!rsiSeriesRef.current) {
        const s = chart.addSeries(LineSeries, {
          color: "#fb923c", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
          priceFormat: { type: "custom", formatter: (v: number) => v.toFixed(0), minMove: 0.01 },
        }, RSI_PANE);
        try {
          rsiObRef.current = s.createPriceLine({ price: 70, color: "rgba(239,68,68,0.5)",  lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
          rsiOsRef.current = s.createPriceLine({ price: 30, color: "rgba(34,197,94,0.5)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
        } catch { /* */ }
        rsiSeriesRef.current = s;
        if (candlesRef.current.length > 0) applyRsi(candlesRef.current, s);
      }
    } else if (rsiSeriesRef.current) {
      try { rsiSeriesRef.current.removePriceLine(rsiObRef.current!); } catch { /* */ }
      try { rsiSeriesRef.current.removePriceLine(rsiOsRef.current!); } catch { /* */ }
      try { chart.removeSeries(rsiSeriesRef.current); } catch { /* */ }
      rsiSeriesRef.current = null; rsiObRef.current = null; rsiOsRef.current = null;
    }
  }, [indicators.rsi]);

  // ── MACD pane ────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.macd) {
      if (!macdLineRef.current) {
        macdHistRef.current = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
          color: "rgba(34,197,94,0.55)", priceLineVisible: false, lastValueVisible: false,
        }, MACD_PANE);
        macdLineRef.current = chart.addSeries(LineSeries, {
          color: "#60a5fa", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, MACD_PANE);
        macdSigRef.current = chart.addSeries(LineSeries, {
          color: "#f97316", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        }, MACD_PANE);
        if (candlesRef.current.length > 0) applyMacd(candlesRef.current);
      }
    } else if (macdLineRef.current) {
      try { chart.removeSeries(macdLineRef.current); } catch { /* */ }
      try { if (macdSigRef.current)  chart.removeSeries(macdSigRef.current);  } catch { /* */ }
      try { if (macdHistRef.current) chart.removeSeries(macdHistRef.current); } catch { /* */ }
      macdLineRef.current = null; macdSigRef.current = null; macdHistRef.current = null;
    }
  }, [indicators.macd]);

  // ── Stochastic pane ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (indicators.stoch) {
      if (!stochKRef.current) {
        const priceFormat = { type: "custom" as const, formatter: (v: number) => v.toFixed(0), minMove: 0.01 };
        stochKRef.current = chart.addSeries(LineSeries, {
          color: "#4ade80", lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceFormat,
        }, STOCH_PANE);
        stochDRef.current = chart.addSeries(LineSeries, {
          color: "#f97316", lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, priceFormat,
        }, STOCH_PANE);
        try {
          stochObRef.current = stochKRef.current.createPriceLine({ price: 80, color: "rgba(239,68,68,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "80" });
          stochOsRef.current = stochKRef.current.createPriceLine({ price: 20, color: "rgba(34,197,94,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "20" });
        } catch { /* */ }
        if (candlesRef.current.length > 0) applyStoch(candlesRef.current);
      }
    } else if (stochKRef.current) {
      try { stochKRef.current.removePriceLine(stochObRef.current!); } catch { /* */ }
      try { stochKRef.current.removePriceLine(stochOsRef.current!); } catch { /* */ }
      try { chart.removeSeries(stochKRef.current); } catch { /* */ }
      try { if (stochDRef.current) chart.removeSeries(stochDRef.current); } catch { /* */ }
      stochKRef.current = null; stochDRef.current = null; stochObRef.current = null; stochOsRef.current = null;
    }
  }, [indicators.stoch]);

  // ── Seed from REST on symbol / interval change ────────────────
  useEffect(() => {
    let cancelled = false;
    setSeedLoaded(false);
    lastTimeRef.current = 0;
    candlesRef.current  = [];
    const clearSeries = (s: ISeriesApi<SeriesType>) => { try { s.setData([]); } catch { /* */ } };
    if (mainSeriesRef.current)  clearSeries(mainSeriesRef.current);
    if (volumeSeriesRef.current) clearSeries(volumeSeriesRef.current);
    Object.values(smaSeriesRef.current).forEach(clearSeries);
    Object.values(emaSeriesRef.current).forEach(clearSeries);

    (async () => {
      try {
        const data = await get<any>(`/exchange/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=500`);
        const raw  = Array.isArray(data) ? data : Array.isArray(data?.candles) ? data.candles : [];
        const candles: Candle[] = raw
          .map((c: any) => {
            if (Array.isArray(c)) {
              return { time: Math.floor(Number(c[0]) / 1000), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] ?? 0) };
            }
            return {
              time:   Math.floor(Number(c.time ?? c.ts ?? c.timestamp ?? 0) / 1000),
              open:   Number(c.open  ?? c.o),
              high:   Number(c.high  ?? c.h),
              low:    Number(c.low   ?? c.l),
              close:  Number(c.close ?? c.c),
              volume: Number(c.volume ?? c.v ?? 0),
            };
          })
          .filter((c: Candle) => c.time > 0 && c.close > 0)
          .sort((a: Candle, b: Candle) => a.time - b.time);
        const seen = new Set<number>();
        const unique = candles.filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true; });
        if (cancelled) return;
        candlesRef.current = unique;
        if (unique.length > 0) setLastCandle(unique[unique.length - 1]);

        // Main series
        if (mainSeriesRef.current) {
          const displayCandles = kind === "heikinashi" ? computeHA(unique) : unique;
          applyCandlesToMain(displayCandles, kind, mainSeriesRef.current);
          if (displayCandles.length > 0) {
            const last = displayCandles[displayCandles.length - 1];
            ensurePriceLine(mainSeriesRef.current, last.close, last.close >= last.open);
          }
        }
        // Volume
        if (volumeSeriesRef.current) applyVolume(unique, volumeSeriesRef.current);
        // SMA
        for (const def of SMA_DEFS) {
          const s = smaSeriesRef.current[def.id];
          if (s) s.setData(sma(unique.map((c) => ({ time: c.time, close: c.close })), def.period));
        }
        // EMA
        for (const def of EMA_DEFS) {
          const s = emaSeriesRef.current[def.id];
          if (s) {
            const pts = calcEma(unique.map((c) => ({ time: c.time, close: c.close })), def.period);
            s.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
          }
        }
        // Others
        if (bbSeriesRef.current)   applyBollinger(unique, bbSeriesRef.current);
        if (vwapSeriesRef.current) applyVwap(unique, vwapSeriesRef.current);
        if (rsiSeriesRef.current)  applyRsi(unique, rsiSeriesRef.current);
        if (macdLineRef.current)   applyMacd(unique);
        if (stochKRef.current)     applyStoch(unique);

        lastTimeRef.current = unique.length > 0 ? unique[unique.length - 1].time : 0;
        // Show last ~150 candles at a readable zoom instead of fitting all history
        const ts = chartRef.current?.timeScale();
        if (ts) {
          const total = unique.length;
          const visibleBars = 80;
          const from = Math.max(0, total - visibleBars);
          ts.setVisibleLogicalRange({ from, to: total + 2 });
        }
      } catch (err) {
        console.warn("chart seed failed", err);
      } finally {
        if (!cancelled) setSeedLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, interval, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live OHLCV updates ────────────────────────────────────────
  useEffect(() => {
    if (!seedLoaded || !mainSeriesRef.current || !liveCandles || liveCandles.length === 0) return;
    const sorted = [...liveCandles].sort((a, b) => a.time - b.time);
    for (const c of sorted) {
      if (!(c.time > 0) || c.time < lastTimeRef.current) continue;
      try {
        // Update raw candles ref
        const last = candlesRef.current[candlesRef.current.length - 1];
        if (last && last.time === c.time) {
          // Only overwrite if the new data has a different close (avoids stale WS
          // clobbering fresh REST seed data with the identical timestamp).
          if (c.close === last.close && c.high === last.high && c.low === last.low) continue;
          candlesRef.current[candlesRef.current.length - 1] = c;
        } else if (!last || c.time > last.time) {
          candlesRef.current.push(c);
          if (candlesRef.current.length > 1000) candlesRef.current = candlesRef.current.slice(-800);
        }
        // Update main series only — do NOT touch price line here.
        // Price line is driven exclusively by live trades (below effect) to avoid
        // stale OHLCV cache overriding a fresher trade price.
        if (kind === "heikinashi") {
          const ha = computeHA(candlesRef.current);
          const haLast = ha[ha.length - 1];
          if (haLast) {
            mainSeriesRef.current!.update({ time: haLast.time as Time, open: haLast.open, high: haLast.high, low: haLast.low, close: haLast.close } as any);
          }
        } else {
          applyOneCandleToMain(c, kind, mainSeriesRef.current!);
        }
        // Volume
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? "rgba(8,153,129,0.4)" : "rgba(242,54,69,0.4)" });
        }
        // SMA tail update
        for (const def of SMA_DEFS) {
          const s = smaSeriesRef.current[def.id];
          if (!s || candlesRef.current.length < def.period) continue;
          const tail = candlesRef.current.slice(-def.period);
          const avg  = tail.reduce((sum, x) => sum + x.close, 0) / def.period;
          s.update({ time: c.time as Time, value: avg });
        }
        // EMA tail update (simplified: recompute last point)
        for (const def of EMA_DEFS) {
          const s = emaSeriesRef.current[def.id];
          if (!s || candlesRef.current.length < def.period) continue;
          const pts = calcEma(candlesRef.current.map((x) => ({ time: x.time, close: x.close })), def.period);
          if (pts.length > 0) s.update({ time: pts[pts.length - 1].time as Time, value: pts[pts.length - 1].value });
        }
        // Full recompute for band/oscillator indicators
        if (bbSeriesRef.current)   applyBollinger(candlesRef.current, bbSeriesRef.current);
        if (vwapSeriesRef.current) applyVwap(candlesRef.current, vwapSeriesRef.current);
        if (rsiSeriesRef.current)  applyRsi(candlesRef.current, rsiSeriesRef.current);
        if (macdLineRef.current)   applyMacd(candlesRef.current);
        if (stochKRef.current)     applyStoch(candlesRef.current);
        lastTimeRef.current = c.time;
      } catch (err) {
        console.warn("chart update skipped", err);
      }
    }
    // Auto-scroll to latest bar only if user hasn't manually panned away
    if (atRightEdgeRef.current) {
      try { chartRef.current?.timeScale().scrollToRealTime(); } catch { /* */ }
    }
  }, [liveCandles, seedLoaded, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live candle + price line from individual trades ───────────
  // Trades arrive every ~1 s from bots; each one updates the current
  // candle's high/low/close and the price line instantly — no OHLCV cache lag.
  useEffect(() => {
    if (!seedLoaded || !marketSocket) return;
    const ivSec = INTERVAL_SEC[interval] ?? 3600;

    const unsub = marketSocket.subscribe(
      { type: "trades", symbol },
      (incoming: NormalizedTrade[]) => {
        if (!incoming.length || !mainSeriesRef.current) return;
        // Newest trade is at index 0 (server pushes descending)
        const trade = incoming[0]!;
        const price = trade.price;
        if (!(price > 0)) return;

        const bucketTime = Math.floor((trade.ts / 1000) / ivSec) * ivSec;
        const last = candlesRef.current[candlesRef.current.length - 1];

        let updated: Candle;
        let isNew = false;

        if (last && last.time === bucketTime) {
          // Update current candle
          updated = {
            ...last,
            high:   Math.max(last.high, price),
            low:    Math.min(last.low,  price),
            close:  price,
            volume: last.volume + trade.qty,
          };
          candlesRef.current[candlesRef.current.length - 1] = updated;
          setLastCandle(updated);
        } else if (!last || bucketTime > last.time) {
          // New interval started — open a fresh candle
          updated = {
            time:   bucketTime,
            open:   last?.close ?? price,
            high:   price,
            low:    price,
            close:  price,
            volume: trade.qty,
          };
          candlesRef.current.push(updated);
          if (candlesRef.current.length > 1000) candlesRef.current = candlesRef.current.slice(-800);
          lastTimeRef.current = bucketTime;
          setLastCandle(updated);
          isNew = true;
        } else {
          return; // trade is older than our last candle — ignore
        }

        try {
          if (kind === "heikinashi") {
            const ha = computeHA(candlesRef.current);
            const haLast = ha[ha.length - 1];
            if (haLast) {
              mainSeriesRef.current!.update({
                time: haLast.time as Time,
                open: haLast.open, high: haLast.high,
                low:  haLast.low,  close: haLast.close,
              } as any);
              ensurePriceLine(mainSeriesRef.current!, price, price >= (last?.open ?? price));
            }
          } else {
            mainSeriesRef.current!.update({
              time:  updated.time as Time,
              open:  updated.open,
              high:  updated.high,
              low:   updated.low,
              close: updated.close,
            } as any);
            ensurePriceLine(mainSeriesRef.current!, price, price >= updated.open);
          }

          // Volume bar
          if (volumeSeriesRef.current) {
            volumeSeriesRef.current.update({
              time:  updated.time as Time,
              value: updated.volume,
              color: updated.close >= updated.open ? "rgba(8,153,129,0.4)" : "rgba(242,54,69,0.4)",
            });
          }

          // Auto-scroll when a new candle opens and user is at right edge
          if (isNew && atRightEdgeRef.current) {
            try { chartRef.current?.timeScale().scrollToRealTime(); } catch { /* */ }
          }
        } catch (err) {
          console.warn("live trade chart update skipped", err);
        }
      },
    );

    return unsub;
  }, [seedLoaded, symbol, interval, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers (hoisted) ─────────────────────────────────────────
  function ensurePriceLine(series: ISeriesApi<SeriesType>, price: number, positive: boolean) {
    const color = positive ? "#089981" : "#f23645";
    if (priceLineRef.current) {
      try {
        priceLineRef.current.applyOptions({
          price,
          color,
          axisLabelVisible: true,
          axisLabelBackgroundColor: color,
        } as any);
      } catch { /* */ }
    } else {
      try {
        priceLineRef.current = series.createPriceLine({
          price,
          color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          axisLabelBackgroundColor: color,
          title: "",
        } as any);
      } catch { /* */ }
    }
  }
  function applyCandlesToMain(candles: Candle[], k: ChartKind, series: ISeriesApi<SeriesType>) {
    if (k === "line" || k === "area") {
      series.setData(candles.map((c) => ({ time: c.time as Time, value: c.close })) as any);
    } else {
      series.setData(candles.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })) as any);
    }
  }
  function applyOneCandleToMain(c: Candle, k: ChartKind, series: ISeriesApi<SeriesType>) {
    if (k === "line" || k === "area") {
      series.update({ time: c.time as Time, value: c.close } as any);
    } else {
      series.update({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close } as any);
    }
  }
  function applyVolume(candles: Candle[], v: ISeriesApi<"Histogram">) {
    v.setData(candles.map((c) => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? "rgba(8,153,129,0.4)" : "rgba(242,54,69,0.4)" })));
  }
  function applyBollinger(candles: Candle[], series: { upper: ISeriesApi<"Line">; middle: ISeriesApi<"Line">; lower: ISeriesApi<"Line"> }) {
    const bb = bollinger(candles.map((c) => ({ time: c.time, close: c.close })), 20, 2);
    series.upper.setData(bb.map((p) => ({ time: p.time as Time, value: p.upper })));
    series.middle.setData(bb.map((p) => ({ time: p.time as Time, value: p.middle })));
    series.lower.setData(bb.map((p) => ({ time: p.time as Time, value: p.lower })));
  }
  function applyVwap(candles: Candle[], series: ISeriesApi<"Line">) {
    const pts = calcVwap(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })));
    series.setData(pts.map((p) => ({ time: p.time as Time, value: p.value })));
  }
  function applyRsi(candles: Candle[], series: ISeriesApi<"Line">) {
    const out = rsi(candles.map((c) => ({ time: c.time, close: c.close })), 14);
    series.setData(out.map((p) => ({ time: p.time as Time, value: p.value })));
  }
  function applyMacd(candles: Candle[]) {
    const out = macd(candles.map((c) => ({ time: c.time, close: c.close })), 12, 26, 9);
    if (macdLineRef.current) macdLineRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.macd })));
    if (macdSigRef.current)  macdSigRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.signal })));
    if (macdHistRef.current) {
      macdHistRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.hist, color: p.hist >= 0 ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)" })));
    }
  }
  function applyStoch(candles: Candle[]) {
    const out = stochastic(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })), 14, 3);
    if (stochKRef.current) stochKRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.k })));
    if (stochDRef.current) stochDRef.current.setData(out.map((p) => ({ time: p.time as Time, value: p.d })));
  }

  // ── Toolbar handlers ─────────────────────────────────────────
  const handleReset      = () => { chartRef.current?.timeScale().fitContent(); };
  const handleRefreshData = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setIsRefreshing(false), 800);
  };
  const handleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) { await el.requestFullscreen(); setIsFullscreen(true); }
      else { await document.exitFullscreen(); setIsFullscreen(false); }
    } catch { /* */ }
  };
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const handleScreenshot = async () => {
    try {
      const chart = chartRef.current;
      if (!chart) return;
      const canvas = chart.takeScreenshot();
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url; a.download = `${symbol.replace("/", "_")}_${interval}_${Date.now()}.png`; a.click();
      toast.success("Chart saved");
    } catch { toast.error("Could not save chart"); }
  };

  // ── Drawing helpers ───────────────────────────────────────────
  function removeHLine(id: string) {
    const pl = hlinePriceRefs.current.get(id);
    if (pl && mainSeriesRef.current) { try { mainSeriesRef.current.removePriceLine(pl); } catch { /* */ } }
    hlinePriceRefs.current.delete(id);
    setHlines((prev) => prev.filter((h) => h.id !== id));
  }
  function removeAllDrawings() {
    for (const [, pl] of hlinePriceRefs.current) {
      if (mainSeriesRef.current) { try { mainSeriesRef.current.removePriceLine(pl); } catch { /* */ } }
    }
    hlinePriceRefs.current.clear();
    setHlines([]);
    setTrendLines([]);
    drawingStateRef.current = null;
    if (previewLineRef2.current) previewLineRef2.current.style.display = "none";
    setDrawTool("cursor");
  }

  // ── Derived display values ────────────────────────────────────
  const display     = hover?.candle || lastCandle || candlesRef.current[candlesRef.current.length - 1];
  const displayPct  = hover?.pct ?? (display && display.open > 0 ? ((display.close - display.open) / display.open) * 100 : 0);
  const activeIndicatorCount =
    (indicators.ma7 ? 1 : 0) + (indicators.ma25 ? 1 : 0) + (indicators.ma99 ? 1 : 0) +
    (indicators.ema9 ? 1 : 0) + (indicators.ema21 ? 1 : 0) + (indicators.ema50 ? 1 : 0) + (indicators.ema200 ? 1 : 0) +
    (indicators.volume ? 1 : 0) + (indicators.vwap ? 1 : 0) +
    (indicators.bb ? 1 : 0) + (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + (indicators.stoch ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      ref={wrapperRef}
      className="flex flex-col h-full w-full relative"
      style={{ background: "#0d1117", cursor: drawTool !== "cursor" ? "crosshair" : undefined }}
    >
      {/* ══ TOP TOOLBAR ═══════════════════════════════════════════ */}
      <div className="flex items-center gap-px px-1.5 sm:px-2 py-1 border-b overflow-x-auto shrink-0" style={{ background: "#161b22", borderColor: "rgba(255,255,255,0.06)" }}>

        {/* Futures badge */}
        {mode === "futures" && (
          <>
            <span className="px-1.5 py-[3px] text-[10px] font-bold rounded border mr-1 shrink-0" style={{ borderColor: "#f59e0b44", color: "#f59e0b", background: "#f59e0b11" }}>
              PERP
            </span>
            <div className="h-3.5 w-px mx-0.5 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
          </>
        )}

        {/* Quick intervals */}
        <div className="flex items-center gap-px">
          {QUICK_INTERVALS.map((iv) => (
            <button key={iv} onClick={() => setInterval(iv)}
              className={`px-2 py-[5px] text-[11px] rounded font-mono leading-none transition-all ${
                interval === iv
                  ? "bg-white/10 text-white font-bold"
                  : "text-white/40 hover:bg-white/5 hover:text-white/80"
              }`}>
              {iv}
            </button>
          ))}
        </div>

        {/* More intervals */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={`px-2 py-[5px] text-[11px] rounded font-mono leading-none inline-flex items-center gap-0.5 transition-all ${
              !QUICK_INTERVALS.includes(interval as any)
                ? "bg-white/10 text-white font-bold"
                : "text-white/40 hover:bg-white/5 hover:text-white/80"
            }`}>
              {!QUICK_INTERVALS.includes(interval as any) ? interval : "More"}<span className="text-[8px] opacity-50">▼</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-2 space-y-2">
            {INTERVAL_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1">{g.label}</div>
                <div className="grid grid-cols-3 gap-1">
                  {g.items.map((iv) => (
                    <button key={iv} onClick={() => setInterval(iv)}
                      className={`px-2 py-1 text-[11px] rounded font-mono transition-all ${
                        interval === iv ? "bg-primary/20 text-primary font-bold" : "bg-muted/30 hover:bg-muted/60 text-foreground"
                      }`}>{iv}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>

        <div className="h-3.5 w-px mx-1 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Chart types */}
        <div className="flex items-center gap-px">
          {CHART_KINDS.map((c) => {
            const Icon = c.icon; const active = kind === c.id;
            return (
              <button key={c.id} onClick={() => setKind(c.id)} title={c.label}
                className={`p-1.5 rounded transition-all text-[10px] font-bold ${
                  active ? "bg-white/10 text-white" : "text-white/35 hover:text-white/75 hover:bg-white/5"
                }`}>
                {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="font-mono">{c.text}</span>}
              </button>
            );
          })}
        </div>

        <div className="h-3.5 w-px mx-1 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Quick indicator pills */}
        <div className="flex items-center gap-0.5">
          {([
            { key: "volume" as const, label: "VOL",   color: "#089981" },
            { key: "rsi"    as const, label: "RSI",   color: "#fb923c" },
            { key: "macd"   as const, label: "MACD",  color: "#60a5fa" },
            { key: "stoch"  as const, label: "STOCH", color: "#4ade80" },
          ]).map(({ key, label, color }) => {
            const on = indicators[key];
            return (
              <button key={key}
                onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key] }))}
                className={`px-1.5 py-[3px] text-[10px] rounded font-mono font-semibold border transition-all ${
                  on ? "border-transparent text-black" : "text-white/30 hover:text-white/60"
                }`}
                style={on
                  ? { backgroundColor: color, borderColor: color, boxShadow: `0 0 8px ${color}50` }
                  : { borderColor: "rgba(255,255,255,0.1)" }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="h-3.5 w-px mx-1 shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Indicators popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="px-2 py-[5px] text-[11px] rounded inline-flex items-center gap-1.5 text-white/35 hover:text-white/75 hover:bg-white/5 transition-all">
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Indicators</span>
              {activeIndicatorCount > 0 && (
                <span className="text-[9px] px-1 rounded font-bold min-w-[1.1rem] text-center" style={{ background: "rgba(250,204,21,0.2)", color: "#facc15" }}>
                  {activeIndicatorCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2.5 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> SMA
              </div>
              <div className="grid grid-cols-3 gap-1">
                {SMA_DEFS.map((def) => {
                  const on = indicators[def.id];
                  return (
                    <button key={def.id} onClick={() => setIndicators((p) => ({ ...p, [def.id]: !p[def.id] }))}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all border ${on ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                      style={on ? { backgroundColor: def.color + "33", borderColor: def.color } : {}}>
                      <span className="h-0.5 w-3 rounded shrink-0" style={{ backgroundColor: def.color }} />
                      <span>{def.label.split(" ")[1]}</span>
                      {on && <Check className="h-2.5 w-2.5 ml-auto shrink-0" style={{ color: def.color }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">EMA</div>
              <div className="grid grid-cols-4 gap-1">
                {EMA_DEFS.map((def) => {
                  const on = indicators[def.id];
                  return (
                    <button key={def.id} onClick={() => setIndicators((p) => ({ ...p, [def.id]: !p[def.id] }))}
                      className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded text-[10px] transition-all border ${on ? "border-transparent" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
                      style={on ? { backgroundColor: def.color + "22", borderColor: def.color, color: def.color } : {}}>
                      <span className="h-0.5 w-4 rounded" style={{ backgroundColor: def.color }} />
                      <span className="font-mono">{def.period}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="h-px bg-border/60" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">Bands</div>
              <button onClick={() => setIndicators((p) => ({ ...p, bb: !p.bb }))}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-xs transition-colors">
                <span className="h-0.5 w-5 rounded" style={{ backgroundColor: BB_COLORS.upper }} />
                <span className="flex-1 text-left">Bollinger 20/2</span>
                {indicators.bb && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            </div>
            <div className="h-px bg-border/60" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1.5">Volume</div>
              {([
                { key: "volume" as const, label: "Volume Bars", color: "#22c55e" },
                { key: "vwap"   as const, label: "VWAP",        color: "#e879f9" },
              ]).map(({ key, label, color }) => (
                <button key={key} onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key] }))}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 text-xs transition-colors">
                  <span className="h-0.5 w-5 rounded" style={{ backgroundColor: color }} />
                  <span className="flex-1 text-left">{label}</span>
                  {indicators[key] && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Right-side utilities */}
        <div className="ml-auto flex items-center gap-px shrink-0">
          <button onClick={handleReset} title="Fit chart" className="p-1.5 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleScreenshot} title="Save chart" className="p-1.5 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="p-1.5 rounded text-white/30 hover:text-white/70 hover:bg-white/5 transition-all">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ══ MIDDLE: DRAWING SIDEBAR + CHART ═══════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ── Drawing tools sidebar ──────────────────────────────── */}
        <div className="flex flex-col items-center gap-0.5 px-1 py-2 shrink-0 w-9" style={{ background: "#10161e", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
          {DRAW_TOOLS.map(({ id, icon: Icon, label }) => (
            <button key={id} title={label}
              onClick={() => {
                setDrawTool((prev) => {
                  if (prev === id) { drawingStateRef.current = null; if (previewLineRef2.current) previewLineRef2.current.style.display = "none"; return "cursor"; }
                  drawingStateRef.current = null;
                  if (previewLineRef2.current) previewLineRef2.current.style.display = "none";
                  return id as DrawTool;
                });
              }}
              className={`w-full p-1.5 rounded transition-all flex items-center justify-center ${
                drawTool === id
                  ? "bg-white/10 text-white"
                  : "text-white/25 hover:text-white/70 hover:bg-white/5"
              }`}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}

          {/* Active drawings list */}
          {(hlines.length > 0 || trendLines.length > 0) && (
            <>
              <div className="h-px w-5 bg-border/60 my-1 shrink-0" />
              {hlines.map((h) => (
                <button key={h.id} onClick={() => removeHLine(h.id)}
                  title={`Remove${h.label ? " " + h.label : " line"} @ ${h.price.toFixed(2)}`}
                  className="w-5 h-[3px] rounded shrink-0 my-0.5 hover:brightness-150 transition-all"
                  style={{ backgroundColor: h.color + "cc" }} />
              ))}
              {trendLines.map((tl) => (
                <button key={tl.id}
                  onClick={() => setTrendLines((prev) => prev.filter((t) => t.id !== tl.id))}
                  title="Remove trend line"
                  className="w-5 h-[2px] rounded shrink-0 my-0.5 hover:brightness-150 transition-all"
                  style={{ backgroundColor: tl.color + "cc", transform: "rotate(-20deg)" }} />
              ))}
              <button onClick={removeAllDrawings} title="Clear all drawings"
                className="mt-1 p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-all">
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {/* ── Chart area ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0 relative">

            {/* OHLCV info bar — TradingView-style flat text overlay, no box */}
          {display && (
            <div className="absolute left-2 right-2 sm:left-3 sm:right-auto top-2 z-10 pointer-events-none select-none">
              {/* Mobile — compact single row */}
              <div className="flex items-center gap-x-1.5 sm:hidden text-[10px] font-mono" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                <span className="font-bold text-white/90">{base}<span className="text-white/40">/</span>{quote}</span>
                {kind === "heikinashi" && <span className="text-[8px] text-amber-400 font-bold">HA</span>}
                <span className="text-white/40">O</span><span className="text-white/80">{fmtPrice(display.open, quote === "INR" ? "INR" : "")}</span>
                <span className="text-white/40">H</span><span className="text-[#089981]">{fmtPrice(display.high, quote === "INR" ? "INR" : "")}</span>
                <span className="text-white/40">L</span><span className="text-[#f23645]">{fmtPrice(display.low, quote === "INR" ? "INR" : "")}</span>
                <span className="text-white/40">C</span><span className={displayPct >= 0 ? "text-[#089981]" : "text-[#f23645]"}>{fmtPrice(display.close, quote === "INR" ? "INR" : "")}</span>
                <span className={`font-semibold ${displayPct >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>{displayPct >= 0 ? "+" : ""}{displayPct.toFixed(2)}%</span>
              </div>
              {/* Desktop — full OHLCV row */}
              <div className="hidden sm:flex flex-wrap items-center gap-x-2.5 gap-y-0 text-[11px] font-mono leading-none" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                <span className="font-semibold text-white/85 tracking-tight mr-0.5">{base}<span className="text-white/30">/</span>{quote}</span>
                {kind === "heikinashi" && <span className="text-[9px] text-amber-400 font-bold">HA</span>}
                <span><span className="text-white/40">O </span><span className="text-white/75 tabular-nums">{fmtPrice(display.open, quote === "INR" ? "INR" : "")}</span></span>
                <span><span className="text-white/40">H </span><span className="text-[#089981] tabular-nums">{fmtPrice(display.high, quote === "INR" ? "INR" : "")}</span></span>
                <span><span className="text-white/40">L </span><span className="text-[#f23645] tabular-nums">{fmtPrice(display.low, quote === "INR" ? "INR" : "")}</span></span>
                <span><span className="text-white/40">C </span><span className={`tabular-nums ${displayPct >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>{fmtPrice(display.close, quote === "INR" ? "INR" : "")}</span></span>
                <span className={`font-semibold tabular-nums ${displayPct >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>{displayPct >= 0 ? "+" : ""}{displayPct.toFixed(2)}%</span>
                {display.volume > 0 && (
                  <span><span className="text-white/40">V </span><span className="text-white/55 tabular-nums">{fmtCompact(display.volume)}</span></span>
                )}
                {/* Active MA/EMA legend */}
                {MA_DEFS.filter((d) => indicators[d.id]).map((d) => {
                  const allDefs = [...SMA_DEFS, ...EMA_DEFS];
                  const defInfo = allDefs.find((x) => x.id === d.id);
                  if (!defInfo) return null;
                  const isEma = EMA_DEFS.some((e) => e.id === d.id);
                  const seriesRef = isEma ? emaSeriesRef.current[d.id] : smaSeriesRef.current[d.id];
                  if (!seriesRef || candlesRef.current.length === 0) return null;
                  const pts = isEma
                    ? calcEma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), defInfo.period)
                    : sma(candlesRef.current.map((c) => ({ time: c.time, close: c.close })), defInfo.period);
                  const lastVal = isEma
                    ? (pts.length > 0 ? (pts as { value: number }[])[pts.length - 1].value : 0)
                    : (pts.length > 0 ? (pts as LineData[])[pts.length - 1].value as number : 0);
                  if (!lastVal) return null;
                  return (
                    <span key={d.id} className="hidden md:inline-flex items-center gap-1">
                      <span className="h-0.5 w-3 rounded" style={{ backgroundColor: defInfo.color }} />
                      <span className="tabular-nums" style={{ color: defInfo.color }}>{fmtPrice(lastVal, "")}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Drawing mode hint banner */}
          {drawTool !== "cursor" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-primary/90 text-primary-foreground text-[10px] font-mono font-bold px-3 py-1 rounded-full shadow-lg backdrop-blur-sm">
                {drawTool === "hline"     && "Click chart to place horizontal line"}
                {drawTool === "trendline" && (drawingStateRef.current?.step === 1 ? "Click second point to complete trend line" : "Click first point to start trend line")}
                {drawTool === "alert"     && "Click chart to set price alert"}
                {drawTool === "eraser"    && "Click near a line to remove it"}
              </div>
            </div>
          )}

          {/* Chart canvas + SVG overlay */}
          <div className="flex-1 min-h-[280px] relative overflow-hidden">
            <div ref={containerRef} className="absolute inset-0" />

            {/* Loading skeleton — visible until chart seeds */}
            {!seedLoaded && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 pointer-events-none" style={{ background: "#0d1117" }}>
                <div className="flex items-end gap-1 h-20">
                  {[40,65,45,80,55,70,35,90,60,75,50,85].map((h,i) => (
                    <div key={i} className="w-4 rounded-sm animate-pulse" style={{ height: `${h}%`, background: i % 2 === 0 ? "rgba(8,153,129,0.25)" : "rgba(242,54,69,0.2)", animationDelay: `${i * 80}ms` }} />
                  ))}
                </div>
                <div className="text-white/20 text-[11px] font-mono tracking-widest animate-pulse">Loading chart…</div>
              </div>
            )}

            {/* Floating controls — bottom-center of chart */}
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 flex flex-row gap-1.5">
              {/* Refresh data */}
              <button
                onClick={handleRefreshData}
                title="Refresh chart data"
                className="flex items-center justify-center w-7 h-7 rounded transition-all hover:scale-110 active:scale-95"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
              {/* Fit / reset zoom */}
              <button
                onClick={handleReset}
                title="Fit chart to full history"
                className="flex items-center justify-center w-7 h-7 rounded transition-all hover:scale-110 active:scale-95"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* SVG overlay for trend lines */}
            <svg
              ref={overlayRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 4 }}
            >
              {/* Preview line (second point while hovering) */}
              <line
                ref={(el) => { previewLineRef2.current = el; }}
                stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="5 3"
                x1="0" y1="0" x2="0" y2="0" style={{ display: "none" }}
              />
              {/* Persisted trend lines */}
              {trendLines.map((tl) => (
                <line key={tl.id} data-tlid={tl.id}
                  x1="0" y1="0" x2="0" y2="0"
                  stroke={tl.color} strokeWidth="1.5"
                />
              ))}
            </svg>

            {/* Pane labels */}
            {(() => {
              const N = (indicators.rsi ? 1 : 0) + (indicators.macd ? 1 : 0) + (indicators.stoch ? 1 : 0);
              if (N === 0) return null;
              const mainH = N === 1 ? 66 : N === 2 ? 58 : 52;
              const subH  = (100 - mainH) / N;
              let idx = 0;
              const paneTop: Record<string, number> = {};
              if (indicators.rsi)   { paneTop.rsi   = mainH + idx * subH; idx++; }
              if (indicators.macd)  { paneTop.macd  = mainH + idx * subH; idx++; }
              if (indicators.stoch) { paneTop.stoch = mainH + idx * subH; }

              const PL = ({ top, color, bg, label, detail }: { top: number; color: string; bg: string; label: string; detail: string }) => (
                <div className="absolute left-2 z-10 pointer-events-none flex items-center gap-1.5" style={{ top: `calc(${top}% + 5px)` }}>
                  <div className="h-px w-full absolute -top-0.5 left-0" style={{ background: `linear-gradient(90deg, ${color}30, transparent)` }} />
                  <span className="text-[9px] font-mono font-bold px-1.5 py-[3px] rounded leading-none backdrop-blur-sm"
                    style={{ backgroundColor: bg, color, border: `1px solid ${color}35` }}>
                    {label}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground/60 hidden sm:inline leading-none">{detail}</span>
                </div>
              );

              return (
                <>
                  {indicators.rsi && <PL top={paneTop.rsi!} color="#fb923c" bg="rgba(251,146,60,0.10)" label="RSI 14" detail="overbought 70 · oversold 30" />}
                  {indicators.macd && <PL top={paneTop.macd!} color="#60a5fa" bg="rgba(96,165,250,0.10)" label="MACD 12·26·9" detail="MACD · Signal · Hist" />}
                  {indicators.stoch && <PL top={paneTop.stoch!} color="#4ade80" bg="rgba(74,222,128,0.10)" label="STOCH 14·3" detail="%K · %D · 80/20" />}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
