import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export const COUNTRIES = [
  { code: "IN", dial: "+91",  flag: "🇮🇳", name: "India" },
  { code: "US", dial: "+1",   flag: "🇺🇸", name: "USA" },
  { code: "GB", dial: "+44",  flag: "🇬🇧", name: "UK" },
  { code: "AE", dial: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "SG", dial: "+65",  flag: "🇸🇬", name: "Singapore" },
  { code: "AU", dial: "+61",  flag: "🇦🇺", name: "Australia" },
  { code: "CA", dial: "+1",   flag: "🇨🇦", name: "Canada" },
  { code: "NP", dial: "+977", flag: "🇳🇵", name: "Nepal" },
  { code: "BD", dial: "+880", flag: "🇧🇩", name: "Bangladesh" },
  { code: "PK", dial: "+92",  flag: "🇵🇰", name: "Pakistan" },
  { code: "LK", dial: "+94",  flag: "🇱🇰", name: "Sri Lanka" },
  { code: "MY", dial: "+60",  flag: "🇲🇾", name: "Malaysia" },
  { code: "ID", dial: "+62",  flag: "🇮🇩", name: "Indonesia" },
  { code: "PH", dial: "+63",  flag: "🇵🇭", name: "Philippines" },
];

export function parsePhone(val: string): { dial: string; number: string } {
  const v = (val ?? "").trim();
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (v.startsWith(c.dial + " ")) return { dial: c.dial, number: v.slice(c.dial.length).trim() };
    if (v.startsWith(c.dial) && v.length > c.dial.length) return { dial: c.dial, number: v.slice(c.dial.length).trim() };
  }
  return { dial: "+91", number: v.startsWith("+") ? "" : v };
}

export interface PhoneInputProps {
  value?: string;
  onChange?: (val: string) => void;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "data-testid"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    {
      value = "",
      onChange,
      onBlur,
      className,
      placeholder,
      disabled,
      id,
      "data-testid": testId,
      "aria-invalid": ariaInvalid,
    },
    ref
  ) {
    const parsed = parsePhone(value);
    const [dial, setDial] = React.useState(parsed.dial);
    const [number, setNumber] = React.useState(parsed.number);

    React.useEffect(() => {
      const p = parsePhone(value);
      setDial(p.dial);
      setNumber(p.number);
    }, [value]);

    const emit = (d: string, n: string) => {
      onChange?.(n.trim() ? `${d} ${n.trim()}` : "");
    };

    const handleDial = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const d = e.target.value;
      setDial(d);
      emit(d, number);
    };

    const handleNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = e.target.value.replace(/[^\d\s\-()]/g, "");
      setNumber(n);
      emit(dial, n);
    };

    const country = COUNTRIES.find(c => c.dial === dial) ?? COUNTRIES[0];
    const defaultPlaceholder = dial === "+91" ? "98765 43210" : "Phone number";
    const ph = placeholder ?? defaultPlaceholder;

    return (
      <div
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-background text-sm",
          "ring-offset-background focus-within:outline-none focus-within:ring-2",
          "focus-within:ring-ring focus-within:ring-offset-2 overflow-hidden",
          ariaInvalid && "border-destructive focus-within:ring-destructive",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {/*
          Country code picker:
          - A styled visual trigger shows flag + dial code compactly
          - An invisible native <select> sits on top so mobile gets the OS picker
          - The OS picker shows full country names from the <option> elements
        */}
        <div className="relative shrink-0 border-r border-border/60 bg-muted/30">
          {/* Visual display — pointer-events:none, purely cosmetic */}
          <div
            className="pointer-events-none flex h-full items-center gap-1 pl-2.5 pr-6 select-none whitespace-nowrap"
            aria-hidden="true"
          >
            <span className="text-[17px] leading-none">{country.flag}</span>
            <span className="text-xs font-semibold tabular-nums">{dial}</span>
            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          </div>

          {/* Invisible native select covers the visual trigger exactly */}
          <select
            value={dial}
            onChange={handleDial}
            disabled={disabled}
            aria-label="Country calling code"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            style={{ WebkitAppearance: "none", MozAppearance: "none" } as React.CSSProperties}
          >
            {COUNTRIES.map(c => (
              <option key={`${c.code}-${c.dial}`} value={c.dial}>
                {c.flag}  {c.dial}  —  {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Phone number text input */}
        <input
          ref={ref}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder={ph}
          disabled={disabled}
          value={number}
          onChange={handleNumber}
          onBlur={onBlur}
          data-testid={testId}
          aria-invalid={ariaInvalid}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed text-sm"
        />
      </div>
    );
  }
);
