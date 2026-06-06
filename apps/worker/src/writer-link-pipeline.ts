import {
  finalizeWriterLinksInHtml,
  type Voice,
  type WriterLink,
  writerLinksNeedRevision,
} from "@content-resourcer/db";
import { reviseWriterLinksInHtml } from "./writer-revise-links.js";

export type WriterLinkPipelineOpts = {
  sourceText: string;
  links: WriterLink[];
  voice: Voice;
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

  if (
    opts.links.length > 0 &&
    writerLinksNeedRevision(out, opts.links, opts.sourceText.trim())
  ) {
    out = await reviseWriterLinksInHtml({
      html: out,
      links: opts.links,
      voice: opts.voice,
      sourceText: opts.sourceText.trim(),
    });
    linksRevised = true;
  }

  const finalized = finalizeWriterLinksInHtml(out, opts.links);
  out = finalized.html;
  linksWoven += finalized.linksWoven;
  linksAppended += finalized.linksAppended;
  linksRedistributed += finalized.linksRedistributed;

  return { html: out, linksRevised, linksWoven, linksAppended, linksRedistributed };
}
