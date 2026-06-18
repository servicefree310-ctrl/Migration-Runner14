import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import publicRouter from "./public";
import publicUserRouter from "./public-user";
import v1PublicRouter from "./v1-public";
import otpRouter from "./otp";
import marketsRouter from "./markets";
import paymentsRouter from "./payments";
import ordersRouter from "./orders";
import positionsRouter from "./positions";
import futuresRouter from "./futures";
import transferRouter from "./transfer";
import earnUserRouter from "./earn-user";
import feesRouter from "./fees";
import securityRouter from "./security";
import klinesRouter from "./klines";
import promoRouter from "./promo";
import redisAdminRouter from "./redis-admin";
import supportUserRouter from "./support-user";
import bicryptoRouter from "./bicrypto";
import contentRouter from "./content";
import adminContentRouter from "./admin-content";
import adminSourceRouter from "./admin-source";
import inmemEngineRouter from "./inmem-engine";
import inmemEngineProdRouter from "./inmem-engine-prod";
import accountApiKeysRouter from "./account-api-keys";
import optionsRouter from "./options";
import optionsAdminRouter from "./options-admin";
import web3Router from "./web3";
import web3AdminRouter from "./web3-admin";
import listingsRouter from "./listings";
import listingsAdminRouter from "./listings-admin";
import notificationsRouter from "./notifications";
import botsRouter from "./bots";
import copyTradingRouter from "./copy-trading";
import portfolioAnalyticsRouter from "./portfolio-analytics";
import dashboardRouter from "./dashboard";
import v1Router from "./v1";
import p2pRouter from "./p2p";
import convertRouter from "./convert";
import pushRouter from "./push";
import instrumentsRouter from "./instruments";
import brokerAccountsRouter from "./broker-accounts";
import mt5Router from "./mt5";
import smartApiRouter from "./smartapi";
import aiTradingRouter from "./ai-trading";
import adminAiTradingRouter from "./admin-ai-trading";
import ledgerRouter from "./ledger";
import referralsRouter from "./referrals";
import adminReferralsRouter from "./admin-referrals";
import priceAlertsRouter from "./price-alerts";
import inrRouter from "./inr";
import invoicesRouter from "./invoices";
import supportTicketsRouter from "./support-tickets";
import adminExchangeSettingsRouter from "./admin-exchange-settings";
import adminWalletManagerRouter from "./admin-wallet-manager";
import adminSystemRouter from "./admin-system";
import adminPriceAlertsRouter from "./admin-price-alerts";
import razorpayRouter from "./razorpay";
import adminTeamRouter from "./admin-team";
import webhooksRouter from "./webhooks";
import apiAliasesRouter from "./api-aliases";
import aiChatRouter from "./ai-chat";
import tradingLeaguesRouter from "./trading-leagues";
import koinxRouter from "./koinx";
import adminFeaturesRouter from "./admin-features";
import adminSeoRouter from "./admin-seo";
import withdrawalWhitelistRouter from "./withdrawal-whitelist";
import creatorRewardsRouter from "./creator-rewards";
import autoInvestRouter from "./auto-invest";
import adminAutoInvestRouter from "./admin-auto-invest";
import { createReadStream, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(apiAliasesRouter);
router.use(healthRouter);
router.use(v1PublicRouter);
// Bicrypto v5 contract adapter — mounted FIRST so /auth/register (PoW),
// /auth/login/flutter, /auth/refresh, /settings, /exchange/* and the futures
// stubs match the Flutter contract. The adapter intentionally does NOT
// define /auth/login or /auth/me so the legacy admin auth keeps owning
// those (admin needs cookie-session login). bicrypto's /auth/logout also
// clears the legacy SESSION cookie for compatibility.
// Real futures router — must mount BEFORE bicrypto so its (now-removed)
// futures paths cannot accidentally shadow real handlers if anyone re-adds
// stubs there.
router.use(futuresRouter);
router.use(bicryptoRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(publicRouter);
router.use(publicUserRouter);
router.use(otpRouter);
router.use(marketsRouter);
router.use(paymentsRouter);
router.use(ordersRouter);
router.use(positionsRouter);
router.use(transferRouter);
router.use(earnUserRouter);
router.use(feesRouter);
router.use(securityRouter);
router.use(klinesRouter);
router.use(promoRouter);
router.use(supportUserRouter);
router.use("/admin", redisAdminRouter);
router.use(contentRouter);
router.use(adminContentRouter);
router.use(adminSourceRouter);
router.use(inmemEngineRouter);
router.use(inmemEngineProdRouter);
router.use(accountApiKeysRouter);
router.use(optionsRouter);
router.use(optionsAdminRouter);
router.use(web3Router);
router.use(web3AdminRouter);
router.use(listingsRouter);
router.use(listingsAdminRouter);
router.use(notificationsRouter);
router.use(botsRouter);
router.use(copyTradingRouter);
router.use(portfolioAnalyticsRouter);
router.use(dashboardRouter);
router.use(p2pRouter);
router.use(convertRouter);
router.use(pushRouter);
router.use(instrumentsRouter);
router.use(brokerAccountsRouter);
router.use(mt5Router);
router.use(smartApiRouter);
router.use(aiTradingRouter);
router.use(adminAiTradingRouter);
router.use(ledgerRouter);
router.use(referralsRouter);
router.use(adminReferralsRouter);
router.use(priceAlertsRouter);
router.use(inrRouter);
router.use(invoicesRouter);
router.use(supportTicketsRouter);
router.use(adminExchangeSettingsRouter);
router.use(adminWalletManagerRouter);
router.use(adminSystemRouter);
router.use(adminPriceAlertsRouter);
router.use(razorpayRouter);
router.use(adminTeamRouter);
router.use(webhooksRouter);
router.use(v1Router);
router.use(aiChatRouter);
router.use(tradingLeaguesRouter);
router.use(koinxRouter);
router.use(adminFeaturesRouter);
router.use(adminSeoRouter);
router.use(withdrawalWhitelistRouter);
router.use(creatorRewardsRouter);
router.use(autoInvestRouter);
router.use(adminAutoInvestRouter);

// ── KYC document file serve ────────────────────────────────────────────────
// Serves files uploaded via POST /api/upload/kyc-document.
// Configurable via KYC_UPLOAD_DIR env var; falls back to /tmp for dev.
const KYC_UPLOAD_DIR = process.env["KYC_UPLOAD_DIR"] ?? "/tmp/kyc-uploads";
const KYC_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", pdf: "application/pdf",
};
router.get("/uploads/kyc/:filename", requireAuth, (req, res): void => {
  const raw = String(req.params.filename ?? "");
  // Reject path traversal
  if (raw.includes("/") || raw.includes("..") || raw.length > 80) {
    res.status(400).json({ message: "Invalid filename" }); return;
  }
  const filepath = join(KYC_UPLOAD_DIR, raw);
  if (!existsSync(filepath)) { res.status(404).json({ message: "Not found" }); return; }
  const ext = (extname(raw).slice(1) || "").toLowerCase();
  const mime = KYC_MIME[ext] ?? "application/octet-stream";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  createReadStream(filepath).pipe(res as unknown as NodeJS.WritableStream);
});

export default router;
