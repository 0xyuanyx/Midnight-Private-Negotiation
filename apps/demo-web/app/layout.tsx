import type { Metadata } from "next";
import "pretendard/dist/web/static/pretendard.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midnight 비공개 협상 데모",
  description:
    "Buyer, Seller, Observer의 비공개 가격 협상 과정을 보여주는 3패널 프레젠테이션 화면",
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
