import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Network, X } from "lucide-react";
import { graphApi } from "../../api/graph.js";
import { claimsApi } from "../../api/claims.js";
import { sourcesApi } from "../../api/sources.js";
import { linksApi } from "../../api/links.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { CLAIM_STATUS } from "../../lib/evidence.js";
import { SOURCE_TYPES } from "../../lib/sourceLabels.js";
import StateMessage from "../common/StateMessage.jsx";
import LinkCard from "../claims/LinkCard.jsx";
import EvidenceGraph, { TYPE_COLOR } from "./EvidenceGraph.jsx";
import Tabs from "../ui/Tabs.jsx";
import { ease } from "../../lib/motion.js";

const VIEWS = [
  ["all", "All", {}],
  ["contested", "Contested only", { contested: "true" }],
  ["unreviewed", "Unreviewed only", { status: "unreviewed" }],
];

function Legend() {
  const line = (color, dashed) => (
    <svg width="28" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="28" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? "5 3" : undefined} />
    </svg>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1">{line("#2e8b57")} supports</span>
      <span className="inline-flex items-center gap-1">{line("#c0392b")} contradicts</span>
      <span className="inline-flex items-center gap-1">{line("#c98b0b")} inconclusive</span>
      <span className="inline-flex items-center gap-1">{line("#9aa5b1", true)} AI-suggested</span>
      <span className="inline-flex items-center gap-1">{line("#6c4ab6")} disputed</span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-3 w-5 rounded-sm border-2 border-[#ffd27a] bg-navy" /> contested claim
      </span>
      {Object.entries(TYPE_COLOR).map(([t, c]) => (
        <span key={t} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} /> {SOURCE_TYPES[t]}
        </span>
      ))}
      <span className="basis-full">Edge colour = stance. Solid = reviewed by a human. Dashed = AI-suggested. Purple = disputed.</span>
    </div>
  );
}

function LinkDrawer({ projectId, claimId, linkId, canReview }) {
  const { data: links, isPending } = useQuery({
    queryKey: ["links", projectId, "claim", claimId],
    queryFn: () => linksApi.list(projectId, { claimId }),
  });
  if (isPending) return <p className="text-sm text-muted">Loading…</p>;
  const link = links?.find((l) => l.id === linkId);
  return link ? <LinkCard projectId={projectId} link={link} canReview={canReview} showClaim /> : <p className="text-sm text-muted">This link no longer exists.</p>;
}

function Drawer({ projectId, selection, canReview, onClose }) {
  const { kind, data } = selection;
  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.24, ease } }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
      className="w-full shrink-0 space-y-3 overflow-auto rounded-xl border border-line bg-white p-3 shadow-sm lg:w-80"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy">{kind === "claim" ? `Claim ${data.label}` : kind === "passage" ? `Passage ${data.label}` : `Evidence ${data.label}`}</h3>
        <button type="button" className="-m-1 rounded-md p-1 text-muted hover:bg-black/5 hover:text-ink" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      {kind === "claim" && (
        <>
          <p className="text-sm text-ink">{data.text}</p>
          <p className="text-xs text-muted">
            {CLAIM_STATUS[data.status]}
            {data.provisionalStatus !== data.status && ` · provisionally ${CLAIM_STATUS[data.provisionalStatus]?.toLowerCase()}`}
            {data.gapCount > 0 && ` · ${data.gapCount} gap${data.gapCount > 1 ? "s" : ""}`}
          </p>
          <Link to={`/projects/${projectId}/claims/${data.id.split(":")[1]}`} className="btn-primary px-2 py-1 text-xs">
            Open claim
          </Link>
        </>
      )}
      {kind === "passage" && (
        <>
          <p className="text-xs text-muted">
            {data.sourceTitle} · {SOURCE_TYPES[data.sourceType]}
            {data.page ? ` · p.${data.page}` : ""}
          </p>
          <p className="max-h-64 overflow-auto whitespace-pre-wrap text-sm text-ink">{data.text}</p>
          <Link to={`/projects/${projectId}/sources/${data.sourceId}?passage=${data.label}`} className="btn-primary px-2 py-1 text-xs">
            Open in source
          </Link>
        </>
      )}
      {kind === "link" && <LinkDrawer projectId={projectId} claimId={data.target.split(":")[1]} linkId={data.linkId} canReview={canReview} />}
    </motion.aside>
  );
}

export default function GraphView() {
  const { projectId } = useParams();
  const { data: project } = useProject(projectId);
  const canReview = ["editor", "owner"].includes(project?.role);
  const [view, setView] = useState("all");
  const [sourceId, setSourceId] = useState("");
  const [claimId, setClaimId] = useState("");
  const [selection, setSelection] = useState(null);

  const filters = useMemo(
    () => ({ ...VIEWS.find(([k]) => k === view)[2], ...(sourceId && { sourceId }), ...(claimId && { claimId }) }),
    [view, sourceId, claimId],
  );
  const graph = useQuery({ queryKey: ["graph", projectId, filters], queryFn: () => graphApi.get(projectId, filters) });
  const claims = useQuery({ queryKey: ["claims", projectId], queryFn: () => claimsApi.list(projectId) });
  const sources = useQuery({ queryKey: ["sources", projectId], queryFn: () => sourcesApi.list(projectId) });
  const elements = graph.data?.elements ?? [];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs label="Graph view" layoutId="graph-view" value={view} onChange={setView} items={VIEWS.map(([key, label]) => ({ key, label }))} />
        <select className="rounded-full border border-line bg-white px-2 py-1 text-xs" value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="Filter by source">
          <option value="">All sources</option>
          {sources.data?.filter((s) => s.status === "ready").map((s) => (
            <option key={s.id} value={s.id}>
              {s.title.slice(0, 50)}
            </option>
          ))}
        </select>
        <select className="rounded-full border border-line bg-white px-2 py-1 text-xs" value={claimId} onChange={(e) => setClaimId(e.target.value)} aria-label="Filter by claim">
          <option value="">All claims</option>
          {claims.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.humanId} — {c.text.slice(0, 40)}
            </option>
          ))}
        </select>
        {graph.data && (
          <span className="ml-auto text-xs tabular-nums text-muted">
            {graph.data.counts.claims} claims · {graph.data.counts.passages} passages · {graph.data.counts.links} links
          </span>
        )}
      </div>
      <Legend />
      {graph.data?.truncated && (
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">The graph is large, so only the first 400 elements are shown. Use the filters to narrow it down.</p>
      )}

      {graph.isPending ? (
        <StateMessage kind="loading" title="Building the evidence graph…" />
      ) : graph.error ? (
        <StateMessage kind="error" title="Couldn't load the graph">{toApiError(graph.error).message}</StateMessage>
      ) : !elements.length ? (
        <StateMessage icon={Network} title={view === "all" && !sourceId && !claimId ? "Add sources and claims to see the evidence graph" : "Nothing matches these filters"} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="min-h-[480px] flex-1 overflow-hidden rounded-xl border border-line bg-white">
            <EvidenceGraph
              elements={elements}
              onSelectClaim={(data) => setSelection({ kind: "claim", data })}
              onSelectPassage={(data) => setSelection({ kind: "passage", data })}
              onSelectLink={(data) => setSelection({ kind: "link", data })}
              onClear={() => setSelection(null)}
            />
          </div>
          <AnimatePresence>
            {selection && <Drawer key="drawer" projectId={projectId} selection={selection} canReview={canReview} onClose={() => setSelection(null)} />}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
