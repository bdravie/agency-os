import { handleEvent, type Env } from "../shared/worker.ts";
import experiments from "../shared/experiments.json";

export const onRequestPost = ({ request, env, waitUntil }: { request: Request; env: Env; waitUntil: (p: Promise<unknown>) => void }) =>
  handleEvent(request, env, { waitUntil }, experiments.experiments.find((e) => e.status === "running") ?? experiments.experiments[0], { rand: Math.random, now: () => new Date() });
