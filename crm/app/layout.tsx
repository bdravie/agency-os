import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { demoMode } from "@/lib/db";
import { COOKIE, verifyToken } from "@/lib/session";
import { logout } from "./login/actions";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = { title: { default: "Agency OS", template: "%s · Agency OS" } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await verifyToken((await cookies()).get(COOKIE)?.value);
  return (
    <html lang="en-GB" className={inter.variable}>
      <body>
        {signedIn ? <AppShell demo={demoMode()} signOut={logout}>{children}</AppShell> : children}
      </body>
    </html>
  );
}
