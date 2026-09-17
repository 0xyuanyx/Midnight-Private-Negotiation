import type { Metadata } from "next";
import "pretendard/dist/web/static/pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midnight B2B 비공개 견적 협상",
  description:
    "GPU 서버 10대 견적에서 Buyer와 Seller의 예약 가격을 보호하는 Midnight 3패널 데모",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
