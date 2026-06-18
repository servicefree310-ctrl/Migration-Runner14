/**
 * ZebvixMark — inline SVG logo for admin panel.
 * No external asset dependency; renders at any size crisply.
 */
export function ZebvixMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Zebvix"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="zbg-admin" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#fcd34d"/>
          <stop offset="45%"  stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#b45309"/>
        </linearGradient>
        <linearGradient id="zshine-admin" x1="0" y1="0" x2="180" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <filter id="zshadow-admin" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#f59e0b" floodOpacity="0.4"/>
        </filter>
      </defs>
      <rect width="180" height="180" rx="38" fill="url(#zbg-admin)" filter="url(#zshadow-admin)"/>
      <rect width="180" height="180" rx="38" fill="url(#zshine-admin)"/>
      <path
        d="M 40 50 L 140 50 L 40 130 L 140 130"
        stroke="#09090b"
        strokeWidth="20"
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      />
      <circle cx="145" cy="145" r="9" fill="white" opacity="0.2"/>
    </svg>
  );
}
