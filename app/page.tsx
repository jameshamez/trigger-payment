"use client";

import { useState } from "react";
import Link from "next/link";

const SAMPLE = `รายการเงินเข้า
26 ส.ค. 69 15:07 น.
เข้าบัญชี xxx-x-x8972-x
จำนวนเงิน 200.00 บาท
ยอดเงินคงเหลือ 207.85 บาท`;

export default function Home() {
  const [text, setText] = useState(SAMPLE);
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, dryRun }),
      });
      setResult({ httpStatus: response.status, ...(await response.json()) });
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>LINE → p-points relay</h1>
      <p className="sub">
        วางข้อความแจ้งเตือนจาก LINE (K PLUS) แล้วกดส่ง เพื่อดูค่าที่ระบบอ่านได้
        และ URL ที่จะยิงไป p-points.com — ดู <Link href="/logs">ประวัติการส่ง</Link> ทั้งหมดได้ที่นี่
      </p>

      <label htmlFor="text">ข้อความแจ้งเตือน</label>
      <textarea
        id="text"
        value={text}
        rows={8}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="row">
        <label className="check">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
          />
          Dry run (ไม่ยิงไป p-points.com จริง)
        </label>
        <button onClick={send} disabled={busy}>
          {busy ? "กำลังส่ง..." : "ส่ง"}
        </button>
      </div>

      {result !== null && (
        <>
          <label>ผลลัพธ์</label>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </>
      )}
    </main>
  );
}
