/** Patterns for blog page chrome that should not appear in learning excerpts or compose output. */
const CHROME_CLASS_ID_RE =
  /\b(?:share|social|breadcrumb|post-meta|post-date|entry-meta|back-to-blog|article-meta|sharing|posted-on|publish-date)\b/i;

const BACK_TO_LINK_RE =
  /<a\b[^>]*>\s*(?:←|&larr;|«)?\s*back\s+to\b[\s\S]*?<\/a>/gi;

const CHROME_BLOCK_RE = new RegExp(
  `<(?:div|span|p|section|aside|ul|nav|header|footer)\\b[^>]*(?:class|id)=["'][^"']*${CHROME_CLASS_ID_RE.source}[^"']*["'][^>]*>[\\s\\S]*?<\\/(?:div|span|p|section|aside|ul|nav|header|footer)>`,
  "gi",
);

/** Plain-text leak patterns (case-insensitive). */
export const COMPOSE_REFERENCE_LEAK_PATTERNS: RegExp[] = [
  /\bback\s+to\s+blog\b/i,
  /\bshare\s*facebook\b/i,
  /\bsharefacebook\b/i,
  /\bshare\s*linkedin\b/i,
  /\bsharelinkedin\b/i,
  /\bposted\s+on\b/i,
  /\bpublished\s+on\b/i,
  /^(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}$/im,
  /^←\s*back\s+to\b/im,
];

export function composeReferenceLeakPlainTextIssues(
  plain: string,
  knownExampleTitles: string[] = [],
): string[] {
  const issues: string[] = [];
  const trimmed = plain.trim();

  for (const re of COMPOSE_REFERENCE_LEAK_PATTERNS) {
    if (re.test(trimmed)) {
      issues.push("Article contains blog page chrome (navigation, share buttons, or publication date)");
      break;
    }
  }

  const firstBlock = trimmed.slice(0, 500);
  for (const title of knownExampleTitles) {
    const t = title.trim();
    if (t.length >= 12 && firstBlock.toLowerCase().includes(t.toLowerCase())) {
      issues.push(`Article copies style example title "${t}" — write a new title for this topic`);
      break;
    }
  }

  return [...new Set(issues)];
}

/** Remove common blog page chrome from HTML used for style examples and reference learning. */
export function sanitizeArticleHtmlForLearning(html: string): string {
  let out = html.trim();
  if (!out) return out;

  out = out
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(BACK_TO_LINK_RE, " ");

  for (let i = 0; i < 8; i++) {
    const next = out.replace(CHROME_BLOCK_RE, " ");
    if (next === out) break;
    out = next;
  }

  out = out.replace(/<(?:div|span|p)\b[^>]*>\s*(?:Share|Tweet|Pin it|Facebook|LinkedIn|Twitter)\b[\s\S]*?<\/(?:div|span|p)>/gi, " ");

  return out.replace(/\s{2,}/g, " ").trim();
}

function stripLeadingHtmlBlocks(html: string, maxBlocks: number): string {
  let out = html.trim();
  for (let i = 0; i < maxBlocks; i++) {
    const blockRe =
      /^(\s*(?:<(?:p|div|span|h1|h2|h3|nav|header|section|aside)\b[^>]*>[\s\S]*?<\/(?:p|div|span|h1|h2|h3|nav|header|section|aside)>|<(?:p|div|span|h1|h2|h3)\b[^>]*\/>))/i;
    const m = out.match(blockRe);
    if (!m?.[1]) break;
    const plain = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const isChrome =
      composeReferenceLeakPlainTextIssues(plain).length > 0 ||
      /^(?:share|facebook|linkedin|twitter)\b/i.test(plain) ||
      (plain.length <= 80 && /back\s+to/i.test(plain));
    if (!isChrome) break;
    out = out.slice(m[1].length).trim();
  }
  return out;
}

/** Strip leading chrome paragraphs from compose output before persisting. */
export function stripLeadingComposeChrome(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;
  return stripLeadingHtmlBlocks(trimmed, 6);
}
