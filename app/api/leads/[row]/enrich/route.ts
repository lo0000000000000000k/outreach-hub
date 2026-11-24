import { NextRequest } from "next/server";
import { enrichRow } from "@/lib/capture";
import { body, errMsg, json } from "@/lib/http";
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ row: string }> }) {
  const row = Number((await ctx.params).row);
  const b = (await body(req)) || {};
  try { return json(await enrichRow(row, { apollo: !!b.apollo, via: "dashboard" })); }
  catch (e) { return json({ error: errMsg(e) }, 400); }
}
