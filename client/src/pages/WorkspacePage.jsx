import { Link, useParams } from "react-router";
import { useProject } from "../hooks/useProject.js";
import { toApiError } from "../api/client.js";
import WorkspaceLayout from "../components/layout/WorkspaceLayout.jsx";
import StateMessage from "../components/common/StateMessage.jsx";
import Placeholder from "../components/common/Placeholder.jsx";

const views = {
  graph: <Placeholder title="Evidence graph — Step 28" />,
  claims: <Placeholder title="Claims — Step 21" />,
  sources: <Placeholder title="Sources — Step 17" />,
  review: <Placeholder title="Review queue — Step 21" />,
  log: <Placeholder title="Pipeline log — Step 26" />,
};

export default function WorkspacePage() {
  const { projectId } = useParams();
  const { data, isPending, error } = useProject(projectId);

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
      left={<Placeholder title="Chat — Step 27" />}
      right={<Placeholder title="Recommendations — Step 26" />}
      views={views}
    />
  );
}
