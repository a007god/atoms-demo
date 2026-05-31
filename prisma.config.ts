import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env first, then .env.local (later file wins for the same key).
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const url = process.env["DATABASE_URL"] ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Only pass URL to Prisma CLI when it's a Postgres connection string.
  // For local SQLite dev, migrations are not run via CLI (adapter handles it).
  ...(url.startsWith("postgres") ? { datasource: { url } } : {}),
});
