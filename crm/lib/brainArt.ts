// Where things are in public/brain/brain.webp, in percent of the square (the SVG overlay's 0-100 viewBox).
// Measured from the image itself (21 Nov 2026): the bright traces along the horizontal fissure and the two midline traces,
// which the signal pulses run along, and the eight coral nodes, two per lobe, which spark. If the art is replaced,
// measure again: the pulses only look right sitting on real traces.

import type { LobeKey } from "./brainLobes";

export type Trace = { key: string; d: string; length: number; lobes: LobeKey[] };

/** Each trace runs outward from the central socket, so a pulse reads as a signal leaving the core. */
export const TRACES: Trace[] = [
  { key: "up-left", d: "M48.6 42.6 V7.4", length: 35.2, lobes: ["find"] },
  { key: "up-right", d: "M51.3 42.6 V7.8", length: 34.8, lobes: ["sell"] },
  { key: "down-right", d: "M51.3 57.4 V93", length: 35.6, lobes: ["deliver"] },
  { key: "down-left", d: "M48.6 57.4 V93.3", length: 35.9, lobes: ["grow"] },
  { key: "fissure-left", d: "M42.2 49.9 H10.7", length: 31.5, lobes: ["find", "grow"] },
  { key: "fissure-right", d: "M57.8 49.9 H89.2", length: 31.4, lobes: ["sell", "deliver"] },
];

export const SPARKS: { lobe: LobeKey; x: number; y: number }[] = [
  { lobe: "find", x: 30.4, y: 7.8 }, { lobe: "find", x: 31.6, y: 38.3 },
  { lobe: "sell", x: 69.6, y: 7.8 }, { lobe: "sell", x: 68.4, y: 38.3 },
  { lobe: "deliver", x: 68.4, y: 64.2 }, { lobe: "deliver", x: 74.9, y: 86.1 },
  { lobe: "grow", x: 31.6, y: 64.2 }, { lobe: "grow", x: 25, y: 86.1 },
];
