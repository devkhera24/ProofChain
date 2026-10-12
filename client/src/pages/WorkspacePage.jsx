import { Link, useParams } from "react-router";
import { useProject } from "../hooks/useProject.js";
import { toApiError } from "../api/client.js";
import WorkspaceLayout from "../components/layout/WorkspaceLayout.jsx";
import StateMessage from "../components/common/StateMessage.jsx";
import SourcesTab from "../components/sources/SourcesTab.jsx";
import ClaimsTab from "../components/claims/ClaimsTab.jsx";
import ReviewQueue, { reviewQueueQuery } from "../components/review/ReviewQueue.jsx";
import { useQuery } from "@tanstack/react-query";
import RightPanel from "../components/recommendations/RightPanel.jsx";
import PipelineLogView from "../components/review/PipelineLogView.jsx";
import ChatPanel from "../components/chat/ChatPanel.jsx";
import { lazy, Suspense } from "react";
import Spinner from "../components/common/Spinner.jsx";

// Cytoscape is large: load the Graph tab only when it is opened
const GraphView = lazy(() => import("../components/graph/GraphView.jsx"));

const views = {
  graph: (
    <Suspense fallback={<Spinner label="Loading the graph…" />}>
      <GraphView />
    </Suspense>
  ),
  claims: <ClaimsTab />,
  sources: <SourcesTab />,
  review: <ReviewQueue />,
  log: <PipelineLogView />,
};

export default function WorkspacePage() {
  const { projectId } = useParams();
  const { data, isPending, error } = useProject(projectId);
  const queue = useQuery({ ...reviewQueueQuery(projectId), enabled: !!data });

  if (isPending) return <StateMessage kind="loading" title="Opening project…" />;
  if (error) {
    const { status, message } = toApiError(error);
    return (
      <div className="mx-auto max-w-lg p-6">
        <StateMessage
          kind="error"
          title={status === 404 ? "Project not found" : "Couldn't open this project"}
          action={
            <Link to="/projects" className="btn-ghost">
              Back to projects
            </Link>
          }
        >
          {status === 404 ? "It doesn't exist or you aren't a member." : message}
        </StateMessage>
      </div>
    );
  }

  return (
    <WorkspaceLayout
      project={data.project}
      role={data.role}
      left={<ChatPanel />}
      right={<RightPanel />}
      views={views}
      badges={{ review: queue.data?.length }}
    />
  );
}
