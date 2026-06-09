import {
  mechanicalWriterLinksInHtml,
  postReviseWriterLinksInHtml,
  writerComposeLinkIssues,
  writerHasRelatedLinksBlock,
  type Voice,
  type WriterLink,
  writerLinksNeedRevision,
} from "@content-resourcer/db";
import { reviseWriterLinksInHtml } from "./writer-revise-links.js";

export type WriterLinkPipelineOpts = {
  sourceText: string;
  links: WriterLink[];
  voice: Voice;
  exactAnchorLabels?: boolean;
  /** When false, never append a Related links block; retry LLM revision instead. */
  allowAppendedLinks?: boolean;
};

export type LinkPipelineResult = {
  html: string;
  linksRevised: boolean;
  linksWoven: number;
  linksAppended: number;
  linksRedistributed: number;
};

const COMPOSE_LINK_REVISE_MAX = 3;

function needsLinkRevision(
  html: string,
  links: WriterLink[],
  sourceText: string,
  allowAppended: boolean,
): boolean {
  if (writerLinksNeedRevision(html, links, sourceText)) return true;
  if (!allowAppended && writerHasRelatedLinksBlock(html)) return true;
  if (!allowAppended && writerComposeLinkIssues(html, links, sourceText).length > 0) {
    return true;
  }
  return false;
}

export async function applyWriterLinkPipeline(
  html: string,
  opts: WriterLinkPipelineOpts,
): Promise<LinkPipelineResult> {
  let out = html;
  let linksRevised = false;
  let linksWoven = 0;
  let linksAppended = 0;
  let linksRedistributed = 0;

  if (!opts.links.length) {
    return { html: out, linksRevised, linksWoven, linksAppended, linksRedistributed };
  }

  const source = opts.sourceText.trim();
  const allowAppended = opts.allowAppendedLinks !== false;
  const maxReviseAttempts = allowAppended ? 1 : COMPOSE_LINK_REVISE_MAX;

  const mechanical = mechanicalWriterLinksInHtml(out, opts.links, {
    exactAnchorLabels: opts.exactAnchorLabels,
  });
  out = mechanical.html;
  linksWoven += mechanical.linksWoven;
  linksRedistributed += mechanical.linksRedistributed;

  let reviseAttempts = 0;
  while (needsLinkRevision(out, opts.links, source, allowAppended) && reviseAttempts < maxReviseAttempts) {
    out = await reviseWriterLinksInHtml({
      html: out,
      links: opts.links,
      voice: opts.voice,
      sourceText: source,
      exactAnchorLabels: opts.exactAnchorLabels,
      composeMode: !allowAppended,
    });
    linksRevised = true;
    reviseAttempts++;

    const reMech = mechanicalWriterLinksInHtml(out, opts.links, {
      exactAnchorLabels: opts.exactAnchorLabels,
    });
    out = reMech.html;
    linksWoven += reMech.linksWoven;
    linksRedistributed += reMech.linksRedistributed;
  }

  const post = postReviseWriterLinksInHtml(out, opts.links, {
    allowAppendedLinks: allowAppended,
  });
  out = post.html;
  linksAppended += post.linksAppended;

  return { html: out, linksRevised, linksWoven, linksAppended, linksRedistributed };
}
