import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export type PageSizeOption = 10 | 20 | 50 | 100;
const PAGE_SIZE_OPTIONS: PageSizeOption[] = [10, 20, 50, 100];

interface PaginationBarProps {
  page: number;
  pageSize: PageSizeOption;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (ps: PageSizeOption) => void;
  label?: string;
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  label = "items",
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="border-t border-border/60 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground bg-muted/10">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSize(Number(v) as PageSizeOption)}
        >
          <SelectTrigger className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1 text-xs tabular-nums">
        {total > 0 ? (
          <span>{from}–{to} of {total} {label}</span>
        ) : (
          <span>0 {label}</span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPage(1)}
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        <span className="px-2 tabular-nums font-medium text-foreground">
          {page} / {totalPages}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
