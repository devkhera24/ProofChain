import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AppError } from "../../utils/errors.js";

const MAX_PAGES = 150;

/** Ensure `text` ends with at least `n` newlines (1 = line break, 2 = paragraph break) without stacking them. */
const breakTo = (text, n) => {
  if (!text || /\n*$/.exec(text)[0].length >= n) return text;
  return text.trimEnd() + "\n".repeat(n);
};

/** Text of one page; vertical jumps between text items become line or paragraph breaks. */
async function pageText(doc, i) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  let text = "";
  let lastY = null;
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform?.[5];
    const jump = lastY === null ? 0 : Math.abs(y - lastY);
    if (jump > 14) text = breakTo(text, 2); // big vertical jump ≈ new paragraph
    else if (jump > 1) text = breakTo(text, 1); // new line
    text += item.str;
    if (item.hasEOL) text = breakTo(text, 1); // EOL + the next line's jump is still one line break
    lastY = y;
  }
  page.cleanup();
  return text;
}

/** Returns { title, pages: string[] } with one string per page. */
export async function extractPdf(buffer) {
  const task = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0, // errors only
  });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch {
      throw new AppError(422, "Could not read this PDF");
    }
    const pages = [];
    const n = Math.min(doc.numPages, MAX_PAGES);
    for (let i = 1; i <= n; i++) pages.push(await pageText(doc, i));
    const meta = await doc.getMetadata().catch(() => null);

    const total = pages.join("").trim().length;
    if (total < 200) throw new AppError(422, "This PDF has no extractable text (it may be a scanned image)");
    return { title: meta?.info?.Title?.trim() || null, pages, truncated: doc.numPages > MAX_PAGES };
  } finally {
    await task.destroy(); // pdfjs v6: destroy lives on the loading task
  }
}
