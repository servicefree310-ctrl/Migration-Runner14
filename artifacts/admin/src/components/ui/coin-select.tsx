import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

export type CoinOption = {
  id: number;
  symbol: string;
  name?: string | null;
  logoUrl?: string | null;
  status?: string;
};

type CoinSelectProps = {
  coins: CoinOption[];
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  activeOnly?: boolean;
  "data-testid"?: string;
};

export function CoinSelect({
  coins,
  value,
  onValueChange,
  placeholder = "Select coin",
  disabled = false,
  activeOnly = false,
  "data-testid": testId,
}: CoinSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = coins
    .filter((c) => !activeOnly || c.status === "active")
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.symbol.toLowerCase().includes(q) ||
        (c.name ?? "").toLowerCase().includes(q)
      );
    });

  const selected = coins.find((c) => String(c.id) === value);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {selected ? (
              <>
                <span className="font-semibold text-amber-400">{selected.symbol}</span>
                {selected.name && (
                  <span className="text-muted-foreground text-xs truncate">— {selected.name}</span>
                )}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center border-b border-border/60 px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground mr-2" />
          <input
            ref={inputRef}
            className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search coin…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No coin found
            </div>
          )}
          {filtered.map((c) => (
            <div
              key={c.id}
              role="option"
              aria-selected={String(c.id) === value}
              className={cn(
                "relative flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                String(c.id) === value && "bg-accent/60"
              )}
              onClick={() => {
                onValueChange(String(c.id));
                setOpen(false);
              }}
            >
              <span className="w-12 shrink-0 font-semibold text-amber-400 text-xs">
                {c.symbol}
              </span>
              <span className="flex-1 truncate text-muted-foreground text-xs">
                {c.name ?? ""}
              </span>
              {String(c.id) === value && (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
          {filtered.length} coin{filtered.length !== 1 ? "s" : ""}
          {search ? ` matching "${search}"` : ""}
        </div>
      </PopoverContent>
    </Popover>
  );
}
