import { api } from "./client.js";

const base = (pid) => `/projects/${pid}/comments`;

export const commentsApi = {
  list: (pid, targetKind, targetId) => api.get(base(pid), { params: { targetKind, targetId } }).then((r) => r.data.comments),
  counts: (pid, targetKind) => api.get(`${base(pid)}/counts`, { params: { targetKind } }).then((r) => r.data.counts),
  add: (pid, data) => api.post(base(pid), data).then((r) => r.data.comment),
  resolve: (pid, commentId, resolved) => api.patch(`${base(pid)}/${commentId}`, { resolved }).then((r) => r.data.comment),
};

export const commentsKey = (pid, targetId) => ["comments", pid, targetId];
export const commentCountsKey = (pid, kind) => ["comments", pid, "counts", kind];
