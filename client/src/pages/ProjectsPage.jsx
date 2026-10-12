import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projects.js";
import { toApiError } from "../api/client.js";
import StateMessage from "../components/common/StateMessage.jsx";
import ProjectCard from "../components/projects/ProjectCard.jsx";
import NewProjectDialog from "../components/projects/NewProjectDialog.jsx";

export default function ProjectsPage() {
  const [creating, setCreating] = useState(false);
  const { data: projects, isPending, error, refetch } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const newButton = (
    <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
      New project
    </button>
  );

  let content;
  if (isPending) content = <StateMessage kind="loading" title="Loading projects…" />;
  else if (error)
    content = (
      <StateMessage
        kind="error"
        title="Couldn't load your projects"
        action={
          <button type="button" className="btn-ghost" onClick={() => refetch()}>
            Try again
          </button>
        }
      >
        {toApiError(error).message}
      </StateMessage>
    );
  else if (!projects.length)
    content = (
      <StateMessage title="No projects yet" action={newButton}>
        Create a project to start collecting sources and checking claims.
      </StateMessage>
    );
  else
    content = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Your projects</h1>
        {projects?.length > 0 && newButton}
      </div>
      {content}
      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
