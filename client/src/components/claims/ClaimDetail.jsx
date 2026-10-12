import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { claimsApi } from "../../api/claims.js";
import { linksApi } from "../../api/links.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { STANCE, STANCE_ORDER } from "../../lib/evidence.js";
import { timeAgo } from "../../lib/format.js";
import StateMessage from "../common/StateMessage.jsx";
import ReasonDialog from "../common/ReasonDialog.jsx";
import LinkCard from "./LinkCard.jsx";
import { ClaimStatus, GapBadges } from "./ClaimBits.jsx";

function describeEvent(e) {
  const parts = Object.entries(e.change ?? {}).map(([field, [from, to]]) =>
    from == null ? `${field}: ${to}` : to == null ? `${field}: ${from} removed` : `${field}: ${from} → ${to}`,
  );
  return parts.join("; ");
}

function History({ projectId, claimId }) {
  const { data: events, isPending } = useQuery({
    queryKey: ["claim-history", projectId, claimId],
    queryFn: () => claimsApi.history(projectId, claimId),
  });
  if (isPending) return null;
  if (!events?.length) return <p className="text-sm text-muted">No history yet.</p>;
  return (
    <ol className="space-y-3 border-l border-line pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-navy" />
          <p>
            <span className="font-medium text-ink">{e.actorName ?? (e.actor === "ai" ? "AI" : e.actor === "system" ? "System" : "Someone")}</span>{" "}
            <span className="text-muted">{e.action}</span>
            {e.target?.humanId && <span className="font-mono text-muted"> {e.target.humanId}</span>}
            <span className="text-xs text-muted"> · {timeAgo(e.at)}</span>
          </p>
          {describeEvent(e) && <p className="text-xs text-muted">{describeEvent(e)}</p>}
          {e.reason && <p className="text-xs italic text-ink">“{e.reason}”</p>}
        </li>
      ))}
    </ol>
  );
}

function EditableText({ projectId, claim, canEdit }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(claim.text);
  const [asking, setAsking] = useState(false);
  const save = useMutation({
    mutationFn: (reason) => claimsApi.update(projectId, claim.id, { text: draft.trim(), reason }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["claim", projectId, claim.id] });
      qc.invalidateQueries({ queryKey: ["claim-history", projectId, claim.id] });
      qc.invalidateQueries({ queryKey: ["claims", projectId] });
    },
  });

  if (!editing)
    return (
      <div className="flex items-start gap-2">
        <p className="flex-1 text-lg text-ink">{claim.text}</p>
        {canEdit && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => (setDraft(claim.text), setEditing(true))}>
            Edit
          </button>
        )}
      </div>
    );
  return (
    <div className="space-y-2">
      <textarea className="input min-h-20" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} autoFocus aria-label="Claim text" />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={draft.trim().length < 10 || draft.trim() === claim.text} onClick={() => setAsking(true)}>
          Save
        </button>
      </div>
      {asking && (
        <ReasonDialog
          title={`Edit ${claim.humanId}`}
          description="Evidence is searched again for the new wording."
          onSubmit={({ reason }) =>
            save.mutateAsync(reason).catch((err) => {
              throw new Error(toApiError(err).message);
            })
          }
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  );
}

export default function ClaimDetail() {
  const { projectId, claimId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: project } = useProject(projectId);
  const canEdit = ["editor", "owner"].includes(project?.role);
  const { data, isPending, error } = useQuery({
    queryKey: ["claim", projectId, claimId],
    queryFn: () => claimsApi.get(projectId, claimId),
    refetchInterval: (q) => (q.state.data && !q.state.data.links.length ? 4000 : false), // evidence may still be arriving
  });
  const relink = useMutation({ mutationFn: () => linksApi.runLinking(projectId, claimId) });
  const remove = useMutation({
    mutationFn: () => claimsApi.remove(projectId, claimId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["claims", projectId] });
      navigate(`/projects/${projectId}/claims`);
    },
  });

  const back = (
    <Link to={`/projects/${projectId}/claims`} className="text-sm text-teal hover:underline">
      ← All claims
    </Link>
  );
  if (isPending) return <StateMessage kind="loading" title="Loading claim…" />;
  if (error)
    return (
      <StateMessage kind="error" title={toApiError(error).status === 404 ? "Claim not found" : "Couldn't load this claim"} action={back}>
        {toApiError(error).message}
      </StateMessage>
    );

  const { claim, links } = data;
  const active = links.filter((l) => l.status !== "rejected");
  const rejected = links.filter((l) => l.status === "rejected");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {back}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-navy">{claim.humanId}</span>
          <ClaimStatus claim={claim} />
          <GapBadges gaps={claim.gaps} />
          {canEdit && (
            <span className="ml-auto flex gap-1">
              <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={relink.isPending || relink.isSuccess} onClick={() => relink.mutate()}>
                {relink.isSuccess ? "Searching…" : "Find more evidence"}
              </button>
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs text-red-700"
                onClick={() => window.confirm(`Delete ${claim.humanId} and its evidence links?`) && remove.mutate()}
              >
                Delete
              </button>
            </span>
          )}
        </div>
        <EditableText key={claim.text} projectId={projectId} claim={claim} canEdit={canEdit} />
        {claim.scopeNote && <p className="text-sm text-muted">Scope: {claim.scopeNote}</p>}
      </header>

      {!links.length ? (
        <StateMessage kind="loading" title="Looking for evidence in your sources…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {STANCE_ORDER.map((s) => {
            const col = active.filter((l) => l.stance === s);
            return (
              <section key={s} className="space-y-2">
                <h3 className={`text-sm font-semibold ${STANCE[s].color}`}>
                  {STANCE[s].label} ({col.length})
                </h3>
                {col.length ? (
                  col.map((l) => <LinkCard key={l.id} projectId={projectId} link={l} canReview={canEdit} />)
                ) : (
                  <p className="rounded-xl border border-dashed border-line p-3 text-xs text-muted">None yet</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {rejected.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Rejected evidence ({rejected.length})</summary>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            {rejected.map((l) => (
              <LinkCard key={l.id} projectId={projectId} link={l} canReview={canEdit} />
            ))}
          </div>
        </details>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-navy">History</h3>
        <History projectId={projectId} claimId={claim.id} />
      </section>
    </div>
  );
}
