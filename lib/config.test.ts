import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, getGmailConfig, getSupabaseLogConfig } from "./config";

const ENV_KEYS = [
  "STN_ID", "ACCOUNT_CODE", "BANK_SENDER_ID", "STN_KEY", "TARGET_URL", "REQUIRE_SENDER",
  "GMAIL_USER", "GMAIL_APP_PASSWORD", "BANK_EMAIL_FROM", "GMAIL_MAILBOX", "POLL_SECRET",
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
];
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

    process.env.REQUIRE_SENDER = "K PLUS";

    expect(getConfig()).toEqual({
      stnId: "S-24001",
      accountCode: "X-7689",
      bankSenderId: "756697110107",
      stnKey: "22162",
      targetUrl: "https://p-points.com/sms_add.php",
      requireSender: "K PLUS",
    });
  });

  it("leaves requireSender empty when it is not set, disabling the check", () => {
    process.env.STN_ID = "S-24001";
    process.env.ACCOUNT_CODE = "X-7689";
    process.env.BANK_SENDER_ID = "756697110107";
    process.env.STN_KEY = "22162";
    process.env.TARGET_URL = "https://p-points.com/sms_add.php";
    delete process.env.REQUIRE_SENDER;

    expect(getConfig().requireSender).toBe("");
  });

  it("throws naming the variable that is missing", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(() => getConfig()).toThrow(/STN_ID/);
  });
});

describe("getGmailConfig", () => {
  beforeEach(() => {
    process.env.GMAIL_USER = "station@gmail.com";
    process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
    process.env.BANK_EMAIL_FROM = "no-reply@kasikornbank.com";
    process.env.POLL_SECRET = "s3cret";
  });

  it("reads the mail settings from the environment", () => {
    process.env.GMAIL_MAILBOX = "Bank";
    expect(getGmailConfig()).toEqual({
      user: "station@gmail.com",
      appPassword: "abcd efgh ijkl mnop",
      bankFrom: "no-reply@kasikornbank.com",
      mailbox: "Bank",
      pollSecret: "s3cret",
    });
  });

  it("defaults the mailbox to INBOX", () => {
    delete process.env.GMAIL_MAILBOX;
    expect(getGmailConfig().mailbox).toBe("INBOX");
  });

  it("throws naming the variable that is missing", () => {
    delete process.env.GMAIL_APP_PASSWORD;
    expect(() => getGmailConfig()).toThrow(/GMAIL_APP_PASSWORD/);
  });
});

describe("getSupabaseLogConfig", () => {
  it("reads the url and service role key from the environment", () => {
    process.env.SUPABASE_URL = "https://xyzcompany.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    expect(getSupabaseLogConfig()).toEqual({
      url: "https://xyzcompany.supabase.co",
      serviceRoleKey: "service-role-key",
    });
  });

  it("returns null when logging is not configured, since it is optional", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(getSupabaseLogConfig()).toBeNull();
  });

  it("returns null when only one of the two variables is set", () => {
    process.env.SUPABASE_URL = "https://xyzcompany.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(getSupabaseLogConfig()).toBeNull();
  });
});
