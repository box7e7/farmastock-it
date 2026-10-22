// Runtime configuration. Must be imported before anything that instantiates PrismaClient,
// because it sets DATABASE_URL from the data directory.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function defaultDataDir() {
  if (process.platform === "win32") return path.join(process.env.ProgramData ?? "C:\\ProgramData", "FarmaStock");
  return path.resolve(here, "../data");
}

export const dataDir = path.resolve(process.env.FARMASTOCK_DATA_DIR ?? defaultDataDir());
mkdirSync(dataDir, { recursive: true });

interface FileConfig { port: number; host: string; jwtSecret: string; demo: boolean }
const configPath = path.join(dataDir, "config.json");
const stored: Partial<FileConfig> = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
const fileConfig: FileConfig = {
  port: stored.port ?? 47400,
  host: stored.host ?? "127.0.0.1",
  jwtSecret: stored.jwtSecret ?? randomBytes(48).toString("base64url"),
  demo: stored.demo ?? true, // MVP: seed demo data on an empty database
};
if (JSON.stringify(stored) !== JSON.stringify(fileConfig)) writeFileSync(configPath, JSON.stringify(fileConfig, null, 2));

export const config = {
  dataDir,
  dbPath: path.join(dataDir, "farmastock.db"),
  backupDir: path.join(dataDir, "backups"),
  port: Number(process.env.PORT ?? fileConfig.port),
  host: process.env.FARMASTOCK_HOST ?? fileConfig.host,
  jwtSecret: process.env.JWT_SECRET ?? fileConfig.jwtSecret,
  demo: process.env.FARMASTOCK_DEMO ? process.env.FARMASTOCK_DEMO === "1" : fileConfig.demo,
  openBrowser: process.env.FARMASTOCK_OPEN_BROWSER === "1",
  // Bundled layout: server.mjs next to web/ and migrations/; dev layout: api/src → ../../web/dist, ../prisma/migrations
  webDir: firstExisting([process.env.FARMASTOCK_WEB_DIR, path.join(here, "web"), path.resolve(here, "../../web/dist")]),
  migrationsDir: firstExisting([process.env.FARMASTOCK_MIGRATIONS_DIR, path.join(here, "migrations"), path.resolve(here, "../prisma/migrations")]),
};

process.env.DATABASE_URL ??= `file:${config.dbPath.replace(/\\/g, "/")}`;

function firstExisting(candidates: (string | undefined)[]) {
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}
