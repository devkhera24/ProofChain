import { useParams } from "react-router";

export default function WorkspacePage() {
  const { projectId } = useParams();
  return (
    <div className="p-6">
      <div className="card">
        <h1 className="text-xl font-semibold text-navy">Workspace</h1>
        <p className="mt-1 text-sm text-muted">Project {projectId}</p>
      </div>
    </div>
  );
}
