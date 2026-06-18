import type { Request } from "express";
import { db, auditLogsTable } from "@workspace/db";

/**
 * Fire-and-forget admin-action logger. Inserts a row into `audit_logs` so
 * every operator mutation has a paper trail. Failures are swallowed and only
 * logged via pino — an audit failure must NEVER block the underlying business
 * operation (we'd rather have an unrecorded action than a 500-ed support ticket).
 *
 * Conventions:
 *  - `action`  is a dotted verb: `user.freeze`, `order.force_cancel`.
 *  - `entity`  is the affected table or resource: `user`, `order`, `coin`.
 *  - `entityId` is coerced to string so it can hold UIDs as well as ints.
 *  - `payload` is JSON-stringified; keep it small and avoid PII / secrets.
 */
export async function logAdminAction(
  req: Request,
  opts: {
    action: string;
    entity: string;
    entityId?: string | number | null;
    payload?: unknown;
  },
): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      actorId: req.user?.id ?? null,
      action: opts.action,
      entity: opts.entity,
      entityId:
        opts.entityId !== undefined && opts.entityId !== null
          ? String(opts.entityId)
          : null,
      payload: opts.payload === undefined ? null : JSON.stringify(opts.payload),
    });
  } catch (err) {
    req.log?.error(
      {
        err: (err as Error)?.message,
        action: opts.action,
        entity: opts.entity,
      },
      "audit log insert failed",
    );
  }
}
