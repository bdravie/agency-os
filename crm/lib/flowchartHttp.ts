import { requireLogin } from "./auth";
import { BODY_MAX } from "./flowchartMath";
import { sameOrigin, type Reply } from "./flowchartApi";

// The wrapper every flowchart route runs through. Middleware has already checked the session; this is the second check, and it also stops other sites writing.
export async function respond(req: Request, run: () => Promise<Reply>): Promise<Response> {
  const send = ({ status, body }: Reply) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    await requireLogin();
  } catch {
    return send({ status: 401, body: { error: "You have been signed out." } });
  }
  if (req.method !== "GET") {
    if (!sameOrigin(req.headers.get("origin"), [req.headers.get("x-forwarded-host"), req.headers.get("host")])) return send({ status: 403, body: { error: "Refused." } });
    if (Number(req.headers.get("content-length") ?? 0) > BODY_MAX) return send({ status: 413, body: { error: "That is too large to save." } });
  }
  try {
    return send(await run());
  } catch (err) {
    console.error("flowcharts:", err instanceof Error ? err.message : "unknown error");   // never the diagram itself
    return send({ status: 500, body: { error: "Something went wrong saving that. Try again." } });
  }
}
