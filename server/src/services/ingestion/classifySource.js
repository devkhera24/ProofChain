const RULES = [
  { type: "preprint", hosts: ["arxiv.org", "biorxiv.org", "medrxiv.org", "ssrn.com", "researchgate.net"] },
  {
    type: "peer_reviewed",
    hosts: [
      "doi.org", "dl.acm.org", "ieeexplore.ieee.org", "link.springer.com", "sciencedirect.com", "vldb.org",
      "usenix.org", "aclanthology.org", "nature.com", "wiley.com", "tandfonline.com", "mdpi.com", "plos.org",
    ],
  },
  {
    type: "vendor",
    hosts: [
      "neo4j.com", "tigergraph.com", "memgraph.com", "arangodb.com", "aws.amazon.com", "cloud.google.com",
      "learn.microsoft.com", "oracle.com", "ibm.com", "mongodb.com", "datastax.com", "nebula-graph.io",
    ],
  },
  { type: "blog", hosts: ["medium.com", "dev.to", "substack.com", "hashnode.dev", "wordpress.com", "blogspot.com"] },
  {
    type: "news",
    hosts: [
      "nytimes.com", "theguardian.com", "bbc.co.uk", "bbc.com", "reuters.com", "techcrunch.com",
      "theverge.com", "wired.com", "zdnet.com", "infoq.com", "thehindu.com", "livemint.com",
    ],
  },
];

export function classifySource({ url, kind, hasDoi }) {
  if (kind === "paper") return hasDoi ? "peer_reviewed" : "preprint";
  if (!url) return "unknown";
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
  for (const rule of RULES) if (rule.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return rule.type;
  if (/\bblog\b/.test(host) || /\/blog\//.test(url)) return "blog";
  return "unknown";
}
