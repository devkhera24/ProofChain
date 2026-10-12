import { api } from "./client.js";
export const projectsApi = {
  list: () => api.get("/projects").then((r) => r.data.projects),
  get: (id) => api.get(`/projects/${id}`).then((r) => r.data),
  create: (data) => api.post("/projects", data).then((r) => r.data.project),
  update: (id, data) => api.patch(`/projects/${id}`, data).then((r) => r.data.project),
  addMember: (id, data) => api.post(`/projects/${id}/members`, data).then((r) => r.data),
};
