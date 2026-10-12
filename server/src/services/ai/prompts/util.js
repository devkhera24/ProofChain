export const formatItems = (items, max = 1200) =>
  items.map((it) => `[${it.id}] ${it.text.slice(0, max)}`).join("\n\n");

export const idsCheck = (allowed, pick) => (data) => {
  const bad = pick(data).filter((id) => !allowed.has(id));
  return bad.length ? `unknown IDs referenced: ${bad.join(", ")}. Use only the IDs given.` : null;
};
