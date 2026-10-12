import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { AppError } from "../../utils/errors.js";

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, figcaption";

export function extractHtml(html, url) {
  const vc = new VirtualConsole(); // silence CSS parse noise
  const dom = new JSDOM(html, { url, virtualConsole: vc });
  const doc = dom.window.document;
  const meta = (name) => doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.content;
  const metaPublished = meta("article:published_time") ?? meta("citation_publication_date") ?? null;
  // Readability mutates the document, so read meta tags first
  const article = new Readability(doc).parse();
  if (!article?.content) throw new AppError(422, "Could not find readable content on this page");

  const content = new JSDOM(article.content).window.document;
  const blocks = [...content.querySelectorAll(BLOCKS)]
    .filter((el) => !el.querySelector(BLOCKS)) // leaf blocks only, avoids duplicates
    .map((el) => el.textContent.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1);

  const text = blocks.join("\n\n");
  if (text.length < 200) throw new AppError(422, "The page has too little readable text");
  return {
    title: article.title || meta("og:title") || "Untitled page",
    byline: article.byline || meta("author") || null,
    siteName: article.siteName || meta("og:site_name") || null,
    publishedTime: article.publishedTime || metaPublished,
    pages: [text], // HTML is treated as a single page
  };
}
