import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

/**
 * Request correlation ID middleware.
 *
 * Honors an inbound `X-Request-Id` (cap 64 chars, alnum + dash/underscore so
 * a malicious upstream can't pollute logs with control characters) and falls
 * back to a fresh UUID v4. The id is exposed back to the client via the
 * response header so callers can quote it in bug reports.
 *
 * pino-http already declares `req.id` on IncomingMessage (as ReqId), so we
 * reuse that slot rather than re-augmenting the type and clashing with it.
 * pinoHttp's genReqId in app.ts reads the same slot to tag every log line
 * for this request with `reqId=…`.
 */
const SAFE = /^[a-zA-Z0-9_-]{1,64}$/;

export function requestId() {
  return function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers["x-request-id"];
    let id: string | undefined;
    if (typeof inbound === "string" && SAFE.test(inbound)) id = inbound;
    if (!id) id = randomUUID();
    // Cast — pino-http's ReqId type allows string; we always set a string here.
    (req as unknown as { id: string }).id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
