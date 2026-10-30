/**
 * Turns MacroDroid's Read Screen output back into the K SHOP card.
 *
 * Reading the screen is how the amount is obtained at all: LINE's notification
 * carries only the first 50 characters, which stop short of the figure, while
 * the card drawn in the chat holds every line. What comes back is every text
 * node on screen — the card's lines mixed in with LINE's own header and
 * buttons — so the card has to be picked back out.
 *
 * The card's own lines are the ones keyed by position (`[index:87]`); anything
 * keyed by a resource id (`[jp.naver.line.android:id/…]`) is the app's
 * furniture and is dropped.
 */
const CARD_LINE = /^--\s*\[index:(\d+)\]:\s*(.+?)\s*$/;

/** The card's last line. Nothing after it belongs to the payment. */
const END_OF_CARD = "แชร์แจ้งเตือนจาก";

export function isScreenDump(text: string): boolean {
  return text.includes("[read]:") || CARD_LINE.test(text.split("\n")[1] ?? "");
}

export function normaliseScreenDump(text: string): string {
  const lines: { index: number; value: string }[] = [];

  for (const line of text.split("\n")) {
    const match = line.match(CARD_LINE);
    if (match) lines.push({ index: Number(match[1]), value: match[2] });
  }

  // Read Screen usually reports in order, but sorting makes the result
  // independent of that — the card reads top to bottom either way.
  lines.sort((a, b) => a.index - b.index);

  const card: string[] = [];
  for (const { value } of lines) {
    if (value === END_OF_CARD) break;
    card.push(value);
  }

  if (card.length === 0) return "";

  // The card itself never writes "K SHOP" as a text node — it is the logo —
  // so it is put back, giving the same wording the shop sees on screen.
  return `K SHOP ${card.join(" ")}`;
}
