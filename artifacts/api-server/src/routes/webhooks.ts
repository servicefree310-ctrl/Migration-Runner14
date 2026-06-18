import { Router, type IRouter } from "express";
import express from "express";
import { db, gatewaysTable, inrDepositsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyWebhookSignature } from "../lib/razorpay";
import { creditDepositOnce } from "./payments";

const router: IRouter = Router();

// Razorpay webhook — needs raw body for HMAC verification
router.post("/webhooks/razorpay/:gatewayId",
  express.raw({ type: "*/*", limit: "1mb" }),
  async (req, res): Promise<void> => {
    const gatewayId = Number(Array.isArray(req.params.gatewayId) ? req.params.gatewayId[0] : req.params.gatewayId);
    const sig = req.header("x-razorpay-signature") || "";
    if (!sig) { res.status(400).send("missing signature"); return; }

    const [g] = await db.select().from(gatewaysTable).where(eq(gatewaysTable.id, gatewayId)).limit(1);
    if (!g || g.provider !== "razorpay" || !g.webhookSecret) {
      res.status(404).send("gateway not configured"); return;
    }
    const raw = req.body instanceof Buffer ? req.body : Buffer.from(req.body ?? "");
    if (!verifyWebhookSignature(g.webhookSecret, raw, sig)) {
      logger.warn({ gatewayId }, "Razorpay webhook signature invalid");
      res.status(400).send("invalid signature"); return;
    }

    let payload: any;
    try { payload = JSON.parse(raw.toString("utf8")); }
    catch { res.status(400).send("bad json"); return; }

    const event = payload?.event as string | undefined;
    const payment = payload?.payload?.payment?.entity;
    if (!event || !payment) { res.status(200).send("ignored"); return; }

    if (event === "payment.captured" || event === "order.paid") {
      const orderId = payment.order_id as string;
      const [dep] = await db.select().from(inrDepositsTable)
        .where(eq(inrDepositsTable.gatewayOrderId, orderId)).limit(1);
      if (!dep) { res.status(200).send("no deposit"); return; }
      try {
        const credited = await creditDepositOnce(dep.id, String(payment.id), payment.method);
        logger.info({ depositId: dep.id, credited, event }, "Razorpay webhook processed");
      } catch (e) {
        logger.error({ err: (e as Error).message }, "Razorpay webhook credit failed");
        res.status(500).send("credit failed"); return;
      }
    }
    res.status(200).send("ok");
  });

export default router;
