const SPECIAL = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "&": "\\&", "%": "\\%", $: "\\$", "#": "\\#", _: "\\_", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" };

/** Escape BibTeX/LaTeX special characters in a field value. */
export const escapeBib = (s = "") => String(s).replace(/[\\{}&%$#_~^]/g, (c) => SPECIAL[c]).replace(/\s+/g, " ").trim();

/** URLs are kept verbatim except characters that would break the braces of the field. */
const safeUrl = (u = "") => u.replace(/[{}\\\s]/g, (c) => encodeURIComponent(c));

const ascii = (s = "") =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const lastName = (name = "") => (name.includes(",") ? name.split(",")[0] : name.trim().split(/\s+/).pop() ?? "");

/** Is this source's metadata verified? Papers came from the recommender, which verified them in a second index. */
export const isVerifiedPaper = (s) => s.kind === "paper" && Boolean(s.ids?.doi || s.ids?.s2Id);
const isCitableUrl = (s) => s.kind === "url" && Boolean(s.url && s.title);

/** Key = firstauthorlastnameYEARfirsttitleword, e.g. "robinson2015graph". */
export function baseKey(s) {
  const author = ascii(lastName(s.authors?.[0] ?? "")) || "anon";
  const word = (s.title ?? "").split(/\s+/).map(ascii).find(Boolean) ?? "untitled";
  return `${author}${s.year ?? "nd"}${word}`;
}

/** Colliding keys all get a, b, c… suffixes in input order. */
function assignKeys(sources) {
  const counts = new Map();
  for (const s of sources) counts.set(baseKey(s), (counts.get(baseKey(s)) ?? 0) + 1);
  const used = new Map();
  return sources.map((s) => {
    const key = baseKey(s);
    if (counts.get(key) === 1) return key;
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return key + String.fromCharCode(97 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : "");
  });
}

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function entry(s, key) {
  const fields = [];
  const add = (name, value, raw = false) => value && fields.push(`  ${name} = {${raw ? value : escapeBib(value)}}`);
  let type;
  if (isVerifiedPaper(s)) {
    type = s.venue ? "article" : "misc";
    add("title", s.title);
    add("author", s.authors?.map(escapeBib).join(" and "), true);
    add("year", s.year && String(s.year));
    add(s.venue ? "journal" : "howpublished", s.venue);
    add("doi", s.ids.doi);
    add("url", s.url && safeUrl(s.url), true);
    add("note", s.ids.s2Id && !s.ids.doi ? `Semantic Scholar ID ${s.ids.s2Id}` : null);
  } else {
    type = "misc";
    add("title", s.title);
    add("author", s.authors?.length ? s.authors.map(escapeBib).join(" and ") : null, true);
    add("year", s.year && String(s.year));
    add("howpublished", `\\url{${safeUrl(s.url)}}`, true);
    add("url", safeUrl(s.url), true);
    add("note", isoDate(s.retrievedAt) && `Accessed ${isoDate(s.retrievedAt)}`);
  }
  return `@${type}{${key},\n${fields.join(",\n")}\n}`;
}

/**
 * BibTeX for the project's sources whose metadata is verified (papers with a DOI/S2 id) or citable as a
 * web page (URL + title, as @misc). Uploaded PDFs without verified metadata are left out and counted in a comment.
 */
export function buildBibtex(sources) {
  const ready = sources.filter((s) => s.status === "ready");
  const citable = ready.filter((s) => isVerifiedPaper(s) || isCitableUrl(s));
  const keys = assignKeys(citable);
  const skipped = ready.length - citable.length;
  const header = [
    `@comment{Exported from ProofChain on ${new Date().toISOString().slice(0, 10)}. Papers were verified in a second scholarly index; web pages are cited as @misc.}`,
    skipped ? `@comment{${skipped} source${skipped === 1 ? " was" : "s were"} left out because ${skipped === 1 ? "its" : "their"} metadata is not verified (e.g. uploaded PDFs).}` : null,
  ].filter(Boolean);
  return [...header, ...citable.map((s, i) => entry(s, keys[i]))].join("\n\n") + "\n";
}
