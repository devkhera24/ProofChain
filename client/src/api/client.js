import axios from "axios";

export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
if (!API_URL) console.warn("VITE_API_URL is not set");

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 60_000, // generous: Render free tier can take ~50s to wake
});

// Normalise errors to { status, message, issues }
export function toApiError(err) {
  if (err.response) {
    return {
      status: err.response.status,
      message: err.response.data?.error ?? "Request failed",
      issues: err.response.data?.issues,
    };
  }
  if (err.code === "ECONNABORTED") return { status: 0, message: "The server took too long to respond." };
  return { status: 0, message: "Cannot reach the server. Check your connection." };
}

const TOKEN_KEY = "proofchain.token";
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.startsWith("/auth/")) onUnauthorized();
    return Promise.reject(err);
  },
);
