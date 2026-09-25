export type ParsedNotification = {
  amount: string;
  balance: string;
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
};

export class ParseError extends Error {
  field: string;
  constructor(field: string) {
    super(`Could not find "${field}" in the notification text`);
    this.name = "ParseError";
    this.field = field;
  }
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                     "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// Matches "26 ส.ค. 69 15:07" and "20 ก.ย. 69, 05:51". Dots in the month names
// are escaped so the alternation cannot match across an unexpected character,
// and a comma may stand between the year and the time — K SHOP writes one,
// KBank LIVE does not.
const DATETIME_PATTERN = new RegExp(
  String.raw`(\d{1,2})\s*(` +
    THAI_MONTHS.map((m) => m.replace(/\./g, String.raw`\.`)).join("|") +
    String.raw`)\s*(\d{2})[,\s]+(\d{1,2}):(\d{2})`,
);

const AMOUNT_PATTERN = /จำนวนเงิน\s*([\d,]+\.\d{2})/;
const BALANCE_PATTERN = /ยอดเงินคงเหลือ\s*([\d,]+\.\d{2})/;

// K SHOP writes the figure two ways, and both reach us.
//
// The Android notification labels it — "จำนวนเงิน 2 บาท วันที่ 25 ก.ย." — and
// that label is what keeps the date's day number from being read as the
// amount. The chat bubble's card states it bare on its own line instead,
// "20 บาท", which is anchored to a line start so a number inside the shop's
// name cannot win. Neither form is guaranteed to carry satang.
const KSHOP_LABELLED_AMOUNT = /จำนวนเงิน\s*([\d,]+(?:\.\d{1,2})?)\s*บาท/;
const KSHOP_BARE_AMOUNT = /^\s*([\d,]+(?:\.\d{1,2})?)\s*บาท/m;

function matchKShopAmount(text: string): RegExpMatchArray | null {
  return text.match(KSHOP_LABELLED_AMOUNT) ?? text.match(KSHOP_BARE_AMOUNT);
}

/**
 * A K SHOP receipt reports what the shop took, never the account total, so
 * there is no balance to read. The +CMGR format has no way to leave the field
 * out, so it is sent as zero.
 *
 * Whether p-points.com accepts that is still unconfirmed — ask before relying
 * on K SHOP as the only source.
 */
const NO_BALANCE = "0.00";

export type AlertFormat = "kbank-live" | "k-shop";

/** Which app's alert this is, or null when the text is neither. */
export function detectFormat(text: string): AlertFormat | null {
  if (text.includes("รายการเงินเข้า") && text.includes("จำนวนเงิน")) {
    return "kbank-live";
  }
  if (/K\s*SHOP/i.test(text) && matchKShopAmount(text) !== null) {
    return "k-shop";
  }
  return null;
}

export function isIncomingTransfer(text: string): boolean {
  return detectFormat(text) !== null;
}

/**
 * Whether the alert carries the expected bank's name.
 *
 * The phone forwards every LINE notification, and the endpoint is open, so the
 * wording of an alert proves nothing on its own — anyone could type it. This
 * narrows what is accepted to text that also names the bank.
 *
 * It is a filter, not authentication: someone who knows both the URL and the
 * bank's name can still post. Treat it as the first of several defences, and
 * keep the deployment URL private.
 *
 * An empty `expected` disables the check and everything is trusted.
 */
export function isFromExpectedSender(text: string, expected: string): boolean {
  if (expected.trim() === "") return true;
  return text.toLowerCase().includes(expected.trim().toLowerCase());
}

/** "20" → "20.00"; "1,250.75" and "20.5" are left with their own decimals. */
function withSatang(figure: string): string {
  if (!figure.includes(".")) return `${figure}.00`;
  const [baht, satang] = figure.split(".");
  return `${baht}.${satang.padEnd(2, "0")}`;
}

/** The date and time, which both formats write the same way apart from a comma. */
function parseThaiDateTime(text: string) {
  const datetime = text.match(DATETIME_PATTERN);
  if (!datetime) throw new ParseError("datetime");

  const [, day, monthAbbr, buddhistYear, hour, minute] = datetime;
  return {
    day: Number(day),
    month: THAI_MONTHS.indexOf(monthAbbr) + 1,
    // "69" is พ.ศ. 2569 → ค.ศ. 2026 → the 2-digit CE year 26.
    year: (Number(buddhistYear) + 2500 - 543) % 100,
    hour: Number(hour),
    minute: Number(minute),
  };
}

export function parseNotification(text: string): ParsedNotification {
  if (detectFormat(text) === "k-shop") {
    const amount = matchKShopAmount(text);
    if (!amount) throw new ParseError("amount");

    return {
      amount: withSatang(amount[1]),
      balance: NO_BALANCE,
      ...parseThaiDateTime(text),
    };
  }

  const amount = text.match(AMOUNT_PATTERN);
  if (!amount) throw new ParseError("amount");

  const balance = text.match(BALANCE_PATTERN);
  if (!balance) throw new ParseError("balance");

  return {
    amount: amount[1],
    balance: balance[1],
    ...parseThaiDateTime(text),
  };
}
