import { handleStats, type Env } from "../../shared/worker.ts";
import experiments from "../../shared/experiments.json";

export const onRequestGet = ({ request, env }: { request: Request; env: Env }) => handleStats(request, env, experiments.experiments);
