"use client";

import { useEffect } from "react";

// Opens the collapsed panel named in the address (#find, #maps) when you arrive or click a link to it.
export default function OpenTarget() {
  useEffect(() => {
    const open = () => { const el = document.getElementById(window.location.hash.slice(1)); if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); } };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
