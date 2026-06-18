import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

// User-owned API keys with HMAC-SHA256 signed-request auth.
// Per the public ApiDocs convention the request headers are:
//   X-ZBX-APIKEY:    <key_id>     (this row's `keyId`, public)
//   X-ZBX-TIMESTAMP: <unix-millis>
//   X-ZBX-SIGN:      hex(HMAC-SHA256(secret, timestamp + method + path + body))
//
// Storage rules:
//   - `keyId` is the public id and is stored plaintext (it's effectively a username).
//   - `secretEncrypted` is the secret encrypted at rest via AES-256-GCM using a
//     server-side master key. We CANNOT use bcrypt (one-way) because HMAC
//     verification needs the server to recover the original secret to recompute
//     the signature. The master key lives outside the database.
//     The raw secret is shown to the user EXACTLY ONCE at creation time.
//   - `secretPreview` is the last 4 chars of the secret kept ONLY so the dashboard can
//     show "ending in …a3f9" — never enough to reconstruct the secret.
//   - `permissions` is a JSON-encoded string array, currently one of: "read", "trade", "withdraw".
//   - `ipWhitelist` is an optional JSON-encoded array of CIDRs/IPs; null = any IP.
//   - `expiresAt` is optional; null = never expires.
export const userApiKeysTable = pgTable("user_api_keys", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull(),
  name:            text("name").notNull(),
  keyId:           text("key_id").notNull().unique(),
  secretEncrypted: text("secret_encrypted").notNull(),
  secretPreview:   text("secret_preview").notNull(),
  permissions:     text("permissions").notNull().default('["read"]'),
  ipWhitelist:     text("ip_whitelist"),
  status:          text("status").notNull().default("active"),
  lastUsedAt:      timestamp("last_used_at", { withTimezone: true }),
  lastUsedIp:      text("last_used_ip"),
  expiresAt:       timestamp("expires_at", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserApiKey = typeof userApiKeysTable.$inferSelect;
