import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lyrisphere Web",
  description: "VRChat DJ Event System - My Page",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
