import type { ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { AdminLayout } from "@/components/admin-layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import UsersPage from "@/pages/users";
import KycPage from "@/pages/kyc";
import KycTemplatesPage from "@/pages/kyc-templates";
import BanksPage from "@/pages/banks";
import CoinsPage from "@/pages/coins";
import NetworksPage from "@/pages/networks";
import PairsPage from "@/pages/pairs";
import GatewaysPage from "@/pages/gateways";
import InrDepositsPage from "@/pages/inr-deposits";
import InrWithdrawalsPage from "@/pages/inr-withdrawals";
import CryptoDepositsPage from "@/pages/crypto-deposits";
import CryptoWithdrawalsPage from "@/pages/crypto-withdrawals";
import EarnPage from "@/pages/earn";
import LegalPage from "@/pages/legal";
import SettingsPage from "@/pages/settings";
import LoginLogsPage from "@/pages/login-logs";
import OptionsAdminPage from "@/pages/options-admin";
import Web3AdminPage from "@/pages/web3-admin";
import ListingsAdminPage from "@/pages/listings-admin";
import OtpProvidersPage from "@/pages/otp-providers";
import IntegrationsPage from "@/pages/integrations";
import ChatPage from "@/pages/chat";
import FundingRatesPage from "@/pages/funding-rates";
import FuturesPositionsPage from "@/pages/futures-positions";
import ApiKeysPage from "@/pages/api-keys";
import BotsPage from "@/pages/bots";
import OrdersPage from "@/pages/orders";
import P2PAdminPage from "@/pages/p2p";
import FeesAdminPage from "@/pages/fees";
import UserAddressesPage from "@/pages/user-addresses";
import BannersPage from "@/pages/banners";
import PromotionsPage from "@/pages/promotions";
import AnnouncementsCmsPage from "@/pages/announcements-cms";
import NewsCmsPage from "@/pages/news-cms";
import CompetitionsPage from "@/pages/competitions";
import NotificationsBroadcastPage from "@/pages/notifications-broadcast";
import SiteSettingsPage from "@/pages/site-settings";
import RedisPage from "@/pages/redis";
import TradingEnginePage from "@/pages/trading-engine";
import BackendStatusPage from "@/pages/backend-status";
import CodeReferencePage from "@/pages/code-reference";
import AuditLogPage from "@/pages/audit-log";
import TDSReportPage from "@/pages/tds";
import PushNotificationsPage from "@/pages/push-notifications";
import BrokerConfigPage from "@/pages/broker-config";
import InstrumentsAdminPage from "@/pages/instruments-admin";
import BrokerApplicationsPage from "@/pages/broker-applications";
import AITradingPlansPage from "@/pages/ai-trading-plans";
import AutoInvestAdminPage from "@/pages/auto-invest-admin";
import ExchangeSettingsPage from "@/pages/exchange-settings";
import ReferralSettingsPage from "@/pages/referral-settings";
import FeaturesPage from "@/pages/features";
import CopyTradingAdminPage from "@/pages/copy-trading-admin";
import WalletManagerPage from "@/pages/wallet-manager";
import SupportAdminPage from "@/pages/support-admin";
import SystemStatusPage from "@/pages/system-status";
import TeamPage from "@/pages/team";
import CompanyMediaPage from "@/pages/company-media";
import SeoPage from "@/pages/seo";
import NotFound from "@/pages/not-found";
import CreatorRewardsPage from "@/pages/creator-rewards";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

const ADMIN_ROLES = ["support", "compliance", "finance", "marketing", "admin", "superadmin"];

/** Wrap a page that requires a stricter role than the global admin gate. */
function RoleGated({ allow, children }: { allow: string[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="text-lg font-semibold">Access restricted</div>
          <div className="text-sm text-muted-foreground">
            This page is restricted to {allow.join(" / ")} roles. Please contact your administrator to request access.
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Protected() {
  const { user, loading, logout } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  if (!ADMIN_ROLES.includes(user.role)) {
    void logout();
    return <Redirect to="/login" />;
  }

  return (
    <AdminLayout>
      <Switch>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/users" component={UsersPage} />
        <Route path="/kyc" component={KycPage} />
        <Route path="/kyc-templates" component={KycTemplatesPage} />
        <Route path="/banks" component={BanksPage} />
        <Route path="/coins" component={CoinsPage} />
        <Route path="/networks" component={NetworksPage} />
        <Route path="/pairs" component={PairsPage} />
        <Route path="/funding-rates" component={FundingRatesPage} />
        <Route path="/futures-positions" component={FuturesPositionsPage} />
        <Route path="/options-admin" component={OptionsAdminPage} />
        <Route path="/web3-admin" component={Web3AdminPage} />
        <Route path="/listings-admin" component={ListingsAdminPage} />
        <Route path="/api-keys" component={ApiKeysPage} />
        <Route path="/bots" component={BotsPage} />
        <Route path="/orders" component={OrdersPage} />
        <Route path="/p2p" component={P2PAdminPage} />
        <Route path="/copy-trading" component={CopyTradingAdminPage} />
        <Route path="/fees">
          <RoleGated allow={["admin", "superadmin"]}>
            <FeesAdminPage />
          </RoleGated>
        </Route>
        <Route path="/gateways" component={GatewaysPage} />
        <Route path="/inr-deposits" component={InrDepositsPage} />
        <Route path="/inr-withdrawals" component={InrWithdrawalsPage} />
        <Route path="/crypto-deposits" component={CryptoDepositsPage} />
        <Route path="/user-addresses" component={UserAddressesPage} />
        <Route path="/crypto-withdrawals" component={CryptoWithdrawalsPage} />
        <Route path="/earn" component={EarnPage} />
        <Route path="/ai-trading-plans" component={AITradingPlansPage} />
        <Route path="/auto-invest-admin" component={AutoInvestAdminPage} />
        <Route path="/banners" component={BannersPage} />
        <Route path="/referral-settings" component={ReferralSettingsPage} />
        <Route path="/promotions" component={PromotionsPage} />
        <Route path="/announcements" component={AnnouncementsCmsPage} />
        <Route path="/news" component={NewsCmsPage} />
        <Route path="/competitions" component={CompetitionsPage} />
        <Route path="/broadcast-notifications" component={NotificationsBroadcastPage} />
        <Route path="/site-settings" component={SiteSettingsPage} />
        <Route path="/redis" component={RedisPage} />
        <Route path="/trading-engine">
          <RoleGated allow={["admin", "superadmin"]}>
            <TradingEnginePage />
          </RoleGated>
        </Route>
        <Route path="/legal" component={LegalPage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/login-logs" component={LoginLogsPage} />
        <Route path="/integrations" component={IntegrationsPage} />
        <Route path="/otp-providers" component={OtpProvidersPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/backend-status" component={BackendStatusPage} />
        <Route path="/code-reference" component={CodeReferencePage} />
        <Route path="/audit-log" component={AuditLogPage} />
        <Route path="/tds-report" component={TDSReportPage} />
        <Route path="/push-notifications" component={PushNotificationsPage} />
        <Route path="/broker-config" component={BrokerConfigPage} />
        <Route path="/instruments-admin" component={InstrumentsAdminPage} />
        <Route path="/broker-applications" component={BrokerApplicationsPage} />
        <Route path="/features" component={FeaturesPage} />
        <Route path="/exchange-settings" component={ExchangeSettingsPage} />
        <Route path="/wallet-manager" component={WalletManagerPage} />
        <Route path="/support-admin" component={SupportAdminPage} />
        <Route path="/system-status" component={SystemStatusPage} />
        <Route path="/team" component={TeamPage} />
        <Route path="/company-media" component={CompanyMediaPage} />
        <Route path="/seo" component={SeoPage} />
        <Route path="/creator-rewards" component={CreatorRewardsPage} />
        <Route component={NotFound} />
      </Switch>
    </AdminLayout>
  );
}

function Router() {
  const { user, loading } = useAuth();
  return (
    <Switch>
      <Route path="/login">{loading ? null : user ? <Redirect to="/dashboard" /> : <LoginPage />}</Route>
      <Route><Protected /></Route>
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset}>
            <AuthProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Router />
                </WouterRouter>
                <Toaster />
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
