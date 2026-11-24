import { NextRequest } from "next/server";
import { normalizeCapture } from "@/lib/extract";
import { save } from "@/lib/capture";
import { CORS, body, captureKeyOk, errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

// Alt+Shift+S on any normal page: clean what the page shows and save it straight away (no popup).
export async function POST(req: NextRequest) {
  if (!captureKeyOk(req)) return json({ error: "Wrong or missing capture key — set it in the extension." }, 401, true);
  const b = await body(req);
  if (!b) return json({ error: "bad request" }, 400, true);
  try {
    const d = normalizeCapture(b.captured || {});
    if (b.niche && !d.niche) d.niche = String(b.niche).slice(0, 60);
    return json(await save(d, { apollo: !!b.apollo, via: "Alt+Shift+S" }), 200, true);
  } catch (e) { return json({ error: errMsg(e) }, 500, true); }
}
