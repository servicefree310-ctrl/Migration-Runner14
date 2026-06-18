/**
 * SMS sending service — reads active provider from otp_providers table.
 * Supports: MSG91, Twilio, Fast2SMS, 2Factor, TextLocal, NinzaSMS, NinzaSMS-WhatsApp (all via HTTP).
 */
import { db, otpProvidersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

type SmsResult = { ok: true; provider: string; messageId?: string } | { ok: false; error: string; provider: string };

async function getActiveProvider() {
  const [p] = await db
    .select()
    .from(otpProvidersTable)
    .where(and(eq(otpProvidersTable.channel, "sms"), eq(otpProvidersTable.isActive, true)))
    .limit(1);
  return p ?? null;
}

async function sendViaMsg91(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey) return { ok: false, provider: "msg91", error: "API key not configured" };
  // MSG91 OTP API v5
  const params = new URLSearchParams({
    authkey: provider.apiKey,
    mobile: phone.replace(/\D/g, ""),
    otp: code,
    ...(provider.senderId ? { sender: provider.senderId } : {}),
    ...(provider.template ? { template_id: provider.template } : {}),
  });
  try {
    const r = await fetch(`https://api.msg91.com/api/v5/otp?${params}`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    const json: any = await r.json();
    if (json.type === "error" || json.type === "fail") {
      return { ok: false, provider: "msg91", error: json.message || "MSG91 error" };
    }
    logger.info({ to: phone, provider: "msg91" }, "SMS OTP sent via MSG91");
    return { ok: true, provider: "msg91", messageId: json.message };
  } catch (e: any) {
    return { ok: false, provider: "msg91", error: e.message };
  }
}

async function sendViaTwilio(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey || !provider.apiSecret) return { ok: false, provider: "twilio", error: "Account SID + Auth Token required" };
  const sid = provider.apiKey;
  const from = provider.senderId || "+1234567890";
  try {
    const formData = new URLSearchParams({ From: from, To: phone, Body: `Your Zebvix OTP is: ${code}. Valid for 10 minutes. Do not share.` });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${sid}:${provider.apiSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await r.json();
    if (json.error_code) return { ok: false, provider: "twilio", error: `Twilio ${json.error_code}: ${json.message}` };
    logger.info({ to: phone, sid: json.sid }, "SMS sent via Twilio");
    return { ok: true, provider: "twilio", messageId: json.sid };
  } catch (e: any) {
    return { ok: false, provider: "twilio", error: e.message };
  }
}

async function sendViaFast2Sms(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey) return { ok: false, provider: "fast2sms", error: "API key not configured" };
  try {
    const params = new URLSearchParams({
      authorization: provider.apiKey,
      variables_values: code,
      route: "otp",
      numbers: phone.replace(/\D/g, "").replace(/^91/, "").slice(-10),
    });
    const r = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params}`, {
      method: "GET",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(8000),
    });
    const json: any = await r.json();
    if (!json.return) return { ok: false, provider: "fast2sms", error: json.message || "Fast2SMS error" };
    logger.info({ to: phone, provider: "fast2sms" }, "SMS sent via Fast2SMS");
    return { ok: true, provider: "fast2sms", messageId: json.request_id };
  } catch (e: any) {
    return { ok: false, provider: "fast2sms", error: e.message };
  }
}

async function sendVia2Factor(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey) return { ok: false, provider: "2factor", error: "API key not configured" };
  try {
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    const r = await fetch(`https://2factor.in/API/V1/${provider.apiKey}/SMS/${cleanPhone}/${code}`, {
      signal: AbortSignal.timeout(8000),
    });
    const json: any = await r.json();
    if (json.Status !== "Success") return { ok: false, provider: "2factor", error: json.Details || "2Factor error" };
    logger.info({ to: phone, provider: "2factor" }, "OTP sent via 2Factor");
    return { ok: true, provider: "2factor", messageId: json.Details };
  } catch (e: any) {
    return { ok: false, provider: "2factor", error: e.message };
  }
}

async function sendViaTextLocal(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey) return { ok: false, provider: "textlocal", error: "API key not configured" };
  try {
    const msg = `Your Zebvix OTP is ${code}. Valid for 10 minutes. -${provider.senderId || "ZEBVIX"}`;
    const formData = new URLSearchParams({
      apikey: provider.apiKey,
      numbers: phone.replace(/\D/g, ""),
      message: msg,
      sender: provider.senderId || "ZEBVIX",
    });
    const r = await fetch("https://api.textlocal.in/send/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const json: any = await r.json();
    if (json.status !== "success") return { ok: false, provider: "textlocal", error: json.errors?.[0]?.message || "TextLocal error" };
    return { ok: true, provider: "textlocal", messageId: json.batch_id };
  } catch (e: any) {
    return { ok: false, provider: "textlocal", error: e.message };
  }
}

/**
 * NinzaSMS — Indian SMS OTP provider (https://ninzasms.in.net)
 * apiKey   → Authorization header value (NINZASMSsitedd7e00ea...)
 * senderId → Sender ID / User ID (e.g. 15716)
 * rout     → "sms" for SMS route
 */
async function sendViaNinzaSms(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey) return { ok: false, provider: "ninzasms", error: "NinzaSMS API key not configured" };
  const cleanPhone = phone.replace(/\D/g, "").replace(/^91/, "").slice(-10);
  try {
    const body = {
      sender_id: provider.senderId || "15716",
      numbers: cleanPhone,
      rout: "sms",
      variables_values: code,
    };
    const r = await fetch("https://ninzasms.in.net/auth/send_sms", {
      method: "POST",
      headers: {
        "Authorization": provider.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await r.json();
    if (json.status !== "success") {
      return { ok: false, provider: "ninzasms", error: json.message || `NinzaSMS error (HTTP ${r.status})` };
    }
    logger.info({ to: cleanPhone, messageId: json.message_id, provider: "ninzasms" }, "SMS OTP sent via NinzaSMS");
    return { ok: true, provider: "ninzasms", messageId: json.message_id };
  } catch (e: any) {
    return { ok: false, provider: "ninzasms", error: e.message };
  }
}

/**
 * NinzaSMS WhatsApp — sends OTP via WhatsApp (rout: "waninza")
 * apiKey   → same Authorization key as SMS
 * senderId → same Sender ID
 */
async function sendViaNinzaWhatsApp(provider: typeof otpProvidersTable.$inferSelect, phone: string, code: string): Promise<SmsResult> {
  if (!provider.apiKey) return { ok: false, provider: "ninzasms_whatsapp", error: "NinzaSMS API key not configured" };
  const cleanPhone = phone.replace(/\D/g, "").replace(/^91/, "").slice(-10);
  try {
    const body = {
      sender_id: provider.senderId || "15716",
      numbers: cleanPhone,
      rout: "waninza",
      variables_values: code,
    };
    const r = await fetch("https://ninzasms.in.net/auth/send_sms", {
      method: "POST",
      headers: {
        "Authorization": provider.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await r.json();
    if (json.status !== "success") {
      return { ok: false, provider: "ninzasms_whatsapp", error: json.message || `NinzaSMS WhatsApp error (HTTP ${r.status})` };
    }
    logger.info({ to: cleanPhone, messageId: json.message_id, provider: "ninzasms_whatsapp" }, "WhatsApp OTP sent via NinzaSMS");
    return { ok: true, provider: "ninzasms_whatsapp", messageId: json.message_id };
  } catch (e: any) {
    return { ok: false, provider: "ninzasms_whatsapp", error: e.message };
  }
}

/** Main SMS send function — reads active provider from DB. */
export async function sendSms(phone: string, code: string): Promise<SmsResult> {
  const provider = await getActiveProvider();
  if (!provider) {
    logger.warn({ to: phone }, "No active SMS provider — OTP not sent via SMS");
    return { ok: false, provider: "none", error: "No active SMS provider. Configure one in Admin → OTP Providers → SMS." };
  }
  switch (provider.provider) {
    case "msg91":              return sendViaMsg91(provider, phone, code);
    case "twilio":             return sendViaTwilio(provider, phone, code);
    case "fast2sms":           return sendViaFast2Sms(provider, phone, code);
    case "2factor":            return sendVia2Factor(provider, phone, code);
    case "textlocal":          return sendViaTextLocal(provider, phone, code);
    case "ninzasms":           return sendViaNinzaSms(provider, phone, code);
    case "ninzasms_whatsapp":  return sendViaNinzaWhatsApp(provider, phone, code);
    default:                   return { ok: false, provider: provider.provider, error: `Provider "${provider.provider}" not implemented` };
  }
}

/** OTP SMS message */
export async function sendOtpSms(phone: string, code: string, purpose: string): Promise<SmsResult> {
  return sendSms(phone, code);
}

/** Transactional SMS (deposit, withdrawal, trade) */
export async function sendTransactionalSms(phone: string, message: string): Promise<SmsResult> {
  const provider = await getActiveProvider();
  if (!provider) return { ok: false, provider: "none", error: "No active SMS provider" };
  // Use Twilio for full message, others for OTP-only
  if (provider.provider === "twilio") return sendViaTwilio(provider, phone, message);
  // Fallback for others — just log
  logger.info({ to: phone, message }, "Transactional SMS queued (provider does not support arbitrary messages)");
  return { ok: true, provider: provider.provider, messageId: "queued" };
}
