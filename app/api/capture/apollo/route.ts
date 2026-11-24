import { NextRequest } from "next/server";
import { captureApollo } from "@/lib/capture";
import { CORS, body, captureKeyOk, errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(req: NextRequest) {
  if (!captureKeyOk(req)) return json({ error: "Wrong or missing capture key — set it in the extension." }, 401, true);
  const b = await body(req);
  const items = Array.isArray(b?.items) ? b!.items.filter((x: any) => typeof x?.id === "string").map((x: any) => ({ id: x.id, kind: (x.kind === "contact" ? "contact" : "person") as "person" | "contact" })) : [];
  if (!items.length) return json({ error: "No Apollo people found on this page — open a person, or tick people in the list." }, 400, true);
  try { return json(await captureApollo(items, String(b?.pageUrl || ""), String(b?.niche || "")), 200, true); }
  catch (e) { return json({ error: errMsg(e) }, 500, true); }
}
