import type { Config } from "./config";
import type { ParsedNotification } from "./parseNotification";

const pad = (value: number): string => String(value).padStart(2, "0");

export function buildAddat(parsed: ParsedNotification, config: Config): string {
  const { day, month, year, hour, minute, amount, balance } = parsed;

  const dd = pad(day);
  const mm = pad(month);
  const yy = pad(year);
  const time = `${pad(hour)}:${pad(minute)}`;

  // The GSM service-centre stamp is YY/MM/DD; the display stamp that follows
  // it is DD/MM/YY. They look alike but are not the same field.
  const gsmStamp = `${yy}/${mm}/${dd},${time}:00+28`;
  const displayStamp = `${dd}/${mm}/${yy} ${time}`;

  return (
    `+CMGR: "REC READ","${config.bankSenderId}","","${gsmStamp}"${displayStamp}` +
    `A/C ${config.accountCode} transferred ${amount} Baht ` +
    `to A/C ${config.accountCode} Outstanding Balance ${balance} Baht.OK`
  );
}
