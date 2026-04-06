import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

/**
 * When this file exists, Prisma CLI skips its default `.env` loading — we mirror
 * `dotenv-cli -c development` so `.env.local` works the same as in npm `db:*` scripts.
 */
const root = process.cwd();
for (const file of [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
]) {
  const path = resolve(root, file);
  if (existsSync(path)) {
    loadEnv({ path, override: true });
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
