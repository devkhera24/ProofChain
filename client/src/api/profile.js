import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/profile`;

export const profileApi = {
  get: (pid) => api.get(base(pid)).then((r) => r.data.profile),
  /** data: { exclusion: { id, strength } } | { removeExclusion: id } */
  update: (pid, data) => api.patch(base(pid), data).then((r) => r.data.profile),
};
