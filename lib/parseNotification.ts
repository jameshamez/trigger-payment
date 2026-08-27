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

// Matches "26 ส.ค. 69 15:07". Dots in the month names are escaped so the
// alternation cannot match across an unexpected character.
const DATETIME_PATTERN = new RegExp(
  String.raw`(\d{1,2})\s*(` +
    THAI_MONTHS.map((m) => m.replace(/\./g, String.raw`\.`)).join("|") +
    String.raw`)\s*(\d{2})\s+(\d{1,2}):(\d{2})`,
);

const AMOUNT_PATTERN = /จำนวนเงิน\s*([\d,]+\.\d{2})/;
const BALANCE_PATTERN = /ยอดเงินคงเหลือ\s*([\d,]+\.\d{2})/;

export function isIncomingTransfer(text: string): boolean {
  return text.includes("รายการเงินเข้า") && text.includes("จำนวนเงิน");
}

export function parseNotification(text: string): ParsedNotification {
  const amount = text.match(AMOUNT_PATTERN);
  if (!amount) throw new ParseError("amount");

  const balance = text.match(BALANCE_PATTERN);
  if (!balance) throw new ParseError("balance");

  const datetime = text.match(DATETIME_PATTERN);
  if (!datetime) throw new ParseError("datetime");

  const [, day, monthAbbr, buddhistYear, hour, minute] = datetime;

  return {
    amount: amount[1],
    balance: balance[1],
    day: Number(day),
    month: THAI_MONTHS.indexOf(monthAbbr) + 1,
    // "69" is พ.ศ. 2569 → ค.ศ. 2026 → the 2-digit CE year 26.
    year: (Number(buddhistYear) + 2500 - 543) % 100,
    hour: Number(hour),
    minute: Number(minute),
  };
}
