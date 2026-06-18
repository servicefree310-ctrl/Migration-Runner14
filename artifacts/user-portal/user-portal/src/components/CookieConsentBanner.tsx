import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Cookie, X, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "zbx_cookie_consent";
const CONSENT_VERSION = "v1";

type ConsentState = {
  version: string;
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

function getStoredConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeConsent(analytics: boolean, marketing: boolean) {
  const val: ConsentState = { version: CONSENT_VERSION, analytics, marketing, ts: Date.now() };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(val));
  // also set a 1-year cookie for SSR/middleware use
  document.cookie = `${CONSENT_KEY}=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    if (!getStoredConsent()) {
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    storeConsent(true, true);
    setVisible(false);
  };
  const rejectNonEssential = () => {
    storeConsent(false, false);
    setVisible(false);
  };
  const savePreferences = () => {
    storeConsent(analytics, marketing);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-[9999] p-3 sm:p-4 md:bottom-4 md:left-4 md:right-auto md:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center flex-shrink-0">
              <Cookie className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-foreground">We use cookies</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Strictly necessary ones are always on.</div>
            </div>
          </div>
          <button
            onClick={rejectNonEssential}
            aria-label="Reject and close"
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-3 text-[12px] text-muted-foreground leading-relaxed">
          We use cookies to keep you logged in, analyse traffic and show relevant content.{" "}
          <Link href="/legal/cookies" className="text-primary hover:underline">Cookie Policy</Link>
          {" & "}
          <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </div>

        {/* Expandable preferences */}
        {expanded && (
          <div className="mx-4 mb-3 rounded-xl border border-border/60 bg-background/60 p-3 space-y-2.5 text-sm">
            <CookieRow
              label="Strictly necessary"
              desc="Login session, security, language preference."
              checked={true}
              locked
              onChange={() => {}}
            />
            <CookieRow
              label="Analytics"
              desc="Page views and performance metrics (anonymised)."
              checked={analytics}
              onChange={setAnalytics}
            />
            <CookieRow
              label="Marketing"
              desc="Personalised offers and remarketing ads."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 px-4 pb-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-[12px] font-bold"
              onClick={acceptAll}
            >
              Accept All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-[12px]"
              onClick={rejectNonEssential}
            >
              Reject Optional
            </Button>
          </div>
          <button
            className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors py-0.5"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Hide preferences</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Customise preferences</>
            )}
          </button>
          {expanded && (
            <Button size="sm" variant="outline" className="h-9 text-[12px] border-primary/40 text-primary" onClick={savePreferences}>
              <Shield className="h-3.5 w-3.5 mr-1.5" /> Save my preferences
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CookieRow({
  label,
  desc,
  checked,
  locked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  locked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[12px] text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={locked}
        onClick={() => !locked && onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 mt-0.5 ${
          locked ? "opacity-50 cursor-not-allowed bg-success" : checked ? "bg-primary cursor-pointer" : "bg-muted cursor-pointer"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
