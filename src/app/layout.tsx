import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Served from our own origin — no external CDN request, no layout shift.
// Two weights of a display cut for headings, the text cut for body: enough
// contrast to read as typeset rather than as browser default.
//
// The files are bundled rather than fetched by `next/font/google`, which
// downloads from fonts.gstatic.com AT BUILD TIME. That download failed once on
// Vercel and took a production deploy down with "Can't resolve
// '@vercel/turbopack-next/internal/font/google/font'" — the same commit having
// built green on the branch two seconds earlier, which is what a third-party
// network dependency in a build looks like when it breaks. Nothing about the
// rendered output changes: same families, same latin subset, same variable
// weight range, and next/font still hashes, preloads and metric-adjusts them.
const sans = localFont({
  src: "../assets/fonts/Inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans-next",
  display: "swap",
});

const display = localFont({
  src: "../assets/fonts/InterTight-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-display-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Auto Glass Marketing Pros Command Center",
  description: "Leads and call coaching platform for auto glass shops",
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
