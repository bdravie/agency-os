"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";

// Previews stay still until a card is hovered, focused or tapped. This switch plays them all at once (the .es-live class turns the motion on
// in app/content/styles.css). Under "reduce motion" nothing moves either way, so the switch says so instead of pretending.
export default function PlayScope({ lead, children }: { lead: React.ReactNode; children: React.ReactNode }) {
  const [live, setLive] = useState(false);
  return (
    <div className={`es${live ? " es-live" : ""}`}>
      <div className="es-bar">
        {lead}
        <button type="button" className="secondary" aria-pressed={live} onClick={() => setLive(!live)}>
          {live ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />} {live ? "Stop the previews" : "Play all previews"}
        </button>
      </div>
      {children}
    </div>
  );
}
