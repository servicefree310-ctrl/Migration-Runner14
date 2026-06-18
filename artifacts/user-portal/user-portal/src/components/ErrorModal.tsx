/**
 * ErrorModal — premium animated error overlay.
 * Supports: error (red), warning (amber), info (blue), validation (orange)
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, XCircle, Info, ShieldAlert, X } from "lucide-react";

const KEYFRAMES = `
@keyframes em-ring {
  from { stroke-dashoffset: 201; opacity: 0; }
  to   { stroke-dashoffset: 0;   opacity: 1; }
}
@keyframes em-icon {
  0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
  55%  { transform: scale(1.2) rotate(5deg);  opacity: 1; }
  100% { transform: scale(1) rotate(0deg);    opacity: 1; }
}
@keyframes em-card {
  from { transform: translateY(20px) scale(0.96); opacity: 0; }
  to   { transform: translateY(0) scale(1);       opacity: 1; }
}
@keyframes em-row {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes em-shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX(6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}
`;

export type ErrorKind = "error" | "warning" | "info" | "validation";

const KIND_CONFIG: Record<ErrorKind, {
  color: string;
  bg: string;
  border: string;
  glow: string;
  label: string;
  Icon: React.FC<any>;
}> = {
  error: {
    color: "#F87171",
    bg: "linear-gradient(145deg, #1a0a0a 0%, #200f0f 60%, #1a0a0a 100%)",
    border: "#F8717130",
    glow: "#F8717115",
    label: "Error",
    Icon: XCircle,
  },
  warning: {
    color: "#F59E0B",
    bg: "linear-gradient(145deg, #1a140a 0%, #20180a 60%, #1a140a 100%)",
    border: "#F59E0B30",
    glow: "#F59E0B15",
    label: "Warning",
    Icon: AlertTriangle,
  },
  info: {
    color: "#60A5FA",
    bg: "linear-gradient(145deg, #0a0f1a 0%, #0a1428 60%, #0a0f1a 100%)",
    border: "#60A5FA30",
    glow: "#60A5FA15",
    label: "Info",
    Icon: Info,
  },
  validation: {
    color: "#FB923C",
    bg: "linear-gradient(145deg, #1a110a 0%, #201508 60%, #1a110a 100%)",
    border: "#FB923C30",
    glow: "#FB923C15",
    label: "Invalid Input",
    Icon: ShieldAlert,
  },
};

function AnimatedErrorIcon({ color, Icon }: { color: string; Icon: React.FC<any> }) {
  return (
    <div
      className="relative w-20 h-20 mx-auto mb-5"
      style={{ animation: "em-shake 0.5s 0.4s ease both" }}
    >
      <svg viewBox="0 0 80 80" className="w-full h-full" fill="none">
        <circle cx="40" cy="40" r="36" fill={`${color}10`} />
        <circle cx="40" cy="40" r="32" fill={`${color}06`} />
        <circle cx="40" cy="40" r="30" stroke={`${color}30`} strokeWidth="1.5" />
        <circle
          cx="40" cy="40" r="30"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="189"
          strokeDashoffset="189"
          style={{
            animation: "em-ring 0.55s cubic-bezier(0.4,0,0.2,1) forwards",
            transformOrigin: "40px 40px",
            transform: "rotate(-90deg)",
          }}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: "em-icon 0.4s 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
      >
        <Icon className="w-8 h-8" style={{ color }} />
      </div>
    </div>
  );
}

export function ErrorModal({
  open,
  onClose,
  kind = "error",
  title,
  message,
  details,
  primaryLabel,
  onPrimary,
}: {
  open: boolean;
  onClose: () => void;
  kind?: ErrorKind;
  title?: string;
  message: string;
  details?: { label: string; value: string }[];
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  const cfg = KIND_CONFIG[kind];
  const displayTitle = title ?? cfg.label;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <style>{KEYFRAMES}</style>
      <DialogContent
        className="max-w-sm border-0 p-0 overflow-hidden gap-0"
        style={{
          background: cfg.bg,
          boxShadow: `0 0 60px ${cfg.glow}, 0 25px 60px rgba(0,0,0,0.85)`,
          border: `1px solid ${cfg.border}`,
          animation: "em-card 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />
        <div className="px-6 pt-6 pb-6">
          <AnimatedErrorIcon color={cfg.color} Icon={cfg.Icon} />

          <div className="text-center mb-4" style={{ animation: "em-row 0.3s 0.4s ease both", opacity: 0 }}>
            <h2 className="text-xl font-black tracking-tight mb-1.5" style={{ color: cfg.color }}>
              {displayTitle}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed font-medium">
              {message}
            </p>
          </div>

          {details && details.length > 0 && (
            <div
              className="rounded-xl border px-4 py-0.5 mb-4"
              style={{
                borderColor: `${cfg.color}22`,
                background: `${cfg.color}07`,
                animation: "em-row 0.3s 0.5s ease both",
                opacity: 0,
              }}
            >
              {details.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0"
                >
                  <span className="text-[11px] text-muted-foreground uppercase tracking-widest font-medium">{d.label}</span>
                  <span className="text-xs font-bold font-mono text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className="flex gap-2 mt-4"
            style={{ animation: "em-row 0.3s 0.55s ease both", opacity: 0 }}
          >
            {onPrimary && (
              <Button
                className="flex-1 h-9 text-xs font-bold gap-1.5"
                style={{ background: cfg.color, color: "#000" }}
                onClick={() => { onPrimary(); onClose(); }}
              >
                {primaryLabel ?? "Try Again"}
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs border-white/10 gap-1.5"
              onClick={onClose}
            >
              <X className="w-3.5 h-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
