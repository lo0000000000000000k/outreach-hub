import { NextRequest } from "next/server";
import { captureApollo } from "@/lib/capture";
import { body, errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Dashboard: add chosen people from "People at this company" (each email found may use an Apollo credit).
export async function POST(req: NextRequest) {
  const b = await body(req);
  const ids: string[] = Array.isArray(b?.ids) ? b!.ids.filter((x: unknown) => typeof x === "string").slice(0, 25) : [];
  if (!ids.length) return json({ error: "Pick at least one person." }, 400);
  try { return json(await captureApollo(ids.map((id) => ({ id, kind: "person" as const })), String(b?.sourceUrl || "apollo company lookup"), String(b?.niche || ""))); }
  catch (e) { return json({ error: errMsg(e) }, 500); }
}
