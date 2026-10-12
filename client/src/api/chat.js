import { api } from "./client.js";
const base = (pid) => `/projects/${pid}/chat`;

export const chatApi = {
  /** → { messages (oldest first), hasMore } */
  history: (pid, { before, limit = 50 } = {}) => api.get(base(pid), { params: { before, limit } }).then((r) => r.data),
  /** A turn takes a few seconds (retrieval + Gemini), so allow up to 60 s. → { userMessage, agentMessage } */
  send: (pid, message) => api.post(base(pid), { message }, { timeout: 60_000 }).then((r) => r.data),
};
