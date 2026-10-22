import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function nextNumber(tx: Tx, key: string, prefix: string) {
  const c = await tx.counter.upsert({ where: { key }, create: { key, next: 2 }, update: { next: { increment: 1 } } });
  const n = c.next - 1;
  return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

export async function findOrCreateLot(tx: Tx, productId: string, lot: string, expiry: Date, owner = "PHARMACY") {
  return tx.lot.upsert({
    where: { productId_lot_owner: { productId, lot, owner } },
    create: { productId, lot, expiry, owner },
    update: {},
  });
}

interface MoveInput {
  storeId: string;
  productId: string;
  lotId: string;
  qty: number;
  type: string;
  unitCost?: number;
  ref?: string;
  note?: string;
  userId?: string;
  createdAt?: Date;
}

/** Appends a ledger row and updates the projected balance. Refuses to go negative. */
export async function postMovement(tx: Tx, m: MoveInput) {
  const bal = await tx.stockBalance.findUnique({ where: { storeId_lotId: { storeId: m.storeId, lotId: m.lotId } } });
  const newQty = (bal?.qty ?? 0) + m.qty;
  if (newQty < -1e-9) throw new AppError(400, "Giacenza insufficiente per il lotto selezionato");
  await tx.stockBalance.upsert({
    where: { storeId_lotId: { storeId: m.storeId, lotId: m.lotId } },
    create: { storeId: m.storeId, lotId: m.lotId, qty: newQty },
    update: { qty: newQty },
  });
  return tx.movement.create({ data: { ...m, unitCost: m.unitCost ?? 0 } });
}

/** Weighted average cost (CMP) across the whole network, updated on every receipt. */
export async function updateAvgCost(tx: Tx, productId: string, qtyIn: number, unitCost: number) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const agg = await tx.stockBalance.aggregate({ where: { lot: { productId, owner: "PHARMACY" } }, _sum: { qty: true } });
  const before = Math.max(0, (agg._sum.qty ?? 0) - qtyIn);
  const avg = before + qtyIn > 0 ? (before * product.avgCost + qtyIn * unitCost) / (before + qtyIn) : unitCost;
  await tx.product.update({ where: { id: productId }, data: { avgCost: Math.round(avg * 10000) / 10000, purchasePrice: unitCost } });
}

/** FEFO allocation: sellable lots ordered by expiry (not blocked, not expired, pharmacy-owned unless DPC). */
export async function allocateFefo(tx: Tx, storeId: string, productId: string, qty: number, owner = "PHARMACY") {
  const today = startOfToday();
  const balances = await tx.stockBalance.findMany({
    where: { storeId, qty: { gt: 0 }, lot: { productId, owner, blocked: false, expiry: { gte: today } } },
    include: { lot: true },
    orderBy: { lot: { expiry: "asc" } },
  });
  const picks: { lotId: string; lot: string; expiry: Date; qty: number }[] = [];
  let remaining = qty;
  for (const b of balances) {
    if (remaining <= 0) break;
    const take = Math.min(b.qty, remaining);
    picks.push({ lotId: b.lotId, lot: b.lot.lot, expiry: b.lot.expiry, qty: take });
    remaining -= take;
  }
  return { picks, missing: remaining };
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysFromNow(n: number) {
  const d = startOfToday();
  d.setDate(d.getDate() + n);
  return d;
}
