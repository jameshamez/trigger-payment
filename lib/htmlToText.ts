// `td`/`th` are included because bank alerts put a label in one cell and its
// value in the next; without a break they run together into one token.
const BLOCK_TAGS = /<\/?(?:p|div|tr|td|th|table|br|li|h[1-6]|hr|section)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Flattens an HTML email body into plain text.
 *
 * Bank alerts are frequently HTML-only, and the figures we need sit in table
 * cells. Block-level tags become newlines so a label and its value do not run
 * together into one unparseable token.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t ]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
