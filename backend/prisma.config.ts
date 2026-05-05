// Prisma 7 configuration file — used by the Prisma CLI for migrations.
//
// This file is NOT used by the running server (the adapter in src/db/prisma.ts
// handles runtime queries). It exists only so `prisma migrate dev` knows which
// database to apply migrations against.
//
// dotenv/config is imported here so the DATABASE_URL from backend/.env is
// available when the CLI runs without a pre-set env.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? (() => { throw new Error("DATABASE_URL is not set — copy .env.example to .env"); })(),
  },
});
