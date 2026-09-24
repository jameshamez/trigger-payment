import { describe, it, expect } from "vitest";
import { buildAddatPayload } from "./addatPayload";
import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";

const CONFIG: Config = {
  stnId: "S-24001",
  accountCode: "X-7689",
  bankSenderId: "756697110107",
  stnKey: "22162",
  targetUrl: "https://p-points.com/sms_add.php",
  requireSender: "",
  addatFormat: "cmgr",
};

const PARSED: ParsedNotification = {
  amount: "20.00", balance: "0.00",
  day: 20, month: 9, year: 26, hour: 5, minute: 51,
};

const RAW = `K SHOP บ้านน้ำตามสั่ง
20 บาท
20 ก.ย. 69, 05:51 น.`;

describe("buildAddatPayload", () => {
  it("rebuilds the alert as +CMGR by default", () => {
    expect(buildAddatPayload(RAW, PARSED, CONFIG)).toBe(
      '+CMGR: "REC READ","756697110107","","26/09/20,05:51:00+28"20/09/26 05:51' +
        "A/C X-7689 transferred 20.00 Baht to A/C X-7689 " +
        "Outstanding Balance 0.00 Baht.OK",
    );
  });

  it("sends the alert text untouched when the format is raw", () => {
    expect(buildAddatPayload(RAW, PARSED, { ...CONFIG, addatFormat: "raw" })).toBe(RAW);
  });

  it("forwards raw text even when the figures could not be read", () => {
    // A wording change at the bank must not stop a real payment reaching
    // p-points.com when the payload does not depend on the figures.
    expect(buildAddatPayload(RAW, null, { ...CONFIG, addatFormat: "raw" })).toBe(RAW);
  });

  it("refuses to build +CMGR without the figures", () => {
    expect(() => buildAddatPayload(RAW, null, CONFIG)).toThrow(/needs a parsed alert/);
  });
});
