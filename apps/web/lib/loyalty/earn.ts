export function computePointsForBill(billIdr: number, earnRateIdrPerPoint: number): number {
  if (billIdr < 0 || earnRateIdrPerPoint <= 0) return 0;
  return Math.floor(billIdr / earnRateIdrPerPoint);
}
