import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig } from "./config";

const ENV_KEYS = ["STN_ID", "ACCOUNT_CODE", "BANK_SENDER_ID", "STN_KEY", "TARGET_URL"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getConfig", () => {
  it("reads all five values from the environment", () => {
    process.env.STN_ID = "S-24001";
    process.env.ACCOUNT_CODE = "X-7689";
    process.env.BANK_SENDER_ID = "756697110107";
    process.env.STN_KEY = "22162";
    process.env.TARGET_URL = "https://p-points.com/sms_add.php";

    expect(getConfig()).toEqual({
      stnId: "S-24001",
      accountCode: "X-7689",
      bankSenderId: "756697110107",
      stnKey: "22162",
      targetUrl: "https://p-points.com/sms_add.php",
    });
  });

  it("throws naming the variable that is missing", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(() => getConfig()).toThrow(/STN_ID/);
  });
});
