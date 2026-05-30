import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env first, then .env.local (later file wins for the same key).
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
