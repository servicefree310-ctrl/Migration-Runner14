import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  // `out` enables `drizzle-kit generate` to produce versioned SQL migration
  // files. Always use `generate` + `migrate` for production schema changes —
  // never `push` (which can silently drop columns on rename/delete).
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
