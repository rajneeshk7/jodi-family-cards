import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jodi — the family card-matching game",
  description: "Flip the cards, find the pairs, beat your family.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#170a1f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
