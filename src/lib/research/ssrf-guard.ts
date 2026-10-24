import dns from "node:dns";
import net from "node:net";

/**
 * Best-effort SSRF protection: blocks loopback, private, link-local, carrier-grade
 * NAT, and metadata-service IP ranges for both IPv4 and IPv6, including addresses
 * reached via DNS resolution or HTTP redirects. This is defense-in-depth for a
 * research pipeline that fetches arbitrary user- and AI-suggested URLs — it is not
 * a substitute for network-level egress controls in a real deployment.
 */

function ipv4ToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(range) & mask);
}

const BLOCKED_V4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local, includes 169.254.169.254 metadata
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved
];

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.replace(/^::ffff:/i, ""); // unwrap IPv4-mapped IPv6

  if (net.isIPv4(ip)) {
    return BLOCKED_V4_CIDRS.some((cidr) => inCidr4(ip, cidr));
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true; // fe80::/10 link-local
    }
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
    return false;
  }

  // Unknown format — fail closed.
  return true;
}

export class SsrfBlockedError extends Error {
  constructor(host: string) {
    super(`Refusing to fetch "${host}": resolves to a private/reserved IP address.`);
    this.name = "SsrfBlockedError";
  }
}

/** Resolves a hostname and throws if any resolved address is private/reserved. */
export async function assertHostIsPublic(hostname: string): Promise<void> {
  // Literal IP in the URL — check directly without a DNS lookup.
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new SsrfBlockedError(hostname);
    return;
  }

  const addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new SsrfBlockedError(hostname);
  }
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new SsrfBlockedError(hostname);
    }
  }
}

export function assertSafeUrl(urlString: string): URL {
  const url = new URL(urlString);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  return url;
}
