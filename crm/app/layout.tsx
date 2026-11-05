import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { demoMode } from "@/lib/db";
import { COOKIE, verifyToken } from "@/lib/session";
import { logout } from "./login/actions";

// Brand type (BRAND_SHEET.md): a characterful grotesque for titles and numbers, a calm text face for everything else.
const display = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--font-display" });
const text = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-text" });

export const metadata: Metadata = { title: { default: "Agency OS", template: "%s · Agency OS" } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const signedIn = await verifyToken(jar.get(COOKIE)?.value);
  const theme = jar.get("theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang="en-GB" data-theme={theme} className={`${display.variable} ${text.variable}`}>
      <body>
        {signedIn ? <AppShell demo={demoMode()} signOut={logout} theme={theme} rendered={Date.now()}>{children}</AppShell> : children}
      </body>
    </html>
  );
}
