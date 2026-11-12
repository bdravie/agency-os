import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  title: { default: "Agency OS", template: "%s · Agency OS" },
  appleWebApp: { capable: true, title: "Agency OS", statusBarStyle: "default" },   // added to an iPhone home screen, it opens full screen
};
// Browser bar colour on a phone: Cream in light mode, Navy in dark (raw hex, because metadata cannot read the CSS tokens).
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F4EDE0" }, { media: "(prefers-color-scheme: dark)", color: "#14213D" }] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const signedIn = await verifyToken(jar.get(COOKIE)?.value);
  const theme = jar.get("theme")?.value === "dark" ? "dark" : "light";
  const collapsed = jar.get("sidebar")?.value === "collapsed";
  return (
    <html lang="en-GB" data-theme={theme} className={`${display.variable} ${text.variable}`}>
      <body>
        {signedIn ? <AppShell demo={demoMode()} signOut={logout} theme={theme} collapsed={collapsed} rendered={Date.now()}>{children}</AppShell> : children}
      </body>
    </html>
  );
}
