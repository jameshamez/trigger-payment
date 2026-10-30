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
};

const PARSED: ParsedNotification = {
  amount: "20.00", balance: "0.00",
  day: 20, month: 9, year: 26, hour: 5, minute: 51,
};

describe("buildAddatPayload", () => {
  it("always builds the +CMGR shape", () => {
    // p-points.com answers RES:NOK to anything else — proven against the live
    // endpoint with Thai text in three different wordings.
    expect(buildAddatPayload(PARSED, CONFIG)).toBe(
      '+CMGR: "REC READ","756697110107","","26/09/20,05:51:00+28"20/09/26 05:51' +
        "A/C X-7689 transferred 20.00 Baht to A/C X-7689 " +
        "Outstanding Balance 0.00 Baht.OK",
    );
  });

  it("never passes the alert's own wording through", () => {
    expect(buildAddatPayload(PARSED, CONFIG)).not.toContain("บาท");
  });
});
