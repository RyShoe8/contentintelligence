import type { Db } from "mongodb";
import {
  listSavedWriterExamplesForVoice,
  listWriterStyleExamplesForVoice,
  sanitizeArticleHtmlForLearning,
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
const COMPOSE_RANKING_EXCERPT_CHARS = 800;

type ExampleCandidate = {
  id: string;
  title: string;
  content: string;
  source: "article";
  styleExample: boolean;
};

export async function loadExampleCandidates(
  db: Db,
  organizationId: string,
  voice: Voice,
  excludeArticleId?: string,
  composeMode?: boolean,
): Promise<ExampleCandidate[]> {
  const styleArticles = composeMode
    ? await listWriterStyleExamplesForVoice(db, organizationId, voice.id)
    : [];
  const savedArticles = await listSavedWriterExamplesForVoice(
    db,
    organizationId,
    voice.id,
    CANDIDATE_ARTICLE_LIMIT,
  );

  const articles = composeMode ? [...styleArticles, ...savedArticles] : savedArticles;
  const styleIds = new Set(styleArticles.map((a) => a.id));

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
      content: sanitizeArticleHtmlForLearning(writerArticleHtmlForLearning(a) ?? ""),
      source: "article" as const,
      styleExample: styleIds.has(a.id),
    }))
    .filter((c) => c.content.length > 0);
}

function fallbackExamples(
  candidates: ExampleCandidate[],
  composeMode?: boolean,
): ArticleRewriteExample[] {
  const excerptChars = composeMode ? COMPOSE_EXAMPLE_EXCERPT_CHARS : EXAMPLE_EXCERPT_CHARS;
  const limit = composeMode ? COMPOSE_RANKED_EXAMPLE_LIMIT : RANKED_EXAMPLE_LIMIT;
  const ordered = composeMode
    ? [...candidates].sort((a, b) => Number(b.styleExample) - Number(a.styleExample))
    : candidates;
  return ordered.slice(0, limit).map((c) => ({
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

  const styleExampleCount = candidates.filter((c) => c.styleExample).length;
  if (composeMode && styleExampleCount > 0 && styleExampleCount <= 3) {
    const styleOnly = candidates.filter((c) => c.styleExample);
    return styleOnly.map((c) => ({
      title: c.title,
      html:
        c.content.length > excerptChars ? `${c.content.slice(0, excerptChars)}…` : c.content,
    }));
  }

  const catalog = candidates.map((c, i) => ({
    index: i,
    title: c.title,
    source: c.source,
    styleExample: c.styleExample,
    excerpt:
      c.content.length > COMPOSE_RANKING_EXCERPT_CHARS
        ? `${c.content.slice(0, COMPOSE_RANKING_EXCERPT_CHARS)}…`
        : c.content,
  }));

  const composeRankingNote = composeMode
    ? " Prefer candidates with styleExample=true for voice and paragraph rhythm — voice match outweighs topical fit."
    : "";

  const raw = await completeJson<{ selected?: number[] }>({
    system: `Select the best brand writing examples for reconstructing an article from facts.
Reply JSON only: {"selected": [index, ...]} with up to ${rankedLimit} indices (0-based).
For compose articles: prioritize stylistic and rhythmic match to a human brand operator over topical overlap.${composeRankingNote}`,
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
