import { pageForOffset } from "./normalize.js";

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/**
 * Split a sentence span longer than maxChars at the last space before the limit
 * (e.g. a PDF table flattened into one line). Pieces are trimmed spans of `text`.
 */
function splitLong(text, span, maxChars) {
  const pieces = [];
  let { start } = span;
  while (span.end - start > maxChars) {
    const window = text.slice(start, start + maxChars + 1);
    const cut = window.lastIndexOf(" ");
    const end = cut > 0 ? start + cut : start + maxChars; // no space at all → cut mid-word
    pieces.push({ start, end });
    start = end;
    while (text[start] === " ") start++;
  }
  if (span.end > start) pieces.push({ start, end: span.end });
  return pieces;
}

/**
 * Split canonical text into passages of up to `maxSentences` sentences / `maxChars` characters,
 * with a one-sentence overlap. Never crosses paragraph boundaries.
 * Returns [{ text, charStart, charEnd, page, paragraph }]
 */
export function chunkText(text, pageStarts = [0], { maxSentences = 4, maxChars = 900, minChars = 40 } = {}) {
  const passages = [];
  const paraRe = /[^\n]+(?:\n(?!\n)[^\n]+)*/g; // runs of text separated by blank lines
  let paragraphIndex = 0;
  let m;

  while ((m = paraRe.exec(text))) {
    paragraphIndex++;
    const paraStart = m.index;
    const sentences = [...segmenter.segment(m[0])]
      .map((s) => ({ start: paraStart + s.index, end: paraStart + s.index + s.segment.trimEnd().length }))
      .filter((s) => s.end > s.start)
      .flatMap((s) => (s.end - s.start > maxChars ? splitLong(text, s, maxChars) : [s]));

    let i = 0;
    while (i < sentences.length) {
      let j = i;
      while (
        j + 1 < sentences.length &&
        j - i + 1 < maxSentences &&
        sentences[j + 1].end - sentences[i].start <= maxChars
      )
        j++;
      const charStart = sentences[i].start;
      const charEnd = sentences[j].end;
      const chunk = text.slice(charStart, charEnd);
      if (chunk.length >= minChars || sentences.length === 1) {
        passages.push({
          text: chunk,
          charStart,
          charEnd,
          page: pageForOffset(pageStarts, charStart),
          paragraph: paragraphIndex,
        });
      }
      if (j + 1 >= sentences.length) break;
      i = j > i ? j : j + 1; // overlap one sentence when the window has >1 sentence
    }
  }
  return passages;
}
