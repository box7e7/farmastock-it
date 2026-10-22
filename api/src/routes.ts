import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { parseScan } from "./gs1.js";
import { computeReplenishment } from "./replenish.js";
import {
  AppError, allocateFefo, daysFromNow, findOrCreateLot, nextNumber, postMovement, prisma, startOfToday, updateAvgCost,
} from "./stock.js";

const r2 = (n: number) => Math.round(n * 100) / 100;
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function storeOf(req: FastifyRequest) {
  const id = req.headers["x-store-id"];
  if (typeof id !== "string" || !id) throw new AppError(400, "Punto vendita non selezionato");
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) throw new AppError(404, "Punto vendita inesistente");
  return store;
}

function requireRole(req: FastifyRequest, ...roles: string[]) {
  if (req.user.role !== "ADMIN" && !roles.includes(req.user.role)) throw new AppError(403, "Permesso negato");
}

async function findProductByScan(code: string) {
  const s = parseScan(code);
  const or: { aic?: string; gtin?: string }[] = [];
  if (s.gtin) or.push({ gtin: s.gtin }, { gtin: s.gtin.replace(/^0/, "") });
  if (s.aic) or.push({ aic: s.aic });
  const product = or.length ? await prisma.product.findFirst({ where: { OR: or } }) : null;
  return { scan: s, product };
}

/** On-hand per product for a store (sellable = not blocked, not expired; DPC products only have ASL-owned lots). */
async function onHandMap(storeId: string, sellableOnly = false) {
  const balances = await prisma.stockBalance.findMany({
    where: {
      storeId,
      qty: { gt: 0 },
      ...(sellableOnly ? { lot: { blocked: false, expiry: { gte: startOfToday() } } } : {}),
    },
    include: { lot: true },
  });
  const map = new Map<string, number>();
  for (const b of balances) map.set(b.lot.productId, (map.get(b.lot.productId) ?? 0) + b.qty);
  return map;
}

const productSchema = z.object({
  aic: z.string().regex(/^\d{9}$/).nullable().optional(),
  gtin: z.string().regex(/^\d{8,14}$/).nullable().optional(),
  name: z.string().min(2),
  activeIngredient: z.string().nullable().optional(),
  atc: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  category: z.enum(["FARMACO", "PARAFARMACO", "DISPOSITIVO", "COSMETICO", "INTEGRATORE", "VETERINARIO"]),
  drugClass: z.enum(["A", "C", "H", "SOP", "OTC"]).nullable().optional(),
  rxRequired: z.boolean().default(false),
  narcotic: z.boolean().default(false),
  coldChain: z.boolean().default(false),
  dpc: z.boolean().default(false),
  vatRate: z.number().min(0).max(22),
  publicPrice: z.number().min(0),
  purchasePrice: z.number().min(0),
  packMultiple: z.number().int().min(1).default(1),
  preferredSupplierId: z.string().nullable().optional(),
});

export async function registerRoutes(app: FastifyInstance) {
  // ---------- Auth & context ----------
  app.post("/api/auth/login", async (req) => {
    const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AppError(401, "Credenziali non valide");
    const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name }, { expiresIn: "12h" });
    return { token, user: { id: user.id, name: user.name, role: user.role, storeId: user.storeId } };
  });

  app.get("/api/me", async (req) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    const stores = await prisma.store.findMany({ orderBy: [{ type: "desc" }, { name: "asc" }] });
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    return { user: { id: user.id, name: user.name, role: user.role, storeId: user.storeId }, stores, suppliers };
  });

  // ---------- Dashboard ----------
  app.get("/api/dashboard", async (req) => {
    const store = await storeOf(req);
    const today = startOfToday();
    const balances = await prisma.stockBalance.findMany({
      where: { storeId: store.id, qty: { gt: 0 } },
      include: { lot: { include: { product: true } } },
    });
    let stockValue = 0, expiredValue = 0, expiringValue = 0, blockedUnits = 0;
    const in90 = daysFromNow(90);
    const expiring: { product: string; lot: string; expiry: Date; qty: number }[] = [];
    for (const b of balances) {
      if (b.lot.owner !== "PHARMACY") continue;
      const v = b.qty * b.lot.product.avgCost;
      stockValue += v;
      if (b.lot.blocked) blockedUnits += b.qty;
      if (b.lot.expiry < today) expiredValue += v;
      else if (b.lot.expiry <= in90) {
        expiringValue += v;
        expiring.push({ product: b.lot.product.name, lot: b.lot.lot, expiry: b.lot.expiry, qty: b.qty });
      }
    }
    const onHand = await onHandMap(store.id, true);
    const rules = await prisma.stockRule.findMany({ where: { storeId: store.id }, include: { product: true } });
    const below = rules
      .filter((r) => (onHand.get(r.productId) ?? 0) <= r.min)
      .map((r) => ({ productId: r.productId, product: r.product.name, onHand: onHand.get(r.productId) ?? 0, min: r.min }))
      .sort((a, b) => a.onHand - b.onHand);

    const since = daysFromNow(-13);
    const sales = await prisma.sale.findMany({ where: { storeId: store.id, createdAt: { gte: since } }, select: { total: true, createdAt: true } });
    const byDay: { day: string; total: number; count: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      byDay.push({ day: localDay(d), total: 0, count: 0 });
    }
    for (const s of sales) {
      const slot = byDay.find((x) => x.day === localDay(s.createdAt));
      if (slot) { slot.total = r2(slot.total + s.total); slot.count++; }
    }
    const openRecalls = await prisma.recall.count({ where: { status: "OPEN" } });
    const skuCount = await prisma.product.count({ where: { active: true } });
    return {
      store,
      kpi: {
        stockValue: r2(stockValue), expiredValue: r2(expiredValue), expiringValue: r2(expiringValue), blockedUnits,
        belowMin: below.length, openRecalls, skuCount,
        salesToday: byDay[13].total, ticketsToday: byDay[13].count,
      },
      salesByDay: byDay,
      belowMin: below.slice(0, 8),
      expiring: expiring.sort((a, b) => +a.expiry - +b.expiry).slice(0, 8),
    };
  });

  // ---------- Catalogue ----------
  app.get("/api/products", async (req) => {
    const store = await storeOf(req);
    const { q, category } = req.query as { q?: string; category?: string };
    const products = await prisma.product.findMany({
      where: {
        active: true,
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { aic: { contains: q } }, { gtin: { contains: q } }, { activeIngredient: { contains: q } }] } : {}),
      },
      include: { preferredSupplier: true },
      orderBy: { name: "asc" },
      take: 300,
    });
    const onHand = await onHandMap(store.id);
    const rules = await prisma.stockRule.findMany({ where: { storeId: store.id } });
    const ruleMap = new Map(rules.map((r) => [r.productId, r]));
    return products.map((p) => ({
      ...p,
      onHand: onHand.get(p.id) ?? 0,
      min: ruleMap.get(p.id)?.min ?? 0,
      max: ruleMap.get(p.id)?.max ?? 0,
    }));
  });

  app.get("/api/products/:id", async (req) => {
    const store = await storeOf(req);
    const { id } = req.params as { id: string };
    const product = await prisma.product.findUnique({ where: { id }, include: { preferredSupplier: true } });
    if (!product) throw new AppError(404, "Prodotto non trovato");
    const lots = await prisma.lot.findMany({
      where: { productId: id },
      include: { balances: { include: { store: true }, where: { qty: { not: 0 } } } },
      orderBy: { expiry: "asc" },
    });
    const rule = await prisma.stockRule.findUnique({ where: { storeId_productId: { storeId: store.id, productId: id } } });
    const movements = await prisma.movement.findMany({
      where: { productId: id }, include: { lot: true, store: true }, orderBy: { createdAt: "desc" }, take: 50,
    });
    return { product, lots, rule, movements };
  });

  app.post("/api/products", async (req) => {
    requireRole(req, "PHARMACIST");
    const data = productSchema.parse(req.body);
    return prisma.product.create({ data: { ...data, avgCost: data.purchasePrice } });
  });

  app.put("/api/products/:id", async (req) => {
    requireRole(req, "PHARMACIST");
    const { id } = req.params as { id: string };
    return prisma.product.update({ where: { id }, data: productSchema.parse(req.body) });
  });

  app.put("/api/products/:id/rule", async (req) => {
    const store = await storeOf(req);
    const { id } = req.params as { id: string };
    const { min, max } = z.object({ min: z.number().min(0), max: z.number().min(0) }).parse(req.body);
    if (max < min) throw new AppError(400, "La scorta massima deve essere ≥ minima");
    return prisma.stockRule.upsert({
      where: { storeId_productId: { storeId: store.id, productId: id } },
      create: { storeId: store.id, productId: id, min, max },
      update: { min, max },
    });
  });

  // ---------- Scanner ----------
  app.get("/api/scan", async (req) => {
    const store = await storeOf(req);
    const { code } = z.object({ code: z.string().min(1) }).parse(req.query);
    const { scan, product } = await findProductByScan(code);
    if (!product) return { scan, product: null };
    const lot = scan.lot ? await prisma.lot.findFirst({ where: { productId: product.id, lot: scan.lot } }) : null;
    const onHand = (await onHandMap(store.id, true)).get(product.id) ?? 0;
    return { scan, product, lot, onHand };
  });

  // ---------- Stock ----------
  app.get("/api/stock", async (req) => {
    const store = await storeOf(req);
    const { q, filter } = req.query as { q?: string; filter?: string };
    const today = startOfToday();
    const balances = await prisma.stockBalance.findMany({
      where: {
        storeId: store.id,
        qty: { not: 0 },
        lot: {
          ...(filter === "blocked" ? { blocked: true } : {}),
          ...(filter === "dpc" ? { owner: "ASL" } : {}),
          ...(filter === "expired" ? { expiry: { lt: today } } : {}),
          ...(filter === "expiring" ? { expiry: { gte: today, lte: daysFromNow(90) } } : {}),
          ...(q ? { product: { OR: [{ name: { contains: q } }, { aic: { contains: q } }] } } : {}),
        },
      },
      include: { lot: { include: { product: true } } },
      orderBy: [{ lot: { product: { name: "asc" } } }, { lot: { expiry: "asc" } }],
      take: 500,
    });
    return balances.map((b) => ({
      lotId: b.lotId, qty: b.qty, lot: b.lot.lot, expiry: b.lot.expiry, owner: b.lot.owner, blocked: b.lot.blocked,
      product: { id: b.lot.product.id, name: b.lot.product.name, aic: b.lot.product.aic, category: b.lot.product.category,
        narcotic: b.lot.product.narcotic, coldChain: b.lot.product.coldChain, avgCost: b.lot.product.avgCost },
      value: r2(b.qty * b.lot.product.avgCost),
    }));
  });

  app.post("/api/stock/count", async (req) => {
    const store = await storeOf(req);
    const { lotId, countedQty, note } = z.object({ lotId: z.string(), countedQty: z.number().min(0), note: z.string().optional() }).parse(req.body);
    return prisma.$transaction(async (tx) => {
      const lot = await tx.lot.findUniqueOrThrow({ where: { id: lotId }, include: { product: true } });
      const bal = await tx.stockBalance.findUnique({ where: { storeId_lotId: { storeId: store.id, lotId } } });
      const diff = countedQty - (bal?.qty ?? 0);
      if (diff === 0) return { diff };
      await postMovement(tx, { storeId: store.id, productId: lot.productId, lotId, qty: diff, type: "COUNT", unitCost: lot.product.avgCost, note: note ?? "Rettifica inventariale", userId: req.user.id });
      return { diff };
    });
  });

  app.post("/api/stock/transfer", async (req) => {
    const store = await storeOf(req);
    const body = z.object({ toStoreId: z.string(), lines: z.array(z.object({ lotId: z.string(), qty: z.number().positive() })).min(1) }).parse(req.body);
    if (body.toStoreId === store.id) throw new AppError(400, "Scegliere un punto vendita diverso");
    return prisma.$transaction(async (tx) => {
      const ref = await nextNumber(tx, "TRF", "TRF");
      for (const l of body.lines) {
        const lot = await tx.lot.findUniqueOrThrow({ where: { id: l.lotId }, include: { product: true } });
        if (lot.blocked) throw new AppError(400, `Lotto ${lot.lot} bloccato (richiamo)`);
        const common = { productId: lot.productId, lotId: l.lotId, unitCost: lot.product.avgCost, ref, userId: req.user.id };
        await postMovement(tx, { ...common, storeId: store.id, qty: -l.qty, type: "TRANSFER_OUT" });
        await postMovement(tx, { ...common, storeId: body.toStoreId, qty: l.qty, type: "TRANSFER_IN" });
      }
      return { ref };
    });
  });

  app.get("/api/movements", async (req) => {
    const store = await storeOf(req);
    const { type } = req.query as { type?: string };
    return prisma.movement.findMany({
      where: { storeId: store.id, ...(type ? { type } : {}) },
      include: { product: { select: { name: true, aic: true } }, lot: { select: { lot: true, expiry: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
  });

  // ---------- Receiving (carico merce) ----------
  const receiptSchema = z.object({
    supplierId: z.string(),
    orderId: z.string().optional(),
    ref: z.string().optional(), // DDT / invoice number
    lines: z.array(z.object({
      productId: z.string(),
      lot: z.string().min(1),
      expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      qty: z.number().positive(),
      unitCost: z.number().min(0),
    })).min(1),
  });

  app.post("/api/receipts", async (req) => {
    requireRole(req, "PHARMACIST", "WAREHOUSE");
    const store = await storeOf(req);
    const body = receiptSchema.parse(req.body);
    return prisma.$transaction(async (tx) => {
      const ref = body.ref || (await nextNumber(tx, "RCV", "CAR"));
      for (const l of body.lines) {
        const product = await tx.product.findUniqueOrThrow({ where: { id: l.productId } });
        const lot = await findOrCreateLot(tx, l.productId, l.lot, new Date(l.expiry), product.dpc ? "ASL" : "PHARMACY");
        if (lot.blocked) throw new AppError(400, `Il lotto ${l.lot} è oggetto di richiamo: carico rifiutato`);
        await postMovement(tx, { storeId: store.id, productId: l.productId, lotId: lot.id, qty: l.qty, type: "RECEIPT", unitCost: l.unitCost, ref, userId: req.user.id });
        if (!product.dpc) await updateAvgCost(tx, l.productId, l.qty, l.unitCost);
        if (body.orderId) {
          const line = await tx.purchaseOrderLine.findFirst({ where: { orderId: body.orderId, productId: l.productId } });
          if (line) await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQty: { increment: l.qty } } });
        }
      }
      if (body.orderId) await tx.purchaseOrder.update({ where: { id: body.orderId }, data: { status: "RECEIVED" } });
      return { ref, lines: body.lines.length };
    });
  });

  // ---------- Replenishment & orders ----------
  app.get("/api/replenishment", async (req) => {
    const store = await storeOf(req);
    const [products, rules, onHand, openLines, sold] = await Promise.all([
      prisma.product.findMany({ where: { active: true, dpc: false }, include: { preferredSupplier: true } }),
      prisma.stockRule.findMany({ where: { storeId: store.id } }),
      onHandMap(store.id, true),
      prisma.purchaseOrderLine.findMany({ where: { order: { storeId: store.id, status: "SENT" } } }),
      prisma.movement.groupBy({ by: ["productId"], where: { storeId: store.id, type: "SALE", createdAt: { gte: daysFromNow(-30) } }, _sum: { qty: true } }),
    ]);
    const ruleMap = new Map(rules.map((r) => [r.productId, r]));
    const soldMap = new Map(sold.map((s) => [s.productId, -(s._sum.qty ?? 0)]));
    const onOrder = new Map<string, number>();
    for (const l of openLines) onOrder.set(l.productId, (onOrder.get(l.productId) ?? 0) + l.qty - l.receivedQty);

    const rows = [];
    for (const p of products) {
      const rule = ruleMap.get(p.id);
      const soldLast30 = soldMap.get(p.id) ?? 0;
      if (!rule && soldLast30 === 0) continue;
      const res = computeReplenishment({
        onHand: onHand.get(p.id) ?? 0, onOrder: onOrder.get(p.id) ?? 0, soldLast30,
        min: rule?.min ?? 0, max: rule?.max ?? 0,
        leadTimeDays: p.preferredSupplier?.leadTimeDays ?? 1, packMultiple: p.packMultiple,
      });
      if (res.suggested > 0) {
        rows.push({
          productId: p.id, name: p.name, aic: p.aic, supplierId: p.preferredSupplierId, supplier: p.preferredSupplier?.name ?? "—",
          onHand: onHand.get(p.id) ?? 0, onOrder: onOrder.get(p.id) ?? 0, soldLast30, min: rule?.min ?? 0, max: rule?.max ?? 0,
          unitCost: p.purchasePrice, ...res,
        });
      }
    }
    return rows.sort((a, b) => (a.supplier + a.name).localeCompare(b.supplier + b.name));
  });

  app.post("/api/orders/from-proposal", async (req) => {
    requireRole(req, "PHARMACIST", "WAREHOUSE");
    const store = await storeOf(req);
    const { lines } = z.object({ lines: z.array(z.object({ productId: z.string(), qty: z.number().positive() })).min(1) }).parse(req.body);
    return prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.productId) } } });
      const bySupplier = new Map<string, { productId: string; qty: number; unitCost: number }[]>();
      for (const l of lines) {
        const p = products.find((x) => x.id === l.productId);
        if (!p?.preferredSupplierId) throw new AppError(400, `Nessun fornitore preferito per ${p?.name ?? l.productId}`);
        const arr = bySupplier.get(p.preferredSupplierId) ?? [];
        arr.push({ productId: p.id, qty: l.qty, unitCost: p.purchasePrice });
        bySupplier.set(p.preferredSupplierId, arr);
      }
      const created = [];
      for (const [supplierId, ls] of bySupplier) {
        const number = await nextNumber(tx, "PO", "ORD");
        // MVP: "SENT" simulates transmission to the wholesaler (FarmaClick adapter in a later phase).
        created.push(await tx.purchaseOrder.create({ data: { number, storeId: store.id, supplierId, status: "SENT", lines: { create: ls } } }));
      }
      return created;
    });
  });

  app.get("/api/orders", async (req) => {
    const store = await storeOf(req);
    const orders = await prisma.purchaseOrder.findMany({
      where: { storeId: store.id }, include: { supplier: true, lines: true }, orderBy: { createdAt: "desc" }, take: 100,
    });
    const productIds = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.productId)))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, aic: true, gtin: true } });
    const pm = new Map(products.map((p) => [p.id, p]));
    return orders.map((o) => ({
      ...o,
      total: r2(o.lines.reduce((s, l) => s + l.qty * l.unitCost, 0)),
      lines: o.lines.map((l) => ({ ...l, product: pm.get(l.productId) })),
    }));
  });

  // ---------- Counter sales (banco) ----------
  const saleSchema = z.object({
    patientCf: z.string().regex(/^[A-Z0-9]{16}$/i).optional().or(z.literal("")),
    paymentMethod: z.enum(["CASH", "CARD", "MIXED"]).default("CASH"),
    rxConfirmed: z.boolean().default(false),
    lines: z.array(z.object({ productId: z.string(), qty: z.number().int().positive() })).min(1),
  });

  app.post("/api/sales", async (req) => {
    const store = await storeOf(req);
    const body = saleSchema.parse(req.body);
    return prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, `SALE-${store.code}`, `V${store.code}`);
      const saleLines: { productId: string; lotId: string; name: string; lot: string; qty: number; unitPrice: number; vatRate: number; total: number }[] = [];
      for (const l of body.lines) {
        const p = await tx.product.findUniqueOrThrow({ where: { id: l.productId } });
        if ((p.rxRequired || p.narcotic) && !body.rxConfirmed) throw new AppError(400, `${p.name}: richiede ricetta medica (confermare la verifica)`);
        if (p.narcotic && !body.patientCf) throw new AppError(400, `${p.name}: stupefacente, codice fiscale paziente obbligatorio`);
        const { picks, missing } = await allocateFefo(tx, store.id, p.id, l.qty, p.dpc ? "ASL" : "PHARMACY");
        if (missing > 0) throw new AppError(400, `${p.name}: disponibili solo ${l.qty - missing} pz vendibili (esclusi lotti scaduti o bloccati)`);
        const unitPrice = p.dpc ? 0 : p.publicPrice; // DPC: dispensed on behalf of the ASL
        for (const pick of picks) {
          await postMovement(tx, { storeId: store.id, productId: p.id, lotId: pick.lotId, qty: -pick.qty, type: "SALE", unitCost: p.avgCost, ref: number, userId: req.user.id });
          saleLines.push({ productId: p.id, lotId: pick.lotId, name: p.name, lot: pick.lot, qty: pick.qty, unitPrice, vatRate: p.vatRate, total: r2(pick.qty * unitPrice) });
        }
      }
      const total = r2(saleLines.reduce((s, l) => s + l.total, 0));
      const vatTotal = r2(saleLines.reduce((s, l) => s + (l.total - l.total / (1 + l.vatRate / 100)), 0));
      return tx.sale.create({
        data: { number, storeId: store.id, userId: req.user.id, patientCf: body.patientCf?.toUpperCase() || null, paymentMethod: body.paymentMethod, total, vatTotal, lines: { create: saleLines } },
        include: { lines: true },
      });
    });
  });

  app.get("/api/sales", async (req) => {
    const store = await storeOf(req);
    return prisma.sale.findMany({ where: { storeId: store.id }, include: { lines: true }, orderBy: { createdAt: "desc" }, take: 50 });
  });

  // ---------- Expiry ----------
  app.get("/api/expiry", async (req) => {
    const store = await storeOf(req);
    const today = startOfToday();
    const balances = await prisma.stockBalance.findMany({
      where: { storeId: store.id, qty: { gt: 0 }, lot: { expiry: { lte: daysFromNow(180) } } },
      include: { lot: { include: { product: { include: { preferredSupplier: true } } } } },
      orderBy: { lot: { expiry: "asc" } },
    });
    return balances.map((b) => {
      const days = Math.round((+b.lot.expiry - +today) / 86400000);
      const bucket = days < 0 ? "EXPIRED" : days <= 30 ? "30" : days <= 60 ? "60" : days <= 90 ? "90" : "180";
      return {
        lotId: b.lotId, lot: b.lot.lot, expiry: b.lot.expiry, qty: b.qty, days, bucket, owner: b.lot.owner, blocked: b.lot.blocked,
        product: b.lot.product.name, productId: b.lot.productId, supplier: b.lot.product.preferredSupplier?.name,
        value: r2(b.qty * b.lot.product.avgCost),
      };
    });
  });

  app.post("/api/expiry/action", async (req) => {
    requireRole(req, "PHARMACIST", "WAREHOUSE");
    const store = await storeOf(req);
    const { lotIds, action } = z.object({ lotIds: z.array(z.string()).min(1), action: z.enum(["WRITEOFF", "RETURN"]) }).parse(req.body);
    return prisma.$transaction(async (tx) => {
      const ref = await nextNumber(tx, action, action === "RETURN" ? "RES" : "DIS");
      for (const lotId of lotIds) {
        const bal = await tx.stockBalance.findUnique({ where: { storeId_lotId: { storeId: store.id, lotId } }, include: { lot: { include: { product: true } } } });
        if (!bal || bal.qty <= 0) continue;
        await postMovement(tx, {
          storeId: store.id, productId: bal.lot.productId, lotId, qty: -bal.qty,
          type: action === "RETURN" ? "RETURN_SUPPLIER" : "EXPIRY_WRITEOFF", unitCost: bal.lot.product.avgCost, ref, userId: req.user.id,
        });
      }
      return { ref };
    });
  });

  // ---------- Recalls (richiami AIFA) ----------
  app.get("/api/recalls", async () => {
    const recalls = await prisma.recall.findMany({ orderBy: { createdAt: "desc" } });
    const result = [];
    for (const r of recalls) {
      const product = await prisma.product.findUnique({ where: { id: r.productId }, select: { name: true, aic: true } });
      const lots = r.lots.split(",").map((s) => s.trim()).filter(Boolean);
      const affected = await prisma.stockBalance.findMany({
        where: { qty: { gt: 0 }, lot: { productId: r.productId, lot: { in: lots } } },
        include: { store: true, lot: true },
      });
      result.push({ ...r, product, affected: affected.map((a) => ({ store: a.store.name, lot: a.lot.lot, qty: a.qty })) });
    }
    return result;
  });

  app.post("/api/recalls", async (req) => {
    requireRole(req, "PHARMACIST");
    const body = z.object({ productId: z.string(), lots: z.array(z.string().min(1)).min(1), severity: z.enum(["I", "II", "III"]), reason: z.string().min(3) }).parse(req.body);
    return prisma.$transaction(async (tx) => {
      const recall = await tx.recall.create({ data: { productId: body.productId, lots: body.lots.join(","), severity: body.severity, reason: body.reason } });
      const res = await tx.lot.updateMany({ where: { productId: body.productId, lot: { in: body.lots } }, data: { blocked: true, recallId: recall.id } });
      return { ...recall, blockedLots: res.count };
    });
  });

  app.post("/api/recalls/:id/close", async (req) => {
    requireRole(req, "PHARMACIST");
    const { id } = req.params as { id: string };
    return prisma.$transaction(async (tx) => {
      const recall = await tx.recall.findUniqueOrThrow({ where: { id } });
      if (recall.status === "CLOSED") throw new AppError(400, "Richiamo già chiuso");
      const balances = await tx.stockBalance.findMany({ where: { qty: { gt: 0 }, lot: { recallId: id } }, include: { lot: { include: { product: true } } } });
      for (const b of balances) {
        await postMovement(tx, { storeId: b.storeId, productId: b.lot.productId, lotId: b.lotId, qty: -b.qty, type: "RECALL", unitCost: b.lot.product.avgCost, ref: `RICHIAMO ${id.slice(-6)}`, userId: req.user.id, note: "Reso per richiamo" });
      }
      return tx.recall.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    });
  });

  // ---------- Narcotics register (view over the immutable ledger) ----------
  app.get("/api/narcotics", async (req) => {
    const store = await storeOf(req);
    const products = await prisma.product.findMany({ where: { narcotic: true }, orderBy: { name: "asc" } });
    const out = [];
    for (const p of products) {
      const moves = await prisma.movement.findMany({ where: { storeId: store.id, productId: p.id }, include: { lot: true }, orderBy: { createdAt: "asc" } });
      let balance = 0;
      const rows = moves.map((m, i) => {
        balance += m.qty;
        return { n: i + 1, date: m.createdAt, type: m.type, lot: m.lot.lot, in: m.qty > 0 ? m.qty : 0, out: m.qty < 0 ? -m.qty : 0, balance, ref: m.ref };
      });
      out.push({ product: { id: p.id, name: p.name, aic: p.aic, activeIngredient: p.activeIngredient }, rows, balance });
    }
    return out;
  });
}
