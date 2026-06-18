import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, post } from "@/lib/api";
import { PageHeader } from "@/components/premium/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings, Save, ChevronDown, ChevronRight, Eye, EyeOff,
  Globe, Zap, Banknote, CreditCard, Share2, BarChart3, RefreshCw,
  ShieldCheck, CheckCircle2, Loader2, Search, X, AlertTriangle, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── World countries list ────────────────────────────────────────────────────
const ALL_COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" }, { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" }, { code: "AO", name: "Angola" },
  { code: "AR", name: "Argentina" }, { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" }, { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" }, { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" }, { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" }, { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" }, { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" }, { code: "BA", name: "Bosnia & Herzegovina" },
  { code: "BW", name: "Botswana" }, { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" }, { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" }, { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodia" }, { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" }, { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" }, { code: "CL", name: "Chile" },
  { code: "CN", name: "China" }, { code: "CO", name: "Colombia" },
  { code: "CD", name: "Congo, DR" }, { code: "CG", name: "Congo, Republic" },
  { code: "CR", name: "Costa Rica" }, { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" }, { code: "CU", name: "Cuba" },
  { code: "CY", name: "Cyprus" }, { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" }, { code: "DJ", name: "Djibouti" },
  { code: "DO", name: "Dominican Republic" }, { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" }, { code: "SV", name: "El Salvador" },
  { code: "ER", name: "Eritrea" }, { code: "EE", name: "Estonia" },
  { code: "ET", name: "Ethiopia" }, { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" }, { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" }, { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" }, { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" }, { code: "GR", name: "Greece" },
  { code: "GT", name: "Guatemala" }, { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" }, { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" }, { code: "HN", name: "Honduras" },
  { code: "HK", name: "Hong Kong" }, { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" }, { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" }, { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" }, { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" }, { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" }, { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" }, { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" }, { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" }, { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" }, { code: "LB", name: "Lebanon" },
  { code: "LY", name: "Libya" }, { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" }, { code: "LU", name: "Luxembourg" },
  { code: "MG", name: "Madagascar" }, { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" }, { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" }, { code: "MT", name: "Malta" },
  { code: "MR", name: "Mauritania" }, { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" }, { code: "MD", name: "Moldova" },
  { code: "MN", name: "Mongolia" }, { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" }, { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" }, { code: "NA", name: "Namibia" },
  { code: "NP", name: "Nepal" }, { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" }, { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" }, { code: "NG", name: "Nigeria" },
  { code: "KP", name: "North Korea" }, { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" }, { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" }, { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" }, { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" }, { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" }, { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" }, { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" }, { code: "RW", name: "Rwanda" },
  { code: "SA", name: "Saudi Arabia" }, { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" }, { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" }, { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" }, { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" }, { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" }, { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" }, { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" }, { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" }, { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" }, { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" }, { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" }, { code: "TT", name: "Trinidad & Tobago" },
  { code: "TN", name: "Tunisia" }, { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" }, { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" }, { code: "AE", name: "UAE" },
  { code: "GB", name: "United Kingdom" }, { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" }, { code: "UZ", name: "Uzbekistan" },
  { code: "VE", name: "Venezuela" }, { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" }, { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

// Countries flagged under FATF/UN sanctions — shown with warning badge
const SANCTIONED_CODES = new Set(["IR","KP","SY","CU","SD","LY","SO","YE","BY","MM","RU","VE"]);

const SECTIONS: {
  label: string;
  icon: typeof Settings;
  description: string;
  keys: { key: string; label: string; type?: "boolean" | "number" | "secret" | "textarea"; hint?: string }[];
}[] = [
  {
    label: "Identity",
    icon: Globe,
    description: "Exchange name, tagline, and contact info",
    keys: [
      { key: "exchange_name",     label: "Exchange Name" },
      { key: "exchange_short",    label: "Short Name" },
      { key: "exchange_tagline",  label: "Tagline" },
      { key: "support_email",     label: "Support Email" },
      { key: "support_phone",     label: "Support Phone" },
      { key: "announcement_text", label: "Announcement Banner", type: "textarea" },
    ],
  },
  {
    label: "Features",
    icon: Zap,
    description: "Enable or disable platform features",
    keys: [
      { key: "maintenance_mode",        label: "Maintenance Mode",       type: "boolean", hint: "Disables all trading — shows maintenance page to users" },
      { key: "registration_enabled",    label: "Registration Enabled",   type: "boolean" },
      { key: "spot_enabled",            label: "Spot Trading",           type: "boolean" },
      { key: "futures_enabled",         label: "Futures Trading",        type: "boolean" },
      { key: "earn_enabled",            label: "Earn Products",          type: "boolean" },
      { key: "ai_trading_enabled",      label: "AI Trading",             type: "boolean" },
      { key: "inr_deposits_enabled",    label: "INR Deposits",           type: "boolean" },
      { key: "inr_withdrawals_enabled", label: "INR Withdrawals",        type: "boolean" },
      { key: "referral_enabled",        label: "Referral System",        type: "boolean" },
    ],
  },
  {
    label: "INR & Fees",
    icon: Banknote,
    description: "INR rate, deposit/withdrawal limits and tax settings",
    keys: [
      { key: "inr_rate",            label: "INR/USD Rate",      type: "number", hint: "e.g. 83.5 — used for display conversions" },
      { key: "min_inr_deposit",     label: "Min INR Deposit",   type: "number" },
      { key: "max_inr_deposit",     label: "Max INR Deposit",   type: "number" },
      { key: "min_inr_withdrawal",  label: "Min INR Withdrawal",type: "number" },
      { key: "max_inr_withdrawal",  label: "Max INR Withdrawal",type: "number" },
      { key: "tds_enabled",         label: "TDS Enabled",       type: "boolean", hint: "India 1% TDS on crypto transactions" },
      { key: "tds_rate",            label: "TDS Rate %",        type: "number",  hint: "e.g. 1 for 1%" },
    ],
  },
  {
    label: "Payment Details",
    icon: CreditCard,
    description: "UPI ID and bank account for INR deposits",
    keys: [
      { key: "upi_id",               label: "UPI ID" },
      { key: "bank_name",            label: "Bank Name" },
      { key: "bank_account_number",  label: "Account Number" },
      { key: "bank_ifsc",            label: "IFSC Code" },
      { key: "bank_account_holder",  label: "Account Holder Name" },
    ],
  },
  {
    label: "Razorpay",
    icon: ShieldCheck,
    description: "Payment gateway credentials",
    keys: [
      { key: "razorpay_key_id",         label: "Razorpay Key ID" },
      { key: "razorpay_key_secret",     label: "Razorpay Key Secret",     type: "secret" },
      { key: "razorpay_webhook_secret", label: "Razorpay Webhook Secret", type: "secret" },
    ],
  },
  {
    label: "Social Media",
    icon: Share2,
    description: "Platform social media profile links",
    keys: [
      { key: "social_twitter",   label: "Twitter / X URL" },
      { key: "social_telegram",  label: "Telegram URL" },
      { key: "social_instagram", label: "Instagram URL" },
      { key: "social_youtube",   label: "YouTube URL" },
      { key: "social_linkedin",  label: "LinkedIn URL" },
    ],
  },
];

// ─── Geo Restrictions Component ───────────────────────────────────────────────
interface GeoConfig {
  mode: "blocklist" | "allowlist";
  blockedCountries: string[];
  allowedCountries: string[];
}

function GeoRestrictionsSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const { data: siteConfig } = useQuery<{ geo?: GeoConfig }>({
    queryKey: ["site-config-geo"],
    queryFn: () => get<{ geo?: GeoConfig }>("/content/site-config"),
    staleTime: 30_000,
  });

  const serverGeo: GeoConfig = useMemo(() => ({
    mode: siteConfig?.geo?.mode ?? "blocklist",
    blockedCountries: siteConfig?.geo?.blockedCountries ?? [],
    allowedCountries: siteConfig?.geo?.allowedCountries ?? [],
  }), [siteConfig]);

  const [localGeo, setLocalGeo] = useState<GeoConfig | null>(null);
  const geo = localGeo ?? serverGeo;

  const isDirty = localGeo !== null;

  const saveGeoMutation = useMutation({
    mutationFn: (value: GeoConfig) =>
      put<void>("/admin/settings/site.geo", { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-config-geo"] });
      setLocalGeo(null);
      toast.success("Geo restrictions saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save geo settings"),
  });

  const toggleCountry = (code: string) => {
    const current = localGeo ?? serverGeo;
    const field = current.mode === "blocklist" ? "blockedCountries" : "allowedCountries";
    const list = current[field];
    const next = list.includes(code) ? list.filter(c => c !== code) : [...list, code];
    setLocalGeo({ ...current, [field]: next });
  };

  const setMode = (mode: "blocklist" | "allowlist") => {
    setLocalGeo({ ...geo, mode });
  };

  const clearAll = () => {
    setLocalGeo({ ...geo, blockedCountries: [], allowedCountries: [] });
  };

  const selectSanctioned = () => {
    const sanctionedList = ALL_COUNTRIES.filter(c => SANCTIONED_CODES.has(c.code)).map(c => c.code);
    setLocalGeo({ ...geo, blockedCountries: sanctionedList });
  };

  const activeField = geo.mode === "blocklist" ? "blockedCountries" : "allowedCountries";
  const activeList = geo[activeField];

  const filtered = useMemo(() =>
    ALL_COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
    ),
    [search]
  );

  return (
    <div className={cn(
      "rounded-xl border bg-card/50 overflow-hidden transition-all",
      isDirty ? "border-amber-500/40" : "border-border",
    )}>
      {/* Section header */}
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center border",
            isDirty ? "bg-amber-500/15 border-amber-500/30" : "bg-muted/40 border-border",
          )}>
            <MapPin className={cn("w-4 h-4", isDirty ? "text-amber-400" : "text-muted-foreground")} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Geo Restrictions</span>
              {isDirty && (
                <Badge className="h-4 px-1.5 text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                  unsaved
                </Badge>
              )}
              {activeList.length > 0 && (
                <Badge className="h-4 px-1.5 text-[9px] bg-rose-500/20 text-rose-400 border-rose-500/30">
                  {activeList.length} {geo.mode === "blocklist" ? "blocked" : "allowed"}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Block or restrict access by country. Users from blocked countries see a compliance notice.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!collapsed && isDirty && (
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={e => { e.stopPropagation(); saveGeoMutation.mutate(geo); }}
              disabled={saveGeoMutation.isPending}
            >
              {saveGeoMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
          )}
          {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border/60 px-5 py-5 space-y-5">
          {/* Mode selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Restriction Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["blocklist", "allowlist"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-all",
                    geo.mode === m
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border bg-muted/20 text-muted-foreground hover:border-border/80",
                  )}
                >
                  <div className="text-sm font-semibold capitalize">{m}</div>
                  <div className="text-[11px] mt-0.5 leading-relaxed">
                    {m === "blocklist"
                      ? "Block specific countries — everyone else has access"
                      : "Allow only specific countries — everyone else is blocked"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Sanctioned countries shortcut */}
          <div className="rounded-lg bg-amber-500/8 border border-amber-500/25 p-3.5 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-300 mb-1">FATF / UN Sanctioned Countries</p>
              <p className="text-[11px] text-amber-200/70 leading-relaxed mb-2.5">
                Quickly add all FATF blacklisted and UN-sanctioned jurisdictions (Iran, North Korea, Syria, Russia, Belarus, Myanmar, Cuba, Sudan, Libya, Somalia, Yemen, Venezuela) to the blocked list.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/15"
                  onClick={selectSanctioned}
                >
                  Add Sanctioned Countries
                </Button>
                {activeList.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearAll}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Country list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {geo.mode === "blocklist" ? "Blocked Countries" : "Allowed Countries"}
                {activeList.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">({activeList.length} selected)</span>
                )}
              </Label>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search countries..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Country grid */}
            <div className="h-72 overflow-y-auto rounded-lg border border-border/60 bg-muted/10 p-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
                {filtered.map(country => {
                  const isSelected = activeList.includes(country.code);
                  const isSanctioned = SANCTIONED_CODES.has(country.code);
                  return (
                    <button
                      key={country.code}
                      onClick={() => toggleCountry(country.code)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-all text-sm",
                        isSelected
                          ? geo.mode === "blocklist"
                            ? "bg-rose-500/15 border border-rose-500/30 text-rose-200"
                            : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
                          : "hover:bg-muted/40 border border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded flex items-center justify-center border shrink-0",
                        isSelected
                          ? geo.mode === "blocklist"
                            ? "bg-rose-500 border-rose-400"
                            : "bg-emerald-500 border-emerald-400"
                          : "border-border bg-muted/30",
                      )}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/70 w-6 shrink-0">{country.code}</span>
                      <span className="flex-1 truncate text-xs">{country.name}</span>
                      {isSanctioned && (
                        <span className="text-[9px] text-amber-400 bg-amber-500/15 border border-amber-500/25 rounded px-1 py-0.5 shrink-0">
                          FATF
                        </span>
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                    No countries match "{search}"
                  </div>
                )}
              </div>
            </div>

            {/* Selected chips */}
            {activeList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activeList.map(code => {
                  const country = ALL_COUNTRIES.find(c => c.code === code);
                  return (
                    <span
                      key={code}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
                        geo.mode === "blocklist"
                          ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                          : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
                      )}
                    >
                      {country?.name ?? code}
                      <button
                        onClick={() => toggleCountry(code)}
                        className="opacity-70 hover:opacity-100 ml-0.5"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2 border-t border-border/60">
            <div className="flex items-center gap-3">
              {isDirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setLocalGeo(null)}
                >
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => saveGeoMutation.mutate(geo)}
                disabled={saveGeoMutation.isPending || !isDirty}
              >
                {saveGeoMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                  : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Geo Restrictions</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Referral Settings Section ────────────────────────────────────────────────
interface ReferralConfig {
  enabled: boolean;
  registrationBonus: number;
  trading: Record<string, number>;
  ai:      Record<string, number>;
  earn:    Record<string, number>;
}

const DEFAULT_REFERRAL: ReferralConfig = {
  enabled: true, registrationBonus: 1.0,
  trading: { "1": 30, "2": 15, "3": 8, "4": 4, "5": 2 },
  ai:      { "1": 5,  "2": 3,  "3": 2, "4": 1, "5": 0.5 },
  earn:    { "1": 3,  "2": 2,  "3": 1, "4": 0.5, "5": 0.25 },
};

const LEVELS = [1, 2, 3, 4, 5] as const;

function ReferralSettingsSection() {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState<ReferralConfig | null>(null);

  const { data: server } = useQuery<ReferralConfig>({
    queryKey: ["referral-settings"],
    queryFn: () => get<ReferralConfig>("/admin/referral-settings"),
    staleTime: 30_000,
  });

  const cfg   = draft ?? server ?? DEFAULT_REFERRAL;
  const dirty = draft !== null;

  const saveMut = useMutation({
    mutationFn: (c: ReferralConfig) => put<unknown>("/admin/referral-settings", c),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referral-settings"] });
      setDraft(null);
      toast.success("Referral settings saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const setTop = (k: keyof ReferralConfig, v: unknown) =>
    setDraft(d => ({ ...(d ?? server ?? DEFAULT_REFERRAL), [k]: v }));

  const setLevel = (type: "trading" | "ai" | "earn", level: number, v: number) =>
    setDraft(d => {
      const base = d ?? server ?? DEFAULT_REFERRAL;
      return { ...base, [type]: { ...base[type], [String(level)]: v } };
    });

  const numInput = (
    type: "trading" | "ai" | "earn",
    level: number,
  ) => (
    <Input
      type="number"
      min={0} max={100} step={0.1}
      className="h-8 w-20 text-xs text-right"
      value={cfg[type][String(level)] ?? 0}
      onChange={e => setLevel(type, level, parseFloat(e.target.value) || 0)}
    />
  );

  return (
    <div className={cn(
      "rounded-xl border bg-card/50 overflow-hidden transition-all",
      dirty ? "border-amber-500/40" : "border-border",
    )}>
      <button
        onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center border",
            dirty ? "bg-amber-500/15 border-amber-500/30" : "bg-muted/40 border-border",
          )}>
            <BarChart3 className={cn("w-4 h-4", dirty ? "text-amber-400" : "text-muted-foreground")} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Referral Commission</span>
              {dirty && (
                <Badge className="h-4 px-1.5 text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">unsaved</Badge>
              )}
              {!cfg.enabled && (
                <Badge className="h-4 px-1.5 text-[9px] bg-rose-500/20 text-rose-400 border-rose-500/30">disabled</Badge>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              5-level commission for Spot, Futures, AI Trading, Earn rewards — admin-configurable rates
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!collapsed && dirty && (
            <Button
              variant="default" size="sm" className="h-7 px-2.5 text-xs"
              onClick={e => { e.stopPropagation(); saveMut.mutate(cfg); }}
              disabled={saveMut.isPending}
            >
              {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" />Save</>}
            </Button>
          )}
          {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border/60 px-5 py-5 space-y-6">
          {/* Global toggle + registration bonus */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
              <Switch
                checked={cfg.enabled}
                onCheckedChange={v => setTop("enabled", v)}
              />
              <div>
                <Label className="text-sm font-medium">Referral System Active</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  When off, zero commissions are paid for any trade/AI/earn event
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
              <Label className="text-sm font-medium">Registration Bonus (USDT)</Label>
              <p className="text-[11px] text-muted-foreground mb-2">
                One-time USDT credited to direct referrer when their invitee signs up
              </p>
              <Input
                type="number" min={0} max={1000} step={0.01}
                className="h-8 w-32 text-xs"
                value={cfg.registrationBonus}
                onChange={e => setTop("registrationBonus", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Commission rate tables */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-16">Level</th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">
                    Spot + Futures<br/>
                    <span className="font-normal opacity-70">% of trade fee</span>
                  </th>
                  <th className="text-right px-4 py-2 font-semibold text-muted-foreground">
                    AI Trading<br/>
                    <span className="font-normal opacity-70">% of AI profit</span>
                  </th>
                  <th className="text-right pl-4 py-2 font-semibold text-muted-foreground">
                    Earn Rewards<br/>
                    <span className="font-normal opacity-70">% of interest</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map(l => (
                  <tr key={l} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted/40 border border-border/60 font-bold text-foreground">
                        {l}
                      </span>
                    </td>
                    <td className="text-right px-4 py-2">{numInput("trading", l)}</td>
                    <td className="text-right px-4 py-2">{numInput("ai", l)}</td>
                    <td className="text-right pl-4 py-2">{numInput("earn", l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              onClick={() => saveMut.mutate(cfg)}
              disabled={!dirty || saveMut.isPending}
              size="sm"
            >
              {saveMut.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Referral Settings</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ExchangeSettings() {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());

  const { data: serverSettings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["exchange-settings"],
    queryFn: () => get<Record<string, string>>("/admin/exchange-settings"),
    staleTime: 60_000,
  });

  const settings: Record<string, string> = useMemo(() => ({
    ...(serverSettings ?? {}),
    ...pendingChanges,
  }), [serverSettings, pendingChanges]);

  const saveSingleMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      put<void>("/admin/exchange-settings", { key, value }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ["exchange-settings"] });
      setSavedKeys(prev => { const n = new Set(prev); n.add(key); setTimeout(() => setSavedKeys(p => { const m = new Set(p); m.delete(key); return m; }), 3000); return n; });
      setPendingChanges(prev => { const n = { ...prev }; delete n[key]; return n; });
      toast.success(`Saved: ${key}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const saveBulkMutation = useMutation({
    mutationFn: (data: { settings: Record<string, string> }) =>
      post<void>("/admin/exchange-settings/bulk", data),
    onSuccess: (_, { settings: saved }) => {
      qc.invalidateQueries({ queryKey: ["exchange-settings"] });
      const keys = Object.keys(saved);
      setSavedKeys(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); setTimeout(() => setSavedKeys(p => { const m = new Set(p); keys.forEach(k => m.delete(k)); return m; }), 3000); return n; });
      setPendingChanges({});
      toast.success(`${keys.length} settings saved`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Bulk save failed"),
  });

  const setValue = (key: string, value: string) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const saveSingle = (key: string) => {
    saveSingleMutation.mutate({ key, value: settings[key] ?? "" });
  };

  const saveBulk = (sectionKeys: string[]) => {
    const obj: Record<string, string> = {};
    sectionKeys.forEach(k => { if (settings[k] !== undefined) obj[k] = settings[k]; });
    saveBulkMutation.mutate({ settings: obj });
  };

  const totalChanges = Object.keys(pendingChanges).length;
  const isAnySaving = saveSingleMutation.isPending || saveBulkMutation.isPending;

  return (
    <div className="space-y-6 max-w-[1000px]">
      <PageHeader
        eyebrow="Configuration"
        title="Exchange Settings"
        description="Platform-wide configuration — features, limits, payment details, and credentials. Changes take effect immediately."
        actions={
          <div className="flex items-center gap-2">
            {totalChanges > 0 && (
              <Badge variant="secondary" className="text-amber-400 border-amber-500/30 bg-amber-500/10">
                {totalChanges} unsaved change{totalChanges !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ["exchange-settings"] })}
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Reload
            </Button>
            {totalChanges > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  const allPending: Record<string, string> = {};
                  SECTIONS.forEach(s => {
                    s.keys.forEach(({ key }) => {
                      if (pendingChanges[key] !== undefined) allPending[key] = pendingChanges[key];
                    });
                  });
                  saveBulkMutation.mutate({ settings: allPending });
                }}
                disabled={isAnySaving}
              >
                {isAnySaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Save all changes
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isCollapsed = collapsed[section.label];
            const sectionKeys = section.keys.map(k => k.key);
            const sectionPending = sectionKeys.filter(k => pendingChanges[k] !== undefined).length;
            const sectionSaved = sectionKeys.filter(k => savedKeys.has(k)).length;

            return (
              <div
                key={section.label}
                className={cn(
                  "rounded-xl border bg-card/50 overflow-hidden transition-all",
                  sectionPending > 0 ? "border-amber-500/40" : "border-border",
                )}
              >
                <button
                  onClick={() => setCollapsed(prev => ({ ...prev, [section.label]: !prev[section.label] }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center border",
                      sectionPending > 0 ? "bg-amber-500/15 border-amber-500/30" : "bg-muted/40 border-border",
                    )}>
                      <Icon className={cn("w-4 h-4", sectionPending > 0 ? "text-amber-400" : "text-muted-foreground")} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{section.label}</span>
                        {sectionPending > 0 && (
                          <Badge className="h-4 px-1.5 text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/30">
                            {sectionPending} pending
                          </Badge>
                        )}
                        {sectionSaved > 0 && (
                          <Badge className="h-4 px-1.5 text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                            Saved
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{section.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isCollapsed && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={e => { e.stopPropagation(); saveBulk(sectionKeys); }}
                        disabled={isAnySaving}
                      >
                        {saveBulkMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                        Save section
                      </Button>
                    )}
                    {isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border/60 px-5 py-5 space-y-5">
                    {section.keys.map(({ key, label, type, hint }) => {
                      const val = settings[key] ?? "";
                      const isDirty = pendingChanges[key] !== undefined;
                      const isSaved = savedKeys.has(key);
                      const isSaving = saveSingleMutation.isPending && saveSingleMutation.variables?.key === key;

                      return (
                        <div key={key} className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Label className="text-sm font-medium">{label}</Label>
                              {isDirty && !isSaved && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved change" />
                              )}
                              {isSaved && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                            </div>
                            {hint && <div className="text-[11px] text-muted-foreground mb-1.5">{hint}</div>}

                            {type === "boolean" ? (
                              <div className="flex items-center gap-3 h-9">
                                <Switch
                                  checked={val === "true"}
                                  onCheckedChange={c => setValue(key, c ? "true" : "false")}
                                />
                                <span className={cn("text-sm", val === "true" ? "text-emerald-400 font-medium" : "text-muted-foreground")}>
                                  {val === "true" ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                            ) : type === "textarea" ? (
                              <Textarea
                                value={val}
                                onChange={e => setValue(key, e.target.value)}
                                rows={2}
                                className={cn("resize-none", isDirty && "border-amber-500/60")}
                              />
                            ) : type === "secret" ? (
                              <div className="relative">
                                <Input
                                  type={showSecrets[key] ? "text" : "password"}
                                  value={val}
                                  onChange={e => setValue(key, e.target.value)}
                                  className={cn("pr-9 font-mono text-xs", isDirty && "border-amber-500/60")}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }))}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {showSecrets[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            ) : (
                              <Input
                                type={type === "number" ? "number" : "text"}
                                value={val}
                                onChange={e => setValue(key, e.target.value)}
                                className={cn(isDirty && "border-amber-500/60")}
                              />
                            )}
                          </div>

                          {type !== "boolean" && (
                            <div className="flex-shrink-0 mt-6">
                              <Button
                                variant={isSaved ? "outline" : isDirty ? "default" : "outline"}
                                size="sm"
                                className={cn(
                                  "h-8 min-w-[64px] text-xs",
                                  isSaved && "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
                                )}
                                onClick={() => saveSingle(key)}
                                disabled={isSaving || isAnySaving}
                              >
                                {isSaving
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : isSaved
                                  ? <><CheckCircle2 className="w-3 h-3 mr-1" />Saved</>
                                  : <><Save className="w-3 h-3 mr-1" />Save</>
                                }
                              </Button>
                            </div>
                          )}
                          {type === "boolean" && isDirty && (
                            <div className="flex-shrink-0 mt-1">
                              <Button
                                variant="default"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => saveSingle(key)}
                                disabled={isSaving || isAnySaving}
                              >
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                                Apply
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Geo Restrictions — separate section using site.geo via settingsTable */}
          <GeoRestrictionsSection />

          {/* Withdrawal Security — whitelist + auto-approve settings */}
          <WithdrawSecuritySection />

          {/* Referral Commission — admin-configurable per-level rates via /admin/referral-settings */}
          <ReferralSettingsSection />
        </div>
      )}
    </div>
  );
}

// ─── Withdrawal Security Section ──────────────────────────────────────────────
function WithdrawSecuritySection() {
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  type WdSec = { whitelistRequired: boolean; autoApproveEnabled: boolean; autoApproveMaxAmount: number; lockHoursOnPwChange: number; whitelistCooldownHours: number };
  const q = useQuery<WdSec>({
    queryKey: ["admin-withdraw-security"],
    queryFn: () => get("/admin/withdraw/auto-approve"),
    staleTime: 30_000,
  });

  const [form, setForm] = useState<WdSec | null>(null);
  const current = form ?? q.data ?? null;

  const set = (k: keyof WdSec, v: boolean | number) => setForm(prev => ({ ...(prev ?? q.data ?? {} as WdSec), [k]: v }));

  const save = useMutation({
    mutationFn: () => put("/admin/withdraw/auto-approve", current),
    onMutate: () => setSaving(true),
    onSettled: () => setSaving(false),
    onSuccess: () => {
      toast.success("Withdrawal security settings saved");
      qc.invalidateQueries({ queryKey: ["admin-withdraw-security"] });
      setForm(null);
    },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const isDirty = form !== null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-rose-500/15">
            <ShieldCheck className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="text-sm font-semibold">Withdrawal Security</div>
            <div className="text-[11px] text-muted-foreground">Whitelist enforcement, auto-approve thresholds, and withdrawal locks</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="default" size="sm" className="h-7 px-2.5 text-xs" onClick={e => { e.stopPropagation(); save.mutate(); }} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Save className="w-3 h-3 mr-1" />Save</>}
            </Button>
          )}
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 px-5 py-5 space-y-5">
          {q.isLoading ? (
            <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="h-10 rounded-lg bg-muted/20 animate-pulse" />)}</div>
          ) : !current ? (
            <div className="text-sm text-muted-foreground">Failed to load — <button className="underline" onClick={() => q.refetch()}>retry</button></div>
          ) : (
            <div className="space-y-5">
              {/* Whitelist required */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Require Whitelisted Addresses</Label>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Users can only withdraw to addresses they have pre-whitelisted. Bypass is blocked for non-whitelisted addresses.</div>
                </div>
                <Switch checked={current.whitelistRequired} onCheckedChange={v => set("whitelistRequired", v)} />
              </div>
              {/* Auto-approve */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Auto-Approve Whitelisted Withdrawals</Label>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Automatically complete withdrawals to whitelisted addresses below the maximum amount. Above the threshold still requires manual admin approval.</div>
                </div>
                <Switch checked={current.autoApproveEnabled} onCheckedChange={v => set("autoApproveEnabled", v)} />
              </div>
              {/* Auto-approve max amount */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Auto-Approve Max Amount (USD equivalent)</Label>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Withdrawals up to this value (in USD) to whitelisted addresses are auto-approved. Set 0 to auto-approve all amounts.</div>
                  <Input
                    type="number"
                    value={current.autoApproveMaxAmount}
                    onChange={e => set("autoApproveMaxAmount", Number(e.target.value))}
                    className="h-9 w-48 mt-2 font-mono text-sm"
                    min={0}
                  />
                </div>
              </div>
              {/* Lock hours on password change */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Withdrawal Lock After Password Change (hours)</Label>
                  <div className="text-[11px] text-muted-foreground mt-0.5">After a user changes their password, withdrawals are locked for this many hours as a security measure.</div>
                  <Input
                    type="number"
                    value={current.lockHoursOnPwChange}
                    onChange={e => set("lockHoursOnPwChange", Number(e.target.value))}
                    className="h-9 w-32 mt-2 font-mono text-sm"
                    min={0}
                    max={168}
                  />
                </div>
              </div>
              {/* Whitelist cooldown hours */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">Whitelist Cooling Period (hours)</Label>
                  <div className="text-[11px] text-muted-foreground mt-0.5">New whitelist addresses must wait this many hours before they can receive withdrawals.</div>
                  <Input
                    type="number"
                    value={current.whitelistCooldownHours}
                    onChange={e => set("whitelistCooldownHours", Number(e.target.value))}
                    className="h-9 w-32 mt-2 font-mono text-sm"
                    min={1}
                    max={72}
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="default"
                  size="sm"
                  className="h-9 px-5"
                  onClick={() => save.mutate()}
                  disabled={saving || !isDirty}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Settings
                </Button>
                {!isDirty && <span className="ml-3 text-xs text-muted-foreground">No unsaved changes</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
