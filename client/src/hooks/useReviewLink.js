import { useMutation, useQueryClient } from "@tanstack/react-query";
import { linksApi } from "../api/links.js";

/** Review a link (L6) and refresh everything that shows links or claim status. */
export function useReviewLink(projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, ...data }) => linksApi.review(projectId, linkId, data),
    onSuccess: (link) => {
      qc.invalidateQueries({ queryKey: ["links", projectId] });
      qc.invalidateQueries({ queryKey: ["claims", projectId] });
      qc.invalidateQueries({ queryKey: ["graph", projectId] });
      qc.invalidateQueries({ queryKey: ["claim", projectId, link.claim?.id] });
      qc.invalidateQueries({ queryKey: ["claim-history", projectId, link.claim?.id] });
      qc.invalidateQueries({ queryKey: ["comments", projectId] }); // disputes and their resolutions post to the thread
    },
  });
}
