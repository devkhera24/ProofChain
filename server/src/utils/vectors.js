export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export const norm = (a) => Math.sqrt(dot(a, a));
export function cosine(a, b) {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot(a, b) / n;
}
export function normalize(a) {
  const n = norm(a) || 1;
  return a.map((x) => x / n);
}
/** Weighted average of vectors (weights need not sum to 1). Skips empty vectors. */
export function weightedMean(pairs) {
  const valid = pairs.filter(([v, w]) => v?.length && w > 0);
  if (!valid.length) return null;
  const dim = valid[0][0].length;
  const out = new Array(dim).fill(0);
  let total = 0;
  for (const [v, w] of valid) {
    for (let i = 0; i < dim; i++) out[i] += v[i] * w;
    total += w;
  }
  return normalize(out.map((x) => x / total));
}
