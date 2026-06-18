/**
 * API path aliases — maps legacy / alternate frontend paths to canonical routes.
 * Keeps backwards compatibility without duplicating business logic.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

const router: IRouter = Router();

function proxy(canonical: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    req.url = canonical + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
    next("router");
  };
}

// /api/finance/wallets → handled inline (wallet list comes from transfer route)
router.get("/finance/wallets", (req, res, next) => {
  req.url = "/wallets";
  next("router");
});

// /api/finance/ledger → /api/ledger
router.get("/finance/ledger", (req, res, next) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  req.url = "/ledger" + qs;
  next("router");
});

// /api/futures/positions → /api/positions
router.get("/futures/positions", (req, res, next) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  req.url = "/positions" + qs;
  next("router");
});

// /api/smartapi/status → /api/smartapi/platform-status
router.get("/smartapi/status", (req, res, next) => {
  req.url = "/smartapi/platform-status";
  next("router");
});

// /api/copy-trading/strategies → /api/copy/leaderboard
router.get("/copy-trading/strategies", (req, res, next) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  req.url = "/copy/leaderboard" + qs;
  next("router");
});

// /api/copy-trading/follow → /api/copy/follow
router.post("/copy-trading/follow", (req, res, next) => {
  req.url = "/copy/follow";
  next("router");
});

// /api/copy-trading/me → /api/copy/me
router.get("/copy-trading/me", (req, res, next) => {
  req.url = "/copy/me/following";
  next("router");
});

// /api/futures/orderbook is now handled by the real futures router
// (futures.ts GET /futures/orderbook → Go engine snapshot + pairId).
// No alias needed here.

export default router;
