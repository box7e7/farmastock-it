// Bundles the API into dist/app/server.mjs and assembles a self-contained app folder:
//   server.mjs, web/ (built UI), migrations/, node_modules/{@prisma/client,.prisma/client} (+ native engines)
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(apiDir, "..");
const out = path.join(root, "dist", "app");
const webDist = path.join(root, "web", "dist");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

if (!existsSync(webDist)) throw new Error("web/dist missing: run `npm run build -w web` first");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(apiDir, "src", "index.ts")],
  outfile: path.join(out, "server.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["@prisma/client", ".prisma/client"],
  define: { "process.env.FARMASTOCK_VERSION": JSON.stringify(version) },
  // CommonJS dependencies inside an ESM bundle need require/__dirname.
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      "import { fileURLToPath as __fu } from 'node:url';",
      "import { dirname as __dn } from 'node:path';",
      "const require = __cr(import.meta.url);",
      "const __filename = __fu(import.meta.url);",
      "const __dirname = __dn(__filename);",
    ].join("\n"),
  },
  logLevel: "warning",
});

cpSync(webDist, path.join(out, "web"), { recursive: true });
cpSync(path.join(apiDir, "prisma", "migrations"), path.join(out, "migrations"), { recursive: true });

const prismaClientDir = path.dirname(require.resolve("@prisma/client/package.json"));
const generatedDir = path.resolve(prismaClientDir, "..", "..", ".prisma", "client");
if (!existsSync(generatedDir)) throw new Error(`Generated Prisma client not found at ${generatedDir}: run prisma generate`);
cpSync(prismaClientDir, path.join(out, "node_modules", "@prisma", "client"), { recursive: true });
cpSync(generatedDir, path.join(out, "node_modules", ".prisma", "client"), { recursive: true });

writeFileSync(path.join(out, "package.json"), JSON.stringify({ name: "farmastock-app", version, type: "module", private: true }, null, 2));
console.log(`Built ${out} (v${version})`);
