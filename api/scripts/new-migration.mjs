// Creates prisma/migrations/NNNN_<name>.sql with the SQL needed to move the current
// migrations to prisma/schema.prisma. Usage: npm run migration:new -w api -- add_customer_table
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
if (!name) throw new Error("Usage: npm run migration:new -w api -- <name>");

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migDir = path.join(apiDir, "prisma", "migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

// Rebuild the current schema in a scratch database from the existing migrations.
const tmp = mkdtempSync(path.join(tmpdir(), "farmastock-mig-"));
const dbFile = path.join(tmp, "shadow.db");
const db = new DatabaseSync(dbFile);
for (const f of files) db.exec(readFileSync(path.join(migDir, f), "utf8"));
db.close();

const sql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-url", `file:${dbFile}`, "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { cwd: apiDir, encoding: "utf8" });
rmSync(tmp, { recursive: true, force: true });

if (!sql.trim() || /This is an empty migration/.test(sql)) {
  console.log("Schema unchanged: no migration created");
} else {
  const next = String(files.length + 1).padStart(4, "0");
  const file = path.join(migDir, `${next}_${name}.sql`);
  writeFileSync(file, sql);
  console.log(`Created ${path.relative(apiDir, file)}`);
}
