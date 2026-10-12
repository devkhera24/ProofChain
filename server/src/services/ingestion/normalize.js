const QUOTES = /[\u2018\u2019\u201A\u201B\u2032]/g;
const DQUOTES = /[\u201C\u201D\u201E\u201F\u2033]/g;
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;

/** Normalise one page/section of extracted text. Keeps paragraph breaks as "\n\n". */
export function normalizeText(raw) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00AD/g, "") // soft hyphens
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2") // re-join words hyphenated across line breaks
    .replace(QUOTES, "'")
    .replace(DQUOTES, '"')
    .replace(DASHES, "-")
    .replace(/[\t\f\v\u00A0]+/g, " ")
    .replace(/ +\n/g, "\n") // whitespace-only lines count as blank, so "\n \n" is still a paragraph break
    .replace(/\n{2,}/g, "\u0000") // protect paragraph breaks
    .replace(/\s*\n\s*/g, " ") // single newlines inside paragraphs → spaces
    .replace(/ {2,}/g, " ")
    .replace(/\s*\u0000\s*/g, "\n\n")
    .trim();
}

/** Join normalised pages; returns canonical text and where each page starts. */
export function joinPages(pages) {
  let text = "";
  const pageStarts = [];
  for (const page of pages) {
    const norm = normalizeText(page);
    if (text && norm) text += "\n\n"; // empty pages (e.g. scanned images) add no blank paragraphs
    pageStarts.push(text.length);
    text += norm;
  }
  return { text, pageStarts };
}

export function pageForOffset(pageStarts, offset) {
  let lo = 0,
    hi = pageStarts.length - 1,
    ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pageStarts[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans + 1; // 1-based page numbers
}
