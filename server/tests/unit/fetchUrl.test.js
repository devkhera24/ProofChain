import { describe, it, expect } from "vitest";
import { __test } from "../../src/services/ingestion/fetchUrl.js";
import { classifySource } from "../../src/services/ingestion/classifySource.js";

const { isPrivateIp, assertPublicUrl } = __test;

describe("isPrivateIp", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.10", "172.16.0.1", "172.31.255.255",
    "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1",
    "::1", "::", "fd00::1", "fc00::1", "fe80::1", "fe90::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::7f00:1", "[::1]",
  ])("blocks %s", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:808:808"])(
    "allows public %s",
    (ip) => expect(isPrivateIp(ip)).toBe(false),
  );
});

describe("assertPublicUrl", () => {
  it.each([
    ["ftp://example.com/file", /Only http\(s\)/],
    ["file:///etc/passwd", /Only http\(s\)/],
    ["not a url", /Invalid URL/],
    ["http://127.0.0.1:4000/api", /not allowed/],
    ["http://169.254.169.254/latest/meta-data/", /not allowed/],
    ["http://[::1]/", /not allowed/],
    ["http://[::ffff:127.0.0.1]/", /not allowed/], // URL normalises this to ::ffff:7f00:1
    ["http://localhost:4000/", /not allowed/],
    ["http://2130706433/", /not allowed/], // decimal form of 127.0.0.1
  ])("rejects %s", async (url, msg) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(msg);
  });
});

describe("classifySource", () => {
  it.each([
    [{ kind: "paper", hasDoi: true }, "peer_reviewed"],
    [{ kind: "paper", hasDoi: false }, "preprint"],
    [{ kind: "url", url: "https://arxiv.org/abs/2101.00001" }, "preprint"],
    [{ kind: "url", url: "https://www.nature.com/articles/x" }, "peer_reviewed"],
    [{ kind: "url", url: "https://dl.acm.org/doi/10.1145/1" }, "peer_reviewed"],
    [{ kind: "url", url: "https://neo4j.com/blog/x" }, "vendor"],
    [{ kind: "url", url: "https://someone.medium.com/post" }, "blog"],
    [{ kind: "url", url: "https://www.reuters.com/tech/x" }, "news"],
    [{ kind: "url", url: "https://engineering.example.com/blog/post" }, "blog"],
    [{ kind: "url", url: "https://blog.example.org/post" }, "blog"],
    [{ kind: "url", url: "https://notarxiv.org/x" }, "unknown"],
    [{ kind: "url", url: "https://example.com/page" }, "unknown"],
    [{ kind: "pdf" }, "unknown"],
    [{ kind: "url", url: "::bad::" }, "unknown"],
  ])("%o → %s", (input, expected) => expect(classifySource(input)).toBe(expected));
});
