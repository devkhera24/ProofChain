import { api } from "./client.js";

/** File name from `Content-Disposition` (quoted or not), or a fallback. */
const fileNameFrom = (header, fallback) => header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1] ?? fallback;

/**
 * Download an export. A plain <a href> wouldn't send the Bearer token, so fetch it as a blob and save it
 * through a temporary object URL.
 */
export async function downloadExport(projectId, format) {
  const res = await api.get(`/projects/${projectId}/export`, { params: { format }, responseType: "blob" });
  const name = decodeURIComponent(fileNameFrom(res.headers["content-disposition"], `proofchain-export.${format}`));
  const url = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
