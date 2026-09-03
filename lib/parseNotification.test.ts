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
