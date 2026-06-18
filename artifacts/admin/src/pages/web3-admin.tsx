import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, patch, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { PremiumStatCard } from "@/components/premium/PremiumStatCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { EmptyState } from "@/components/premium/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Globe2, Coins, Plus, Trash2, Network as NetworkIcon } from "lucide-react";

type Network = {
  id: number; chainKey: string; displayName: string; chainId: number; nativeSymbol: string;
  rpcUrl: string; explorerUrl: string; family: string; status: string;
  bridgeFeeBps: number; swapFeeBps: number; estGasUsd: string;
};
type Token = {
  id: number; networkId: number; symbol: string; name: string;
  contractAddress: string | null; decimals: number; isNative: boolean;
  priceCoinSymbol: string; status: string; isStablecoin: boolean;
};

export default function Web3AdminPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"networks" | "tokens">("networks");

  const netQ = useQuery<{ networks: Network[] }>({
    queryKey: ["admin-web3-networks"], queryFn: () => get(`/admin/web3/networks`),
  });
  const networks = netQ.data?.networks ?? [];

  const [filterNet, setFilterNet] = useState<number>(0);
  useEffect(() => { if (!filterNet && networks.length) setFilterNet(networks[0].id); }, [networks, filterNet]);

  const tokQ = useQuery<{ tokens: Token[] }>({
    queryKey: ["admin-web3-tokens", filterNet],
    queryFn: () => get(`/admin/web3/tokens?networkId=${filterNet}`),
    enabled: !!filterNet,
  });

  // ─── Network mutations ──────────────────────────────────────────────
  const [netDialog, setNetDialog] = useState(false);
  const [netForm, setNetForm] = useState({
    chainKey: "", displayName: "", chainId: 0, nativeSymbol: "",
    rpcUrl: "", explorerUrl: "", family: "evm",
    bridgeFeeBps: 15, swapFeeBps: 30, estGasUsd: 0.5,
  });
  const createNet = useMutation({
    mutationFn: () => post(`/admin/web3/networks`, netForm),
    onSuccess: () => { toast({ title: "Network added" }); setNetDialog(false); qc.invalidateQueries({ queryKey: ["admin-web3-networks"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });
  const patchNet = useMutation({
    mutationFn: (vars: { id: number; patch: Partial<Network> }) => patch(`/admin/web3/networks/${vars.id}`, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-web3-networks"] }),
  });
  const delNet = useMutation({
    mutationFn: (id: number) => del(`/admin/web3/networks/${id}`),
    onSuccess: () => { toast({ title: "Deleted" }); qc.invalidateQueries({ queryKey: ["admin-web3-networks"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  // ─── Token mutations ────────────────────────────────────────────────
  const [tokDialog, setTokDialog] = useState(false);
  const [tokForm, setTokForm] = useState({
    networkId: 0, symbol: "", name: "", contractAddress: "",
    decimals: 18, isNative: false, priceCoinSymbol: "", isStablecoin: false,
  });
  useEffect(() => { setTokForm((p) => ({ ...p, networkId: filterNet })); }, [filterNet]);

  const createTok = useMutation({
    mutationFn: () => post(`/admin/web3/tokens`, tokForm),
    onSuccess: () => { toast({ title: "Token listed" }); setTokDialog(false); qc.invalidateQueries({ queryKey: ["admin-web3-tokens"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });
  const patchTok = useMutation({
    mutationFn: (vars: { id: number; patch: Partial<Token> }) => patch(`/admin/web3/tokens/${vars.id}`, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-web3-tokens"] }),
  });
  const delTok = useMutation({
    mutationFn: (id: number) => del(`/admin/web3/tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-web3-tokens"] }),
  });

  const tokens = tokQ.data?.tokens ?? [];
  const totalTokens = useMemo(() => tokens.length, [tokens]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Multi-chain"
        title="Web3 Admin"
        description="Manage networks and tokens — fees, status, and RPC URLs all in one place."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PremiumStatCard title="Networks" value={networks.length} icon={Globe2} hero />
        <PremiumStatCard title="Active networks" value={networks.filter((n) => n.status === "active").length} icon={NetworkIcon} accent />
        <PremiumStatCard title="Tokens (selected net)" value={totalTokens} icon={Coins} />
        <PremiumStatCard title="Active tokens" value={tokens.filter((t) => t.status === "active").length} icon={Coins} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="networks">Networks</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="networks" className="mt-4">
          <div className="premium-card rounded-xl">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <h3 className="font-semibold">All Networks</h3>
              <Button size="sm" onClick={() => setNetDialog(true)} data-testid="btn-add-network"><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            {networks.length === 0 ? <EmptyState title="No networks" description="Add the first chain" icon={Globe2} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Key</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Family</th>
                      <th className="px-3 py-2 text-left">Native</th>
                      <th className="px-3 py-2 text-right">Chain ID</th>
                      <th className="px-3 py-2 text-right">Swap fee bps</th>
                      <th className="px-3 py-2 text-right">Bridge fee bps</th>
                      <th className="px-3 py-2 text-right">Gas USD</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {networks.map((n) => (
                      <tr key={n.id} className="hover:bg-muted/10" data-testid={`row-net-${n.chainKey}`}>
                        <td className="px-3 py-2 font-mono text-xs">{n.chainKey}</td>
                        <td className="px-3 py-2">{n.displayName}</td>
                        <td className="px-3 py-2 text-xs uppercase">{n.family}</td>
                        <td className="px-3 py-2">{n.nativeSymbol}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n.chainId}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" defaultValue={n.swapFeeBps} className="w-14 bg-muted/30 border border-border rounded px-1 py-0.5 text-xs text-right" onBlur={(e) => { const v = Number(e.target.value); if (v !== n.swapFeeBps) patchNet.mutate({ id: n.id, patch: { swapFeeBps: v } }); }} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" defaultValue={n.bridgeFeeBps} className="w-14 bg-muted/30 border border-border rounded px-1 py-0.5 text-xs text-right" onBlur={(e) => { const v = Number(e.target.value); if (v !== n.bridgeFeeBps) patchNet.mutate({ id: n.id, patch: { bridgeFeeBps: v } }); }} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" step="0.01" defaultValue={n.estGasUsd} className="w-16 bg-muted/30 border border-border rounded px-1 py-0.5 text-xs text-right" onBlur={(e) => { const v = e.target.value; if (v !== n.estGasUsd) patchNet.mutate({ id: n.id, patch: { estGasUsd: v as any } }); }} />
                        </td>
                        <td className="px-3 py-2">
                          <select defaultValue={n.status} onChange={(e) => patchNet.mutate({ id: n.id, patch: { status: e.target.value } })} className="bg-muted/30 border border-border rounded px-2 py-0.5 text-xs">
                            <option>active</option><option>maintenance</option><option>disabled</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" className="text-red-400" onClick={() => { if (confirm(`Delete ${n.chainKey}?`)) delNet.mutate(n.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tokens" className="mt-4">
          <div className="premium-card rounded-xl">
            <div className="flex items-center justify-between p-4 border-b border-border/50 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">Tokens</h3>
                <select value={filterNet} onChange={(e) => setFilterNet(Number(e.target.value))} className="bg-muted/30 border border-border rounded-md px-3 py-1.5 text-sm">
                  {networks.map((n) => <option key={n.id} value={n.id}>{n.displayName}</option>)}
                </select>
              </div>
              <Button size="sm" onClick={() => setTokDialog(true)} data-testid="btn-add-token"><Plus className="w-4 h-4 mr-1" /> Add Token</Button>
            </div>
            {tokens.length === 0 ? <EmptyState title="No tokens" description="Add a token on this network" icon={Coins} /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 text-muted-foreground text-[10px] uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Symbol</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Contract</th>
                      <th className="px-3 py-2 text-right">Decimals</th>
                      <th className="px-3 py-2">Native</th>
                      <th className="px-3 py-2">Stable</th>
                      <th className="px-3 py-2 text-left">Price coin</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {tokens.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/10" data-testid={`row-tok-${t.symbol}`}>
                        <td className="px-3 py-2 font-bold">{t.symbol}</td>
                        <td className="px-3 py-2">{t.name}</td>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{t.contractAddress ? `${t.contractAddress.slice(0, 8)}…${t.contractAddress.slice(-4)}` : "native"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.decimals}</td>
                        <td className="px-3 py-2"><StatusPill variant={t.isNative ? "gold" : "neutral"}>{t.isNative ? "yes" : "no"}</StatusPill></td>
                        <td className="px-3 py-2"><StatusPill variant={t.isStablecoin ? "info" : "neutral"}>{t.isStablecoin ? "yes" : "no"}</StatusPill></td>
                        <td className="px-3 py-2 font-mono text-xs">{t.priceCoinSymbol}</td>
                        <td className="px-3 py-2">
                          <select defaultValue={t.status} onChange={(e) => patchTok.mutate({ id: t.id, patch: { status: e.target.value } })} className="bg-muted/30 border border-border rounded px-2 py-0.5 text-xs">
                            <option>active</option><option>disabled</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" className="text-red-400" onClick={() => { if (confirm(`Delist ${t.symbol}?`)) delTok.mutate(t.id); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Network dialog */}
      <Dialog open={netDialog} onOpenChange={setNetDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Network</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Chain key</Label><Input value={netForm.chainKey} onChange={(e) => setNetForm({ ...netForm, chainKey: e.target.value })} placeholder="bsc" /></div>
            <div><Label className="text-xs">Display name</Label><Input value={netForm.displayName} onChange={(e) => setNetForm({ ...netForm, displayName: e.target.value })} placeholder="BNB Chain" /></div>
            <div><Label className="text-xs">Family</Label>
              <select value={netForm.family} onChange={(e) => setNetForm({ ...netForm, family: e.target.value })} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm">
                <option value="evm">EVM</option><option value="solana">Solana</option><option value="cosmos">Cosmos</option>
              </select>
            </div>
            <div><Label className="text-xs">Chain ID</Label><Input type="number" value={netForm.chainId} onChange={(e) => setNetForm({ ...netForm, chainId: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Native symbol</Label><Input value={netForm.nativeSymbol} onChange={(e) => setNetForm({ ...netForm, nativeSymbol: e.target.value.toUpperCase() })} placeholder="BNB" /></div>
            <div><Label className="text-xs">RPC URL</Label><Input value={netForm.rpcUrl} onChange={(e) => setNetForm({ ...netForm, rpcUrl: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Explorer URL</Label><Input value={netForm.explorerUrl} onChange={(e) => setNetForm({ ...netForm, explorerUrl: e.target.value })} placeholder="https://bscscan.com" /></div>
            <div><Label className="text-xs">Swap fee bps</Label><Input type="number" value={netForm.swapFeeBps} onChange={(e) => setNetForm({ ...netForm, swapFeeBps: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Bridge fee bps</Label><Input type="number" value={netForm.bridgeFeeBps} onChange={(e) => setNetForm({ ...netForm, bridgeFeeBps: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Est gas USD</Label><Input type="number" step="0.01" value={netForm.estGasUsd} onChange={(e) => setNetForm({ ...netForm, estGasUsd: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNetDialog(false)}>Cancel</Button>
            <Button disabled={createNet.isPending} onClick={() => createNet.mutate()} data-testid="btn-create-network">{createNet.isPending ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Token dialog */}
      <Dialog open={tokDialog} onOpenChange={setTokDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Token</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Network</Label>
              <select value={tokForm.networkId} onChange={(e) => setTokForm({ ...tokForm, networkId: Number(e.target.value) })} className="w-full bg-muted/40 border border-border rounded-md px-3 py-2 text-sm">
                {networks.map((n) => <option key={n.id} value={n.id}>{n.displayName}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">Symbol</Label><Input value={tokForm.symbol} onChange={(e) => setTokForm({ ...tokForm, symbol: e.target.value.toUpperCase() })} placeholder="USDT" /></div>
            <div className="col-span-2"><Label className="text-xs">Name</Label><Input value={tokForm.name} onChange={(e) => setTokForm({ ...tokForm, name: e.target.value })} placeholder="Tether USD" /></div>
            <div className="col-span-2"><Label className="text-xs">Contract address (blank if native)</Label><Input value={tokForm.contractAddress} onChange={(e) => setTokForm({ ...tokForm, contractAddress: e.target.value })} placeholder="0x…" /></div>
            <div><Label className="text-xs">Decimals</Label><Input type="number" value={tokForm.decimals} onChange={(e) => setTokForm({ ...tokForm, decimals: Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Price coin (coins.symbol)</Label><Input value={tokForm.priceCoinSymbol} onChange={(e) => setTokForm({ ...tokForm, priceCoinSymbol: e.target.value.toUpperCase() })} placeholder="USDT" /></div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={tokForm.isNative} onChange={(e) => setTokForm({ ...tokForm, isNative: e.target.checked })} /> <Label className="text-xs">Is native</Label></div>
            <div className="flex items-center gap-2"><input type="checkbox" checked={tokForm.isStablecoin} onChange={(e) => setTokForm({ ...tokForm, isStablecoin: e.target.checked })} /> <Label className="text-xs">Is stablecoin</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokDialog(false)}>Cancel</Button>
            <Button disabled={createTok.isPending} onClick={() => createTok.mutate()} data-testid="btn-create-token">{createTok.isPending ? "Adding…" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
