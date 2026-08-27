import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE → p-points relay",
  description: "รับแจ้งเตือนเงินเข้าจาก LINE แล้วส่งต่อไป p-points.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
