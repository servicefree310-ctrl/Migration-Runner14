/**
 * ZebvixLogo — reusable brand component.
 *
 * Variants:
 *   mark       — just the Z square mark
 *   wordmark   — Z mark + "ZEBVIX" text beside it
 *   stacked    — Z mark above "ZEBVIX" + tagline
 */
import { cn } from "@/lib/utils";

type Variant = "mark" | "wordmark" | "stacked";

interface ZebvixLogoProps {
  variant?: Variant;
  size?: number;
  className?: string;
  showDot?: boolean;
}

function ZMark({ size = 32, showDot = true }: { size: number; showDot?: boolean }) {
  const r = Math.round(size * 0.21);
  const sw = Math.round(size * 0.115);
  const pad = Math.round(size * 0.222);
  const dim = size;
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0, width: size, height: size }}
    >
      <defs>
        <linearGradient id="zbg" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#fcd34d"/>
          <stop offset="45%"  stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#b45309"/>
        </linearGradient>
        <linearGradient id="zshine" x1="0" y1="0" x2="180" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <filter id="zshadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.35"/>
        </filter>
      </defs>
      <rect width="180" height="180" rx="38" fill="url(#zbg)" filter="url(#zshadow)"/>
      <rect width="180" height="180" rx="38" fill="url(#zshine)"/>
      <path
        d="M 40 50 L 140 50 L 40 130 L 140 130"
        stroke="#09090b"
        strokeWidth="20"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      />
      {showDot && <circle cx="145" cy="145" r="9" fill="white" opacity="0.2"/>}
    </svg>
  );
}

export function ZebvixLogo({ variant = "wordmark", size = 32, className, showDot = true }: ZebvixLogoProps) {
  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)}>
        <ZMark size={size} showDot={showDot} />
      </span>
    );
  }

  if (variant === "stacked") {
    return (
      <span className={cn("inline-flex flex-col items-center gap-1.5", className)}>
        <ZMark size={size} showDot={showDot} />
        <span className="text-sm font-black tracking-[0.22em] uppercase" style={{ lineHeight: 1 }}>
          Zebvix
        </span>
        <span className="text-[9px] text-muted-foreground tracking-widest uppercase">
          India's premium exchange
        </span>
      </span>
    );
  }

  const textSize = Math.round(size * 0.625);
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ZMark size={size} showDot={showDot} />
      <span
        className="font-black tracking-tight"
        style={{ fontSize: textSize, lineHeight: 1 }}
      >
        Zebvix<span style={{ color: "#f59e0b" }}>.</span>
      </span>
    </span>
  );
}

export { ZMark };
