export type Config = {
  stnId: string;
  accountCode: string;
  bankSenderId: string;
  stnKey: string;
  targetUrl: string;
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
