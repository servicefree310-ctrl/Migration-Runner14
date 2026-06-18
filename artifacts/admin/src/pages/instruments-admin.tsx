import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Gem, Globe, Building2, TrendingUp, Plus, Pencil, ToggleLeft, ToggleRight, Search, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Instrument = {
  id: number; symbol: string; name: string; assetClass: string; exchange: string;
  quoteCurrency: string; currentPrice: string; change24h: string;
  tradingEnabled: boolean; maxLeverage: number; marginRequired: string;
  takerFee: string; sector: string | null; countryCode: string;
  minQty: string; maxQty: string; lotSize: string; pricePrecision: number;
  brokerSymbol: string | null; brokerToken: string | null;
};

const ASSET_CLASS_TABS = [
  { id: "all", label: "All", icon: TrendingUp },
  { id: "forex", label: "Forex", icon: Globe },
  { id: "stock", label: "Stocks", icon: Building2 },
  { id: "commodity", label: "Commodities", icon: Gem },
];

const ASSET_CLASS_COLORS: Record<string, string> = {
  forex: "border-blue-500/40 text-blue-400",
  stock: "border-emerald-500/40 text-emerald-400",
  commodity: "border-yellow-500/40 text-yellow-400",
};

export default function InstrumentsAdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [editDialog, setEditDialog] = useState(false);
  const [addDialog, setAddDialog] = useState(false);
  const [selected, setSelected] = useState<Instrument | null>(null);

  const [editForm, setEditForm] = useState<Partial<Instrument>>({});
  const [addForm, setAddForm] = useState({
    symbol: "", name: "", assetClass: "forex", exchange: "NSE",
    brokerSymbol: "", brokerToken: "", quoteCurrency: "INR",
    maxLeverage: 10, marginRequired: "0.10", takerFee: "0.0003",
    minQty: "1", maxQty: "10000", lotSize: "1", pricePrecision: 4,
    sector: "", countryCode: "IN", tradingEnabled: true,
  });

  const { data, isLoading, refetch } = useQuery<{ instruments: Instrument[] }>({
    queryKey: ["admin-instruments", tab],
    queryFn: () => get(`/api/admin/instruments${tab !== "all" ? `?assetClass=${tab}` : ""}`),
  });

  const instruments = (data?.instruments ?? []).filter((i) => {
    if (!search) return true;
    return i.symbol.includes(search.toUpperCase()) || i.name.toUpperCase().includes(search.toUpperCase());
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => patch(`/api/admin/instruments/${id}`, body),
    onSuccess: () => { toast({ title: "Instrument updated" }); qc.invalidateQueries({ queryKey: ["admin-instruments"] }); setEditDialog(false); },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (body: object) => post("/admin/instruments", body),
    onSuccess: () => { toast({ title: "Instrument added" }); qc.invalidateQueries({ queryKey: ["admin-instruments"] }); setAddDialog(false); },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => patch(`/api/admin/instruments/${id}`, { tradingEnabled: enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-instruments"] }),
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  const openEdit = (inst: Instrument) => {
    setSelected(inst);
    setEditForm({
      maxLeverage: inst.maxLeverage,
      marginRequired: inst.marginRequired,
      takerFee: inst.takerFee,
      minQty: inst.minQty,
      maxQty: inst.maxQty,
      lotSize: inst.lotSize,
      brokerSymbol: inst.brokerSymbol ?? "",
      brokerToken: inst.brokerToken ?? "",
      pricePrecision: inst.pricePrecision,
    });
    setEditDialog(true);
  };

  const byClass = {
    all: instruments.length,
    forex: instruments.filter((i) => i.assetClass === "forex").length,
    stock: instruments.filter((i) => i.assetClass === "stock").length,
    commodity: instruments.filter((i) => i.assetClass === "commodity").length,
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Forex, Stocks & Commodities"
        description="Manage all tradeable instruments — Forex, Indian & international stocks, Gold, Silver, Oil"
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Instruments", value: byClass.all, icon: TrendingUp, color: "text-white" },
          { label: "Forex Pairs", value: byClass.forex, icon: Globe, color: "text-blue-400" },
          { label: "Stocks", value: byClass.stock, icon: Building2, color: "text-emerald-400" },
          { label: "Commodities", value: byClass.commodity, icon: Gem, color: "text-yellow-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-[#0d1117] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center">
              <s.icon className={cn("w-4 h-4", s.color)} />
            </div>
            <div>
              <div className={cn("text-xl font-bold tabular-nums", s.color)}>{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or name..." className="pl-9 bg-white/5 border-white/20 h-9 text-sm" />
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        <Button onClick={() => setAddDialog(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-bold ml-auto">
          <Plus className="w-4 h-4 mr-2" />Add Instrument
        </Button>
      </div>

      {/* Tabs + Table */}
      <div className="rounded-xl border border-white/10 bg-[#0d1117] overflow-hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="border-b border-white/10 bg-transparent rounded-none h-10 px-2 justify-start">
            {ASSET_CLASS_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}
                className="data-[state=active]:border-b-2 data-[state=active]:border-amber-400 rounded-none text-xs flex items-center gap-1.5">
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                <span className="text-[10px] text-muted-foreground">({byClass[t.id as keyof typeof byClass]})</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {ASSET_CLASS_TABS.map((t) => (
            <TabsContent key={t.id} value={t.id} className="m-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-muted-foreground">
                      <th className="text-left py-3 px-4">Symbol</th>
                      <th className="text-left py-3 px-4">Name</th>
                      <th className="text-left py-3 px-4">Type</th>
                      <th className="text-left py-3 px-4">Exchange</th>
                      <th className="text-right py-3 px-4">Price</th>
                      <th className="text-right py-3 px-4">Change</th>
                      <th className="text-right py-3 px-4">Leverage</th>
                      <th className="text-right py-3 px-4">Margin</th>
                      <th className="text-center py-3 px-4">Status</th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} className="border-b border-white/5">
                          <td colSpan={10} className="py-3 px-4">
                            <div className="h-4 bg-white/5 rounded animate-pulse" />
                          </td>
                        </tr>
                      ))
                    ) : instruments.filter((i) => t.id === "all" || i.assetClass === t.id).length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-muted-foreground text-sm">No instruments found</td>
                      </tr>
                    ) : (
                      instruments.filter((i) => t.id === "all" || i.assetClass === t.id).map((inst) => {
                        const chg = Number(inst.change24h);
                        const isUp = chg >= 0;
                        return (
                          <tr key={inst.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                            <td className="py-3 px-4 font-bold text-sm">{inst.symbol}</td>
                            <td className="py-3 px-4 text-muted-foreground text-xs max-w-[160px] truncate">{inst.name}</td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className={cn("text-[10px]", ASSET_CLASS_COLORS[inst.assetClass] ?? "")}>
                                {inst.assetClass}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-xs text-muted-foreground">{inst.exchange}</td>
                            <td className="py-3 px-4 text-right tabular-nums text-sm font-medium">
                              {inst.quoteCurrency === "INR" ? "₹" : ""}{Number(inst.currentPrice).toLocaleString("en-IN", { maximumFractionDigits: inst.pricePrecision })}{inst.quoteCurrency !== "INR" ? ` ${inst.quoteCurrency}` : ""}
                            </td>
                            <td className={cn("py-3 px-4 text-right tabular-nums text-xs font-medium", isUp ? "text-emerald-400" : "text-red-400")}>
                              {isUp ? "+" : ""}{chg.toFixed(2)}%
                            </td>
                            <td className="py-3 px-4 text-right text-xs">{inst.maxLeverage}×</td>
                            <td className="py-3 px-4 text-right text-xs">{(Number(inst.marginRequired) * 100).toFixed(0)}%</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => toggleMutation.mutate({ id: inst.id, enabled: !inst.tradingEnabled })}
                                disabled={toggleMutation.isPending}
                                className="transition-opacity hover:opacity-80"
                              >
                                {inst.tradingEnabled
                                  ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                                  : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(inst)} className="h-7 text-xs">
                                <Pencil className="w-3.5 h-3.5 mr-1" />Edit
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="bg-[#0d1117] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-400" />
              Edit {selected?.symbol}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {[
              { key: "brokerSymbol", label: "Broker Symbol", placeholder: "e.g. EURINR" },
              { key: "brokerToken", label: "Broker Token", placeholder: "Angel One token" },
              { key: "maxLeverage", label: "Max Leverage", type: "number", placeholder: "10" },
              { key: "marginRequired", label: "Margin Required (0.10 = 10%)", type: "number", placeholder: "0.10" },
              { key: "takerFee", label: "Taker Fee (0.0003 = 0.03%)", type: "number", placeholder: "0.0003" },
              { key: "lotSize", label: "Lot Size", type: "number", placeholder: "1" },
              { key: "minQty", label: "Min Qty", type: "number", placeholder: "1" },
              { key: "maxQty", label: "Max Qty", type: "number", placeholder: "10000" },
              { key: "pricePrecision", label: "Price Precision (decimals)", type: "number", placeholder: "4" },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  type={type ?? "text"}
                  value={String((editForm as Record<string, unknown>)[key] ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                  placeholder={placeholder}
                  className="bg-white/5 border-white/20 text-sm h-9"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)} className="border-white/20">Cancel</Button>
            <Button
              onClick={() => selected && patchMutation.mutate({ id: selected.id, body: editForm })}
              disabled={patchMutation.isPending}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
            >
              {patchMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="bg-[#0d1117] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" />
              Add New Instrument
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Symbol *</Label>
              <Input value={addForm.symbol} onChange={(e) => setAddForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                placeholder="e.g. EURINR" className="bg-white/5 border-white/20 text-sm h-9 font-bold uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Euro / Indian Rupee" className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Asset Class *</Label>
              <select value={addForm.assetClass} onChange={(e) => setAddForm((f) => ({ ...f, assetClass: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none">
                <option value="forex">Forex</option>
                <option value="stock">Stock</option>
                <option value="commodity">Commodity</option>
                <option value="index">Index</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Exchange</Label>
              <Input value={addForm.exchange} onChange={(e) => setAddForm((f) => ({ ...f, exchange: e.target.value }))}
                placeholder="NSE / MCX / NASDAQ" className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Quote Currency</Label>
              <Input value={addForm.quoteCurrency} onChange={(e) => setAddForm((f) => ({ ...f, quoteCurrency: e.target.value }))}
                placeholder="INR / USD" className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Broker Symbol</Label>
              <Input value={addForm.brokerSymbol} onChange={(e) => setAddForm((f) => ({ ...f, brokerSymbol: e.target.value }))}
                placeholder="Angel One symbol" className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max Leverage</Label>
              <Input type="number" value={addForm.maxLeverage} onChange={(e) => setAddForm((f) => ({ ...f, maxLeverage: Number(e.target.value) }))}
                className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Margin Required</Label>
              <Input type="number" value={addForm.marginRequired} onChange={(e) => setAddForm((f) => ({ ...f, marginRequired: e.target.value }))}
                step="0.01" className="bg-white/5 border-white/20 text-sm h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)} className="border-white/20">Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(addForm)}
              disabled={addMutation.isPending || !addForm.symbol || !addForm.name}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
            >
              {addMutation.isPending ? "Adding..." : "Add Instrument"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
