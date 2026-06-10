import type { Db } from "mongodb";
import { listWriterStyleExamplesForVoice, type Voice } from "@content-resourcer/db";
import {
  extractComposeStyleKitDeterministic,
  summarizeComposeStyleKits,
} from "./extract-compose-style-kit.js";

const COMPOSE_EDITORIAL_RULES = `- Single editorial thread on the topic — not a typology survey of community types
- Open with operator conviction, not neutral industry overview
- Match section rhythm from style examples; do not create one H2 per research subtopic`;

/** Builds the "## Editorial compose" appendix for writer persona generation. */
export async function buildComposeEditorialPersonaBlock(
  db: Db,
  voice: Voice,
): Promise<string | undefined> {
  const articles = await listWriterStyleExamplesForVoice(db, voice.organization_id, voice.id);
  const kits = articles
    .slice(0, 3)
    .map((article) => {
      const html = article.final_html?.trim() ?? "";
      if (article.compose_style_kit) return article.compose_style_kit;
      return html ? extractComposeStyleKitDeterministic(html) : undefined;
    })
    .filter((kit): kit is NonNullable<typeof kit> => kit != null);

  const summary = summarizeComposeStyleKits(kits);
  if (!summary && !kits.length) return COMPOSE_EDITORIAL_RULES;
  return summary ? `${summary}\n\n${COMPOSE_EDITORIAL_RULES}` : COMPOSE_EDITORIAL_RULES;
}
