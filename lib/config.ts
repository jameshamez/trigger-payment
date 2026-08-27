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
