import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Viz",
  description: "Codex sessions 可视化（本地）"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-dvh antialiased">
        <div className="mx-auto max-w-7xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
