import { api } from "./client.js";

export const graphApi = {
  /** filters: { claimId?, sourceId?, status?: "unreviewed"|…, contested?: "true" } → { elements, truncated, counts } */
  get: (pid, filters = {}) => api.get(`/projects/${pid}/graph`, { params: filters }).then((r) => r.data),
};
