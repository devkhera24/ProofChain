import { distance } from "fastest-levenshtein";

export const normTitle = (t = "") =>
  t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function titleSimilarity(a, b) {
  const x = normTitle(a),
    y = normTitle(b);
  if (!x || !y) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

/** "Ada Lovelace" → "lovelace"; "Lovelace, Ada" → "lovelace" */
export const lastName = (name = "") => {
  if (name.includes(",")) return normTitle(name.split(",")[0]).split(" ").filter(Boolean).pop() ?? "";
  return normTitle(name).split(" ").filter(Boolean).pop() ?? "";
};

/** L2: do two records describe the same paper? */
export function metadataConsistent(a, b, { titleMin = 0.9 } = {}) {
  const reasons = [];
  const ts = titleSimilarity(a.title, b.title);
  if (ts < titleMin) reasons.push(`title_mismatch(${ts.toFixed(2)})`);
  if (a.year && b.year && Math.abs(a.year - b.year) > 1) reasons.push(`year_mismatch(${a.year}≠${b.year})`);
  if (a.authors?.length && b.authors?.length) {
    const la = new Set(a.authors.slice(0, 5).map(lastName));
    if (!b.authors.slice(0, 5).some((x) => la.has(lastName(x)))) reasons.push("author_mismatch");
  }
  return { ok: reasons.length === 0, titleScore: ts, reasons };
}
