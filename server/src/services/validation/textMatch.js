import { distance } from "fastest-levenshtein";

export const NEAR_MATCH_THRESHOLD = 0.92;

const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B\u2032]/;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u2033]/;
const DASHES = /[\u2010-\u2015\u2212]/;

/** Normalise for matching and keep a map from normalised index → original index. */
export function normalizeWithMap(s) {
  let out = "";
  const map = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i];
    if (SINGLE_QUOTES.test(ch)) ch = "'";
    else if (DOUBLE_QUOTES.test(ch)) ch = '"';
    else if (DASHES.test(ch)) ch = "-";
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else lastSpace = false;
    out += ch.toLowerCase();
    map.push(i);
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
    map.pop();
  }
  return { text: out, map };
}

const similarity = (a, b) => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 1);

/** Quote marks, ellipses and stray full stops around a quote aren't part of it. Runs after normalisation. */
const stripWrapping = (q) => q.replace(/^["'.\u2026 ]+|["'.\u2026 ]+$/g, "");

/**
 * Does `quote` occur in `passageText`?
 * @returns {{ matched: boolean, matchType?: "exact"|"near_match", score: number, start?: number, end?: number, original?: string }}
 * start/end/original refer to the ORIGINAL passage text, so the UI shows real text, never the AI's version.
 */
export function matchQuote(quote, passageText) {
  if (!quote || !passageText) return { matched: false, score: 0 };
  const q = stripWrapping(normalizeWithMap(quote).text);
  const p = normalizeWithMap(passageText);
  if (q.length < 8) return { matched: false, score: 0 }; // too short to be meaningful

  const idx = p.text.indexOf(q);
  if (idx !== -1) return located("exact", 1, idx, idx + q.length, p, passageText);

  // Near match: slide a window over word boundaries, window length ≈ quote length (±10%)
  const starts = [0];
  for (let i = 0; i < p.text.length; i++) if (p.text[i] === " ") starts.push(i + 1);
  let best = { score: 0 };
  for (const s of starts) {
    for (const len of [q.length, Math.round(q.length * 0.9), Math.round(q.length * 1.1)]) {
      if (s + len > p.text.length + 5) continue;
      const window = p.text.slice(s, s + len);
      const score = similarity(q, window);
      if (score > best.score) best = { score, s, e: Math.min(s + len, p.text.length) };
    }
  }
  if (best.score >= NEAR_MATCH_THRESHOLD) {
    let e = best.e;
    while (e < p.text.length && p.text[e] !== " ") e++; // end on a word boundary so the UI never shows half a word
    return located("near_match", best.score, best.s, e, p, passageText);
  }
  return { matched: false, score: Number(best.score.toFixed(3)) };
}

function located(matchType, score, ns, ne, p, original) {
  const start = p.map[ns];
  const end = p.map[Math.max(ns, ne - 1)] + 1;
  return { matched: true, matchType, score: Number(score.toFixed(3)), start, end, original: original.slice(start, end) };
}
