import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
