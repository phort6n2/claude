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
// weight range, and next/font still hashes and preloads them. The metric
// adjustment is ours, not next/font's — see the fallback faces in globals.css.
const sans = localFont({
  src: "../assets/fonts/Inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans-next",
  display: "swap",
  // Our own size-adjusted faces, per weight and per platform — see the note
  // above them in globals.css. next/font's single local("Arial") face does not
  // exist on Android or Linux, which is where the headline re-wrapped.
  adjustFontFallback: false,
  fallback: ["gl-sans-arial", "gl-sans-roboto"],
});

const display = localFont({
  src: "../assets/fonts/InterTight-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-display-next",
  // OPTIONAL, not swap: the heading face is the one whose arrival moves the
  // page. Every hero H1 is display type at 30px+, and the size-adjusted
  // fallbacks only match where Arial, Liberation Sans or Roboto exist — on a
  // machine with none of them the stack falls to system-ui, AGS's
  // /windshield-replacement H1 re-wrapped from three lines to two at ~4s and
  // pushed the quote form (CLS 0.209 in that case). With `optional` the
  // browser gives the file ~100ms (it is preloaded, so a warm or fast visit
  // gets it) and otherwise keeps the matched fallback for that page view
  // instead of swapping late. Body text stays `swap`: at 17px its re-flow
  // measured 0.003.
  display: "optional",
  adjustFontFallback: false,
  fallback: ["gl-display-arial", "gl-display-roboto"],
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
