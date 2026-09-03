export type Config = {
  stnId: string;
  accountCode: string;
  bankSenderId: string;
  stnKey: string;
  targetUrl: string;
  /**
   * Text that must appear in an alert for it to be trusted — the bank's name as
   * it shows in the notification, e.g. "K PLUS".
   *
   * MacroDroid fires on every LINE notification, so without this a message
   * typed by anyone in any chat could be relayed as a real transaction. Empty
   * disables the check, which is only appropriate while you are still
   * discovering what the real notification text looks like.
   */
  requireSender: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getConfig(): Config {
  return {
    stnId: required("STN_ID"),
    accountCode: required("ACCOUNT_CODE"),
    bankSenderId: required("BANK_SENDER_ID"),
    stnKey: required("STN_KEY"),
    targetUrl: required("TARGET_URL"),
    requireSender: process.env.REQUIRE_SENDER ?? "",
  };
}

export type GmailConfig = {
  user: string;
  appPassword: string;
  /** Only unread mail from this address is considered. */
  bankFrom: string;
  mailbox: string;
  pollSecret: string;
};

/**
 * Read separately from {@link getConfig} so the notify route — which never
 * touches mail — does not fail when only the relay half is configured.
 */
export function getGmailConfig(): GmailConfig {
  return {
    user: required("GMAIL_USER"),
    appPassword: required("GMAIL_APP_PASSWORD"),
    bankFrom: required("BANK_EMAIL_FROM"),
    mailbox: process.env.GMAIL_MAILBOX || "INBOX",
    pollSecret: required("POLL_SECRET"),
  };
}
