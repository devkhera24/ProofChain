import { useQuery } from "@tanstack/react-query";
import { recommendationsApi } from "../api/recommendations.js";
import { useFallbackPoll } from "../context/SocketContext.jsx";

export const latestBatchKey = (projectId) => ["batch", projectId, "latest"];

/** The caller's latest batch. `batch.ready` refreshes it; it polls only while the socket is down. */
export function useLatestBatch(projectId) {
  const poll = useFallbackPoll();
  return useQuery({
    queryKey: latestBatchKey(projectId),
    queryFn: () => recommendationsApi.latest(projectId),
    refetchInterval: (q) => poll(q.state.data?.status === "running"),
  });
}
