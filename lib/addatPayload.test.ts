import { describe, it, expect } from "vitest";
import { buildAddatPayload } from "./addatPayload";

describe("buildAddatPayload", () => {
  const CARD =
    "K SHOP บ้านน้ำตามสั่ง 1.11 บาท 30 ต.ค. 69, 19:30 น. " +
    "รับชำระจาก นาย ณรรถพงษ์ ชำระเงินด้วย QR Payment";

  it("sends the alert's own wording, which is what line_add.php accepts", () => {
    // Tested against the live endpoint: line_add.php answers RES:OK to this
    // and RES:NOK to +CMGR — the exact opposite of sms_add.php, which is the
    // GSM modules' endpoint.
    expect(buildAddatPayload(CARD)).toBe(CARD);
  });

  it("never rewrites it into the +CMGR shape", () => {
    expect(buildAddatPayload(CARD)).not.toContain("+CMGR");
  });
});
