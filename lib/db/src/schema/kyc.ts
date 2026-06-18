import { pgTable, text, serial, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const kycRecordsTable = pgTable("kyc_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  level: integer("level").notNull(),
  status: text("status").notNull().default("pending"),
  fullName: text("full_name"),
  dob: text("dob"),
  address: text("address"),
  panNumber: text("pan_number"),
  aadhaarNumber: text("aadhaar_number"),
  panDocUrl: text("pan_doc_url"),
  aadhaarDocUrl: text("aadhaar_doc_url"),
  aadhaarDocBackUrl: text("aadhaar_doc_back_url"),
  selfieUrl: text("selfie_url"),
  extra: text("extra").notNull().default("{}"),
  rejectReason: text("reject_reason"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqUserLevel: uniqueIndex("kyc_records_user_level_uniq").on(t.userId, t.level),
  byUserStatus:  index("kyc_records_user_status_idx").on(t.userId, t.status),
}));

export type KycRecord = typeof kycRecordsTable.$inferSelect;

export const kycSettingsTable = pgTable("kyc_settings", {
  level: integer("level").primaryKey(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  depositLimit: text("deposit_limit").notNull(),
  withdrawLimit: text("withdraw_limit").notNull(),
  tradeLimit: text("trade_limit").notNull(),
  features: text("features").notNull().default("[]"),
  fields: text("fields").notNull().default("[]"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KycSetting = typeof kycSettingsTable.$inferSelect;

export type KycFieldType =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "identity"
  | "image"
  | "select";

export type KycFieldDef = {
  key: string;
  label: string;
  type: KycFieldType;
  required: boolean;
  regex?: string;
  placeholder?: string;
  helperText?: string;
  options?: string[];
};

export const KYC_CORE_FIELD_KEYS = [
  "fullName",
  "dob",
  "address",
  "panNumber",
  "aadhaarNumber",
  "panDoc",
  "aadhaarDoc",
  "selfie",
] as const;

export const DEFAULT_KYC_TEMPLATES: Record<number, { name: string; description: string; fields: KycFieldDef[] }> = {
  1: {
    name: "Basic Verification",
    description: "Confirm your identity with PAN. Unlocks deposits, trading and withdrawals up to base limits.",
    fields: [
      { key: "fullName", label: "Full Name (as per PAN)", type: "text", required: true, placeholder: "RAVI KUMAR SHARMA" },
      { key: "dob", label: "Date of Birth", type: "date", required: true },
      { key: "panNumber", label: "PAN Number", type: "identity", required: true, regex: "^[A-Z]{5}[0-9]{4}[A-Z]$", placeholder: "ABCDE1234F", helperText: "10 characters, format AAAAA1111A" },
    ],
  },
  2: {
    name: "Intermediate Verification",
    description: "Add Aadhaar and document images to raise daily trading and withdrawal limits.",
    fields: [
      { key: "aadhaarNumber", label: "Aadhaar Number", type: "identity", required: true, regex: "^\\d{12}$", placeholder: "1234 5678 9012", helperText: "12-digit Aadhaar number" },
      { key: "panDoc", label: "PAN Card Image", type: "image", required: true, helperText: "Upload a clear photo of your PAN card" },
      { key: "aadhaarDoc", label: "Aadhaar Card (Front)", type: "image", required: true, helperText: "Upload front side of your Aadhaar card" },
      { key: "aadhaarDocBack", label: "Aadhaar Card (Back)", type: "image", required: true, helperText: "Upload back side of your Aadhaar card" },
    ],
  },
  3: {
    name: "Advanced Verification",
    description: "Selfie + address verification for institutional limits and futures access.",
    fields: [
      { key: "address", label: "Residential Address", type: "textarea", required: true, placeholder: "House / Street / City / State / PIN" },
      { key: "selfie", label: "Selfie holding PAN Card", type: "image", required: true, helperText: "Hold your PAN card next to your face in good lighting" },
    ],
  },
};
