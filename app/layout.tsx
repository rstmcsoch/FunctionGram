import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RSTMC — Your world, shared",
  description: "Share the moments that matter. Photos, stories, reels, and conversations on RSTMC.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
