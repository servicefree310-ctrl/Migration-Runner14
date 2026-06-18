/**
 * ConfirmModal — premium animated confirmation dialog.
 * Used for destructive or important actions (cancel order, withdraw, etc.)
 */
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, LogOut, XCircle, CheckCircle2, LucideIcon } from "lucide-react";

const KEYFRAMES = `
@keyframes cf-ring {
  from { stroke-dashoffset: 201; opacity: 0; }
  to   { stroke-dashoffset: 0;   opacity: 1; }
}
@keyframes cf-icon {
  0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
  60%  { transform: scale(1.15) rotate(3deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg);   opacity: 1; }
}
@keyframes cf-card {
  from { transform: translateY(20px) scale(0.96); opacity: 0; }
  to   { transform: translateY(0) scale(1);       opacity: 1; }
}
@keyframes cf-row {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

export type ConfirmKind = "danger" | "warning" | "info";

const KIND_CONFIG: Record<ConfirmKind, {
  color: string;
  bg: string;
  confirmStyle: React.CSSProperties;
  Icon: LucideIcon;
}> = {
  danger: {
    color: "#F87171",
    bg: "linear-gradient(145deg, #1a0a0a 0%, #1e0e0e 60%, #1a0a0a 100%)",
    confirmStyle: { background: "#F87171", color: "#000" },
    Icon: Trash2,
  },
  warning: {
    color: "#F59E0B",
    bg: "linear-gradient(145deg, #1a140a 0%, #1e1808 60%, #1a140a 100%)",
    confirmStyle: { background: "#F59E0B", color: "#000" },
    Icon: AlertTriangle,
  },
  info: {
    color: "#60A5FA",
    bg: "linear-gradient(145deg, #0a0f1a 0%, #0a1220 60%, #0a0f1a 100%)",
    confirmStyle: { background: "#60A5FA", color: "#000" },
    Icon: CheckCircle2,
  },
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  kind = "warning",
  title,
  message,
  details,
  confirmLabel,
  cancelLabel,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  kind?: ConfirmKind;
  title: string;
  message: string;
  details?: { label: string; value: string }[];
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}) {
  const cfg = KIND_CONFIG[kind];
  const Icon = cfg.Icon;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <style>{KEYFRAMES}</style>
      <DialogContent
        className="max-w-sm border-0 p-0 overflow-hidden gap-0"
        style={{
          background: cfg.bg,
          boxShadow: `0 0 60px ${cfg.color}10, 0 25px 60px rgba(0,0,0,0.85)`,
          border: `1px solid ${cfg.color}28`,
          animation: "cf-card 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
        }}
      >
        <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />
        <div className="px-6 pt-6 pb-6">
          <div
            className="relative w-16 h-16 mx-auto mb-5"
          >
            <svg viewBox="0 0 64 64" className="w-full h-full" fill="none">
              <circle cx="32" cy="32" r="28" fill={`${cfg.color}10`} />
              <circle cx="32" cy="32" r="23" fill={`${cfg.color}06`} />
              <circle
                cx="32" cy="32" r="23"
                stroke={cfg.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="145"
                strokeDashoffset="145"
                style={{
                  animation: "cf-ring 0.5s cubic-bezier(0.4,0,0.2,1) forwards",
                  transformOrigin: "32px 32px",
                  transform: "rotate(-90deg)",
                }}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ animation: "cf-icon 0.4s 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
            >
              <Icon className="w-7 h-7" style={{ color: cfg.color }} />
            </div>
          </div>

          <div className="text-center mb-4" style={{ animation: "cf-row 0.3s 0.38s ease both", opacity: 0 }}>
            <h2 className="text-xl font-black tracking-tight mb-1.5" style={{ color: cfg.color }}>
              {title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
          </div>

          {details && details.length > 0 && (
            <div
              className="rounded-xl border px-4 py-0.5 mb-4"
              style={{
                borderColor: `${cfg.color}22`,
                background: `${cfg.color}07`,
                animation: "cf-row 0.3s 0.44s ease both",
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
            style={{ animation: "cf-row 0.3s 0.5s ease both", opacity: 0 }}
          >
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs border-white/10"
              onClick={onClose}
              disabled={loading}
            >
              {cancelLabel ?? "Cancel"}
            </Button>
            <Button
              className="flex-1 h-9 text-xs font-bold"
              style={cfg.confirmStyle}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "Processing…" : (confirmLabel ?? "Confirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
