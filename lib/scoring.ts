export function upsetPoints(p: number) {
  return Math.min(5, Math.sqrt(1 / Math.max(p, 0.01)))
}