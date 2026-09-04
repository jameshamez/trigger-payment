import { getSupabaseLogConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogRow = {
  id: string;
  created_at: string;
  source: "notify" | "poll";
  amount: string;
  balance: string;
  addat: string;
  ok: boolean;
  response_status: number;
  response_body: string;
};

type LogsResult =
  | { state: "not_configured" }
  | { state: "error"; message: string }
  | { state: "ok"; rows: LogRow[] };

async function fetchLogs(): Promise<LogsResult> {
  const config = getSupabaseLogConfig();
  if (!config) return { state: "not_configured" };

  try {
    const response = await fetch(
      `${config.url}/rest/v1/forward_logs?select=*&order=created_at.desc&limit=200`,
      {
        headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return { state: "error", message: `Supabase ตอบกลับ ${response.status}: ${await response.text()}` };
    }
    return { state: "ok", rows: await response.json() };
  } catch (error) {
    return { state: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Bangkok",
  });
}

export default async function LogsPage() {
  const result = await fetchLogs();

  return (
    <main className="logs">
      <h1>ประวัติการส่งไป p-points</h1>
      <p className="sub">รายการล่าสุด 200 รายการที่ระบบพยายามยิงไป p-points.com ทั้งจาก LINE/MacroDroid และ Gmail</p>

      {result.state === "not_configured" && (
        <p>
          ยังไม่ได้ตั้งค่า Supabase — ใส่ <code>SUPABASE_URL</code> และ{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> ใน environment variables ก่อน (ดู README)
        </p>
      )}

      {result.state === "error" && <p className="error">โหลด log ไม่สำเร็จ: {result.message}</p>}

      {result.state === "ok" && result.rows.length === 0 && <p>ยังไม่มีรายการ</p>}

      {result.state === "ok" && result.rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ช่องทาง</th>
                <th>จำนวนเงิน</th>
                <th>คงเหลือ</th>
                <th>สถานะ</th>
                <th>สิ่งที่ส่งไป (addat)</th>
                <th>คำตอบจาก p-points</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatTime(row.created_at)}</td>
                  <td>{row.source}</td>
                  <td>{row.amount}</td>
                  <td>{row.balance}</td>
                  <td className={row.ok ? "ok" : "fail"}>
                    {row.ok ? "สำเร็จ" : "ล้มเหลว"} ({row.response_status})
                  </td>
                  <td className="mono">{row.addat}</td>
                  <td className="mono">{row.response_body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
