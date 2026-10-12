import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { FolderPlus, Plus } from "lucide-react";
import Button from "../components/ui/Button.jsx";
import { Skeleton } from "../components/ui/Skeleton.jsx";
import { stagger, staggerChild } from "../lib/motion.js";
import { projectsApi } from "../api/projects.js";
import { toApiError } from "../api/client.js";
import StateMessage from "../components/common/StateMessage.jsx";
import ProjectCard from "../components/projects/ProjectCard.jsx";
import NewProjectDialog from "../components/projects/NewProjectDialog.jsx";

export default function ProjectsPage() {
  const [creating, setCreating] = useState(false);
  const { data: projects, isPending, error, refetch } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const newButton = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      New project
    </Button>
  );

  let content;
  if (isPending)
    content = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading projects…">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
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
      <StateMessage icon={FolderPlus} title="No projects yet" action={newButton}>
        Create a project to start collecting sources and checking claims.
      </StateMessage>
    );
  else
    content = (
      <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" variants={stagger(0.05)} initial="initial" animate="animate">
        {projects.map((p) => (
          <motion.div key={p.id} variants={staggerChild}>
            <ProjectCard project={p} />
          </motion.div>
        ))}
      </motion.div>
    );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">Your projects</h1>
          <p className="mt-0.5 text-sm text-muted">Each project keeps its own sources, claims and recommendations.</p>
        </div>
        {projects?.length > 0 && newButton}
      </div>
      {content}
      <AnimatePresence>{creating && <NewProjectDialog onClose={() => setCreating(false)} />}</AnimatePresence>
    </div>
  );
}
