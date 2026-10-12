/**
 * Split text into non-overlapping segments at every passage (and page) boundary; each segment lists the
 * passage IDs covering it. Passages overlap by one sentence, so nesting spans wouldn't work.
 */
export function buildSegments(text, passages, extraCuts = []) {
  const cuts = new Set([0, text.length, ...extraCuts.filter((c) => c > 0 && c < text.length)]);
  passages.forEach((p) => {
    cuts.add(p.charStart);
    cuts.add(p.charEnd);
  });
  const points = [...cuts].sort((a, b) => a - b);
  const sorted = [...passages].sort((a, b) => a.charStart - b.charStart);
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s, e] = [points[i], points[i + 1]];
    const covering = [];
    for (const p of sorted) {
      if (p.charStart > s) break;
      if (p.charEnd >= e) covering.push(p.humanId);
    }
    segs.push({ start: s, end: e, text: text.slice(s, e), passageIds: covering });
  }
  return segs;
}
