import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

// Self-hosted by next/font — no external CDN request, no layout shift.
// Two weights of a display cut for headings, the text cut for body: enough
// contrast to read as typeset rather than as browser default.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-next",
  display: "swap",
});

const display = Inter_Tight({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Auto Glass Marketing Pros Command Center",
  description: "Content automation platform for auto glass shops",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
