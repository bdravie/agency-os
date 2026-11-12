"use client";

import { useEffect, useRef } from "react";
import { startParticles } from "@/lib/particleField";

// The drifting dots behind the dashboard hero. Decoration only: hidden from screen readers and never in the way of a click.
export default function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => (ref.current ? startParticles(ref.current) : undefined), []);
  return <canvas ref={ref} className="hero-particles" aria-hidden />;
}
