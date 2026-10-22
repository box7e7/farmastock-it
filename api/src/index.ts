import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fstatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ZodError } from "zod";
import { AppError, prisma } from "./stock.js";
import { registerRoutes } from "./routes.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { id: string; role: string; name: string };
  }
}

const app = Fastify({ logger: { level: "warn" } });
await app.register(cors, { origin: true });
await app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });

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

app.get("/api/health", async () => ({ ok: true }));
await registerRoutes(app);

// Serve the built web app (single URL for the MVP).
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  await app.register(fstatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) return reply.status(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "127.0.0.1" });
console.log(`FarmaStock IT running on http://localhost:${port}`);

process.on("SIGTERM", async () => {
  await app.close();
  await prisma.$disconnect();
});
