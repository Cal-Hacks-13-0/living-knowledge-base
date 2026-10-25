import { assertHostIsPublic, assertSafeUrl } from "./ssrf-guard";

const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3 MB cap per fetch
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "text/xml",
  "application/json",
  "text/plain",
];

export class FetchBlockedError extends Error {}
export class FetchTooLargeError extends Error {}
export class UpstreamError extends Error {}

export interface SafeFetchResult {
  status: number;
  finalUrl: string;
  headers: Headers;
  text: string;
  notModified: boolean;
}

export interface SafeFetchOptions {
  etag?: string | null;
  lastModified?: string | null;
  accept?: string;
  userAgent?: string;
}

/**
 * Fetches a URL with: protocol allowlisting, SSRF protection on every hop
 * (including redirects), a hard timeout, a response size cap, and content-type
 * allowlisting. Does not execute any scripts in fetched content — content is
 * only ever treated as text.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const url = assertSafeUrl(currentUrl);
    await assertHostIsPublic(url.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const headers: Record<string, string> = {
      "User-Agent": options.userAgent ?? "LivingKnowledgeBase/0.1 (+research bot)",
      Accept: options.accept ?? "*/*",
    };
    if (options.etag) headers["If-None-Match"] = options.etag;
    if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (err) {
      // Name the actual failure (timeout vs. the network-level cause) instead
      // of fetch's bare "fetch failed" — lib/research/source-errors.ts turns
      // these into plain-language explanations.
      if (controller.signal.aborted) {
        throw new UpstreamError(`${url.hostname} did not respond within ${FETCH_TIMEOUT_MS / 1000}s (timed out)`);
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code;
      throw new UpstreamError(`Couldn't connect to ${url.hostname}${cause ? ` (${cause})` : ""}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 304) {
      return { status: 304, finalUrl: url.toString(), headers: response.headers, text: "", notModified: true };
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new FetchBlockedError("Redirect with no Location header");
      currentUrl = new URL(location, url).toString();
      continue;
    }

    if (response.status >= 400) {
      // Don't attempt to parse an error page (e.g. a 502 Bad Gateway HTML
      // body) as RSS/JSON — surface it as a clear per-source failure instead.
      throw new UpstreamError(`${url.hostname} returned HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (contentType && !ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
      throw new FetchBlockedError(`Unsupported content-type: ${contentType}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new FetchTooLargeError(`Response too large: ${contentLength} bytes`);
    }

    const text = await readBounded(response);
    return { status: response.status, finalUrl: url.toString(), headers: response.headers, text, notModified: false };
  }

  throw new FetchBlockedError("Too many redirects");
}

async function readBounded(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new FetchTooLargeError(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

/** Retries a fetch-like operation with exponential backoff on transient failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 500 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof FetchBlockedError) throw err; // don't retry policy violations
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Minimal robots.txt check: fetches /robots.txt for the URL's origin and
 * returns false if a User-agent: * block disallows the exact path (prefix
 * match). Fails open (allowed) if robots.txt is unreachable or unparseable,
 * matching common crawler behavior for best-effort compliance.
 */
export async function isAllowedByRobots(rawUrl: string): Promise<boolean> {
  try {
    const url = assertSafeUrl(rawUrl);
    const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
    const res = await safeFetch(robotsUrl, { accept: "text/plain" });
    if (res.status >= 400) return true;

    const lines = res.text.split("\n").map((l) => l.trim());
    let applies = false;
    const disallowed: string[] = [];
    for (const line of lines) {
      if (/^user-agent:\s*\*/i.test(line)) {
        applies = true;
        continue;
      }
      if (/^user-agent:/i.test(line)) {
        applies = false;
        continue;
      }
      if (applies && /^disallow:/i.test(line)) {
        const path = line.split(":").slice(1).join(":").trim();
        if (path) disallowed.push(path);
      }
    }
    return !disallowed.some((path) => url.pathname.startsWith(path));
  } catch {
    return true; // fail open — best-effort only
  }
}
