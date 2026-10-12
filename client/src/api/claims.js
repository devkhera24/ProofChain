import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/claims`;

export const claimsApi = {
  list: (pid) => api.get(base(pid)).then((r) => r.data.claims),
  get: (pid, cid) => api.get(`${base(pid)}/${cid}`).then((r) => r.data),
  create: (pid, data) => api.post(base(pid), data).then((r) => r.data), // { claim, merged }
  update: (pid, cid, data) => api.patch(`${base(pid)}/${cid}`, data).then((r) => r.data.claim),
  remove: (pid, cid) => api.delete(`${base(pid)}/${cid}`),
  history: (pid, cid) => api.get(`${base(pid)}/${cid}/history`).then((r) => r.data.events),
};
