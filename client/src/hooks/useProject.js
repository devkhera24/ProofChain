import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projects.js";

/** Loads { project, role } for the workspace. */
export function useProject(projectId) {
  return useQuery({ queryKey: ["project", projectId], queryFn: () => projectsApi.get(projectId), enabled: !!projectId });
}
