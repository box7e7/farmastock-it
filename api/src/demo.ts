// Demo data: 1 central warehouse + 2 pharmacies, 36 products, ~45 days of simulated sales.
// AIC codes and lots are FICTITIOUS (demo only).
import bcrypt from "bcryptjs";
import type { Product } from "@prisma/client";
import { allocateFefo, daysFromNow, findOrCreateLot, nextNumber, postMovement, prisma, updateAvgCost } from "./stock.js";

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const poisson = (lambda: number) => {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
};

function gs1Check(body: string) {
  const sum = body.split("").reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}
const ntin = (aic: string) => { const b = "0380" + aic; return b + gs1Check(b); };
const ean = (n: number) => { const b = "80" + String(n).padStart(10, "0"); return b + gs1Check(b); };

type P = [name: string, category: string, cls: string | null, vat: number, price: number, rate: number, flags?: string, ingredient?: string];
// flags: r=rx, n=narcotic, c=cold chain, d=DPC, m=manufacturer-direct
const catalogue: P[] = [
  ["Paracetamolo 500 mg 20 compresse", "FARMACO", "OTC", 10, 4.9, 6, "", "paracetamolo"],
  ["Paracetamolo 1000 mg 16 compresse", "FARMACO", "C", 10, 5.5, 3, "r", "paracetamolo"],
  ["Ibuprofene 400 mg 12 compresse rivestite", "FARMACO", "OTC", 10, 6.9, 5, "", "ibuprofene"],
  ["Ibuprofene 200 mg 24 compresse", "FARMACO", "OTC", 10, 7.5, 2, "", "ibuprofene"],
  ["Ketoprofene sale di lisina 80 mg 10 bustine", "FARMACO", "SOP", 10, 8.9, 3, "", "ketoprofene"],
  ["Acido acetilsalicilico 500 mg 20 compresse", "FARMACO", "OTC", 10, 5.9, 2, "", "acido acetilsalicilico"],
  ["Loratadina 10 mg 20 compresse", "FARMACO", "SOP", 10, 7.9, 2, "", "loratadina"],
  ["Cetirizina 10 mg 10 compresse", "FARMACO", "SOP", 10, 6.5, 2.5, "", "cetirizina"],
  ["Pantoprazolo 20 mg 14 compresse", "FARMACO", "SOP", 10, 8.9, 1.5, "", "pantoprazolo"],
  ["Diclofenac gel 1% 100 g", "FARMACO", "OTC", 10, 9.9, 2, "", "diclofenac"],
  ["Xilometazolina spray nasale 10 ml", "FARMACO", "OTC", 10, 6.2, 2, "", "xilometazolina"],
  ["Omeprazolo 20 mg 14 capsule", "FARMACO", "A", 10, 4.2, 4, "r", "omeprazolo"],
  ["Amoxicillina/Ac. clavulanico 875/125 mg 12 compresse", "FARMACO", "A", 10, 7.8, 3, "r", "amoxicillina"],
  ["Atorvastatina 20 mg 30 compresse", "FARMACO", "A", 10, 8.5, 3.5, "r", "atorvastatina"],
  ["Ramipril 5 mg 28 compresse", "FARMACO", "A", 10, 5.1, 3, "r", "ramipril"],
  ["Metformina 1000 mg 60 compresse", "FARMACO", "A", 10, 4.3, 3, "r", "metformina"],
  ["Insulina glargine 100 U/ml 5 penne", "FARMACO", "A", 10, 62.0, 0.6, "rc", "insulina glargine"],
  ["Enoxaparina 4000 UI 6 siringhe (DPC)", "FARMACO", "A", 10, 21.0, 1, "rd", "enoxaparina"],
  ["Morfina solfato 10 mg/ml 5 fiale", "FARMACO", "A", 10, 6.8, 0.2, "rn", "morfina"],
  ["Tramadolo 50 mg 20 capsule", "FARMACO", "A", 10, 5.6, 0.5, "rn", "tramadolo"],
  ["Lorazepam 2,5 mg 20 compresse", "FARMACO", "C", 10, 6.1, 1, "r", "lorazepam"],
  ["Sildenafil 50 mg 4 compresse", "FARMACO", "C", 10, 19.9, 0.7, "r", "sildenafil"],
  ["Crema solare SPF 50+ 200 ml", "COSMETICO", null, 22, 18.9, 1.5, "m"],
  ["Detergente intimo 250 ml", "COSMETICO", null, 22, 6.9, 1.5, "m"],
  ["Shampoo antiforfora 200 ml", "COSMETICO", null, 22, 9.9, 1, "m"],
  ["Magnesio e Potassio 20 bustine", "INTEGRATORE", null, 10, 12.5, 2],
  ["Vitamina D3 2000 UI gocce 30 ml", "INTEGRATORE", null, 10, 14.9, 1.5],
  ["Fermenti lattici 10 flaconcini", "INTEGRATORE", null, 10, 11.9, 2],
  ["Termometro digitale", "DISPOSITIVO", null, 22, 9.9, 0.4],
  ["Mascherine FFP2 10 pezzi", "DISPOSITIVO", null, 22, 7.5, 1],
  ["Cerotti assortiti 20 pezzi", "DISPOSITIVO", null, 22, 3.9, 1.5],
  ["Test di gravidanza 1 pezzo", "DISPOSITIVO", null, 22, 9.5, 0.6],
  ["Siringhe 2,5 ml 10 pezzi", "DISPOSITIVO", null, 22, 2.9, 0.8],
  ["Latte in polvere 1 - 800 g", "PARAFARMACO", null, 10, 24.9, 0.8],
  ["Antiparassitario spot-on cane 3 pipette", "VETERINARIO", null, 10, 19.9, 0.5],
  ["Collirio idratante 10 ml", "DISPOSITIVO", null, 22, 8.9, 1],
];

export async function seedDemo() {
  console.log("Seeding…");
  const [mag, mi, rm] = await Promise.all([
    prisma.store.create({ data: { code: "MAG", name: "Magazzino Centrale", type: "WAREHOUSE", city: "Milano" } }),
    prisma.store.create({ data: { code: "MI01", name: "Farmacia Milano Centro", city: "Milano", aslCode: "ATS-MI" } }),
    prisma.store.create({ data: { code: "RM01", name: "Farmacia Roma Prati", city: "Roma", aslCode: "ASL-RM1" } }),
  ]);
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  await prisma.user.createMany({
    data: [
      { name: "Amministratore", email: "admin@farmastock.it", passwordHash: hash("admin123"), role: "ADMIN" },
      { name: "Dott.ssa Giulia Rossi", email: "farmacista@farmastock.it", passwordHash: hash("farma123"), role: "PHARMACIST", storeId: mi.id },
      { name: "Marco Bianchi", email: "cassa@farmastock.it", passwordHash: hash("cassa123"), role: "CASHIER", storeId: mi.id },
      { name: "Luca Verdi", email: "magazzino@farmastock.it", passwordHash: hash("magazzino123"), role: "WAREHOUSE", storeId: mag.id },
    ],
  });
  const [gNord, gCentro, , direct] = await Promise.all([
    prisma.supplier.create({ data: { name: "Grossista Nord S.p.A.", leadTimeDays: 1 } }),
    prisma.supplier.create({ data: { name: "Grossista Centro S.r.l.", leadTimeDays: 1 } }),
    prisma.supplier.create({ data: { name: "Magazzino Centrale (interno)", type: "WAREHOUSE", leadTimeDays: 1 } }),
    prisma.supplier.create({ data: { name: "Cosmetica Diretta S.r.l.", type: "MANUFACTURER", leadTimeDays: 5 } }),
  ]);

  const products: { p: Product; rate: number }[] = [];
  for (let i = 0; i < catalogue.length; i++) {
    const [name, category, cls, vat, price, rate, flags = "", ingredient] = catalogue[i];
    const isDrug = category === "FARMACO";
    const aic = isDrug ? String(30000000 + i * 1237).padStart(9, "0") : null;
    const purchase = Math.round((price / (1 + vat / 100)) * (0.6 + rand() * 0.08) * 100) / 100;
    const p = await prisma.product.create({
      data: {
        aic, gtin: aic ? ntin(aic) : ean(1000 + i), name, category, drugClass: cls, vatRate: vat, publicPrice: price,
        purchasePrice: purchase, avgCost: purchase, activeIngredient: ingredient ?? null,
        rxRequired: flags.includes("r"), narcotic: flags.includes("n"), coldChain: flags.includes("c"), dpc: flags.includes("d"),
        manufacturer: isDrug ? "Lab. Farmaceutico Demo" : "Brand Demo",
        packMultiple: category === "COSMETICO" ? 3 : 1,
        preferredSupplierId: flags.includes("m") ? direct.id : i % 3 === 0 ? gCentro.id : gNord.id,
      },
    });
    products.push({ p, rate });
  }

  const start = daysFromNow(-45);
  // Opening receipts: warehouse holds bulk stock; pharmacies get 1–2 lots each.
  await prisma.$transaction(async (tx) => {
    for (const [idx, { p, rate }] of products.entries()) {
      const owner = p.dpc ? "ASL" : "PHARMACY";
      const lotA = await findOrCreateLot(tx, p.id, `L${2400 + idx}A`, daysFromNow(idx % 9 === 4 ? -10 : idx % 7 === 0 ? 25 : idx % 5 === 0 ? 70 : 400 + idx * 5), owner);
      const lotB = await findOrCreateLot(tx, p.id, `L${2400 + idx}B`, daysFromNow(600 + idx * 3), owner);
      const ref = await nextNumber(tx, "RCV", "CAR");
      await postMovement(tx, { storeId: mag.id, productId: p.id, lotId: lotB.id, qty: Math.ceil(rate * 120) + 20, type: "RECEIPT", unitCost: p.purchasePrice, ref, createdAt: start });
      for (const store of [mi, rm]) {
        const factor = idx % 4 === 1 ? 0.35 : 0.8 + rand() * 0.9; // some items will end up below min
        const qty = Math.max(2, Math.round(rate * 45 * factor));
        const qa = Math.ceil(qty * 0.4);
        await postMovement(tx, { storeId: store.id, productId: p.id, lotId: lotA.id, qty: qa, type: "RECEIPT", unitCost: p.purchasePrice, ref, createdAt: start });
        await postMovement(tx, { storeId: store.id, productId: p.id, lotId: lotB.id, qty: qty - qa, type: "RECEIPT", unitCost: p.purchasePrice, ref, createdAt: start });
        const min = Math.max(1, Math.ceil(rate * 3));
        await tx.stockRule.create({ data: { storeId: store.id, productId: p.id, min, max: Math.max(min + 2, Math.ceil(rate * 12)) } });
      }
      if (!p.dpc) await updateAvgCost(tx, p.id, 0, p.purchasePrice);
    }
  }, { timeout: 120000 });

  // Simulated daily sales (FEFO) for the last 45 days.
  const cf = ["RSSMRA80A01F205X", "BNCLRA75B45H501Y", "VRDGPP62C10L219Z"];
  for (let d = 44; d >= 0; d--) {
    await prisma.$transaction(async (tx) => {
      for (const store of [mi, rm]) {
        const tickets = 8 + Math.floor(rand() * 10);
        for (let t = 0; t < tickets; t++) {
          const day = daysFromNow(-d);
          day.setHours(9 + Math.floor(rand() * 10), Math.floor(rand() * 60));
          if (day > new Date()) day.setTime(Date.now() - 60000 * (tickets - t));
          const lines = [];
          const n = 1 + Math.floor(rand() * 3);
          for (let k = 0; k < n; k++) {
            // weight by demand rate
            const pick = products[Math.floor(rand() * products.length)];
            const qty = Math.max(1, poisson(pick.rate / 6));
            if (rand() > Math.min(1, pick.rate / 3)) continue;
            const { picks, missing } = await allocateFefo(tx, store.id, pick.p.id, qty, pick.p.dpc ? "ASL" : "PHARMACY");
            if (missing > 0 || picks.length === 0) continue;
            lines.push({ p: pick.p, picks });
          }
          if (!lines.length) continue;
          const number = await nextNumber(tx, `SALE-${store.code}`, `V${store.code}`);
          const saleLines = [];
          for (const { p, picks } of lines) {
            const price = p.dpc ? 0 : p.publicPrice;
            for (const pk of picks) {
              await postMovement(tx, { storeId: store.id, productId: p.id, lotId: pk.lotId, qty: -pk.qty, type: "SALE", unitCost: p.avgCost, ref: number, createdAt: day });
              saleLines.push({ productId: p.id, lotId: pk.lotId, name: p.name, lot: pk.lot, qty: pk.qty, unitPrice: price, vatRate: p.vatRate, total: Math.round(pk.qty * price * 100) / 100 });
            }
          }
          const total = Math.round(saleLines.reduce((s, l) => s + l.total, 0) * 100) / 100;
          const vatTotal = Math.round(saleLines.reduce((s, l) => s + (l.total - l.total / (1 + l.vatRate / 100)), 0) * 100) / 100;
          const needsCf = lines.some((l) => l.p.rxRequired || l.p.narcotic);
          await tx.sale.create({
            data: { number, storeId: store.id, total, vatTotal, createdAt: day, paymentMethod: rand() > 0.4 ? "CARD" : "CASH",
              patientCf: needsCf ? cf[Math.floor(rand() * cf.length)] : null, lines: { create: saleLines } },
          });
        }
      }
    }, { timeout: 120000 });
  }
  const counts = { products: await prisma.product.count(), movements: await prisma.movement.count(), sales: await prisma.sale.count() };
  console.log("Seed completed:", counts);
}

