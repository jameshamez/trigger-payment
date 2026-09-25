import { describe, it, expect } from "vitest";
import {
  parseNotification,
  isIncomingTransfer,
  isFromExpectedSender,
  ParseError,
} from "./parseNotification";

const SAMPLE = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
เข้าบัญชี xxx-x-x8972-x
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

describe("isIncomingTransfer", () => {
  it("accepts a K PLUS incoming-money notification", () => {
    expect(isIncomingTransfer(SAMPLE)).toBe(true);
  });

  it("rejects an unrelated LINE message", () => {
    expect(isIncomingTransfer("สวัสดีครับ วันนี้ประชุมกี่โมง")).toBe(false);
  });
});

const KSHOP = `K SHOP บ้านน้ำตามสั่ง
20 บาท
20 ก.ย. 69, 05:51 น.
รับชำระจาก นาย ธีรวัฒน์
ชำระเงินด้วย QR Payment`;

// What the Android notification actually carries, captured from a real
// payment. It is not the chat bubble's rich card: the bank writes a separate
// one-line summary, with the figure labelled and the date prefixed.
const KSHOP_NOTIFICATION = `KBank Live รายการรับชำระเงิน K SHOP จาก นาย ณรรถพงษ์
จำนวนเงิน 2 บาท วันที่ 25 ก.ย. 69, 10:43 น.`;

describe("the real K SHOP notification", () => {
  it("is recognised as an incoming transfer", () => {
    expect(isIncomingTransfer(KSHOP_NOTIFICATION)).toBe(true);
  });

  it("reads every field", () => {
    expect(parseNotification(KSHOP_NOTIFICATION)).toEqual({
      amount: "2.00",
      balance: "0.00",
      day: 25,
      month: 9,
      year: 26,
      hour: 10,
      minute: 43,
    });
  });

  it("reads it the same when collapsed onto one line", () => {
    const collapsed = KSHOP_NOTIFICATION.replace(/\n/g, " ");
    expect(parseNotification(collapsed)).toMatchObject({ amount: "2.00", day: 25 });
  });

  it("keeps satang and comma grouping when present", () => {
    const larger = KSHOP_NOTIFICATION.replace("2 บาท", "1,250.75 บาท");
    expect(parseNotification(larger).amount).toBe("1,250.75");
  });

  it("does not take the date's day number for the amount", () => {
    // "25" in "วันที่ 25 ก.ย." must never win over the 2 after จำนวนเงิน.
    expect(parseNotification(KSHOP_NOTIFICATION).amount).toBe("2.00");
  });
});

describe("K SHOP alerts", () => {
  it("recognises one as an incoming transfer", () => {
    expect(isIncomingTransfer(KSHOP)).toBe(true);
  });

  it("reads the amount, which carries no label and no decimals", () => {
    expect(parseNotification(KSHOP).amount).toBe("20.00");
  });

  it("reads the date, where a comma separates the year from the time", () => {
    expect(parseNotification(KSHOP)).toMatchObject({
      day: 20,
      month: 9,
      year: 26,
      hour: 5,
      minute: 51,
    });
  });

  it("reports a zero balance, since a K SHOP receipt carries none", () => {
    // A shop receipt states what was taken, never the account total. The
    // +CMGR format has no way to omit the field, so it is sent as zero.
    expect(parseNotification(KSHOP).balance).toBe("0.00");
  });

  it("keeps decimals and comma grouping when the amount has them", () => {
    const larger = KSHOP.replace("20 บาท", "1,250.75 บาท");
    expect(parseNotification(larger).amount).toBe("1,250.75");
  });

  it("does not mistake the shop name for the amount", () => {
    const numeric = KSHOP.replace("บ้านน้ำตามสั่ง", "ร้าน 24 ชม.");
    expect(parseNotification(numeric).amount).toBe("20.00");
  });

  it("throws naming the amount when there is no figure at all", () => {
    const noAmount = KSHOP.replace("20 บาท\n", "");
    expect(() => parseNotification(noAmount)).toThrow(ParseError);
  });
});

describe("isFromExpectedSender", () => {
  it("accepts an alert naming the expected bank", () => {
    expect(isFromExpectedSender(`K PLUS\n${SAMPLE}`, "K PLUS")).toBe(true);
  });

  it("rejects a lookalike message from someone else", () => {
    // The whole point: a friend can type this into any LINE chat, and the
    // phone forwards every LINE notification.
    expect(isFromExpectedSender(SAMPLE, "K PLUS")).toBe(false);
  });

  it("ignores case and surrounding spaces in the configured name", () => {
    expect(isFromExpectedSender("k plus แจ้งเตือน", "  K PLUS  ")).toBe(true);
  });

  it("trusts everything when no sender is configured", () => {
    expect(isFromExpectedSender(SAMPLE, "")).toBe(true);
    expect(isFromExpectedSender(SAMPLE, "   ")).toBe(true);
  });
});

describe("parseNotification", () => {
  it("extracts every field from the real sample", () => {
    expect(parseNotification(SAMPLE)).toEqual({
      amount: "200.00",
      balance: "207.85",
      day: 26,
      month: 8,
      year: 26,
      hour: 15,
      minute: 7,
    });
  });

  it("parses the same text collapsed onto one line", () => {
    const collapsed = SAMPLE.replace(/\n/g, " ");
    expect(parseNotification(collapsed).amount).toBe("200.00");
    expect(parseNotification(collapsed).day).toBe(26);
  });

  it("keeps comma grouping in large numbers", () => {
    const text = SAMPLE.replace("207.85", "96,508.08").replace("200.00", "1,234.50");
    const parsed = parseNotification(text);
    expect(parsed.amount).toBe("1,234.50");
    expect(parsed.balance).toBe("96,508.08");
  });

  it("handles a single-digit day", () => {
    const parsed = parseNotification(SAMPLE.replace("26 ส.ค. 69", "5 ส.ค. 69"));
    expect(parsed.day).toBe(5);
  });

  it("converts every Thai month abbreviation", () => {
    const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    months.forEach((abbr, index) => {
      const parsed = parseNotification(SAMPLE.replace("ส.ค.", abbr));
      expect(parsed.month).toBe(index + 1);
    });
  });

  it("converts the Buddhist year to a 2-digit CE year", () => {
    expect(parseNotification(SAMPLE.replace("69 15:07", "70 15:07")).year).toBe(27);
  });

  it("throws a ParseError naming the missing field", () => {
    const withoutAmount = SAMPLE.replace("จำนวนเงิน 200.00 บาท", "");
    expect(() => parseNotification(withoutAmount)).toThrow(ParseError);
    try {
      parseNotification(withoutAmount);
    } catch (error) {
      expect((error as ParseError).field).toBe("amount");
    }
  });
});
