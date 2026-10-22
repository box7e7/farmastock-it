// Pure replenishment maths (min/max + days-of-cover), kept free of DB access for testing.

export interface ReplenishInput {
  onHand: number;
  onOrder: number;
  soldLast30: number;
  min: number;
  max: number;
  leadTimeDays: number;
  packMultiple: number;
  coverDays?: number;
}

export interface ReplenishResult {
  avgDaily: number;
  reorderPoint: number;
  target: number;
  suggested: number;
  daysOfCover: number | null;
}

export function computeReplenishment(i: ReplenishInput): ReplenishResult {
  const coverDays = i.coverDays ?? 14;
  const avgDaily = i.soldLast30 / 30;
  const safety = Math.ceil(avgDaily * 2);
  const reorderPoint = Math.max(i.min, Math.ceil(avgDaily * i.leadTimeDays) + safety);
  const target = Math.max(i.max, reorderPoint + 1, Math.ceil(avgDaily * coverDays));
  const position = i.onHand + i.onOrder;
  let suggested = 0;
  if (position <= reorderPoint) {
    const need = target - position;
    const pack = Math.max(1, i.packMultiple);
    suggested = Math.ceil(need / pack) * pack;
  }
  return {
    avgDaily: Math.round(avgDaily * 100) / 100,
    reorderPoint,
    target,
    suggested,
    daysOfCover: avgDaily > 0 ? Math.round((i.onHand / avgDaily) * 10) / 10 : null,
  };
}
