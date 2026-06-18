import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, ShoppingCart, Tag, MessageSquare, Trash2, Power, ShieldCheck,
  AlertTriangle, AlertCircle, Loader2, Send, ArrowDown, ArrowUp, Wallet, RefreshCw,
  Check, X, Hourglass, CircleDot, IndianRupee, Building, Smartphone,
  Star, Edit2, CheckCircle2, Clock, Trophy, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useFeatureFlags } from "@/lib/features";
import { KycGate } from "@/components/KycGate";
import { get, post, ApiError } from "@/lib/api";
import {
  useListP2pOffers,
  useListMyP2pOffers,
  useGetP2pOffer,
  useUpdateP2pOffer,
  useDeleteP2pOffer,
  useCreateP2pOffer,
  useListP2pOfferSellerMethods,
  useListP2pOrders,
  useGetP2pOrder,
  useOpenP2pOrder,
  useMarkP2pOrderPaid,
  useReleaseP2pOrder,
  useCancelP2pOrder,
  useOpenP2pDispute,
  useListP2pMessages,
  usePostP2pMessage,
  useListP2pPaymentMethods,
  useCreateP2pPaymentMethod,
  useDeleteP2pPaymentMethod,
} from "@workspace/api-client-react";

// customFetch in @workspace/api-client-react doesn't default credentials
// (Expo uses bearer tokens), so opt cookie-auth in per-call here.
const COOKIE_REQ = { credentials: "include" as const };
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { EmptyState } from "@/components/premium/EmptyState";
import { StatusPill } from "@/components/premium/StatusPill";
import { toast } from "sonner";
import { SuccessModal, type GenericSuccess } from "@/components/SuccessModal";
import { Link } from "wouter";

type PaymentMethod = {
  id: number; method: string; label: string; account: string;
  ifsc: string | null; holderName: string | null; active: boolean;
};

type Coin = { id: number; symbol: string; name: string };

type Merchant = { id: number; name: string; handle: string; kycLevel: number; vipTier: number; createdAt: string };

type Offer = {
  id: number; uid: string; userId: number; side: "buy" | "sell";
  fiat: string; price: number; totalQty: number; availableQty: number;
  minFiat: number; maxFiat: number; paymentMethods: string[];
  payWindowMins: number; terms?: string | null; status: string;
  minKycLevel: number; minTrades: number;
  coin?: Coin | null; merchant: Merchant; createdAt: string;
};

type P2pOrder = {
  id: number; uid: string; offerId: number; buyerId: number; sellerId: number;
  fiat: string; price: number; qty: number; fiatAmount: number;
  paymentMethod: string; paymentAccount: string; paymentLabel: string;
  paymentIfsc?: string | null; paymentHolderName?: string | null;
  paymentUtr?: string | null;
  status: "pending" | "paid" | "released" | "cancelled" | "disputed" | "expired";
  paidAt?: string | null; releasedAt?: string | null; cancelledAt?: string | null;
  expiresAt: string; createdAt: string;
  disputeReason?: string | null; disputeOpenedBy?: number | null;
  role: "buyer" | "seller" | "admin";
  coin?: Coin | null;
  buyer: Merchant; seller: Merchant;
};

type ChatMsg = {
  id: number; orderId: number; senderId: number;
  senderRole: "buyer" | "seller" | "admin" | "system";
  body: string; createdAt: string;
};

type MerchantStats = {
  userId: number;
  totalTrades: number;
  completionRate: number;
  avgReleaseTimeSecs: number | null;
  avgRating: number | null;
  ratingCount: number;
};

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI", icon: Smartphone },
  { value: "imps", label: "IMPS", icon: Building },
  { value: "neft", label: "NEFT", icon: Building },
  { value: "bank", label: "Bank Transfer", icon: Building },
  { value: "paytm", label: "Paytm Wallet", icon: Smartphone },
  { value: "phonepe", label: "PhonePe", icon: Smartphone },
  { value: "gpay", label: "Google Pay", icon: Smartphone },
] as const;

function fmtINR(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function fmtCrypto(n: number, dp = 8): string {
  return n.toFixed(dp).replace(/\.?0+$/, "");
}
function relTime(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function methodLabel(m: string): string {
  return PAYMENT_METHODS.find(p => p.value === m)?.label ?? m.toUpperCase();
}

function StarDisplay({ score, size = "sm" }: { score: number | null; size?: "sm" | "xs" }) {
  if (!score) return null;
  const cls = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} className={`${cls} ${score >= s ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  );
}


export default function P2P() {
  const { user } = useAuth();
  const { flags } = useFeatureFlags();

  if (!flags.p2p) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center gap-6 px-4 text-center bg-background">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Hourglass className="w-9 h-9 text-amber-400" />
        </div>
        <div className="max-w-sm space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Coming Soon</p>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">P2P Marketplace</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Direct peer-to-peer crypto trading with INR/UPI escrow — launching soon on Zebvix.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 border border-border/50">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-muted-foreground font-medium">Launching soon on Zebvix</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader
          eyebrow="P2P"
          title="P2P Marketplace"
          description="Direct buyer ↔ seller trades with INR/UPI escrow."
        />
        <SectionCard>
          <EmptyState
            icon={Users}
            title="Login required"
            description="Please log in to access P2P trading."
            action={
              <Link href="/login">
                <Button>Login</Button>
              </Link>
            }
          />
        </SectionCard>
      </div>
    );
  }

  if ((user.kycLevel ?? 0) < 1) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <PageHeader eyebrow="Peer-to-Peer" title="P2P Marketplace" description="Direct buyer-seller trades secured by escrow." />
        <KycGate requiredLevel={1} feature="P2P Marketplace" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <PageHeader
        eyebrow="Peer-to-Peer"
        title="P2P Marketplace"
        description="Direct buyer-seller trades secured by INR/UPI/IMPS escrow. Post an ad or browse the marketplace."
        actions={
          <StatusPill status="active" variant="success">
            Live
          </StatusPill>
        }
      />

      <Tabs defaultValue="marketplace" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="marketplace" data-testid="p2p-tab-marketplace">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Marketplace
          </TabsTrigger>
          <TabsTrigger value="my-ads" data-testid="p2p-tab-my-ads">
            <Tag className="w-4 h-4 mr-2" />
            My Ads
          </TabsTrigger>
          <TabsTrigger value="my-orders" data-testid="p2p-tab-my-orders">
            <MessageSquare className="w-4 h-4 mr-2" />
            My Orders
          </TabsTrigger>
          <TabsTrigger value="payment-methods" data-testid="p2p-tab-payment-methods">
            <Wallet className="w-4 h-4 mr-2" />
            Payment
          </TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace"><MarketplaceTab /></TabsContent>
        <TabsContent value="my-ads"><MyAdsTab /></TabsContent>
        <TabsContent value="my-orders"><MyOrdersTab /></TabsContent>
        <TabsContent value="payment-methods"><PaymentMethodsTab /></TabsContent>
      </Tabs>
    </div>
  );
}


function MarketplaceTab() {
  // Toggle is labelled from the user's perspective; offerSide is the inverse
  // (user wants to BUY → list SELL ads, and vice versa).
  const [intent, setIntent] = useState<"buy" | "sell">("buy");
  const offerSide = intent === "buy" ? "sell" : "buy";
  const [coin, setCoin] = useState<string>("");
  const [method, setMethod] = useState<string>("");
  const [openOffer, setOpenOffer] = useState<Offer | null>(null);
  const [viewMerchant, setViewMerchant] = useState<Merchant | null>(null);

  const offersQ = useListP2pOffers(
    {
      side: offerSide,
      ...(coin ? { coin } : {}),
      ...(method ? { method: method as "upi" | "imps" | "neft" | "bank" | "paytm" | "phonepe" | "gpay" } : {}),
    },
    {
      request: COOKIE_REQ,
      query: { queryKey: ["/p2p/offers", offerSide, coin, method] },
    },
  );

  const coinsQ = useQuery<Coin[]>({
    queryKey: ["/coins"],
    queryFn: () => get<Coin[]>("/coins"),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <SectionCard padded={false}>
        <div className="p-4 border-b border-border/60 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
            <button
              type="button"
              onClick={() => setIntent("buy")}
              data-testid="p2p-intent-buy"
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                intent === "buy" ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Buy Crypto
            </button>
            <button
              type="button"
              onClick={() => setIntent("sell")}
              data-testid="p2p-intent-sell"
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                intent === "sell" ? "bg-rose-500 text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sell Crypto
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Select value={coin || "all"} onValueChange={(v) => setCoin(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px]" data-testid="p2p-filter-coin">
                <SelectValue placeholder="All coins" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-[240px]" sideOffset={4}>
                <SelectItem value="all">All coins</SelectItem>
                {(coinsQ.data ?? []).filter(c => c.symbol !== "INR").map(c => (
                  <SelectItem key={c.id} value={c.symbol}>{c.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={method || "all"} onValueChange={(v) => setMethod(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px]" data-testid="p2p-filter-method">
                <SelectValue placeholder="Any method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any method</SelectItem>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={() => offersQ.refetch()} data-testid="p2p-refresh">
              <RefreshCw className={`w-4 h-4 ${offersQ.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {offersQ.isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300" /></div>
        ) : offersQ.isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load offers" description={(offersQ.error as ApiError)?.message || "Try again in a moment"} />
        ) : (offersQ.data ?? []).length === 0 ? (
          <EmptyState
            icon={Users}
            title="No offers found"
            description="Try adjusting your filters or refresh in a moment."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="text-left p-3 font-medium">Merchant</th>
                  <th className="text-right p-3 font-medium">Price</th>
                  <th className="text-right p-3 font-medium">Available</th>
                  <th className="text-right p-3 font-medium">Limits (₹)</th>
                  <th className="text-left p-3 font-medium">Methods</th>
                  <th className="text-right p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(offersQ.data ?? []).map((o: any) => (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-muted/30" data-testid={`p2p-offer-${o.id}`}>
                    <td className="p-3">
                      <button
                        type="button"
                        className="font-semibold text-left hover:text-amber-300 transition-colors"
                        onClick={() => setViewMerchant(o.merchant)}
                      >
                        {o.merchant.name}
                      </button>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" /> KYC L{o.merchant.kycLevel}
                        {o.merchant.vipTier > 0 && <span className="text-amber-400">· VIP{o.merchant.vipTier}</span>}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-bold text-amber-300 tabular-nums">₹{fmtINR(o.price)}</div>
                      <div className="text-xs text-muted-foreground">per {o.coin?.symbol}</div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {fmtCrypto(o.availableQty, 4)} {o.coin?.symbol}
                    </td>
                    <td className="p-3 text-right tabular-nums text-xs">
                      ₹{fmtINR(o.minFiat)} – ₹{fmtINR(o.maxFiat)}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {o.paymentMethods.slice(0, 3).map((m: any) => (
                          <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">
                            {methodLabel(m)}
                          </Badge>
                        ))}
                        {o.paymentMethods.length > 3 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{o.paymentMethods.length - 3}</Badge>}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        onClick={() => setOpenOffer(o)}
                        className={intent === "buy" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"}
                        data-testid={`p2p-open-offer-${o.id}`}
                      >
                        {intent === "buy" ? "Buy" : "Sell"} {o.coin?.symbol}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {openOffer && (
        <OpenOrderDialog offer={openOffer} onClose={() => setOpenOffer(null)} />
      )}
      {viewMerchant && (
        <MerchantStatsDialog merchant={viewMerchant} onClose={() => setViewMerchant(null)} />
      )}
    </div>
  );
}


function OpenOrderDialog({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [fiatAmount, setFiatAmount] = useState<string>("");
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);

  // SELL ads: I'm the buyer → pick from the merchant's saved methods.
  // BUY ads:  I'm the seller → pick from MY OWN saved methods.
  const iAmSeller = offer.side === "buy";

  const myMethodsQ = useListP2pPaymentMethods({
    request: COOKIE_REQ,
    query: {
      queryKey: ["/p2p/payment-methods"],
      enabled: iAmSeller,
    },
  });

  // Seller methods come via /p2p/offers/:id/seller-methods (id+type+label only).
  const offerMethodsQ = useListP2pOfferSellerMethods(offer.id, {
    request: COOKIE_REQ,
    query: {
      queryKey: ["/p2p/offers", offer.id, "seller-methods"],
      enabled: !iAmSeller,
      retry: false,
    },
  });

  const fiatNum = Number(fiatAmount);
  const qty = fiatNum > 0 ? fiatNum / offer.price : 0;
  const kycOk = (user?.kycLevel ?? 0) >= offer.minKycLevel;
  const valid = fiatNum >= offer.minFiat && fiatNum <= offer.maxFiat
    && qty <= offer.availableQty && qty > 0
    && paymentMethodId != null && kycOk;

  const openMut = useOpenP2pOrder({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        toast.success("Order opened — pay window is now active. See My Orders.");
        qc.invalidateQueries({ queryKey: ["/p2p/orders"] });
        qc.invalidateQueries({ queryKey: ["/p2p/offers"] });
        onClose();
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Failed to open order"),
    },
  });

  const availableMethodChoices = iAmSeller
    ? (myMethodsQ.data ?? []).filter((pm: any) => offer.paymentMethods.includes(pm.method))
    : (offerMethodsQ.data ?? []);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="p2p-open-order-dialog">
        <DialogHeader>
          <DialogTitle>
            {iAmSeller ? "Sell" : "Buy"} {offer.coin?.symbol} from {offer.merchant.name}
          </DialogTitle>
          <DialogDescription>
            Price: ₹{fmtINR(offer.price)} per {offer.coin?.symbol}.
            Limits: ₹{fmtINR(offer.minFiat)} – ₹{fmtINR(offer.maxFiat)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label>Fiat amount (₹)</Label>
            <Input
              type="number"
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              placeholder={`Between ${offer.minFiat} and ${offer.maxFiat}`}
              data-testid="p2p-input-fiat"
            />
            {fiatNum > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                ≈ {fmtCrypto(qty, 8)} {offer.coin?.symbol}
              </div>
            )}
          </div>

          <div>
            <Label>{iAmSeller ? "Receive into" : "Payment method"}</Label>
            <Select value={paymentMethodId?.toString() ?? ""} onValueChange={(v) => setPaymentMethodId(Number(v))}>
              <SelectTrigger data-testid="p2p-select-method">
                <SelectValue placeholder="Choose payment method" />
              </SelectTrigger>
              <SelectContent>
                {availableMethodChoices.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    {iAmSeller
                      ? "Add a payment method first (Payment tab)"
                      : "Merchant has no compatible methods"}
                  </div>
                ) : (
                  availableMethodChoices.map((pm: any) => (
                    <SelectItem key={pm.id} value={pm.id.toString()}>
                      {methodLabel(pm.method)} · {pm.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {!kycOk && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              This offer requires <strong>KYC Level {offer.minKycLevel}</strong>. Your level is {user?.kycLevel ?? 0}.{" "}
              <Link href="/kyc" className="underline font-medium">Complete KYC →</Link>
            </div>
          )}

          {offer.terms && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="font-semibold mb-1 text-foreground">Merchant terms</div>
              {offer.terms}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => openMut.mutate({ data: { offerId: offer.id, fiatAmount: fiatNum, paymentMethodId: paymentMethodId! } })}
            disabled={!valid || openMut.isPending}
            data-testid="p2p-confirm-open"
          >
            {openMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Open Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function MyAdsTab() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const adsQ = useListMyP2pOffers({
    request: COOKIE_REQ,
    query: { queryKey: ["/p2p/offers/mine"] },
  });

  const toggleMut = useUpdateP2pOffer({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: ["/p2p/offers/mine"] }),
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Update failed"),
    },
  });
  const deleteMut = useDeleteP2pOffer({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/p2p/offers/mine"] });
        toast.success("Ad closed");
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Cannot close ad"),
    },
  });

  return (
    <div className="space-y-4">
      <SectionCard padded={false}>
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <div className="font-semibold">Your P2P Ads</div>
            <div className="text-xs text-muted-foreground">Counterparties can open orders against your online ads.</div>
          </div>
          <Button onClick={() => setCreating(true)} data-testid="p2p-create-ad">
            <Plus className="w-4 h-4 mr-2" /> New Ad
          </Button>
        </div>

        {adsQ.isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300" /></div>
        ) : (adsQ.data ?? []).length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No ads yet"
            description="Post your first P2P ad — trade as a buyer or seller."
            action={<Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-2" />Create First Ad</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="text-left p-3 font-medium">Side / Coin</th>
                  <th className="text-right p-3 font-medium">Price</th>
                  <th className="text-right p-3 font-medium">Avail. / Total</th>
                  <th className="text-right p-3 font-medium">Limits</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(adsQ.data ?? []).map((o: any) => (
                  <tr key={o.id} className="border-b border-border/40" data-testid={`p2p-myad-${o.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={o.side === "sell" ? "destructive" : "default"} className={o.side === "sell" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}>
                          {o.side.toUpperCase()}
                        </Badge>
                        <span className="font-semibold">{o.coin?.symbol}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">₹{fmtINR(o.price)}</td>
                    <td className="p-3 text-right tabular-nums text-xs">
                      {fmtCrypto(o.availableQty, 4)} / {fmtCrypto(o.totalQty, 4)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-xs">
                      ₹{fmtINR(o.minFiat)} – ₹{fmtINR(o.maxFiat)}
                    </td>
                    <td className="p-3">
                      <StatusPill status={o.status} />
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex gap-1">
                        {o.status !== "suspended" && (
                          <Button
                            size="icon" variant="outline"
                            onClick={() => toggleMut.mutate({ id: o.id, data: { status: o.status === "online" ? "offline" : "online" } })}
                            disabled={toggleMut.isPending}
                            title={o.status === "online" ? "Take offline" : "Bring online"}
                            data-testid={`p2p-toggle-${o.id}`}
                          >
                            <Power className={`w-4 h-4 ${o.status === "online" ? "text-emerald-400" : "text-muted-foreground"}`} />
                          </Button>
                        )}
                        <Button
                          size="icon" variant="outline"
                          onClick={() => { if (confirm("Close this ad? Active orders block deletion.")) deleteMut.mutate({ id: o.id }); }}
                          disabled={deleteMut.isPending}
                          title="Close ad"
                          data-testid={`p2p-delete-${o.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {creating && <CreateAdDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function defaultAdTerms(side: "buy" | "sell", mins: number): string {
  return side === "sell"
    ? `Payment must be completed within ${mins} minutes. Only accept transfers from your KYC-verified bank account or UPI. No third-party payments. Ensure the exact amount is transferred before confirming.`
    : `I will complete the payment within ${mins} minutes from my KYC-verified account. No cancellations after payment is sent. Please release crypto promptly once payment is confirmed.`;
}

function CreateAdDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [adSuccess, setAdSuccess] = useState<GenericSuccess | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [coinSymbol, setCoinSymbol] = useState("");
  const [coinSearch, setCoinSearch] = useState("");
  const [price, setPrice] = useState("");
  const [totalQty, setTotalQty] = useState("");
  const [minFiat, setMinFiat] = useState("");
  const [maxFiat, setMaxFiat] = useState("");
  const [methods, setMethods] = useState<string[]>(["upi"]);
  // Specific payment method IDs the seller pins for this ad (sell ads only)
  const [selectedMethodIds, setSelectedMethodIds] = useState<number[]>([]);
  const [payWindowMins, setPayWindowMins] = useState(15);
  const [terms, setTerms] = useState(() => defaultAdTerms("sell", 15));
  const [termsEdited, setTermsEdited] = useState(false);

  // Auto-update terms when side/payWindow changes — only if user hasn't manually edited
  useEffect(() => {
    if (!termsEdited) setTerms(defaultAdTerms(side, payWindowMins));
  }, [side, payWindowMins, termsEdited]);

  // Seller's saved payment methods — needed for sell ad validation
  const myMethodsQ = useListP2pPaymentMethods({
    request: COOKIE_REQ,
    query: { queryKey: ["/p2p/payment-methods"] },
  });
  const savedMethods: PaymentMethod[] = (myMethodsQ.data ?? []) as PaymentMethod[];

  // Count how many saved accounts exist per method type
  const savedCountByType = PAYMENT_METHODS.reduce<Record<string, number>>((acc, m) => {
    acc[m.value] = savedMethods.filter(sm => sm.method === m.value && sm.active).length;
    return acc;
  }, {});
  const hasSavedMethods = savedMethods.filter(sm => sm.active).length > 0;

  // For sell ads: auto-deselect method types that have no saved accounts
  useEffect(() => {
    if (side === "sell" && savedMethods.length > 0) {
      setMethods(prev => {
        const valid = prev.filter(m => (savedCountByType[m] ?? 0) > 0);
        // If nothing valid left, pick first available type
        if (valid.length === 0) {
          const first = PAYMENT_METHODS.find(m => (savedCountByType[m.value] ?? 0) > 0);
          return first ? [first.value] : [];
        }
        return valid;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, savedMethods.length]);

  const coinsQ = useQuery<Coin[]>({
    queryKey: ["/coins"],
    queryFn: () => get<Coin[]>("/coins"),
    staleTime: 60_000,
  });

  // Available balance for sell ads — /finance/wallet returns { items: [...] }
  // each item: { type: "SPOT"|"FIAT"|"FUTURES"|"ECO", currency: "BTC", balance: number }
  const walletQ = useQuery<{ balance: number; currency: string; type: string }[]>({
    queryKey: ["/finance/wallet", "spot"],
    queryFn: () =>
      get<any>("/finance/wallet").then((d: any) =>
        (d?.items ?? []).filter((w: any) => w.type === "SPOT")
      ),
    enabled: side === "sell",
    staleTime: 30_000,
  });
  const availBal = side === "sell" && coinSymbol
    ? Number((walletQ.data ?? []).find((w: any) => w.currency?.toUpperCase() === coinSymbol.toUpperCase())?.balance ?? 0)
    : null;

  const filteredCoins = (coinsQ.data ?? [])
    .filter(c => c.symbol !== "INR")
    .filter(c => !coinSearch || c.symbol.toLowerCase().includes(coinSearch.toLowerCase()) || c.name.toLowerCase().includes(coinSearch.toLowerCase()));

  const createMut = useCreateP2pOffer({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/p2p/offers/mine"] });
        qc.invalidateQueries({ queryKey: ["/p2p/offers"] });
        setAdSuccess({
          kind: "generic",
          accentColor: "#A78BFA",
          iconKind: "p2p_ad",
          title: "Ad Posted!",
          subtitle: `${coinSymbol} · ${side === "sell" ? "Sell" : "Buy"} Offer`,
          rows: [
            { label: "Coin",   value: coinSymbol },
            { label: "Price",  value: `₹${Number(price).toLocaleString("en-IN")} / ${coinSymbol}`, accent: "text-violet-400" },
            { label: "Qty",    value: `${totalQty} ${coinSymbol}` },
            { label: "Limit",  value: `₹${Number(minFiat).toLocaleString("en-IN")} – ₹${Number(maxFiat).toLocaleString("en-IN")}` },
          ],
          primaryLabel: "Done",
          onPrimaryExtra: onClose,
        });
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Create ad failed"),
    },
  });

  const valid = !!coinSymbol && Number(price) > 0 && Number(totalQty) > 0
    && Number(minFiat) > 0 && Number(maxFiat) >= Number(minFiat) && methods.length > 0
    && (side !== "sell" || (hasSavedMethods && selectedMethodIds.length > 0));

  return (<>
    <Dialog open onOpenChange={adSuccess ? undefined : onClose}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden flex flex-col max-h-[92vh]" data-testid="p2p-create-ad-dialog">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/15 ring-1 ring-violet-500/30">
              <Tag className="h-4 w-4 text-violet-400" />
            </div>
            Post a P2P Ad
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 ml-10">
            Set your price, quantity, and payment terms. Counterparties can open orders against live ads.
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Side + Coin row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">I want to</Label>
              <Select value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
                <SelectTrigger className="h-10" data-testid="p2p-ad-side"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sell">Sell crypto for INR</SelectItem>
                  <SelectItem value="buy">Buy crypto with INR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Coin</Label>
              <Select
                value={coinSymbol}
                onValueChange={(v) => { setCoinSymbol(v); setCoinSearch(""); }}
              >
                <SelectTrigger className="h-10" data-testid="p2p-ad-coin">
                  <SelectValue placeholder="Select coin" />
                </SelectTrigger>
                {/* position=popper avoids Dialog overflow clipping the dropdown */}
                <SelectContent position="popper" className="max-h-[260px]" sideOffset={4}>
                  {/* Coin search */}
                  <div className="px-2 pb-1.5 pt-1 border-b border-border/50">
                    <Input
                      value={coinSearch}
                      onChange={e => setCoinSearch(e.target.value)}
                      placeholder="Search coin…"
                      className="h-7 text-xs"
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                  {coinsQ.isLoading ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">Loading…</div>
                  ) : filteredCoins.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground text-center">No coins found</div>
                  ) : (
                    filteredCoins.map(c => (
                      <SelectItem key={c.id} value={c.symbol}>
                        <span className="font-semibold">{c.symbol}</span>
                        <span className="ml-1.5 text-muted-foreground text-xs">{c.name}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {/* Show available balance for sell ads */}
              {side === "sell" && coinSymbol && availBal !== null && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Wallet className="h-2.5 w-2.5" />
                  Available: <span className="font-medium text-foreground">{availBal.toFixed(6)} {coinSymbol}</span>
                </div>
              )}
            </div>
          </div>

          {/* Price + Qty */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price per coin</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 5500000"
                  className="h-10 pl-8"
                  data-testid="p2p-ad-price"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total Quantity {coinSymbol ? `(${coinSymbol})` : "(crypto)"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  value={totalQty}
                  onChange={(e) => setTotalQty(e.target.value)}
                  placeholder="e.g. 0.05"
                  className="h-10 pr-14"
                  data-testid="p2p-ad-qty"
                />
                {coinSymbol && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{coinSymbol}</span>
                )}
              </div>
              {/* Total value preview */}
              {Number(price) > 0 && Number(totalQty) > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  Total: <span className="font-medium text-foreground">₹{(Number(price) * Number(totalQty)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sell balance warning */}
          {side === "sell" && availBal !== null && Number(totalQty) > availBal && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Quantity exceeds available balance ({availBal.toFixed(6)} {coinSymbol})
            </div>
          )}

          {/* Order limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Min order (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  value={minFiat}
                  onChange={(e) => setMinFiat(e.target.value)}
                  placeholder="e.g. 500"
                  className="h-10 pl-8"
                  data-testid="p2p-ad-min"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Max order (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  value={maxFiat}
                  onChange={(e) => setMaxFiat(e.target.value)}
                  placeholder="e.g. 100000"
                  className="h-10 pl-8"
                  data-testid="p2p-ad-max"
                />
              </div>
              {Number(minFiat) > 0 && Number(maxFiat) > 0 && Number(maxFiat) < Number(minFiat) && (
                <div className="text-[11px] text-rose-400">Max must be ≥ Min</div>
              )}
            </div>
          </div>

          {/* Payment methods */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Accepted payment methods <span className="normal-case font-normal">(select at least one)</span>
              </Label>
            </div>

            {/* Sell ad + no saved methods → hard block */}
            {side === "sell" && !myMethodsQ.isLoading && !hasSavedMethods && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-rose-300">No payment methods added</p>
                  <p className="text-[11px] text-rose-400/80 mt-0.5">
                    You need at least one saved UPI/bank account before posting a sell ad. Buyers will pay to your saved account.
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-1.5 text-[11px] text-rose-300 underline underline-offset-2 hover:text-rose-200"
                  >
                    Go to Payment Methods tab →
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(m => {
                const Icon = m.icon;
                const checked = methods.includes(m.value);
                const count = savedCountByType[m.value] ?? 0;
                // For sell ads: disable types with no saved accounts
                const disabled = side === "sell" && count === 0;
                return (
                  <label
                    key={m.value}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      disabled
                        ? "border-border/30 bg-muted/20 text-muted-foreground/40 cursor-not-allowed opacity-50"
                        : checked
                          ? "border-violet-500/50 bg-violet-500/10 text-violet-300 cursor-pointer"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground cursor-pointer"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(c) => {
                        if (disabled) return;
                        const next = c ? [...methods, m.value] : methods.filter(x => x !== m.value);
                        setMethods(next);
                        // When unchecking a type, remove its account IDs from selection
                        if (!c) {
                          const typeIds = savedMethods.filter(sm => sm.method === m.value).map(sm => sm.id);
                          setSelectedMethodIds(prev => prev.filter(id => !typeIds.includes(id)));
                        }
                      }}
                      className="shrink-0"
                      data-testid={`p2p-ad-method-${m.value}`}
                    />
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-medium truncate">
                      {m.label}
                      {side === "sell" && count > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">({count})</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Sell ads: per-type specific account picker */}
            {side === "sell" && hasSavedMethods && methods.length > 0 && (
              <div className="space-y-2 mt-1">
                {methods.map(mType => {
                  const mDef = PAYMENT_METHODS.find(p => p.value === mType);
                  const Icon = mDef?.icon ?? Smartphone;
                  const accountsOfType = savedMethods.filter(sm => sm.method === mType && sm.active);
                  if (accountsOfType.length === 0) return null;
                  return (
                    <div key={mType} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {mDef?.label ?? mType} — select receiving account(s)
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {accountsOfType.map(acc => {
                          const picked = selectedMethodIds.includes(acc.id);
                          return (
                            <label
                              key={acc.id}
                              className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer transition-colors ${
                                picked
                                  ? "border-violet-500/50 bg-violet-500/10"
                                  : "border-border/40 hover:bg-muted/40"
                              }`}
                            >
                              <Checkbox
                                checked={picked}
                                onCheckedChange={(c) =>
                                  setSelectedMethodIds(prev =>
                                    c ? [...prev, acc.id] : prev.filter(x => x !== acc.id)
                                  )
                                }
                                className="shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-foreground truncate">{acc.account}</div>
                                {acc.label && acc.label !== acc.account && (
                                  <div className="text-[10px] text-muted-foreground truncate">{acc.label}</div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {selectedMethodIds.length === 0 && (
                  <div className="text-[11px] text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Select at least one account that will receive payment
                  </div>
                )}
              </div>
            )}

            {methods.length === 0 && hasSavedMethods && (
              <div className="text-[11px] text-rose-400">Select at least one payment method</div>
            )}
          </div>

          {/* Pay window */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pay window</Label>
              <Select value={String(payWindowMins)} onValueChange={(v) => setPayWindowMins(Number(v))}>
                <SelectTrigger className="h-10" data-testid="p2p-ad-paywindow"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="90">90 minutes</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground">Buyer must pay within this window</div>
            </div>
          </div>

          {/* Terms */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Terms <span className="normal-case font-normal">(optional)</span></Label>
            <Textarea
              value={terms}
              onChange={(e) => { setTerms(e.target.value); setTermsEdited(true); }}
              maxLength={500}
              rows={3}
              placeholder="e.g. Only KYC L2 users. UPI only. Pay within 10 mins."
              className="resize-none text-sm"
              data-testid="p2p-ad-terms"
            />
            <div className="text-[11px] text-muted-foreground text-right">{terms.length}/500</div>
          </div>

          {/* Sell escrow note */}
          {side === "sell" && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-3 text-xs text-amber-300/90 flex items-start gap-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>For SELL ads, crypto is escrowed when a buyer opens an order — your balance is locked at that point, not now.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate({
              data: {
                side,
                coinSymbol,
                fiat: "INR",
                price: Number(price),
                totalQty: Number(totalQty),
                minFiat: Number(minFiat),
                maxFiat: Number(maxFiat),
                paymentMethods: methods as Array<"upi" | "imps" | "neft" | "bank" | "paytm" | "phonepe" | "gpay">,
                ...(side === "sell" && selectedMethodIds.length > 0 ? { paymentMethodIds: selectedMethodIds } : {}),
                payWindowMins: payWindowMins as 15,
                ...(terms ? { terms } : {}),
              },
            })}
            disabled={!valid || createMut.isPending}
            data-testid="p2p-ad-submit"
          >
            {createMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Posting…</> : <><Tag className="w-4 h-4 mr-2" />Post Ad</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <SuccessModal
      open={adSuccess !== null}
      onClose={() => setAdSuccess(null)}
      payload={adSuccess}
    />
  </>);
}


function MyOrdersTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [openOrder, setOpenOrder] = useState<P2pOrder | null>(null);

  const ordersQ = useListP2pOrders(
    statusFilter !== "all"
      ? { status: statusFilter as "pending" | "paid" | "released" | "cancelled" | "disputed" | "expired" }
      : undefined,
    {
      request: COOKIE_REQ,
      query: {
        queryKey: ["/p2p/orders", statusFilter],
        refetchInterval: 10_000,
      },
    },
  );

  return (
    <div className="space-y-4">
      <SectionCard padded={false}>
        <div className="p-4 border-b border-border/60 flex items-center justify-between gap-3">
          <div className="font-semibold">Your P2P Orders</div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="p2p-orders-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid (awaiting release)</SelectItem>
              <SelectItem value="released">Released</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {ordersQ.isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300" /></div>
        ) : (ordersQ.data ?? []).length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No orders yet"
            description="Browse the marketplace or post your own ad to get started."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="text-left p-3 font-medium">Role / Coin</th>
                  <th className="text-left p-3 font-medium">Counterparty</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Method</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(ordersQ.data ?? []).map((o: any) => (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-muted/30" data-testid={`p2p-order-${o.id}`}>
                    <td className="p-3">
                      <Badge className={o.role === "buyer" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border-rose-500/30"}>
                        {o.role === "buyer" ? <ArrowDown className="w-3 h-3 mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                        {o.role.toUpperCase()}
                      </Badge>
                      <div className="text-xs mt-1 font-semibold">{o.coin?.symbol}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-sm">{o.role === "buyer" ? o.seller.name : o.buyer.name}</div>
                      <div className="text-[10px] text-muted-foreground">{relTime(o.createdAt)}</div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      <div className="font-bold">₹{fmtINR(o.fiatAmount)}</div>
                      <div className="text-xs text-muted-foreground">{fmtCrypto(o.qty, 6)} {o.coin?.symbol}</div>
                    </td>
                    <td className="p-3 text-xs">
                      {methodLabel(o.paymentMethod)}<br />
                      <span className="text-muted-foreground">{o.paymentLabel}</span>
                    </td>
                    <td className="p-3">
                      <StatusPill status={o.status} />
                      {o.status === "pending" && (
                        <div className="text-[10px] text-amber-300 mt-1 flex items-center gap-1">
                          <Hourglass className="w-3 h-3" /> {timeLeft(o.expiresAt)}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setOpenOrder(o)} data-testid={`p2p-open-order-${o.id}`}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {openOrder && <OrderDetailDialog order={openOrder} onClose={() => setOpenOrder(null)} />}
    </div>
  );
}


function OrderDetailDialog({ order: initial, onClose }: { order: P2pOrder; onClose: () => void }) {
  const qc = useQueryClient();
  const [utr, setUtr] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidenceUrl, setDisputeEvidenceUrl] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [chatBody, setChatBody] = useState("");
  const [p2pSuccess, setP2pSuccess] = useState<GenericSuccess | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const orderQ = useGetP2pOrder(initial.id, {
    request: COOKIE_REQ,
    query: {
      queryKey: ["/p2p/orders", initial.id],
      initialData: initial,
      refetchInterval: 4000,
    },
  });
  const order = (orderQ.data ?? initial) as P2pOrder;

  const messagesQ = useListP2pMessages(initial.id, {
    request: COOKIE_REQ,
    query: {
      queryKey: ["/p2p/orders", initial.id, "messages"],
      refetchInterval: 4000,
    },
  });

  const onActionFail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Request failed");

  const markPaidMut = useMarkP2pOrderPaid({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        setP2pSuccess({
          kind: "generic", accentColor: "#F59E0B", iconKind: "paid",
          title: "Marked as Paid!", subtitle: `Order #${order.id}`,
          rows: [
            { label: "Status",   value: "Awaiting seller release", accent: "text-amber-300" },
            { label: "Coin",     value: order.coin?.symbol ?? "—" },
            { label: "INR Amt",  value: `₹${Number(order.fiatAmount).toLocaleString("en-IN")}` },
          ],
          primaryLabel: "Got it",
        });
        qc.invalidateQueries({ queryKey: ["/p2p/orders"] });
      },
      onError: onActionFail,
    },
  });
  const releaseMut = useReleaseP2pOrder({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        setP2pSuccess({
          kind: "generic", accentColor: "#10B981", iconKind: "p2p",
          title: "Crypto Released!", subtitle: `Order #${order.id} Complete`,
          rows: [
            { label: "Status",   value: "Trade Complete ✓", accent: "text-emerald-400" },
            { label: "Sent",     value: `${order.qty} ${order.coin?.symbol ?? ""}`, accent: "text-emerald-400" },
            { label: "Received", value: `₹${Number(order.fiatAmount).toLocaleString("en-IN")}` },
          ],
          primaryLabel: "Rate Counterparty",
          onPrimaryExtra: () => setShowRating(true),
        });
        qc.invalidateQueries({ queryKey: ["/p2p/orders"] });
      },
      onError: onActionFail,
    },
  });
  const cancelMut = useCancelP2pOrder({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        setP2pSuccess({
          kind: "generic", accentColor: "#94A3B8", iconKind: "p2p",
          title: "Order Cancelled", subtitle: `Order #${order.id}`,
          rows: [
            { label: "Status",  value: "Cancelled", accent: "text-muted-foreground" },
            { label: "Escrow",  value: "Refunded to seller", accent: "text-emerald-400" },
          ],
          primaryLabel: "Rate Counterparty",
          onPrimaryExtra: () => setShowRating(true),
        });
        qc.invalidateQueries({ queryKey: ["/p2p/orders"] });
      },
      onError: onActionFail,
    },
  });
  const disputeMut = useOpenP2pDispute({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        setP2pSuccess({
          kind: "generic", accentColor: "#EF4444", iconKind: "dispute",
          title: "Dispute Opened", subtitle: `Order #${order.id} · Under Review`,
          rows: [
            { label: "Status", value: "Under Review", accent: "text-amber-300" },
            { label: "Action", value: "Admin will review within 24h", accent: "text-muted-foreground" },
          ],
          primaryLabel: "Got it",
        });
        setShowDispute(false);
        qc.invalidateQueries({ queryKey: ["/p2p/orders"] });
      },
      onError: onActionFail,
    },
  });
  const sendChatMut = usePostP2pMessage({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => { setChatBody(""); messagesQ.refetch(); },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Send failed"),
    },
  });

  useScrollToBottom(chatEndRef, messagesQ.data?.length ?? 0);

  const isBuyer = order.role === "buyer";
  const isSeller = order.role === "seller";
  const canMarkPaid = isBuyer && order.status === "pending";
  const canRelease = isSeller && order.status === "paid";
  const canCancel = (isBuyer || isSeller) && order.status === "pending";
  const canDispute = (isBuyer || isSeller) && (order.status === "pending" || order.status === "paid");

  return (<>
    <Dialog open onOpenChange={p2pSuccess ? undefined : onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="p2p-order-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            P2P Order #{order.id}
            <StatusPill status={order.status} />
          </DialogTitle>
          <DialogDescription>
            You are the <strong>{order.role}</strong> · Counterparty:{" "}
            {isBuyer ? order.seller.name : order.buyer.name}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: payment details + actions */}
          <div className="space-y-3">
            <SectionCard title="Order Details">
              <div className="text-sm space-y-2">
                <Row label="Coin" value={order.coin?.symbol || "—"} />
                <Row label="Quantity" value={`${fmtCrypto(order.qty, 8)} ${order.coin?.symbol}`} />
                <Row label="Price" value={`₹${fmtINR(order.price)}`} />
                <Row label="Total" value={`₹${fmtINR(order.fiatAmount)}`} bold />
                {order.status === "pending" && (
                  <Row label="Expires in" value={timeLeft(order.expiresAt)} accent />
                )}
              </div>
            </SectionCard>

            <SectionCard title={isBuyer ? "Pay To" : "Receive From"}>
              <div className="text-sm space-y-2">
                <Row label="Method" value={methodLabel(order.paymentMethod)} />
                <Row label="Account / VPA" value={order.paymentAccount} mono />
                {order.paymentIfsc && <Row label="IFSC" value={order.paymentIfsc} mono />}
                {order.paymentHolderName && <Row label="Holder" value={order.paymentHolderName} />}
                <Row label="Label" value={order.paymentLabel} />
                {order.paymentUtr && <Row label="UTR" value={order.paymentUtr} mono />}
              </div>
            </SectionCard>

            <SectionCard title="Actions">
              <div className="space-y-2">
                {canMarkPaid && (
                  <div className="space-y-2">
                    <Input
                      placeholder="Optional: UPI/IMPS UTR reference"
                      value={utr}
                      onChange={(e) => setUtr(e.target.value)}
                      data-testid="p2p-utr-input"
                    />
                    <Button
                      className="w-full bg-emerald-500 hover:bg-emerald-600"
                      onClick={() => markPaidMut.mutate({ id: order.id, data: { utr: utr || undefined } })}
                      disabled={markPaidMut.isPending}
                      data-testid="p2p-mark-paid"
                    >
                      {markPaidMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      <Check className="w-4 h-4 mr-2" /> I've Paid — Mark as Paid
                    </Button>
                  </div>
                )}
                {canRelease && (
                  <Button
                    className="w-full bg-emerald-500 hover:bg-emerald-600"
                    onClick={() => { if (confirm("Confirm fiat received and release crypto to buyer?")) releaseMut.mutate({ id: order.id }); }}
                    disabled={releaseMut.isPending}
                    data-testid="p2p-release"
                  >
                    {releaseMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <ShieldCheck className="w-4 h-4 mr-2" /> Confirm & Release Crypto
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { if (confirm("Cancel this order? Escrow refunds to seller.")) cancelMut.mutate({ id: order.id }); }}
                    disabled={cancelMut.isPending}
                    data-testid="p2p-cancel"
                  >
                    <X className="w-4 h-4 mr-2" /> Cancel Order
                  </Button>
                )}
                {canDispute && (
                  <Button
                    variant="outline"
                    className="w-full text-amber-300 border-amber-500/40 hover:bg-amber-500/10"
                    onClick={() => setShowDispute(true)}
                    data-testid="p2p-dispute-btn"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" /> Open Dispute
                  </Button>
                )}
                {!canMarkPaid && !canRelease && !canCancel && !canDispute && (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    No actions available for this status.
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Right: chat */}
          <div>
            <SectionCard title={`Chat (${messagesQ.data?.length || 0})`} padded={false}>
              <div
                id="p2p-chat-scroll"
                className="h-[360px] overflow-y-auto p-3 space-y-2 text-sm"
              >
                {(messagesQ.data ?? []).length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hi 👋</div>
                )}
                {(messagesQ.data ?? []).map((m: any) => {
                  const fromMe = m.senderRole !== "system" && m.senderRole !== "admin"
                    && ((isBuyer && m.senderRole === "buyer") || (isSeller && m.senderRole === "seller"));
                  const isSystem = m.senderRole === "system";
                  const isAdmin = m.senderRole === "admin";
                  const isImgUrl = /^https?:\/\/.+\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(m.body.trim());
                  const isUrl = /^https?:\/\//i.test(m.body.trim());
                  return (
                    <div key={m.id} className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-1.5 ${
                        isSystem ? "bg-muted/50 text-xs text-muted-foreground italic mx-auto text-center"
                        : isAdmin ? "bg-amber-500/20 border border-amber-500/30 text-amber-200"
                        : fromMe ? "bg-emerald-500/20 border border-emerald-500/30"
                        : "bg-muted/40 border border-border"
                      }`}>
                        {(isAdmin || (!isSystem && !fromMe)) && (
                          <div className="text-[10px] opacity-70 mb-0.5 capitalize font-medium">{m.senderRole}</div>
                        )}
                        {isImgUrl ? (
                          <img
                            src={m.body.trim()}
                            alt="shared"
                            className="max-w-full max-h-36 rounded object-cover mt-0.5"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : isUrl ? (
                          <a href={m.body.trim()} target="_blank" rel="noopener noreferrer"
                             className="underline break-all flex items-center gap-1">
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />{m.body}
                          </a>
                        ) : (
                          <div className="break-words">{m.body}</div>
                        )}
                        <div className="text-[10px] opacity-60 mt-0.5">{relTime(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-border/60 p-2 flex gap-2">
                <Input
                  placeholder="Type a message or paste an image URL…"
                  value={chatBody}
                  onChange={(e) => setChatBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && chatBody.trim()) { e.preventDefault(); sendChatMut.mutate({ id: order.id, data: { body: chatBody } }); } }}
                  data-testid="p2p-chat-input"
                />
                <Button
                  size="icon"
                  onClick={() => sendChatMut.mutate({ id: order.id, data: { body: chatBody } })}
                  disabled={!chatBody.trim() || sendChatMut.isPending}
                  data-testid="p2p-chat-send"
                >
                  {sendChatMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </SectionCard>
          </div>
        </div>

        {showDispute && (
          <Dialog open onOpenChange={() => setShowDispute(false)}>
            <DialogContent data-testid="p2p-dispute-dialog">
              <DialogHeader>
                <DialogTitle>Open a Dispute</DialogTitle>
                <DialogDescription>Admin will review and decide. Provide as much detail as possible.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Reason</Label>
                  <Textarea
                    rows={4}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Describe the issue (min 10 chars). E.g., Buyer hasn't sent UTR after 20 mins; Seller not releasing despite payment confirmed."
                    data-testid="p2p-dispute-reason"
                  />
                </div>
                <div>
                  <Label className="text-xs">Evidence URL (optional)</Label>
                  <Input
                    type="url"
                    value={disputeEvidenceUrl}
                    onChange={(e) => setDisputeEvidenceUrl(e.target.value)}
                    placeholder="https://… (link to screenshot, bank statement, chat)"
                    maxLength={500}
                    data-testid="p2p-dispute-evidence"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Paste a public link to a screenshot or document. Admin will review along with your reason.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDispute(false)}>Cancel</Button>
                <Button
                  onClick={() => disputeMut.mutate({
                    id: order.id,
                    data: {
                      reason: disputeReason,
                      ...(disputeEvidenceUrl.trim() ? { evidenceUrl: disputeEvidenceUrl.trim() } : {}),
                    },
                  })}
                  disabled={disputeReason.length < 10 || disputeMut.isPending}
                  data-testid="p2p-dispute-submit"
                >
                  {disputeMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Submit Dispute
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>

    <SuccessModal
      open={p2pSuccess !== null}
      onClose={() => setP2pSuccess(null)}
      payload={p2pSuccess}
    />

    {showRating && (
      <RatingDialog order={order} onClose={() => setShowRating(false)} />
    )}
  </>);
}

function useScrollToBottom(ref: React.RefObject<HTMLDivElement | null>, dep: number) {
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }, [dep]);
}

function Row({ label, value, mono, bold, accent }: { label: string; value: string; mono?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""} ${accent ? "text-amber-300" : ""}`}>{value}</span>
    </div>
  );
}


function PaymentMethodsTab() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editMethod, setEditMethod] = useState<PaymentMethod | null>(null);

  const methodsQ = useListP2pPaymentMethods({
    request: COOKIE_REQ,
    query: { queryKey: ["/p2p/payment-methods"] },
  });

  const deleteMut = useDeleteP2pPaymentMethod({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/p2p/payment-methods"] });
        toast.success("Removed");
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Request failed"),
    },
  });

  return (
    <div className="space-y-4">
      <SectionCard padded={false}>
        <div className="p-4 border-b border-border/60 flex items-center justify-between">
          <div>
            <div className="font-semibold">Saved Payment Methods</div>
            <div className="text-xs text-muted-foreground">These appear when you sell crypto on P2P. Buyers pay you here.</div>
          </div>
          <Button onClick={() => setAdding(true)} data-testid="p2p-add-method">
            <Plus className="w-4 h-4 mr-2" /> Add Method
          </Button>
        </div>

        {methodsQ.isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-300" /></div>
        ) : (methodsQ.data ?? []).length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payment methods added"
            description="Add a UPI ID, IMPS, or bank account to start selling on P2P."
            action={<Button onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-2" />Add First Method</Button>}
          />
        ) : (
          <div className="divide-y divide-border/40">
            {(methodsQ.data ?? []).map((m: any) => (
              <div key={m.id} className="p-4 flex items-center justify-between" data-testid={`p2p-method-${m.id}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-amber-500/15 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{m.label}</span>
                      {m.verified
                        ? <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-300 border-emerald-500/30 flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                          </Badge>
                        : <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            Self-reported
                          </Badge>
                      }
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {methodLabel(m.method)} · {m.account}
                      {m.ifsc && <> · {m.ifsc}</>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon" variant="outline"
                    onClick={() => setEditMethod(m)}
                    title="Edit method"
                    data-testid={`p2p-edit-method-${m.id}`}
                  >
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon" variant="outline"
                    onClick={() => { if (confirm("Remove this payment method?")) deleteMut.mutate({ id: m.id }); }}
                    disabled={deleteMut.isPending}
                    data-testid={`p2p-delete-method-${m.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {adding && <AddMethodDialog onClose={() => setAdding(false)} />}
      {editMethod && <EditMethodDialog method={editMethod} onClose={() => setEditMethod(null)} />}
    </div>
  );
}

// ─── Rating Dialog ────────────────────────────────────────────────────────
function RatingDialog({ order, onClose }: { order: P2pOrder; onClose: () => void }) {
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const counterparty = order.role === "buyer" ? order.seller : order.buyer;
  const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

  const handleSubmit = async () => {
    if (score === 0 || loading) return;
    setLoading(true);
    try {
      await post(`/p2p/orders/${order.id}/rate`, { score, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      setSubmitted(true);
    } catch {
      toast.error("Could not submit rating — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" /> Rate Your Trade
          </DialogTitle>
          <DialogDescription>
            How was your experience with <strong>{counterparty.name}</strong>?
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="text-center py-6 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <div className="font-semibold text-lg">Thanks for your feedback!</div>
            <div className="text-sm text-muted-foreground">Your review helps build trust on the P2P marketplace.</div>
            <Button className="mt-2" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="flex justify-center gap-1.5">
                {[1,2,3,4,5].map(s => (
                  <button
                    key={s} type="button"
                    className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setScore(s)}
                  >
                    <Star className={`w-9 h-9 transition-colors ${(hovered || score) >= s
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40"}`}
                    />
                  </button>
                ))}
              </div>
              {(hovered || score) > 0 && (
                <div className="text-center text-sm font-medium text-amber-300">
                  {LABELS[hovered || score]}
                </div>
              )}
              <div>
                <Label className="text-xs">Comment (optional)</Label>
                <Textarea
                  placeholder="Share details about your experience…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className="mt-1"
                />
                <div className="text-right text-xs text-muted-foreground mt-0.5">{comment.length}/300</div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Skip</Button>
              <Button onClick={handleSubmit} disabled={score === 0 || loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Submit Rating
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Merchant Stats Dialog ─────────────────────────────────────────────────
function MerchantStatsDialog({ merchant, onClose }: { merchant: Merchant; onClose: () => void }) {
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch(`/api/p2p/merchant/${merchant.id}/stats`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStats)
      .catch(() => setErr(true));
  }, [merchant.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> {merchant.name}
          </DialogTitle>
          <DialogDescription>P2P merchant profile</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
              <ShieldCheck className="w-3 h-3 mr-1" /> KYC Level {merchant.kycLevel}
            </Badge>
            {merchant.vipTier > 0 && (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
                VIP {merchant.vipTier}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Since {new Date(merchant.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short" })}
            </span>
          </div>

          {err ? (
            <div className="text-center text-sm text-muted-foreground py-2">Could not load stats.</div>
          ) : !stats ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-amber-300" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{stats.totalTrades}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total Trades</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                <div className={`text-2xl font-bold ${stats.completionRate >= 90 ? "text-emerald-400" : stats.completionRate >= 70 ? "text-amber-400" : "text-rose-400"}`}>
                  {stats.completionRate}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Completion Rate</div>
              </div>
              {stats.avgRating != null && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    <span className="text-2xl font-bold text-amber-400">{stats.avgRating}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{stats.ratingCount} review{stats.ratingCount !== 1 ? "s" : ""}</div>
                </div>
              )}
              {stats.avgReleaseTimeSecs != null && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-2xl font-bold text-blue-400">
                      {stats.avgReleaseTimeSecs < 60
                        ? `${stats.avgReleaseTimeSecs}s`
                        : `${Math.round(stats.avgReleaseTimeSecs / 60)}m`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Avg Release Time</div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Payment Method Dialog ────────────────────────────────────────────
function EditMethodDialog({ method, onClose }: { method: PaymentMethod; onClose: () => void }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(method.label);
  const [account, setAccount] = useState(method.account);
  const [ifsc, setIfsc] = useState(method.ifsc || "");
  const [holderName, setHolderName] = useState(method.holderName || "");

  const needsBank = method.method === "imps" || method.method === "neft" || method.method === "bank";

  const deleteMut = useDeleteP2pPaymentMethod({ request: COOKIE_REQ, mutation: {} });
  const createMut = useCreateP2pPaymentMethod({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/p2p/payment-methods"] });
        toast.success("Payment method updated");
        onClose();
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Update failed"),
    },
  });

  const valid = !!label && !!account && (!needsBank || (!!ifsc && !!holderName));
  const busy = deleteMut.isPending || createMut.isPending;

  const handleSave = () => {
    if (!valid || busy) return;
    deleteMut.mutate({ id: method.id }, {
      onSuccess: () => {
        createMut.mutate({
          data: {
            method: method.method as "upi" | "imps" | "neft" | "bank" | "paytm" | "phonepe" | "gpay",
            label, account,
            ...(needsBank ? { ifsc, holderName } : {}),
          },
        });
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not update — please try again"),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="p2p-edit-method-dialog">
        <DialogHeader>
          <DialogTitle>Edit Payment Method</DialogTitle>
          <DialogDescription>Updating saves a new record and removes the old one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Method type (read-only)</Label>
            <div className="text-sm font-medium mt-0.5">{methodLabel(method.method)}</div>
          </div>
          <div>
            <Label>Display label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>{needsBank ? "Account number" : method.method === "upi" ? "UPI ID (VPA)" : "Phone / Account"}</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} className="mt-1" />
          </div>
          {needsBank && (
            <>
              <div>
                <Label>IFSC code</Label>
                <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} className="mt-1" />
              </div>
              <div>
                <Label>Account holder name</Label>
                <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} className="mt-1" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!valid || busy} data-testid="p2p-edit-method-save">
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMethodDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [method, setMethod] = useState("upi");
  const [label, setLabel] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holderName, setHolderName] = useState(() => user?.fullName ?? "");

  const needsBank = method === "imps" || method === "neft" || method === "bank";

  const createMut = useCreateP2pPaymentMethod({
    request: COOKIE_REQ,
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/p2p/payment-methods"] });
        toast.success("Payment method saved");
        onClose();
      },
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Request failed"),
    },
  });

  const valid = !!label && !!account && (!needsBank || (!!ifsc && !!holderName));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent data-testid="p2p-add-method-dialog">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Method type</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger data-testid="p2p-method-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Display label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={needsBank ? "e.g. HDFC Primary" : "e.g. Personal UPI"} data-testid="p2p-method-label" />
          </div>
          <div>
            <Label>{needsBank ? "Account number" : method === "upi" ? "UPI ID (VPA)" : "Phone / Account"}</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={method === "upi" ? "e.g. yourname@okhdfcbank" : "Account / Handle"} data-testid="p2p-method-account" />
          </div>
          {needsBank && (
            <>
              <div>
                <Label>IFSC code</Label>
                <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="e.g. HDFC0000123" data-testid="p2p-method-ifsc" />
              </div>
              <div>
                <Label>Account holder name</Label>
                <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="As per bank records" data-testid="p2p-method-holder" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createMut.mutate({
              data: {
                method: method as "upi" | "imps" | "neft" | "bank" | "paytm" | "phonepe" | "gpay",
                label,
                account,
                ...(needsBank ? { ifsc, holderName } : {}),
              },
            })}
            disabled={!valid || createMut.isPending}
            data-testid="p2p-method-submit"
          >
            {createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
