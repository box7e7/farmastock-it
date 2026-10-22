// config must be imported first: it sets DATABASE_URL before PrismaClient is created.
import { config } from "./config.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fstatic from "@fastify/static";
import { exec } from "node:child_process";
import { ZodError } from "zod";
import { AppError, prisma } from "./stock.js";
import { registerRoutes } from "./routes.js";
import { runMigrations } from "./migrate.js";
import { seedDemo } from "./demo.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { id: string; role: string; name: string };
  }
}

const applied = await runMigrations(prisma);
if (applied.length) console.log(`Migrations applied: ${applied.join(", ")}`);
if (config.demo && (await prisma.store.count()) === 0) {
  console.log("Empty database: loading demo data…");
  await seedDemo();
}

const app = Fastify({ logger: { level: "warn" } });
await app.register(cors, { origin: true });
await app.register(jwt, { secret: config.jwtSecret });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof AppError) return reply.status(err.status).send({ error: err.message });
  if (err instanceof ZodError) return reply.status(400).send({ error: "Dati non validi", details: err.issues });
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  return reply.status(status).send({ error: err.message });
});

// Every /api route except login requires a token and a store context.
app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api") || req.url.startsWith("/api/auth/login") || req.url === "/api/health") return;
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Sessione scaduta" });
  }
});

app.get("/api/health", async () => ({ ok: true, version: process.env.FARMASTOCK_VERSION ?? "dev", platform: process.platform }));
await registerRoutes(app);

// Serve the built web app (single URL).
if (config.webDir) {
  await app.register(fstatic, { root: config.webDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) return reply.status(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: config.port, host: config.host });
const url = `http://localhost:${config.port}`;
console.log(`FarmaStock IT running on ${url} (data: ${config.dataDir})`);

if (config.openBrowser) {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
