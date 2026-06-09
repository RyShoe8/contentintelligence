import {
  mechanicalWriterLinksInHtml,
  postReviseWriterLinksInHtml,
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
};

export type LinkPipelineResult = {
  html: string;
  linksRevised: boolean;
  linksWoven: number;
  linksAppended: number;
  linksRedistributed: number;
};

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
  const mechanical = mechanicalWriterLinksInHtml(out, opts.links, {
    exactAnchorLabels: opts.exactAnchorLabels,
  });
  out = mechanical.html;
  linksWoven += mechanical.linksWoven;
  linksRedistributed += mechanical.linksRedistributed;

  if (writerLinksNeedRevision(out, opts.links, source)) {
    out = await reviseWriterLinksInHtml({
      html: out,
      links: opts.links,
      voice: opts.voice,
      sourceText: source,
      exactAnchorLabels: opts.exactAnchorLabels,
    });
    linksRevised = true;
  }

  const post = postReviseWriterLinksInHtml(out, opts.links);
  out = post.html;
  linksAppended += post.linksAppended;

  return { html: out, linksRevised, linksWoven, linksAppended, linksRedistributed };
}
