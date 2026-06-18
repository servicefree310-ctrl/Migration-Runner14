/**
 * User-facing push notification routes.
 * - POST /push/register-token — register device FCM token
 * - DELETE /push/register-token — deregister on logout
 */
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { registerDeviceToken, deregisterDeviceToken } from "../lib/push";

const router: IRouter = Router();

router.post("/push/register-token", requireAuth, async (req, res): Promise<void> => {
  const { token, platform } = req.body ?? {};
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  const plat = ["web", "android", "ios"].includes(platform) ? platform : "web";
  await registerDeviceToken(req.user!.id, String(token), plat);
  res.json({ ok: true });
});

router.delete("/push/register-token", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body ?? {};
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  await deregisterDeviceToken(req.user!.id, String(token));
  res.json({ ok: true });
});

export default router;
