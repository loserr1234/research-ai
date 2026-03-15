import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research AI",
  description: "AI-powered research agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
