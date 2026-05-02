import { sanitizeEmailHtmlPreview } from "@/lib/sanitize-email-html";

type Props = { html: string; className?: string };

/** Server-safe sanitized HTML fragment (no scripts; img src https only). */
export function EmailHtmlPreview({ html, className }: Props) {
  const safe = sanitizeEmailHtmlPreview(html);
  if (!safe.trim()) return null;
  return (
    <div
      className={
        className ??
        "email-html-preview max-w-none text-sm text-[var(--fg)] [&_a]:text-[var(--accent)] [&_img]:max-w-full [&_table]:max-w-full"
      }
      // eslint-disable-next-line react/no-danger -- sanitized with sanitize-html (no scripts; img https only)
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
