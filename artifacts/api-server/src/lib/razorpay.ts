import crypto from "crypto";
import { logger } from "./logger";

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret?: string };

export type RazorpayOrder = {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: string;
  created_at: number;
};

export type RazorpayPayment = {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  method: string;
  captured: boolean;
  email?: string;
  contact?: string;
};

const API = "https://api.razorpay.com/v1";

function authHeader(cfg: RazorpayConfig): string {
  return "Basic " + Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
}

export async function createOrder(cfg: RazorpayConfig, params: {
  amount: number; // in INR rupees, will be converted to paise
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const body = {
    amount: Math.round(params.amount * 100),
    currency: params.currency ?? "INR",
    receipt: params.receipt.slice(0, 40),
    notes: params.notes ?? {},
  };
  const r = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader(cfg) },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}) as any) as any;
  if (!r.ok) {
    logger.error({ status: r.status, body: json }, "Razorpay createOrder failed");
    const msg = json?.error?.description || json?.error?.code || `HTTP ${r.status}`;
    throw new Error(`Razorpay: ${msg}`);
  }
  return json as RazorpayOrder;
}

export async function fetchPayment(cfg: RazorpayConfig, paymentId: string): Promise<RazorpayPayment> {
  const r = await fetch(`${API}/payments/${paymentId}`, {
    headers: { authorization: authHeader(cfg) },
  });
  const json = await r.json().catch(() => ({}) as any) as any;
  if (!r.ok) {
    const msg = json?.error?.description || `HTTP ${r.status}`;
    throw new Error(`Razorpay: ${msg}`);
  }
  return json as RazorpayPayment;
}

// Verify checkout signature: HMAC-SHA256(orderId|paymentId, keySecret)
export function verifyCheckoutSignature(cfg: RazorpayConfig, orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", cfg.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

// Verify webhook signature: HMAC-SHA256(rawBody, webhookSecret)
export function verifyWebhookSignature(secret: string, rawBody: string | Buffer, signature: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
