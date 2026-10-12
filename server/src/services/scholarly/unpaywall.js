import pLimit from "p-limit";
import { getJson } from "./http.js";
import { env } from "../../config/env.js";
import { normDoi } from "./paper.js";

const limit = pLimit(2);

export function fromUnpaywall(u) {
  if (!u?.doi || !u.title) return null;
  return {
    ids: { doi: normDoi(u.doi) },
    title: u.title,
    authors: (u.z_authors ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    year: u.year ?? null,
    venue: u.journal_name ?? null,
    abstract: null,
    citationCount: 0,
    oaPdfUrl: u.best_oa_location?.url_for_pdf ?? null,
    url: u.doi_url ?? null,
    providers: ["unpaywall"],
  };
}

/** Open-access PDF lookup by DOI. */
export async function getUnpaywall(doi) {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(env.CONTACT_EMAIL)}`;
  return fromUnpaywall(await limit(() => getJson("unpaywall", url)));
}
