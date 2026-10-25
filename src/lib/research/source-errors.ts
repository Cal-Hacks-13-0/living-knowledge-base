/**
 * Plain-language explanations for source problems, shared by every place
 * that shows them (Sources page cards, the per-source "Check again" result).
 *
 * Classification is deterministic: it reads the error text our own fetchers
 * store in Source.lastError (lib/research/http.ts, rss-fetcher.ts,
 * html-fetcher.ts, github-fetcher.ts, ssrf-guard.ts), so errors saved before
 * this existed get the same explanations. Each explanation claims only what
 * that evidence shows — e.g. a 403 means the site refused access, not that a
 * membership is required; a timeout means it was slow this time, not that it
 * is offline. Anything unrecognized gets an honest generic message.
 *
 * Safe to import from client components (no server-only dependencies).
 */

/** Where in the pipeline it went wrong. */
export type SourceErrorStage = "access" | "content" | "processing";

export type SourceErrorKind =
  | "not_found"
  | "sign_in_required"
  | "payment_required"
  | "access_denied"
  | "robots_disallowed"
  | "rate_limited"
  | "timeout"
  | "server_error"
  | "connection_failed"
  | "address_not_found"
  | "redirect_problem"
  | "private_address"
  | "invalid_address"
  | "unsupported_content"
  | "too_large"
  | "not_a_feed"
  | "empty_content"
  | "processing_failed"
  | "unknown";

export type SourceAction = "retry" | "edit_url" | "open_site";

export interface SourceErrorExplanation {
  kind: SourceErrorKind;
  stage: SourceErrorStage;
  /** Likely to fix itself — worth simply trying again later. */
  temporary: boolean;
  /** Short status, e.g. "Page not found". */
  title: string;
  /** What happened, in plain language. */
  message: string;
  /** A practical next step, when there is one. */
  nextStep: string | null;
  /** Actions that make sense for this problem (the UI shows only these). */
  actions: SourceAction[];
  /** HTTP status code, when the error carried one. */
  httpStatus: number | null;
  /** The stored error with anything sensitive-looking redacted — for "Technical details" only. */
  technical: string;
}

const STAGE_LABEL: Record<SourceErrorStage, string> = {
  access: "Can't access",
  content: "Can't read content",
  processing: "Processing problem",
};

/** Badge text for a source's problem stage. */
export function sourceProblemLabel(stage: SourceErrorStage): string {
  return STAGE_LABEL[stage];
}

const REPLACE_URL = "Check the address, or replace it with the page's current URL.";

type Template = Omit<SourceErrorExplanation, "httpStatus" | "technical">;

const T: Record<SourceErrorKind, Template> = {
  not_found: {
    kind: "not_found",
    stage: "access",
    temporary: false,
    title: "Page not found",
    message: "We couldn't find a page at this address. The link may have changed or the page may have been removed.",
    nextStep: REPLACE_URL,
    actions: ["edit_url", "open_site", "retry"],
  },
  sign_in_required: {
    kind: "sign_in_required",
    stage: "access",
    temporary: false,
    title: "Sign-in required",
    message: "This website asked for a sign-in before showing the page, so Axion couldn't read it. Axion can't sign in to websites for you.",
    nextStep: "Use a public page or feed for this content instead.",
    actions: ["edit_url", "open_site"],
  },
  payment_required: {
    kind: "payment_required",
    stage: "access",
    temporary: false,
    title: "Payment required",
    message: "This website says payment is required to view the page, so Axion couldn't read it.",
    nextStep: "Use a freely available page or feed for this content instead.",
    actions: ["edit_url", "open_site"],
  },
  access_denied: {
    kind: "access_denied",
    stage: "access",
    temporary: false,
    title: "Access denied",
    message: "This website didn't allow Axion to access the page. It may restrict automated access or require additional permissions.",
    nextStep: "Try the site's RSS feed or another public page with the same content.",
    actions: ["edit_url", "open_site", "retry"],
  },
  robots_disallowed: {
    kind: "robots_disallowed",
    stage: "access",
    temporary: false,
    title: "Automated access not allowed",
    message: "This website's rules for automated tools (its robots.txt file) ask tools like Axion not to read this address, so Axion skips it.",
    nextStep: "Use a different source for this content.",
    actions: ["edit_url", "open_site"],
  },
  rate_limited: {
    kind: "rate_limited",
    stage: "access",
    temporary: true,
    title: "Too many requests",
    message: "The website is temporarily limiting requests. Please wait before trying again.",
    nextStep: "Try again later.",
    actions: ["retry", "open_site"],
  },
  timeout: {
    kind: "timeout",
    stage: "access",
    temporary: true,
    title: "Website took too long",
    message: "The website took too long to respond. This is often temporary.",
    nextStep: "Try again later.",
    actions: ["retry", "open_site"],
  },
  server_error: {
    kind: "server_error",
    stage: "access",
    temporary: true,
    title: "Website error",
    message: "The website had a problem on its end and couldn't send the page. This is usually temporary.",
    nextStep: "Try again later.",
    actions: ["retry", "open_site"],
  },
  connection_failed: {
    kind: "connection_failed",
    stage: "access",
    temporary: true,
    title: "Couldn't connect",
    message: "Axion couldn't connect to this website. Please check the address or try again later.",
    nextStep: "Check the address, or try again later.",
    actions: ["retry", "edit_url", "open_site"],
  },
  address_not_found: {
    kind: "address_not_found",
    stage: "access",
    temporary: false,
    title: "Website address not found",
    message: "Axion couldn't find a website at this domain name. The address may be mistyped, or the site may no longer exist.",
    nextStep: "Check the spelling of the address.",
    actions: ["edit_url", "retry"],
  },
  redirect_problem: {
    kind: "redirect_problem",
    stage: "access",
    temporary: false,
    title: "Couldn't follow the link",
    message: "The website kept sending Axion to other addresses, so it never reached the actual page.",
    nextStep: "Open the site in your browser and use the address you end up on.",
    actions: ["edit_url", "open_site"],
  },
  private_address: {
    kind: "private_address",
    stage: "access",
    temporary: false,
    title: "Private address",
    message: "This address points to a private or internal network. For security, Axion only reads public websites.",
    nextStep: "Use a public web address.",
    actions: ["edit_url"],
  },
  invalid_address: {
    kind: "invalid_address",
    stage: "access",
    temporary: false,
    title: "Address can't be used",
    message: "This doesn't look like a web address Axion can read. Sources need to be public http:// or https:// links.",
    nextStep: "Enter the full web address, starting with https://.",
    actions: ["edit_url"],
  },
  unsupported_content: {
    kind: "unsupported_content",
    stage: "content",
    temporary: false,
    title: "Unsupported format",
    message: "Axion opened this address, but can't read this content format yet (it reads web pages and RSS/Atom feeds).",
    nextStep: "Use a web page or feed with the same content.",
    actions: ["edit_url", "open_site"],
  },
  too_large: {
    kind: "too_large",
    stage: "content",
    temporary: false,
    title: "Page too large",
    message: "This page is larger than Axion reads at once (3 MB), so it was skipped.",
    nextStep: "Use a more specific page or the site's feed.",
    actions: ["edit_url", "open_site"],
  },
  not_a_feed: {
    kind: "not_a_feed",
    stage: "content",
    temporary: false,
    title: "Not a readable feed",
    message: "The address opened, but it isn't an RSS/Atom feed Axion can read.",
    nextStep: "Replace it with the site's feed address (it often ends in /feed or /rss).",
    actions: ["edit_url", "open_site", "retry"],
  },
  empty_content: {
    kind: "empty_content",
    stage: "content",
    temporary: false,
    title: "No readable content",
    message: "The page opened, but Axion couldn't extract readable content from it. It may be mostly images or built by scripts.",
    nextStep: "Try the site's feed or a text article page instead.",
    actions: ["edit_url", "open_site"],
  },
  processing_failed: {
    kind: "processing_failed",
    stage: "processing",
    temporary: true,
    title: "Couldn't process new items",
    message: "Axion reached this source, but ran into a problem while processing some of what it found.",
    nextStep: "Run research again later.",
    actions: [],
  },
  unknown: {
    kind: "unknown",
    stage: "access",
    temporary: true,
    title: "Couldn't check this source",
    message: "Axion encountered a problem while checking this source. Please try again.",
    nextStep: "Try again; if it keeps happening, check the address.",
    actions: ["retry", "edit_url", "open_site"],
  },
};

function fromStatus(status: number): SourceErrorKind {
  if (status === 404 || status === 410) return "not_found";
  if (status === 401) return "sign_in_required";
  if (status === 402) return "payment_required";
  if (status === 403 || status === 451) return "access_denied";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "server_error";
  return "unknown";
}

function classify(raw: string): { kind: SourceErrorKind; httpStatus: number | null } {
  const status = /returned (?:HTTP )?(\d{3})\b/i.exec(raw);
  if (status) return { kind: fromStatus(Number(status[1])), httpStatus: Number(status[1]) };

  const rules: Array<[RegExp, SourceErrorKind]> = [
    [/disallowed by robots\.txt/i, "robots_disallowed"],
    [/private\/reserved IP|Refusing to fetch/i, "private_address"],
    [/Unsupported protocol|Invalid URL|Could not parse GitHub repo/i, "invalid_address"],
    [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, "address_not_found"],
    [/timed out|did not respond within|operation was aborted|AbortError|ETIMEDOUT|UND_ERR_.*TIMEOUT/i, "timeout"],
    [/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|certificate|SSL|TLS|fetch failed|couldn't connect/i, "connection_failed"],
    [/Too many redirects|Redirect with no Location/i, "redirect_problem"],
    [/Unsupported content-type|non-JSON response/i, "unsupported_content"],
    [/too large|exceeded \d+ bytes/i, "too_large"],
    [/no readable text/i, "empty_content"],
    [
      /isn't a feed|No RSS\/Atom feed|Feed not recognized|Attribute without value|Invalid character in entity|Unexpected close tag|Non-whitespace before first tag|Unclosed root tag|Unexpected end/i,
      "not_a_feed",
    ],
    [/AI processing failed|Insight generation failed|schema after retry|invalid_request_error|overloaded/i, "processing_failed"],
  ];
  for (const [re, kind] of rules) if (re.test(raw)) return { kind, httpStatus: null };
  return { kind: "unknown", httpStatus: null };
}

/**
 * The error as shown under "Technical details": our own message, with
 * credential-like query parameters and long tails trimmed. Stack traces are
 * never stored in lastError (only `err.message` is).
 */
export function redactTechnicalDetail(raw: string): string {
  return raw
    .replace(/([?&](?:token|key|api[_-]?key|secret|password|sig|signature|auth|access_token)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[\w.~+/-]+=*/gi, "$1[redacted]")
    .slice(0, 600);
}

export function explainSourceError(raw: string | null | undefined): SourceErrorExplanation {
  const text = (raw ?? "").trim();
  const { kind, httpStatus } = text ? classify(text) : { kind: "unknown" as const, httpStatus: null };
  const base = T[kind];
  // A status code we don't specifically map still deserves an honest, specific line.
  let message = base.message;
  if (kind === "unknown" && httpStatus) message = `The website responded with an error (code ${httpStatus}) instead of the page.`;
  // Only say discovery came up empty when the error shows it was attempted.
  if (kind === "not_a_feed" && /none was discoverable|No RSS\/Atom feed found/i.test(text)) {
    message = "The address opened, but it isn't an RSS/Atom feed Axion can read, and Axion couldn't find a feed linked from it.";
  }
  return { ...base, message, httpStatus, technical: redactTechnicalDetail(text || "No error details were recorded.") };
}
