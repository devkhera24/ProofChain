// Usage: API_URL=https://proofchain-api.onrender.com WEB_URL=https://proofchain.vercel.app node scripts/smoke.mjs
const API_URL = process.env.API_URL?.replace(/\/$/, "");
const WEB_URL = process.env.WEB_URL?.replace(/\/$/, "");
if (!API_URL || !WEB_URL) {
  console.error("Set API_URL and WEB_URL");
  process.exit(1);
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

await check("API health (may take ~60s if asleep)", async () => {
  const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(90_000) });
  const body = await res.json();
  if (body.status !== "ok") throw new Error(JSON.stringify(body));
  if (body.db !== "connected") throw new Error(`db is ${body.db}`);
});

await check("CORS allows the web origin", async () => {
  const res = await fetch(`${API_URL}/api/health`, { headers: { Origin: WEB_URL } });
  const allowed = res.headers.get("access-control-allow-origin");
  if (allowed !== WEB_URL) throw new Error(`access-control-allow-origin = ${allowed}`);
});

await check("Web app serves index.html on deep links", async () => {
  const res = await fetch(`${WEB_URL}/projects/some-id`);
  const html = await res.text();
  if (!res.ok || !html.includes('id="root"')) throw new Error(`status ${res.status}`);
});
