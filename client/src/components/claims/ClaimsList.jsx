import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { claimsApi } from "../../api/claims.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { NEEDS_REVIEW } from "../../lib/evidence.js";
import StateMessage from "../common/StateMessage.jsx";
import { ClaimStatus, StanceCounts, GapBadges } from "./ClaimBits.jsx";

const FILTERS = {
  all: { label: "All", test: () => true },
  contested: { label: "Contested", test: (c) => c.status === "contested" || c.provisionalStatus === "contested" },
  gaps: { label: "Has gaps", test: (c) => c.gaps?.length > 0 },
  review: { label: "Needs review", test: (c) => NEEDS_REVIEW.some((s) => c.links.byStatus[s] > 0) },
};
const RECENT_MS = 90_000; // linking runs in the background right after a claim is created

function AddClaim({ projectId }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState(null);
  const add = useMutation({
    mutationFn: () => claimsApi.create(projectId, { text: text.trim() }),
    onSuccess: ({ claim, merged }) => {
      setNotice(merged ? `Already exists: merged with ${claim.humanId}` : `Added ${claim.humanId}. Looking for evidence…`);
      setText("");
      qc.invalidateQueries({ queryKey: ["claims", projectId] });
    },
  });
  return (
    <form
      className="card space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(null);
        if (text.trim().length >= 10) add.mutate();
      }}
    >
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Add a specific, checkable claim, e.g. “X outperforms Y on Z”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          aria-label="New claim"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={add.isPending || text.trim().length < 10}>
          {add.isPending ? "Adding…" : "Add claim"}
        </button>
      </div>
      {notice && <p className="text-xs text-teal">{notice}</p>}
      {add.error && <p className="text-xs text-red-700">{toApiError(add.error).message}</p>}
    </form>
  );
}

export default function ClaimsList() {
  const { projectId } = useParams();
  const { data: project } = useProject(projectId);
  const canEdit = ["editor", "owner"].includes(project?.role);
  const [filter, setFilter] = useState("all");
  const { data: claims, isPending, error, refetch } = useQuery({
    queryKey: ["claims", projectId],
    queryFn: () => claimsApi.list(projectId),
    // Step 29 replaces polling with socket events
    refetchInterval: (q) => (q.state.data?.some((c) => Date.now() - new Date(c.createdAt) < RECENT_MS) ? 4000 : false),
  });

  const shown = claims?.filter(FILTERS[filter].test) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="font-semibold text-navy">Claims{claims?.length ? ` (${claims.length})` : ""}</h2>
      {canEdit && <AddClaim projectId={projectId} />}

      {claims?.length > 0 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter claims">
          {Object.entries(FILTERS).map(([key, f]) => {
            const n = claims.filter(f.test).length;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={clsx("rounded-full px-3 py-1 text-xs", filter === key ? "bg-navy text-white" : "bg-black/5 text-muted hover:bg-black/10")}
              >
                {f.label} {key !== "all" && `(${n})`}
              </button>
            );
          })}
        </div>
      )}

      {isPending ? (
        <StateMessage kind="loading" title="Loading claims…" />
      ) : error ? (
        <StateMessage
          kind="error"
          title="Couldn't load claims"
          action={
            <button type="button" className="btn-ghost" onClick={() => refetch()}>
              Try again
            </button>
          }
        >
          {toApiError(error).message}
        </StateMessage>
      ) : !claims.length ? (
        <StateMessage title="No claims yet">
          Claims are extracted automatically when you add sources, or you can write your own above.
        </StateMessage>
      ) : !shown.length ? (
        <StateMessage title="Nothing matches this filter" />
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id}>
              <Link to={`/projects/${projectId}/claims/${c.id}`} className="card block space-y-2 transition hover:border-teal">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-sm font-medium text-navy">{c.humanId}</span>
                  <span className="flex-1 text-sm text-ink">{c.text}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-9">
                  <ClaimStatus claim={c} />
                  <StanceCounts byStance={c.links.byStance} />
                  {NEEDS_REVIEW.some((s) => c.links.byStatus[s] > 0) && (
                    <span className="text-xs text-disputed">
                      {NEEDS_REVIEW.reduce((n, s) => n + (c.links.byStatus[s] ?? 0), 0)} to review
                    </span>
                  )}
                  <GapBadges gaps={c.gaps} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
