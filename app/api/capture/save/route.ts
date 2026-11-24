import { NextRequest } from "next/server";
import { save } from "@/lib/capture";
import { CORS, body, captureKeyOk, errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(req: NextRequest) {
  if (!captureKeyOk(req)) return json({ error: "Wrong or missing capture key — set it in the extension." }, 401, true);
  const b = await body(req);
  if (!b) return json({ error: "bad request" }, 400, true);
  try { return json(await save(b.lead || {}, { apollo: !!b.apollo, via: "extension" }), 200, true); }
  catch (e) { return json({ error: errMsg(e) }, 500, true); }
}
