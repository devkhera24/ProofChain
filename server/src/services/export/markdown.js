const CLAIM_STATUS = { open: "Open", supported: "Supported", contested: "Contested", unsupported: "Unsupported" };
const GAP_LABEL = {
  single_source: "Single source",
  interested_party_only: "Only supported by interested parties (e.g. vendors)",
  unchallenged: "Unchallenged: no contradicting evidence was looked for or found",
  stale: "Stale evidence",
  abstract_only: "Supported by abstracts only",
  contested: "Contested",
};
const STANCE_HEADINGS = [
  ["supports", "Supporting evidence"],
  ["contradicts", "Contradicting evidence"],
  ["inconclusive", "Inconclusive evidence"],
];
const STATUS_LABEL = { ai_suggested: "AI-suggested", under_review: "under review", disputed: "disputed" };

const byHumanId = (a, b) => a.humanId.localeCompare(b.humanId, "en", { numeric: true });
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "unknown");
/** Text collapsed to one line. */
const inline = (s = "") => String(s).replace(/\s+/g, " ").trim();
/** One line that starts a Markdown line: escape what would otherwise become a heading, list or nested quote. */
const lineStart = (s) => inline(s).replace(/^([#>*+-]|\d+\.)\s/, "\\$1 ");
const quote = (s) => `> ${lineStart(s)}`;
const cite = (l) => `— *${inline(l.source?.title ?? "Unknown source")}*${l.passage?.page ? `, p. ${l.passage.page}` : ""} (${l.passage?.humanId ?? "?"}, ${l.humanId})`;

/**
 * The project as a Markdown report: confirmed evidence per claim, then what is still provisional,
 * open gaps, and the sources with their provenance (URL/DOI, retrieval time, snapshot hash — L7).
 * `links` must have `passage` and `source` populated; rejected links are ignored.
 */
export function buildMarkdown({ project, claims, links, sources, exportedAt = new Date() }) {
  const out = [];
  const live = links.filter((l) => l.status !== "rejected");
  const linksOf = (claim) => live.filter((l) => String(l.claimId) === String(claim._id ?? claim.id));
  const sortedClaims = [...claims].sort(byHumanId);

  out.push(`# ${inline(project.name)}`, "");
  if (project.goal) out.push(`**Goal:** ${inline(project.goal)}  `);
  if (project.topics?.length) out.push(`**Topics:** ${project.topics.map(inline).join(", ")}  `);
  out.push(`**Exported:** ${exportedAt.toISOString().replace("T", " ").slice(0, 16)} UTC from ProofChain`, "");
  out.push("Only evidence confirmed by a person is listed under each claim. Every quote is verbatim from the source passage.", "");

  out.push("## Claims", "");
  if (!sortedClaims.length) out.push("_No claims yet._", "");
  for (const claim of sortedClaims) {
    out.push(`### ${claim.humanId}: ${inline(claim.text)}`, "");
    let status = `**Status:** ${CLAIM_STATUS[claim.status] ?? claim.status}`;
    if (claim.provisionalStatus && claim.provisionalStatus !== claim.status) {
      status += ` (provisionally ${CLAIM_STATUS[claim.provisionalStatus]?.toLowerCase() ?? claim.provisionalStatus}, including unreviewed AI suggestions)`;
    }
    out.push(status + "  ");
    if (claim.scopeNote) out.push(`**Scope:** ${inline(claim.scopeNote)}  `);
    if (claim.gaps?.length) out.push(`**Gaps:** ${claim.gaps.map((g) => GAP_LABEL[g.type] ?? g.type).join("; ")}  `);
    out.push("");
    const confirmed = linksOf(claim).filter((l) => l.status === "confirmed");
    if (!confirmed.length) out.push("_No confirmed evidence yet._", "");
    for (const [stance, heading] of STANCE_HEADINGS) {
      const group = confirmed.filter((l) => l.stance === stance);
      if (!group.length) continue;
      out.push(`#### ${heading}`, "");
      for (const l of group) {
        out.push(quote(l.quote));
        out.push(`> ${cite(l)}${l.scope ? ` · scope: ${inline(l.scope)}` : ""}`, "");
      }
    }
  }

  const provisional = live.filter((l) => l.status !== "confirmed");
  out.push("## Still provisional", "");
  if (!provisional.length) out.push("_Every evidence link has been reviewed._", "");
  else {
    out.push("Evidence suggested by the AI or disputed, not yet confirmed by a person:", "");
    const claimById = new Map(claims.map((c) => [String(c._id ?? c.id), c]));
    for (const l of [...provisional].sort((a, b) => byHumanId(claimById.get(String(a.claimId)) ?? a, claimById.get(String(b.claimId)) ?? b))) {
      const claim = claimById.get(String(l.claimId));
      out.push(`- **${claim?.humanId ?? "?"}** ${l.stance}, ${STATUS_LABEL[l.status] ?? l.status}: "${inline(l.quote)}" ${cite(l)}`);
    }
    out.push("");
  }

  const gapClaims = sortedClaims.filter((c) => c.gaps?.length);
  out.push("## Open evidence gaps", "");
  if (!gapClaims.length) out.push("_None detected._", "");
  else {
    for (const c of gapClaims) out.push(`- **${c.humanId}** ${inline(c.text)}: ${c.gaps.map((g) => GAP_LABEL[g.type] ?? g.type).join("; ")}`);
    out.push("");
  }

  out.push("## Sources", "");
  const ready = sources.filter((s) => s.status === "ready");
  if (!ready.length) out.push("_No sources yet._", "");
  for (const s of ready) {
    const meta = [s.authors?.length ? s.authors.slice(0, 3).join(", ") + (s.authors.length > 3 ? " et al." : "") : null, s.venue, s.year].filter(Boolean).map(inline);
    out.push(`- **${inline(s.title)}**${meta.length ? ` — ${meta.join(", ")}` : ""}`);
    const where = s.ids?.doi ? `DOI: https://doi.org/${s.ids.doi}` : s.url ? `URL: ${s.url}` : s.fileName ? `Uploaded file: ${inline(s.fileName)}` : null;
    if (where) out.push(`  - ${where}`);
    out.push(`  - Type: ${s.sourceType}, ${s.depth === "abstract_only" ? "abstract only" : "full text"} · Retrieved: ${day(s.retrievedAt ?? s.createdAt)}`);
    if (s.textHash) out.push(`  - Snapshot hash (SHA-256 of the text the quotes refer to): \`${s.textHash}\``);
  }
  out.push("");
  return out.join("\n");
}
