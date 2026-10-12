import dns from "node:dns/promises";
import net from "node:net";
import { AppError } from "../../utils/errors.js";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** "::ffff:7f00:1" / "64:ff9b::7f00:1" → "127.0.0.1": the IPv4 address embedded in the last 32 bits. */
function embeddedIpv4(v6) {
  const tail = v6.split(":").slice(-2);
  if (tail.length < 2 || tail.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  const [hi, lo] = tail.map((h) => parseInt(h, 16));
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (!net.isIPv6(v)) return true; // not an IP we understand → refuse
  if (v === "::1" || v === "::") return true;
  if (/^f[cd]/.test(v) || /^fe[89a-f]/.test(v) || v.startsWith("ff")) return true; // unique-local, link/site-local, multicast
  // IPv4-mapped (::ffff:a.b.c.d or ::ffff:7f00:1) and NAT64 (64:ff9b::/96) carry an IPv4 address
  if (v.startsWith("::ffff:") || v.startsWith("64:ff9b::")) {
    const tail = v.slice(v.lastIndexOf(":") + 1);
    return isPrivateIp(net.isIPv4(tail) ? tail : (embeddedIpv4(v) ?? "0.0.0.0"));
  }
  return false;
}

async function assertPublicUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new AppError(400, "Invalid URL");
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new AppError(400, "Only http(s) URLs are allowed");
  const host = u.hostname.replace(/^\[|\]$/g, ""); // IPv6 literals come bracketed
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true }).catch(() => {
        throw new AppError(400, "Could not resolve host");
      });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new AppError(400, "This address is not allowed");
  return u;
}

/** Returns { finalUrl, contentType, buffer } */
export async function fetchUrl(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "User-Agent": "ProofChainBot/1.0 (research verification; contact via site)",
        Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5",
      },
    }).catch((err) => {
      throw new AppError(422, err.name === "TimeoutError" ? "The page took too long to respond" : "Could not fetch the page");
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      continue;
    }
    if (!res.ok) throw new AppError(422, `The page returned HTTP ${res.status}`);

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        reader.cancel();
        throw new AppError(413, "The document is too large (max 8 MB)");
      }
      chunks.push(value);
    }
    return { finalUrl: current, contentType, buffer: Buffer.concat(chunks) };
  }
  throw new AppError(422, "Too many redirects");
}

export const __test = { isPrivateIp, assertPublicUrl };
