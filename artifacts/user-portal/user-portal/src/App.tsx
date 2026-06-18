import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, RequireAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/lib/theme";
import { useFeatureFlags, type FeatureKey } from "@/lib/features";
import type { ReactNode } from "react";

import Home from "@/pages/Home";
import Markets from "@/pages/Markets";
import Trade from "@/pages/Trade";
import Futures from "@/pages/Futures";
import Options from "@/pages/Options";
import Web3 from "@/pages/Web3";
import Discover from "@/pages/Discover";
import Wallet from "@/pages/Wallet";
import Orders from "@/pages/Orders";
import Invoice from "@/pages/Invoice";
import ConvertInvoice from "@/pages/ConvertInvoice";
import Portfolio from "@/pages/Portfolio";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import Profile from "@/pages/Profile";
import Kyc from "@/pages/Kyc";
import Banks from "@/pages/Banks";
import Settings from "@/pages/Settings";
import Earn from "@/pages/Earn";
import Invite from "@/pages/Invite";
import Support from "@/pages/Support";
import About from "@/pages/About";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Aml from "@/pages/Aml";
import Cookies from "@/pages/Cookies";
import Risk from "@/pages/Risk";
import Fees from "@/pages/Fees";
import ApiDocs from "@/pages/ApiDocs";
import ApiStatus from "@/pages/ApiStatus";
import Careers from "@/pages/Careers";
import Blog from "@/pages/Blog";
import Press from "@/pages/Press";
import Contact from "@/pages/Contact";
import Help from "@/pages/Help";
import Tutorials from "@/pages/Tutorials";
import Status from "@/pages/Status";
import P2P from "@/pages/P2P";
import Convert from "@/pages/Convert";
import Notifications from "@/pages/Notifications";
import Bots from "@/pages/Bots";
import AITrading from "@/pages/AITrading";
import AutoInvest from "@/pages/AutoInvest";
import AIInvoice from "@/pages/AIInvoice";
import SpotStatement from "@/pages/SpotStatement";
import AIStatement from "@/pages/AIStatement";
import Ledger from "@/pages/Ledger";
import Referrals from "@/pages/Referrals";
import CopyTrading from "@/pages/CopyTrading";
import PortfolioPro from "@/pages/PortfolioPro";
import ProDashboard from "@/pages/ProDashboard";
import Calculator from "@/pages/tools/Calculator";
import Converter from "@/pages/tools/Converter";
import Compare from "@/pages/tools/Compare";
import Predictions from "@/pages/tools/Predictions";
import Announcements from "@/pages/Announcements";
import News from "@/pages/News";
import Leagues from "@/pages/Leagues";
import Forex from "@/pages/Forex";
import SmartAPI from "@/pages/SmartAPI";
import Stocks from "@/pages/Stocks";
import Commodities from "@/pages/Commodities";
import BrokerOnboarding from "@/pages/BrokerOnboarding";
import BrokerDashboard from "@/pages/BrokerDashboard";
import SupportChatWidget from "@/components/SupportChatWidget";
import PriceAlerts from "@/pages/PriceAlerts";
import INRPayments from "@/pages/INRPayments";
import SupportTickets from "@/pages/SupportTickets";
import ComingSoon from "@/pages/ComingSoon";
import NotFound from "@/pages/not-found";
import CreatorRewards from "@/pages/CreatorRewards";

const queryClient = new QueryClient();

/** Gates a feature — renders ComingSoon if the flag is off. */
function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { flags, isLoading } = useFeatureFlags();
  if (isLoading) return null;
  if (!flags[feature]) return <ComingSoon featureKey={feature} />;
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset}>
            <AuthProvider>
              <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppShell>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/markets" component={Markets} />

                {/* ── Spot Trading ───────────────────────────────── */}
                <Route path="/trade/:symbol?">
                  {() => <RequireAuth><FeatureGate feature="spot_trading"><Trade /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Futures ────────────────────────────────────── */}
                <Route path="/futures/:symbol?">
                  {() => <RequireAuth><FeatureGate feature="futures"><Futures /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Options ────────────────────────────────────── */}
                <Route path="/options">
                  {() => <RequireAuth><FeatureGate feature="options"><Options /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/web3">{() => <RequireAuth><Web3 /></RequireAuth>}</Route>
                <Route path="/discover" component={Discover} />

                {/* ── Wallet ─────────────────────────────────────── */}
                <Route path="/wallet">
                  {() => <RequireAuth><FeatureGate feature="wallet"><Wallet /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/orders/:id/invoice">
                  {() => <RequireAuth><Invoice /></RequireAuth>}
                </Route>
                <Route path="/convert/:id/invoice">
                  {() => <RequireAuth><ConvertInvoice /></RequireAuth>}
                </Route>
                <Route path="/orders/statement">
                  {() => <RequireAuth><SpotStatement /></RequireAuth>}
                </Route>
                <Route path="/orders">
                  {() => <RequireAuth><Orders /></RequireAuth>}
                </Route>

                {/* ── Portfolio ──────────────────────────────────── */}
                <Route path="/portfolio">
                  {() => <RequireAuth><FeatureGate feature="portfolio"><Portfolio /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/profile">
                  {() => <RequireAuth><Profile /></RequireAuth>}
                </Route>
                <Route path="/kyc">
                  {() => <RequireAuth><Kyc /></RequireAuth>}
                </Route>
                <Route path="/banks">
                  {() => <RequireAuth><Banks /></RequireAuth>}
                </Route>
                <Route path="/settings">
                  {() => <RequireAuth><Settings /></RequireAuth>}
                </Route>

                {/* ── Earn ───────────────────────────────────────── */}
                <Route path="/earn">
                  {() => <RequireAuth><FeatureGate feature="earn"><Earn /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Referrals ──────────────────────────────────── */}
                <Route path="/invite">
                  {() => <RequireAuth><FeatureGate feature="referrals"><Invite /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/support" component={Support} />

                {/* Legal — always available */}
                <Route path="/about" component={About} />
                <Route path="/terms" component={Terms} />
                <Route path="/privacy" component={Privacy} />
                <Route path="/aml" component={Aml} />
                <Route path="/cookies" component={Cookies} />
                <Route path="/risk" component={Risk} />
                <Route path="/api-docs" component={ApiDocs} />
                <Route path="/legal/terms" component={Terms} />
                <Route path="/legal/privacy" component={Privacy} />
                <Route path="/legal/aml" component={Aml} />
                <Route path="/legal/cookies" component={Cookies} />
                <Route path="/legal/risk" component={Risk} />
                <Route path="/fees" component={Fees} />
                <Route path="/creator-rewards" component={CreatorRewards} />
                <Route path="/docs/api" component={ApiDocs} />
                <Route path="/careers" component={Careers} />
                <Route path="/blog" component={Blog} />
                <Route path="/press" component={Press} />
                <Route path="/contact" component={Contact} />
                <Route path="/help" component={Help} />
                <Route path="/tutorials" component={Tutorials} />
                <Route path="/status" component={Status} />
                <Route path="/api-status" component={ApiStatus} />

                {/* ── P2P ────────────────────────────────────────── */}
                <Route path="/p2p">
                  {() => <RequireAuth><FeatureGate feature="p2p"><P2P /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Convert ────────────────────────────────────── */}
                <Route path="/convert">
                  {() => <RequireAuth><FeatureGate feature="convert"><Convert /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/dashboard">
                  {() => <RequireAuth><ProDashboard /></RequireAuth>}
                </Route>
                <Route path="/notifications">
                  {() => <RequireAuth><Notifications /></RequireAuth>}
                </Route>

                {/* ── Trading Bots ───────────────────────────────── */}
                <Route path="/bots">
                  {() => <RequireAuth><FeatureGate feature="trading_bots"><Bots /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Auto Invest ────────────────────────────────── */}
                <Route path="/auto-invest">
                  {() => <RequireAuth><AutoInvest /></RequireAuth>}
                </Route>

                {/* ── AI Trading ─────────────────────────────────── */}
                <Route path="/ai-trading/:id/invoice">
                  {() => <RequireAuth><AIInvoice /></RequireAuth>}
                </Route>
                <Route path="/ai-trading/statement">
                  {() => <RequireAuth><AIStatement /></RequireAuth>}
                </Route>
                <Route path="/ai-trading">
                  {() => <RequireAuth><FeatureGate feature="ai_trading"><AITrading /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/ledger">
                  {() => <RequireAuth><Ledger /></RequireAuth>}
                </Route>

                {/* ── Referrals (detail page) ─────────────────────── */}
                <Route path="/referrals">
                  {() => <RequireAuth><FeatureGate feature="referrals"><Referrals /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Copy Trading ───────────────────────────────── */}
                <Route path="/copy-trading">
                  {() => <RequireAuth><FeatureGate feature="copy_trading"><CopyTrading /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── Price Alerts ───────────────────────────────── */}
                <Route path="/price-alerts">
                  {() => <RequireAuth><FeatureGate feature="price_alerts"><PriceAlerts /></FeatureGate></RequireAuth>}
                </Route>

                {/* ── INR Payments ───────────────────────────────── */}
                <Route path="/inr">
                  {() => <RequireAuth><FeatureGate feature="inr_payments"><INRPayments /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/support-tickets">
                  {() => <RequireAuth><SupportTickets /></RequireAuth>}
                </Route>
                <Route path="/portfolio-pro">
                  {() => <RequireAuth><PortfolioPro /></RequireAuth>}
                </Route>

                <Route path="/tools/calculator" component={Calculator} />
                <Route path="/tools/converter" component={Converter} />
                <Route path="/tools/compare" component={Compare} />
                <Route path="/tools/predictions" component={Predictions} />
                <Route path="/announcements" component={Announcements} />
                <Route path="/news" component={News} />

                {/* ── Trading Leagues ────────────────────────────── */}
                <Route path="/leagues">
                  {() => <RequireAuth><FeatureGate feature="leagues"><Leagues /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/forex" component={Forex} />

                {/* ── Smart API ──────────────────────────────────── */}
                <Route path="/smartapi">
                  {() => <RequireAuth><FeatureGate feature="smart_api"><SmartAPI /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/stocks" component={Stocks} />
                <Route path="/commodities" component={Commodities} />

                {/* ── Broker ─────────────────────────────────────── */}
                <Route path="/broker/onboarding">
                  {() => <RequireAuth><FeatureGate feature="broker"><BrokerOnboarding /></FeatureGate></RequireAuth>}
                </Route>
                <Route path="/broker/dashboard">
                  {() => <RequireAuth><FeatureGate feature="broker"><BrokerDashboard /></FeatureGate></RequireAuth>}
                </Route>

                <Route path="/login" component={Login} />
                <Route path="/signup" component={Signup} />
                <Route path="/register">{() => { window.location.replace(import.meta.env.BASE_URL + "signup"); return null; }}</Route>
                <Route path="/forgot-password" component={ForgotPassword} />

                <Route component={NotFound} />
              </Switch>
            </AppShell>
            <SupportChatWidget />
            <Toaster />
            <SonnerToaster richColors position="top-right" expand closeButton duration={7000} />
          </WouterRouter>
              </TooltipProvider>
            </AuthProvider>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
