import { useQuery } from "@tanstack/react-query";
import { recommendationsApi } from "../api/recommendations.js";

export const latestBatchKey = (projectId) => ["batch", projectId, "latest"];

/** The caller's latest batch; polls while it's running (Step 29 replaces polling with `batch.ready`). */
export function useLatestBatch(projectId) {
  return useQuery({
    queryKey: latestBatchKey(projectId),
    queryFn: () => recommendationsApi.latest(projectId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
  });
}
