import { Globe, AlertTriangle, Mail, ExternalLink, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const COUNTRY_FLAGS: Record<string, string> = {
  AF:"🇦🇫",AL:"🇦🇱",DZ:"🇩🇿",AO:"🇦🇴",AR:"🇦🇷",AM:"🇦🇲",AU:"🇦🇺",AT:"🇦🇹",AZ:"🇦🇿",
  BH:"🇧🇭",BD:"🇧🇩",BY:"🇧🇾",BE:"🇧🇪",BZ:"🇧🇿",BJ:"🇧🇯",BT:"🇧🇹",BO:"🇧🇴",BA:"🇧🇦",
  BW:"🇧🇼",BR:"🇧🇷",BN:"🇧🇳",BG:"🇧🇬",BF:"🇧🇫",BI:"🇧🇮",CV:"🇨🇻",KH:"🇰🇭",CM:"🇨🇲",
  CA:"🇨🇦",CF:"🇨🇫",TD:"🇹🇩",CL:"🇨🇱",CN:"🇨🇳",CO:"🇨🇴",KM:"🇰🇲",CD:"🇨🇩",CG:"🇨🇬",
  CR:"🇨🇷",CI:"🇨🇮",HR:"🇭🇷",CU:"🇨🇺",CY:"🇨🇾",CZ:"🇨🇿",DK:"🇩🇰",DJ:"🇩🇯",DO:"🇩🇴",
  EC:"🇪🇨",EG:"🇪🇬",SV:"🇸🇻",GQ:"🇬🇶",ER:"🇪🇷",EE:"🇪🇪",SZ:"🇸🇿",ET:"🇪🇹",FJ:"🇫🇯",
  FI:"🇫🇮",FR:"🇫🇷",GA:"🇬🇦",GM:"🇬🇲",GE:"🇬🇪",DE:"🇩🇪",GH:"🇬🇭",GR:"🇬🇷",GT:"🇬🇹",
  GN:"🇬🇳",GW:"🇬🇼",GY:"🇬🇾",HT:"🇭🇹",HN:"🇭🇳",HU:"🇭🇺",IS:"🇮🇸",IN:"🇮🇳",ID:"🇮🇩",
  IR:"🇮🇷",IQ:"🇮🇶",IE:"🇮🇪",IL:"🇮🇱",IT:"🇮🇹",JM:"🇯🇲",JP:"🇯🇵",JO:"🇯🇴",KZ:"🇰🇿",
  KE:"🇰🇪",KI:"🇰🇮",KW:"🇰🇼",KG:"🇰🇬",LA:"🇱🇦",LV:"🇱🇻",LB:"🇱🇧",LS:"🇱🇸",LR:"🇱🇷",
  LY:"🇱🇾",LI:"🇱🇮",LT:"🇱🇹",LU:"🇱🇺",MG:"🇲🇬",MW:"🇲🇼",MY:"🇲🇾",MV:"🇲🇻",ML:"🇲🇱",
  MT:"🇲🇹",MH:"🇲🇭",MR:"🇲🇷",MU:"🇲🇺",MX:"🇲🇽",FM:"🇫🇲",MD:"🇲🇩",MC:"🇲🇨",MN:"🇲🇳",
  ME:"🇲🇪",MA:"🇲🇦",MZ:"🇲🇿",MM:"🇲🇲",NA:"🇳🇦",NR:"🇳🇷",NP:"🇳🇵",NL:"🇳🇱",NZ:"🇳🇿",
  NI:"🇳🇮",NE:"🇳🇪",NG:"🇳🇬",NO:"🇳🇴",OM:"🇴🇲",PK:"🇵🇰",PW:"🇵🇼",PA:"🇵🇦",PG:"🇵🇬",
  PY:"🇵🇾",PE:"🇵🇪",PH:"🇵🇭",PL:"🇵🇱",PT:"🇵🇹",QA:"🇶🇦",RO:"🇷🇴",RU:"🇷🇺",RW:"🇷🇼",
  KN:"🇰🇳",LC:"🇱🇨",VC:"🇻🇨",WS:"🇼🇸",SM:"🇸🇲",ST:"🇸🇹",SA:"🇸🇦",SN:"🇸🇳",RS:"🇷🇸",
  SC:"🇸🇨",SL:"🇸🇱",SG:"🇸🇬",SK:"🇸🇰",SI:"🇸🇮",SB:"🇸🇧",SO:"🇸🇴",ZA:"🇿🇦",SS:"🇸🇸",
  ES:"🇪🇸",LK:"🇱🇰",SD:"🇸🇩",SR:"🇸🇷",SE:"🇸🇪",CH:"🇨🇭",SY:"🇸🇾",TW:"🇹🇼",TJ:"🇹🇯",
  TZ:"🇹🇿",TH:"🇹🇭",TL:"🇹🇱",TG:"🇹🇬",TO:"🇹🇴",TT:"🇹🇹",TN:"🇹🇳",TR:"🇹🇷",TM:"🇹🇲",
  TV:"🇹🇻",UG:"🇺🇬",UA:"🇺🇦",AE:"🇦🇪",GB:"🇬🇧",US:"🇺🇸",UY:"🇺🇾",UZ:"🇺🇿",VU:"🇻🇺",
  VE:"🇻🇪",VN:"🇻🇳",YE:"🇾🇪",ZM:"🇿🇲",ZW:"🇿🇼",KP:"🇰🇵",
};

export interface GeoBlockModalProps {
  countryCode: string;
  countryName: string;
}

export function GeoBlockModal({ countryCode, countryName }: GeoBlockModalProps) {
  const flag = COUNTRY_FLAGS[countryCode] ?? "🌍";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(ellipse at 50% 40%, rgba(var(--primary-rgb,251,191,36),0.08) 0%, rgba(0,0,0,0.92) 70%)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-primary/10 blur-3xl animate-pulse" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-rose-500/10 blur-3xl animate-pulse" style={{ animationDelay: "1.2s" }} />
        <div className="absolute bottom-0 right-1/4 h-64 w-64 rounded-full bg-blue-500/08 blur-3xl animate-pulse" style={{ animationDelay: "0.6s" }} />
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl border border-border/60 bg-card/95 shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 0 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)" }}
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

        <div className="p-8 text-center">
          {/* Globe icon with country flag */}
          <div className="relative mx-auto mb-6 w-20 h-20">
            <div className="absolute inset-0 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <Globe className="h-8 w-8 text-rose-400" />
            </div>
            <span
              className="absolute -bottom-1 -right-1 text-3xl leading-none"
              role="img"
              aria-label={countryName}
            >
              {flag}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">
            Service Unavailable
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-1">
            <span className="font-semibold text-foreground">{flag} {countryName}</span>
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Zebvix Exchange is not available in your region due to local
            regulatory requirements or international compliance obligations.
          </p>

          {/* Divider */}
          <div className="my-6 border-t border-border/60" />

          {/* Notice box */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-4 text-left space-y-2 mb-6">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-0.5">Regulatory Notice</p>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Zebvix is registered with <span className="font-medium">FIU-IND</span> under PMLA 2002 and
                  complies with FATF recommendations, UN Security Council sanctions, and
                  applicable international AML/CFT standards. Access from certain
                  jurisdictions is restricted by law.
                </p>
              </div>
            </div>
          </div>

          {/* Compliance badges */}
          <div className="flex justify-center gap-3 mb-6">
            {["FATF Compliant", "OFAC Screened", "FIU-IND Registered"].map(b => (
              <span
                key={b}
                className="inline-flex items-center gap-1 rounded-full bg-muted/60 border border-border/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
              >
                <Shield className="h-2.5 w-2.5" />
                {b}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-10 text-sm border-border/60 hover:bg-muted/40"
              asChild
            >
              <a href="mailto:compliance@zebvix.com" className="flex items-center justify-center gap-2">
                <Mail className="h-4 w-4" />
                Contact Compliance Team
              </a>
            </Button>
            <a
              href="/user/legal/aml"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View our AML / Sanctions Policy
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-8 pb-5 text-center">
          <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
            If you believe this is an error, please contact{" "}
            <a href="mailto:support@zebvix.com" className="underline hover:text-muted-foreground">
              support@zebvix.com
            </a>
            . Using a VPN or proxy to circumvent geo-restrictions may violate our{" "}
            <a href="/user/legal/terms" className="underline hover:text-muted-foreground">
              Terms of Service
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
