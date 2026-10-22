import { describe, expect, it } from "vitest";
import { parseScan } from "../src/gs1.js";
import { computeReplenishment } from "../src/replenish.js";

describe("parseScan", () => {
  it("parses human-readable GS1 Data Matrix", () => {
    const r = parseScan("(01)08030300000001(17)271231(10)LOT42(21)ABC123");
    expect(r).toMatchObject({ kind: "DATAMATRIX", gtin: "08030300000001", aic: "030000000", lot: "LOT42", expiry: "2027-12-31", serial: "ABC123" });
  });
  it("parses raw Data Matrix with GS separators and variable fields in any order", () => {
    const r = parseScan("010803030000000121SER9\x1d10LOTX\x1d17260600");
    expect(r).toMatchObject({ gtin: "08030300000001", serial: "SER9", lot: "LOTX", expiry: "2026-06-30" });
  });
  it("parses bollino ottico AIC with and without A prefix", () => {
    expect(parseScan("A030300000")).toMatchObject({ kind: "AIC", aic: "030300000" });
    expect(parseScan("030300000")).toMatchObject({ kind: "AIC", aic: "030300000" });
  });
  it("parses EAN-13", () => {
    expect(parseScan("8000000010003")).toMatchObject({ kind: "EAN", gtin: "8000000010003" });
  });
  it("flags unknown input", () => {
    expect(parseScan("hello").kind).toBe("UNKNOWN");
  });
});

describe("computeReplenishment", () => {
  const base = { onOrder: 0, min: 5, max: 20, leadTimeDays: 1, packMultiple: 1 };
  it("orders up to target when at or below reorder point", () => {
    const r = computeReplenishment({ ...base, onHand: 3, soldLast30: 30 });
    expect(r.reorderPoint).toBe(5);
    expect(r.suggested).toBe(17);
  });
  it("does not order above reorder point", () => {
    expect(computeReplenishment({ ...base, onHand: 12, soldLast30: 30 }).suggested).toBe(0);
  });
  it("counts open orders in the stock position", () => {
    expect(computeReplenishment({ ...base, onHand: 2, onOrder: 10, soldLast30: 30 }).suggested).toBe(0);
  });
  it("rounds up to pack multiple", () => {
    expect(computeReplenishment({ ...base, onHand: 0, soldLast30: 0, packMultiple: 6 }).suggested).toBe(24);
  });
  it("uses demand-driven target for fast movers", () => {
    const r = computeReplenishment({ ...base, onHand: 0, soldLast30: 300 });
    expect(r.target).toBe(140);
    expect(r.suggested).toBe(140);
  });
});
