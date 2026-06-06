import type { Db } from "mongodb";
import {
  listPostsForVoice,
  listSavedWriterExamplesForVoice,
  primarySocialCopy,
  type ContentFacts,
  writerArticleHtmlForLearning,
} from "@content-resourcer/db";
import type { Voice } from "@content-resourcer/db";
import { completeJson } from "../llm/json-completion.js";
import type { ArticleRewriteExample } from "./types.js";

const EXAMPLE_EXCERPT_CHARS = 1200;
const CANDIDATE_ARTICLE_LIMIT = 10;
const CANDIDATE_POST_LIMIT = 10;
const RANKED_EXAMPLE_LIMIT = 5;

type ExampleCandidate = {
  id: string;
  title: string;
  content: string;
  source: "article" | "post";
};

export async function loadExampleCandidates(
  db: Db,
  organizationId: string,
  voice: Voice,
  excludeArticleId?: string,
): Promise<ExampleCandidate[]> {
  const articles = await listSavedWriterExamplesForVoice(
    db,
    organizationId,
    voice.id,
    CANDIDATE_ARTICLE_LIMIT,
  );
  const articleCandidates = articles
    .filter((a) => a.id !== excludeArticleId)
    .map((a) => ({
      id: a.id,
      title: a.title,
      content: writerArticleHtmlForLearning(a),
      source: "article" as const,
    }))
    .filter((c) => c.content.length > 0);

  const posts = await listPostsForVoice(db, organizationId, voice.content_signal_ids ?? [], {
    status: "draft",
    limit: CANDIDATE_POST_LIMIT,
  });
  const postCandidates: ExampleCandidate[] = [];
  for (const [i, p] of posts.entries()) {
    const copy = primarySocialCopy(p.social_copy_by_platform, p.social_copy)?.trim();
    if (!copy) continue;
    postCandidates.push({
      id: p.id,
      title: `Post ${i + 1}`,
      content: copy,
      source: "post",
    });
  }

  return [...articleCandidates, ...postCandidates];
}

function fallbackExamples(candidates: ExampleCandidate[]): ArticleRewriteExample[] {
  return candidates.slice(0, RANKED_EXAMPLE_LIMIT).map((c) => ({
    title: c.title,
    html:
      c.content.length > EXAMPLE_EXCERPT_CHARS
        ? `${c.content.slice(0, EXAMPLE_EXCERPT_CHARS)}…`
        : c.content,
  }));
}

export async function retrieveRankedExamples(
  db: Db,
  organizationId: string,
  voice: Voice,
  facts: ContentFacts,
  excludeArticleId?: string,
): Promise<ArticleRewriteExample[]> {
  const candidates = await loadExampleCandidates(db, organizationId, voice, excludeArticleId);
  if (!candidates.length) return [];

  if (candidates.length <= RANKED_EXAMPLE_LIMIT) {
    return fallbackExamples(candidates);
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
Reply JSON only: {"selected": [index, ...]} with up to ${RANKED_EXAMPLE_LIMIT} indices (0-based).
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
  if (!indices?.length) return fallbackExamples(candidates);

  const unique = [...new Set(indices)].slice(0, RANKED_EXAMPLE_LIMIT);
  return unique.map((i) => {
    const c = candidates[i]!;
    return {
      title: c.title,
      html:
        c.content.length > EXAMPLE_EXCERPT_CHARS
          ? `${c.content.slice(0, EXAMPLE_EXCERPT_CHARS)}…`
          : c.content,
    };
  });
}
