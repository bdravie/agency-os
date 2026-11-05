"use client";

import dynamic from "next/dynamic";

// The editor and Mermaid load only here, in the browser, so no other page carries their weight.
export default dynamic(() => import("./Workspace"), {
  ssr: false,
  loading: () => <div className="fc fc-workspace"><p className="muted">Loading the editor…</p></div>,
});
