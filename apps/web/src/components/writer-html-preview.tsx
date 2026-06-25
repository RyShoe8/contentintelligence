import { sanitizeEmailHtmlPreview } from "@/lib/sanitize-email-html";

type Props = { html: string; className?: string };

export const writerPreviewClass =
  "writer-html-preview max-w-none text-sm leading-relaxed text-[var(--fg)] " +
  "[&_p]:mb-4 [&_p:last-child]:mb-0 " +
  "[&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-medium " +
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mb-1 [&_li]:leading-relaxed " +
  "[&_a]:text-[var(--accent)] [&_a]:underline " +
  "[&_img]:max-w-full";

/** Sanitized blog-style HTML preview for Writer rewrites (paragraph/heading spacing). */
export function WriterHtmlPreview({ html, className }: Props) {
  const safe = sanitizeEmailHtmlPreview(html);
  if (!safe.trim()) return null;
  return (
    <div
      className={className ?? writerPreviewClass}
      // eslint-disable-next-line react/no-danger -- sanitized with sanitize-html (no scripts; img https only)
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
