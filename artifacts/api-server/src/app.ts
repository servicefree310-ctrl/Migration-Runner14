import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import pinoHttp from "pino-http";
import compression from "compression";
import { resolve, join } from "node:path";
import router from "./routes";
import webhooksRouter from "./routes/webhooks";
import { logger } from "./lib/logger";
import { getRedis, isRedisReady } from "./lib/redis";
import { requestId } from "./middleware/requestId";

const app: Express = express();

// ─── Trust proxy ─────────────────────────────────────────────────────────
// Replit puts a single proxy in front of every artifact. Without this
// `trust proxy` setting, express-rate-limit would key every visitor by the
// proxy's IP (locking down the whole app on the first burst) and the
// `x-forwarded-for` chain we log on login would be unverified.
app.set("trust proxy", 1);

// ─── HTTPS enforcement (VPS / production behind Nginx) ───────────────────
// On Replit the outer proxy always uses HTTPS so this is a no-op there.
// On a VPS, Nginx terminates TLS and sets X-Forwarded-Proto. Redirect any
// plain-HTTP request to HTTPS so `secure:true` cookies always transmit and
// HSTS takes effect immediately.
if (process.env["NODE_ENV"] === "production") {
  app.use((req: Request, res: Response, next: NextFunction): void => {
    if (req.headers["x-forwarded-proto"] === "http") {
      res.redirect(301, `https://${req.headers.host}${req.url}`);
      return;
    }
    next();
  });
}

// ─── CORS allow-list ─────────────────────────────────────────────────────
// Priority order:
//  1. CORS_ORIGINS (explicit comma-separated list) — always wins if set
//  2. REPLIT_DOMAINS (auto-set by Replit in both dev and production) — used
//     as an automatic fallback so deploys work without manual env-var config
//  3. REPLIT_DEV_DOMAIN + localhost fallbacks (dev only)
function getAllowedOrigins(): string[] {
  const explicit = (process.env["CORS_ORIGINS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;

  // Auto-derive from REPLIT_DOMAINS (bare hostnames → https:// origins).
  // Replit sets this in both dev and production environments automatically.
  const replitDomains = (process.env["REPLIT_DOMAINS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((d) => `https://${d}`);
  if (replitDomains.length > 0) return replitDomains;

  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "CORS_ORIGINS env required in production — REPLIT_DOMAINS was also not set",
    );
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  const out: string[] = [];
  if (dev) out.push(`https://${dev}`);
  // Local dev fallbacks
  out.push("http://localhost:3000", "http://localhost:5000", "http://localhost:5173");
  return out;
}
const allowedOrigins = new Set(getAllowedOrigins());
logger.info({ allowedOrigins: [...allowedOrigins] }, "CORS allow-list configured");

// In dev, accept any same-host Replit preview subdomain (e.g. port-prefixed
// proxy subdomains like `<port>--<repl-id>.<domain>` used by Playwright/test
// runners) and any localhost:port. Production stays strictly allow-listed.
const isDev = process.env["NODE_ENV"] !== "production";
function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.has(origin)) return true;
  if (!isDev) return false;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    // Same Replit workspace — match the configured dev domain or its
    // port-prefixed sibling (e.g. `8080--<repl>.<domain>`).
    const dev = process.env["REPLIT_DEV_DOMAIN"];
    if (dev && (u.hostname === dev || u.hostname.endsWith(`--${dev}`) || u.hostname.endsWith(`.${dev}`))) {
      return true;
    }
    // Generic Replit preview hosts — only safe in dev.
    if (/\.(replit\.dev|repl\.co|kirk\.replit\.dev|janeway\.replit\.dev|riker\.replit\.dev|picard\.replit\.dev|spock\.replit\.dev)$/i.test(u.hostname)) {
      return true;
    }
  } catch {
    /* malformed origin → deny */
  }
  return false;
}

const corsMiddleware = cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin header — covers mobile native HTTP
    // clients (Expo), curl, server-to-server, and same-origin requests
    // from older Safari versions. They are still subject to the CSRF
    // origin guard below for any cookie-bearing write.
    if (!origin) return cb(null, true);
    if (isOriginAllowed(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin not allowed: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With"],
});

// ─── CSRF / Origin guard ─────────────────────────────────────────────────
// Defense-in-depth on top of SameSite=strict cookies. Any cookie-authed
// state-changing write (POST/PUT/PATCH/DELETE) must originate from an
// allow-listed Origin (or Referer, as a fallback). Bearer-token requests
// are CSRF-immune because the Authorization header cannot be set by an
// HTML form / cross-site script — so they bypass this check. Webhooks are
// already mounted before this middleware and HMAC-validated separately.
function originGuard(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }
  const auth = req.headers.authorization || "";
  // Bearer-only requests are CSRF-immune (Authorization header can't be set
  // by an HTML form / cross-site script). BUT if a session cookie is also
  // present, an attacker could auto-attach the victim's cookie via CSRF and
  // tack on a junk Bearer to bypass this check; the route's auth middleware
  // would then fall back to the cookie. So we only skip when the request is
  // PURELY token-authenticated.
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies || {};
  const hasSessionCookie =
    !!cookies["cx_session"] || !!cookies["accessToken"] || !!cookies["sessionId"];
  if (auth.toLowerCase().startsWith("bearer ") && !hasSessionCookie) {
    next();
    return;
  }
  // HMAC-signed API key requests (X-ZBX-APIKEY + X-ZBX-SIGN) are CSRF-immune:
  // the HMAC signature cannot be forged by a cross-site attacker, and these
  // headers cannot be auto-sent by a browser HTML form or cross-site script.
  if (req.headers["x-zbx-apikey"] && req.headers["x-zbx-sign"]) {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (origin) {
    if (isOriginAllowed(origin)) {
      next();
      return;
    }
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  const referer = req.headers.referer || "";
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (isOriginAllowed(refOrigin)) {
        next();
        return;
      }
    } catch {
      /* malformed referer falls through */
    }
    res.status(403).json({ error: "Referer not allowed" });
    return;
  }
  res
    .status(403)
    .json({ error: "Missing Origin/Referer header for cookie-authenticated request" });
}

// ─── Rate limiters ───────────────────────────────────────────────────────
// IP-keyed (trust proxy:1 above unwraps the real client IP). The global
// limiter is generous because the app polls tickers/orderbook frequently;
// hot endpoints (auth, OTP) get much tighter caps mounted before it.
//
// Multi-server safety: when Redis is reachable, all three limiters share a
// distributed counter via `rate-limit-redis`. Without this, each replica
// would maintain its own in-process counter, so an attacker could simply
// spread requests across instances to hit N×limit.
//
// This module is imported AFTER initRedis() (see index.ts bootstrap), so
// we can safely snapshot isRedisReady() at module load. When Redis is
// available we return a RedisStore (constructor calls SCRIPT LOAD via the
// already-connected client). When Redis is unavailable we return undefined
// so express-rate-limit falls back to the default in-process MemoryStore —
// safe for single-replica/dev, and the only viable option without Redis.
//
// At RUNTIME, rate-limit-redis can still error if Redis disconnects mid-
// flight. All three limiters set `passOnStoreError: true` so transient
// Redis blips fail OPEN (allow the request, log the error) rather than
// blanket-503'ing the whole API.
function makeStore(prefix: string): RedisStore | undefined {
  if (!isRedisReady()) return undefined;
  const r = getRedis();
  if (!r) return undefined;
  return new RedisStore({
    prefix: `cryptox:rl:${prefix}:`,
    sendCommand: (...args: string[]) => r.call(args[0], ...args.slice(1)) as Promise<any>,
  });
}

const globalLimiter = rateLimit({
  store: makeStore("global"),
  windowMs: 60 * 1000,
  limit: 600, // 10/sec sustained
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Fail OPEN on store errors. A Redis blip must not 503 the whole API —
  // we'd rather under-rate-limit briefly than take downtime.
  passOnStoreError: true,
  message: { error: "Too many requests, please slow down" },
  // Skip true-public / high-volume endpoints from the cap
  skip: (req) => {
    const p = req.path;
    return (
      p === "/health" ||
      p === "/healthz" ||
      p === "/ws" ||
      p === "/stream" ||
      p.startsWith("/ws/") ||
      p === "/exchange/ticker" ||
      p === "/exchange/ws" ||
      p === "/exchange/market" ||
      p.startsWith("/webhooks/")
    );
  },
});

const authLimiter = rateLimit({
  store: makeStore("auth"),
  windowMs: 15 * 60 * 1000,
  limit: 10, // 10 auth attempts per IP per 15 min
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Fail OPEN: a Redis blip during a login attempt must not lock everyone
  // out of the API. We accept slightly looser rate limiting briefly.
  passOnStoreError: true,
  message: { error: "Too many auth attempts, try again in 15 minutes" },
});

const otpSendLimiter = rateLimit({
  store: makeStore("otp"),
  windowMs: 60 * 60 * 1000,
  limit: 5, // 5 OTP sends per IP per hour (stops free SMS flooding)
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Fail OPEN: SMS flooding protection should not trigger 503s on Redis
  // blips. The OTP endpoint also runs behind authLimiter so an attacker
  // can't fully bypass throttling even during a Redis outage.
  passOnStoreError: true,
  message: { error: "Too many OTP requests, try again in 1 hour" },
});

// Per-session cap on order placement / cancel. The global 10/sec limiter is
// far too loose for the trading hot path where every POST takes a wallet TX
// + engine submit + redis push. Cap each session at 2/sec sustained with a
// short burst window. Falls back to IP for unauthenticated probes.
//
// Keyed by the *session cookie* (last 16 chars) rather than user id because
// the auth middleware runs per-route, after this middleware. We can't read
// req.user here, but we can still tie throttling to a stable identifier.
const orderLimiter = rateLimit({
  store: makeStore("order"),
  windowMs: 60 * 1000,
  limit: 120, // 2/sec sustained, generous for serious traders
  standardHeaders: "draft-7",
  legacyHeaders: false,
  passOnStoreError: true,
  message: { error: "Too many order requests, please slow down (2/sec sustained)" },
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    const cookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.session_token;
    if (cookie) return `s:${String(cookie).slice(-16)}`;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    return `ip:${ip}`;
  },
});

// ─── Middleware stack ────────────────────────────────────────────────────
// Correlation ID first so every downstream log line carries `reqId`.
app.use(requestId());

app.use(
  pinoHttp({
    logger,
    // pino-http calls our genReqId before assigning req.id; we already set it
    // in the requestId middleware above, so just pass it through. This keeps
    // the same id we returned in the X-Request-Id response header.
    genReqId: (req) => (req as unknown as { id?: string }).id ?? "",
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// helmet defaults plus a few app-specific overrides:
//  - CSP off: would break Vite HMR + Flutter inline assets without a
//    carefully tuned policy. Re-enable in a follow-up with explicit
//    script-src / connect-src lists.
//  - COEP off: we need cross-origin iframes (canvas, mockup sandbox).
//  - CORP cross-origin: artifacts on different paths still need to fetch
//    each other's static assets through the Replit proxy.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// Permissions-Policy: disable powerful APIs that this app never uses.
// Prevents malicious scripts from accessing camera, microphone, payment
// UI, geolocation, or USB on behalf of the user.
app.use((_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader(
    "Permissions-Policy",
    "payment=(), geolocation=(), camera=(), microphone=(), usb=(), interest-cohort=()",
  );
  next();
});

app.use(corsMiddleware);
app.use(cookieParser());

// Webhooks BEFORE express.json — they need raw body for HMAC verification.
// Also mounted BEFORE the origin guard / rate limiter so legitimate
// gateway callbacks aren't throttled or blocked.
app.use("/api", webhooksRouter);

app.use(express.json({
  limit: "20mb",
  // Capture the raw request body so HMAC-signed API key requests can recompute
  // the signature against the EXACT bytes the client sent. Reconstructing from
  // req.body via JSON.stringify is unsafe — key order and whitespace differences
  // would break the signature.
  verify: (req, _res, buf) => {
    if (buf?.length) (req as unknown as { rawBody?: string }).rawBody = buf.toString("utf8");
  },
}));
app.use(express.urlencoded({ extended: true }));

// CSRF/origin guard on every /api write.
app.use("/api", originGuard);

// Tighter caps on hot auth surfaces. Paths cover both the legacy cookie
// auth (auth.ts) and the Bicrypto JWT adapter (bicrypto.ts).
app.use(
  [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/change-password",
    "/api/auth/forgot-password-request",
    "/api/auth/forgot-password-confirm",
    "/api/auth/login/flutter",
    "/api/auth/refresh",
  ],
  authLimiter,
);
app.use("/api/otp/send", otpSendLimiter);

// Broker quote endpoints proxy to an external pricing API. Limit aggressively
// to prevent abuse and protect the upstream quota.
const brokerQuoteLimiter = rateLimit({
  store: makeStore("broker-quote"),
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  passOnStoreError: true,
  message: { error: "Too many quote requests — max 30/min" },
  validate: { xForwardedForHeader: false },
});
app.use("/api/instruments", brokerQuoteLimiter);

// Tight per-session order throttle. Mounted BEFORE the global limiter so the
// tighter cap takes precedence; the global limiter then still acts as a
// platform-wide ceiling.
app.use("/api/exchange/order", orderLimiter);
app.use("/api/orders", (req, res, next) => {
  // Only throttle mutating verbs — order list / detail GETs are fine at the
  // global cap. Polling order status shouldn't ever hit a placement limit.
  if (req.method === "GET" || req.method === "HEAD") return next();
  return orderLimiter(req, res, next);
});

// Global cap last — runs only if a request slipped past the specific limiters.
app.use("/api", globalLimiter);

app.use("/api", router);

// ─── Static frontend serving (production only) ────────────────────────────
// In production a single Express process serves both built SPAs so no
// separate Vite preview server is needed. The working directory is expected
// to be artifacts/api-server/ (the production run command sets it with `cd`).
if (process.env["NODE_ENV"] === "production") {
  const cwd = process.cwd(); // artifacts/api-server/

  const userDist = resolve(cwd, "../user-portal/dist/public");
  app.use("/user", express.static(userDist, { index: false }));
  app.get("/user", (_req: Request, res: Response) => res.sendFile(join(userDist, "index.html")));
  app.get("/user/*path", (_req: Request, res: Response) => res.sendFile(join(userDist, "index.html")));

  const adminDist = resolve(cwd, "../admin/dist/public");
  app.use("/admin", express.static(adminDist, { index: false }));
  app.get("/admin", (_req: Request, res: Response) => res.sendFile(join(adminDist, "index.html")));
  app.get("/admin/*path", (_req: Request, res: Response) => res.sendFile(join(adminDist, "index.html")));

  logger.info({ userDist, adminDist }, "Production static frontend serving enabled");
}

// Global error handler — last in the chain. Logs everything, never
// leaks stack traces back to clients.
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  if (err?.message?.startsWith("CORS:")) {
    res.status(403).json({ error: err.message });
    return;
  }
  logger.error(
    { err: err?.message, stack: err?.stack, path: req.path, method: req.method },
    "Unhandled error",
  );
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
