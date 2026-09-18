import type { Metadata } from "next";
import "pretendard/dist/web/static/pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midnight 하도급 비공개 단가 협상",
  description:
    "하도급 부품 납품 단가 협상에서 Buyer와 Seller의 예약 가격을 보호하는 Midnight 3패널 데모",
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
