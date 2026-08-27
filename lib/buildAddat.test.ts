import { describe, it, expect } from "vitest";
import { buildAddat } from "./buildAddat";
import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";

const CONFIG: Config = {
  stnId: "S-24001",
  accountCode: "X-7689",
  bankSenderId: "756697110107",
  stnKey: "22162",
  targetUrl: "https://p-points.com/sms_add.php",
};

const PARSED: ParsedNotification = {
  amount: "200.00",
  balance: "207.85",
  day: 26,
  month: 8,
  year: 26,
  hour: 15,
  minute: 7,
};

describe("buildAddat", () => {
  it("produces exactly the approved string for the real sample", () => {
    expect(buildAddat(PARSED, CONFIG)).toBe(
      '+CMGR: "REC READ","756697110107","","26/08/26,15:07:00+28"26/08/26 15:07' +
        "A/C X-7689 transferred 200.00 Baht to A/C X-7689 " +
        "Outstanding Balance 207.85 Baht.OK",
    );
  });

  it("writes the quoted stamp as YY/MM/DD and the plain one as DD/MM/YY", () => {
    // 7 July 2026: day 7, year 26 — the two formats must differ here.
    const result = buildAddat(
      { ...PARSED, day: 7, month: 7, year: 26, hour: 14, minute: 16 },
      CONFIG,
    );
    expect(result).toContain('"26/07/07,14:16:00+28"');
    expect(result).toContain("07/07/26 14:16");
  });

  it("zero-pads single-digit hours and minutes", () => {
    const result = buildAddat({ ...PARSED, hour: 9, minute: 5 }, CONFIG);
    expect(result).toContain("09:05:00+28");
    expect(result).toContain(" 09:05");
  });

  it("uses the configured account code for both A/C slots", () => {
    const result = buildAddat(PARSED, { ...CONFIG, accountCode: "X-1111" });
    expect(result).toContain("A/C X-1111 transferred");
    expect(result).toContain("to A/C X-1111 Outstanding");
  });

  it("passes amount and balance through with comma grouping intact", () => {
    const result = buildAddat(
      { ...PARSED, amount: "1,234.50", balance: "96,508.08" },
      CONFIG,
    );
    expect(result).toContain("transferred 1,234.50 Baht");
    expect(result).toContain("Outstanding Balance 96,508.08 Baht");
  });
});
