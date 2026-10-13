import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/chat`;

export const chatApi = {
  /** → { messages (oldest first), hasMore } */
  history: (pid, { before, limit = 50 } = {}) => api.get(base(pid), { params: { before, limit } }).then((r) => r.data),
  /** A turn takes a few seconds (retrieval + the model), so allow up to 120 s. → { userMessage, agentMessage } */
  send: (pid, message) => api.post(base(pid), { message }, { timeout: 120_000 }).then((r) => r.data),
};
