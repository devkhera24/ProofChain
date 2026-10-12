import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { linksApi } from "../../api/links.js";
import { toApiError } from "../../api/client.js";
import { useProject } from "../../hooks/useProject.js";
import { NEEDS_REVIEW } from "../../lib/evidence.js";
import StateMessage from "../common/StateMessage.jsx";
import LinkCard from "../claims/LinkCard.jsx";

export const reviewQueueQuery = (projectId) => ({
  queryKey: ["links", projectId, "queue"],
  queryFn: () => linksApi.list(projectId, { status: NEEDS_REVIEW }),
});

export default function ReviewQueue() {
  const { projectId } = useParams();
  const { data: project } = useProject(projectId);
  const canReview = ["editor", "owner"].includes(project?.role);
  const { data: links, isPending, error } = useQuery(reviewQueueQuery(projectId));

  if (isPending) return <StateMessage kind="loading" title="Loading review queue…" />;
  if (error) return <StateMessage kind="error" title="Couldn't load the review queue">{toApiError(error).message}</StateMessage>;
  if (!links.length)
    return (
      <StateMessage title="Nothing to review">AI-suggested and disputed evidence shows up here for a person to confirm or reject.</StateMessage>
    );

  // Group by claim, keeping the server's order
  const groups = new Map();
  for (const l of links) {
    const key = l.claim?.id ?? "unknown";
    if (!groups.has(key)) groups.set(key, { claim: l.claim, links: [] });
    groups.get(key).links.push(l);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="font-semibold text-navy">Review queue ({links.length})</h2>
        <p className="text-sm text-muted">Confirm evidence you agree with. Rejecting, disputing or changing a stance asks for a reason.</p>
      </div>
      {[...groups.values()].map(({ claim, links: group }) => (
        <section key={claim?.id} className="space-y-2">
          <h3 className="text-sm">
            <span className="font-mono font-medium text-navy">{claim?.humanId}</span> <span className="text-ink">{claim?.text}</span>
          </h3>
          {group.map((l) => (
            <LinkCard key={l.id} projectId={projectId} link={l} canReview={canReview} />
          ))}
        </section>
      ))}
    </div>
  );
}
