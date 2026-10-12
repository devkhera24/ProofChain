import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/sources`;
const PAGE_SIZE = 200; // server maximum

export const sourcesApi = {
  list: (pid) => api.get(base(pid)).then((r) => r.data.sources),
  get: (pid, sid) => api.get(`${base(pid)}/${sid}`).then((r) => r.data.source),
  passages: (pid, sid, page = 1) =>
    api.get(`${base(pid)}/${sid}/passages`, { params: { page, limit: PAGE_SIZE } }).then((r) => r.data),
  /** Every passage of a source, fetched page by page. */
  allPassages: async (pid, sid) => {
    const all = [];
    for (let page = 1; ; page++) {
      const { passages, total } = await sourcesApi.passages(pid, sid, page);
      all.push(...passages);
      if (!passages.length || all.length >= total) return all;
    }
  },
  addUrl: (pid, url) => api.post(base(pid), { url }).then((r) => r.data.source),
  upload: (pid, file, onProgress) => {
    const fd = new FormData();
    fd.append("file", file);
    return api
      .post(`${base(pid)}/upload`, fd, {
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
      .then((r) => r.data);
  },
  update: (pid, sid, data) => api.patch(`${base(pid)}/${sid}`, data).then((r) => r.data.source),
  retry: (pid, sid) => api.post(`${base(pid)}/${sid}/retry`).then((r) => r.data.source),
  remove: (pid, sid) => api.delete(`${base(pid)}/${sid}`),
};
