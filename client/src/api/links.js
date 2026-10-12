import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/links`;

export const linksApi = {
  /** filters: { status?: string[], claimId?, sourceId? } */
  list: (pid, { status, ...rest } = {}) =>
    api.get(base(pid), { params: { ...rest, status: status?.join(",") } }).then((r) => r.data.links),
  review: (pid, lid, data) => api.patch(`${base(pid)}/${lid}`, data).then((r) => r.data.link),
  create: (pid, data) => api.post(base(pid), data).then((r) => r.data.link),
  runLinking: (pid, cid) => api.post(`${base(pid)}/claims/${cid}/run`).then((r) => r.data),
};
