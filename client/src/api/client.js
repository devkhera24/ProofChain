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
