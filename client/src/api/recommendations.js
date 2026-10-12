import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/recommendations`;

export const recommendationsApi = {
  latest: (pid) => api.get(`${base(pid)}/latest`).then((r) => r.data.batch),
  get: (pid, bid) => api.get(`${base(pid)}/${bid}`).then((r) => r.data.batch),
  generate: (pid, data = {}) => api.post(base(pid), data).then((r) => r.data), // { batchId, humanId }
  /** data: { action: "added"|"not_relevant"|"read"|"later", reason? } → { batch, item, rule, source, replaced, note } */
  feedback: (pid, bid, index, data) => api.post(`${base(pid)}/${bid}/items/${index}/feedback`, data).then((r) => r.data),
};
