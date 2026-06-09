import type { Db } from "mongodb";
import {
  listSavedWriterExamplesForVoice,
  listWriterStyleExamplesForVoice,
  type ContentFacts,
  writerArticleHtmlForLearning,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import type { ArticleRewriteExample } from "./types.js";

const EXAMPLE_EXCERPT_CHARS = 1200;
const COMPOSE_EXAMPLE_EXCERPT_CHARS = 2800;
const CANDIDATE_ARTICLE_LIMIT = 10;
const COMPOSE_RANKED_EXAMPLE_LIMIT = 2;
const RANKED_EXAMPLE_LIMIT = 5;

type ExampleCandidate = {
  id: string;
  title: string;
  content: string;
  source: "article";
};

export async function loadExampleCandidates(
  db: Db,
  organizationId: string,
  voice: Voice,
  excludeArticleId?: string,
  composeMode?: boolean,
): Promise<ExampleCandidate[]> {
  const articles = composeMode
    ? [
        ...(await listWriterStyleExamplesForVoice(db, organizationId, voice.id)),
        ...(await listSavedWriterExamplesForVoice(db, organizationId, voice.id, CANDIDATE_ARTICLE_LIMIT)),
      ]
    : await listSavedWriterExamplesForVoice(db, organizationId, voice.id, CANDIDATE_ARTICLE_LIMIT);

  const seen = new Set<string>();
  return articles
    .filter((a) => a.id !== excludeArticleId)
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .slice(0, CANDIDATE_ARTICLE_LIMIT)
    .map((a) => ({
      id: a.id,
      title: a.title,
      content: writerArticleHtmlForLearning(a),
      source: "article" as const,
    }))
    .filter((c) => c.content.length > 0);
}

function fallbackExamples(
  candidates: ExampleCandidate[],
  composeMode?: boolean,
): ArticleRewriteExample[] {
  const excerptChars = composeMode ? COMPOSE_EXAMPLE_EXCERPT_CHARS : EXAMPLE_EXCERPT_CHARS;
  const limit = composeMode ? COMPOSE_RANKED_EXAMPLE_LIMIT : RANKED_EXAMPLE_LIMIT;
  return candidates.slice(0, limit).map((c) => ({
    title: c.title,
    html:
      c.content.length > excerptChars ? `${c.content.slice(0, excerptChars)}…` : c.content,
  }));
}

export async function retrieveRankedExamples(
  db: Db,
  organizationId: string,
  voice: Voice,
  facts: ContentFacts,
  excludeArticleId?: string,
  opts?: { composeMode?: boolean },
): Promise<ArticleRewriteExample[]> {
  const composeMode = opts?.composeMode === true;
  const excerptChars = composeMode ? COMPOSE_EXAMPLE_EXCERPT_CHARS : EXAMPLE_EXCERPT_CHARS;
  const rankedLimit = composeMode ? COMPOSE_RANKED_EXAMPLE_LIMIT : RANKED_EXAMPLE_LIMIT;
  const candidates = await loadExampleCandidates(
    db,
    organizationId,
    voice,
    excludeArticleId,
    composeMode,
  );
  if (!candidates.length) return [];

  if (candidates.length <= rankedLimit) {
    return fallbackExamples(candidates, composeMode);
  }

  const catalog = candidates.map((c, i) => ({
    index: i,
    title: c.title,
    source: c.source,
    excerpt:
      c.content.length > 400 ? `${c.content.slice(0, 400)}…` : c.content,
  }));

  const raw = await completeJson<{ selected?: number[] }>({
    system: `Select the best brand writing examples for reconstructing an article from facts.
Reply JSON only: {"selected": [index, ...]} with up to ${rankedLimit} indices (0-based).
Prefer topical relevance to the facts and stylistic match to a human brand operator — not generic AI tone.`,
    user: [
      "Facts (JSON):",
      JSON.stringify(facts, null, 2),
      "",
      "Candidate examples:",
      JSON.stringify(catalog, null, 2),
    ].join("\n"),
    temperature: 0.2,
    maxTokens: 300,
  });

  const indices = raw?.selected?.filter(
    (i) => Number.isInteger(i) && i >= 0 && i < candidates.length,
  );
  if (!indices?.length) return fallbackExamples(candidates, composeMode);

  const unique = [...new Set(indices)].slice(0, rankedLimit);
  return unique.map((i) => {
    const c = candidates[i]!;
    return {
      title: c.title,
      html:
        c.content.length > excerptChars ? `${c.content.slice(0, excerptChars)}…` : c.content,
    };
  });
}
