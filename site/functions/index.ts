import { handleHome, type Env } from "../shared/worker.ts";
import experiments from "../shared/experiments.json";

export const onRequestGet = ({ request, env, waitUntil }: { request: Request; env: Env; waitUntil: (p: Promise<unknown>) => void }) =>
  handleHome(request, env, { waitUntil }, experiments.experiments.find((e) => e.status === "running") ?? experiments.experiments[0], { rand: Math.random, now: () => new Date() });
