import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { demoMode } from "@/lib/db";

export const metadata: Metadata = { title: "Agency OS" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        {demoMode() && <div className="demo">DEMO MODE: fake data only</div>}
        <Nav />
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
