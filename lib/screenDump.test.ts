import { describe, it, expect } from "vitest";
import { isScreenDump, normaliseScreenDump } from "./screenDump";

// What MacroDroid's Read Screen sends after opening the KBank Live chat:
// every text node it can see, the card's own lines mixed in with LINE's
// buttons and headers.
const DUMP = `[read]:
-- [index:82]: บ้านน้ำตามสั่ง
-- [index:87]: 1 บาท
-- [index:90]: 30 ต.ค. 69, 17:48 น.
-- [index:95]: รับชำระจาก
-- [index:97]: นาย ณรรถพงษ์
-- [index:100]: ชำระเงินด้วย
-- [index:102]: QR Payment
-- [index:106]: แชร์แจ้งเตือนจาก
-- [jp.naver.line.android:id/chat_ui_header_official_account_icon]: ชื่อบัญชี
-- [jp.naver.line.android:id/chat_ui_main_header]: ค้นหา
-- [jp.naver.line.android:id/header_title]: KBank Live
-- [jp.naver.line.android:id/header_up_button_bg]: กลับ`;

describe("isScreenDump", () => {
  it("recognises a Read Screen dump", () => {
    expect(isScreenDump(DUMP)).toBe(true);
  });

  it("does not mistake an ordinary notification for one", () => {
    expect(isScreenDump("K SHOP ได้รับชำระเงิน 1.00 บ. จาก นาย ณรรถพงษ์")).toBe(false);
  });
});

describe("normaliseScreenDump", () => {
  it("rebuilds the card as one line in the order it appears", () => {
    expect(normaliseScreenDump(DUMP)).toBe(
      "K SHOP บ้านน้ำตามสั่ง 1 บาท 30 ต.ค. 69, 17:48 น. " +
        "รับชำระจาก นาย ณรรถพงษ์ ชำระเงินด้วย QR Payment",
    );
  });

  it("drops LINE's own buttons and headers", () => {
    const result = normaliseScreenDump(DUMP);
    // Only the card's text belongs in addat; the chat's furniture does not.
    expect(result).not.toContain("ค้นหา");
    expect(result).not.toContain("กลับ");
    expect(result).not.toContain("ชื่อบัญชี");
  });

  it("stops at the share line, which ends the card", () => {
    expect(normaliseScreenDump(DUMP)).not.toContain("แชร์แจ้งเตือนจาก");
  });

  it("orders by index rather than by the order the lines arrived", () => {
    const shuffled = `[read]:
-- [index:90]: 30 ต.ค. 69, 17:48 น.
-- [index:82]: บ้านน้ำตามสั่ง
-- [index:87]: 1 บาท`;

    expect(normaliseScreenDump(shuffled)).toBe(
      "K SHOP บ้านน้ำตามสั่ง 1 บาท 30 ต.ค. 69, 17:48 น.",
    );
  });

  it("keeps satang in the amount", () => {
    const withSatang = DUMP.replace("1 บาท", "20.23 บาท");
    expect(normaliseScreenDump(withSatang)).toContain("20.23 บาท");
  });

  it("returns an empty string when the dump holds no card", () => {
    // The lock screen, which is what gets read when LINE never came forward.
    const lockScreen = `[read]:
-- [com.samsung.android.app.clockpack:id/common_date]: ศ. 30 ตุลาคม
-- [com.samsung.android.app.clockpack:id/common_time_area_container]: 17:48`;

    expect(normaliseScreenDump(lockScreen)).toBe("");
  });
});
