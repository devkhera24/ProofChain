/** Collects human-readable lines like the example log in the design doc (Section 7). */
export function createPipelineLog(label) {
  const lines = [];
  const ts = () => new Date().toISOString().slice(11, 19);
  const fmt = (data) =>
    data
      ? " " +
        Object.entries(data)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")
      : "";
  return {
    lines,
    info: (msg, data) => lines.push(`[${ts()}] ${label} ${msg}${fmt(data)}`),
    drop: (layer, what, reason) => lines.push(`[${ts()}] ${layer} drop  ${what}   reason=${reason}`),
    pass: (layer, what) => lines.push(`[${ts()}] ${layer} pass  ${what}`),
    retry: (layer, what, reason) => lines.push(`[${ts()}] ${layer} retry ${what}  reason=${reason}`),
  };
}
