// Applies versioned SQL migrations at startup (no Prisma CLI needed at runtime).
// Each pending migration runs in a transaction, after an online backup of a non-empty database.
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { config } from "./config.js";

export async function backupDatabase(prisma: PrismaClient, reason: string) {
  mkdirSync(config.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(config.backupDir, `farmastock-${stamp}-${reason}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return file;
}

export async function runMigrations(prisma: PrismaClient) {
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  if (!config.migrationsDir) throw new Error("Migrations directory not found");

  const files = readdirSync(config.migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM "_migrations"`)).map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));
  if (!pending.length) return [];

  const hasData = (await prisma.$queryRawUnsafe<unknown[]>(`SELECT name FROM sqlite_master WHERE type='table' AND name='Store'`)).length > 0;
  // Databases created earlier with `prisma db push` already contain the initial schema.
  if (hasData && applied.size === 0 && pending[0].startsWith("0001_")) {
    await prisma.$executeRawUnsafe(`INSERT INTO "_migrations" ("name") VALUES (?)`, pending.shift()!);
    if (!pending.length) return [];
  }
  if (hasData && existsSync(config.dbPath)) await backupDatabase(prisma, "pre-migration");

  for (const file of pending) {
    const sql = readFileSync(path.join(config.migrationsDir, file), "utf8");
    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    await prisma.$transaction(async (tx) => {
      for (const st of statements) await tx.$executeRawUnsafe(st);
      await tx.$executeRawUnsafe(`INSERT INTO "_migrations" ("name") VALUES (?)`, file);
    });
  }
  return pending;
}
