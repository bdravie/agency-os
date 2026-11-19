import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const work = Work_Sans({ subsets: ["latin"], variable: "--font-work", display: "swap" });

export const metadata: Metadata = {
  title: "Thistledown Home help (demo)",
  description: "Demo: a support chat that answers from a shop's own help pages and hands anything else to a person.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbf9f4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${fraunces.variable} ${work.variable}`}>
      <body className="font-sans antialiased min-h-svh">
        <div className="bg-ink text-cream text-xs sm:text-sm text-center px-4 py-2">
          <strong className="font-semibold">Demo.</strong> Thistledown Home is a made-up shop. Use made-up details only.
        </div>
        {children}
      </body>
    </html>
  );
}
