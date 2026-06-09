import { sanitizeArticleHtmlForLearning } from "@content-resourcer/db";
import type { ArticleRewriteExample } from "./types.js";

const PER_EXAMPLE_CHARS = 1200;
const MAX_TOTAL_CHARS = 2800;

/** Headings + opening body from up to two ranked style examples for rhythm anchoring. */
export function buildComposeStyleExampleExcerpt(
  examples: ArticleRewriteExample[],
): string | undefined {
  const selected = examples.slice(0, 2).filter((ex) => ex.html?.trim());
  if (!selected.length) return undefined;

  const blocks: string[] = [];
  let total = 0;
  for (const ex of selected) {
    const header = `Example ${blocks.length + 1} (reference only — do not copy title or chrome):\n`;
    const remaining = MAX_TOTAL_CHARS - total - header.length;
    if (remaining <= 200) break;
    const sliceLen = Math.min(PER_EXAMPLE_CHARS, remaining);
    const sanitized = sanitizeArticleHtmlForLearning(ex.html);
    const body =
      sanitized.length > sliceLen ? `${sanitized.slice(0, sliceLen)}…` : sanitized;
    blocks.push(`${header}${body}`);
    total += header.length + body.length;
  }

  return blocks.length ? blocks.join("\n\n") : undefined;
}
