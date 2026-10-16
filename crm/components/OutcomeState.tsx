import { Pill } from "./ui";
import type { State } from "@/lib/outcomeMath";

const MAP: Record<State, { label: string; tone: "good" | "blue" | "warn" | "bad" | "neutral" }> = {
  improving: { label: "Improving", tone: "good" }, mixed: { label: "Mixed", tone: "blue" }, flat: { label: "Flat", tone: "warn" },
  slipping: { label: "Slipping", tone: "bad" }, no_data: { label: "No results logged", tone: "bad" }, stale: { label: "Results out of date", tone: "bad" }, early: { label: "Too early", tone: "neutral" },
};
export default function OutcomeState({ state }: { state: State }) { return <Pill label={MAP[state].label} tone={MAP[state].tone} />; }
