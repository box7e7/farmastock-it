// Assembles a portable, self-contained FarmaStock folder + zip (W0 of WINDOWS_PLAN.md):
//   FarmaStock/
//     node(.exe)              official Node.js runtime (same version as the build machine)
//     app/                    output of `npm run build` (server.mjs, web/, migrations/, prisma engines)
//     Avvia FarmaStock.bat    (Windows) / Avvia FarmaStock.command (macOS)
//     data/                   created on first start: database, config.json, backups
// Usage: node scripts/package-portable.mjs --platform win32 --arch x64
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean).map((a) => a.trim().split(/\s+/)));
const platform = args.platform ?? process.platform;
const arch = args.arch ?? process.arch;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "dist", "app");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const nodeVersion = process.versions.node;
const label = `FarmaStock-${version}-portable-${platform === "win32" ? "win" : platform}-${arch}`;
const releaseDir = path.join(root, "release");
const target = path.join(releaseDir, label, "FarmaStock");

if (!existsSync(path.join(appDir, "server.mjs"))) throw new Error("dist/app missing: run `npm run build` first");
const engine = platform === "win32" ? "query_engine-windows.dll.node" : null;
if (engine && !existsSync(path.join(appDir, "node_modules", ".prisma", "client", engine))) {
  throw new Error(`Prisma engine ${engine} missing from the build (check binaryTargets)`);
}

rmSync(path.join(releaseDir, label), { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(appDir, path.join(target, "app"), { recursive: true });

// --- Node.js runtime ---
// Always ship an official nodejs.org build: package-manager builds (e.g. Homebrew) link shared libraries
// and are not portable. On Windows CI, setup-node already provides the official node.exe.
const nodeExe = platform === "win32" ? "node.exe" : "node";
if (platform === "win32" && process.platform === "win32" && arch === process.arch) {
  copyFileSync(process.execPath, path.join(target, nodeExe));
} else {
  await downloadNode(path.join(target, nodeExe));
}
if (platform !== "win32") chmodSync(path.join(target, nodeExe), 0o755);

// --- Launchers ---
if (platform === "win32") {
  const bat = [
    "@echo off",
    "title FarmaStock IT",
    'cd /d "%~dp0"',
    'set "FARMASTOCK_DATA_DIR=%~dp0data"',
    "set FARMASTOCK_OPEN_BROWSER=1",
    "echo Avvio di FarmaStock IT in corso... Il browser si aprira' automaticamente.",
    "echo Per arrestare il programma chiudere questa finestra.",
    "echo.",
    '"%~dp0node.exe" "%~dp0app\\server.mjs"',
    "echo.",
    "echo FarmaStock si e' arrestato. Premere un tasto per chiudere.",
    "pause >nul",
  ].join("\r\n");
  writeFileSync(path.join(target, "Avvia FarmaStock.bat"), bat + "\r\n");
} else {
  const sh = ["#!/bin/sh", 'cd "$(dirname "$0")"', 'export FARMASTOCK_DATA_DIR="$PWD/data"', "export FARMASTOCK_OPEN_BROWSER=1", 'exec ./node app/server.mjs'].join("\n");
  writeFileSync(path.join(target, "Avvia FarmaStock.command"), sh + "\n");
  chmodSync(path.join(target, "Avvia FarmaStock.command"), 0o755);
}
writeFileSync(
  path.join(target, "LEGGIMI.txt"),
  [
    `FarmaStock IT ${version} - versione portatile (demo)`,
    "",
    platform === "win32" ? "1. Fare doppio clic su 'Avvia FarmaStock.bat'." : "1. Fare doppio clic su 'Avvia FarmaStock.command'.",
    "2. Il browser si apre su http://localhost:47400",
    "3. Accesso demo: farmacista@farmastock.it / farma123",
    "",
    "I dati (database, configurazione, backup) sono nella cartella 'data'.",
    "Dati e codici AIC sono fittizi (ambiente demo).",
    "",
  ].join(platform === "win32" ? "\r\n" : "\n"),
);

// --- Zip ---
const zipPath = path.join(releaseDir, `${label}.zip`);
rmSync(zipPath, { force: true });
if (process.platform === "win32") execFileSync("tar.exe", ["-a", "-c", "-f", zipPath, "FarmaStock"], { cwd: path.join(releaseDir, label) });
else execFileSync("zip", ["-qr", zipPath, "FarmaStock"], { cwd: path.join(releaseDir, label) });
console.log(`Portable package: ${zipPath}`);

async function downloadNode(dest) {
  const base = `https://nodejs.org/dist/v${nodeVersion}`;
  const dist = `node-v${nodeVersion}-${platform === "win32" ? "win" : platform}-${arch}`;
  const archive = platform === "win32" ? `${dist}.zip` : `${dist}.tar.gz`;
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
  const expected = sums.split("\n").find((l) => l.endsWith(`  ${archive}`))?.split(/\s+/)[0];
  if (!expected) throw new Error(`No checksum for ${archive}`);
  const buf = Buffer.from(await (await fetch(`${base}/${archive}`)).arrayBuffer());
  if (createHash("sha256").update(buf).digest("hex") !== expected) throw new Error(`Checksum mismatch for ${archive}`);
  const tmp = path.join(releaseDir, archive);
  writeFileSync(tmp, buf);
  if (platform === "win32") {
    writeFileSync(dest, execFileSync("unzip", ["-p", tmp, `${dist}/node.exe`], { maxBuffer: 512 * 1024 * 1024 }));
  } else {
    execFileSync("tar", ["-xzf", tmp, "-C", releaseDir, `${dist}/bin/node`]);
    copyFileSync(path.join(releaseDir, dist, "bin", "node"), dest);
    rmSync(path.join(releaseDir, dist), { recursive: true, force: true });
  }
  rmSync(tmp);
  console.log(`Official Node.js ${nodeVersion} (${platform}-${arch}) downloaded and verified (sha256)`);
}
