"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

// Desktop notifications come from the browser, so they appear on the Mac like any other notification while the CRM is open in a tab.
export default function EnableNotifications() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission), []);
  if (perm === "unsupported") return null;
  if (perm === "granted") return <span className="muted row" style={{ gap: 6 }}><Bell size={14} aria-hidden /> Desktop notifications are on</span>;
  if (perm === "denied") return <span className="muted row" style={{ gap: 6 }}><BellOff size={14} aria-hidden /> Notifications are blocked: allow them for this site in the browser&apos;s address bar settings</span>;
  return <button type="button" className="secondary" onClick={async () => setPerm(await Notification.requestPermission())}><Bell size={14} aria-hidden /> Turn on desktop notifications</button>;
}
