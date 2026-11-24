import { NextRequest } from "next/server";
import { leads } from "@/lib/leads";
import { save } from "@/lib/capture";
import { body, errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const all = await leads.all();
    return json({ leads: all.sort((a, b) => (a.dateAdded < b.dateAdded ? 1 : a.dateAdded > b.dateAdded ? -1 : b.row - a.row)), summary: leads.summary(all), demo: leads.isDemo() });
  } catch (e) { return json({ error: errMsg(e) }, 500); }
}

// Manual add from the dashboard (same pipeline as the extension).
export async function POST(req: NextRequest) {
  const b = await body(req);
  if (!b) return json({ error: "bad request" }, 400);
  try { return json(await save(b.lead || {}, { apollo: !!b.apollo, via: "dashboard" })); }
  catch (e) { return json({ error: errMsg(e) }, 500); }
}
