import sanitizeHtml from "sanitize-html";

const options: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "img",
    "center",
  ]),
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["src", "alt", "width", "height", "style", "border", "title"],
    table: ["border", "cellpadding", "cellspacing", "width", "height", "style", "align", "bgcolor", "role"],
    tr: ["align", "bgcolor", "style", "valign"],
    td: ["colspan", "rowspan", "align", "valign", "width", "height", "style", "bgcolor"],
    th: ["colspan", "rowspan", "align", "valign", "width", "height", "style", "bgcolor"],
    div: ["style", "class", "align", "dir"],
    span: ["style", "class", "dir"],
    p: ["style", "class", "align", "dir"],
    body: ["style", "class", "dir"],
    html: ["lang", "dir"],
  },
  allowedSchemesByTag: {
    img: ["https"],
    a: ["http", "https", "mailto"],
  },
  allowVulnerableTags: false,
};

/** Sanitize marketing HTML for read-only display (feed detail). */
export function sanitizeEmailHtmlPreview(html: string): string {
  return sanitizeHtml(html, options);
}
