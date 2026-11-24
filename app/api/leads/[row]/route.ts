import { NextRequest } from "next/server";
import { leads } from "@/lib/leads";
import { logActivity } from "@/lib/activity";
import { body, errMsg, json } from "@/lib/http";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ row: string }> }) {
  const row = Number((await ctx.params).row);
  const b = await body(req);
  if (!row || (!b?.status && typeof b?.whatsapp !== "string")) return json({ error: "bad request" }, 400);
  if (typeof b?.whatsapp === "string") {
    try {
      const v = b.whatsapp === "No" ? "No" : String(b.whatsapp).replace(/[^\d+]/g, "");
      const l = await leads.setWhatsapp(row, v);
      await logActivity("WhatsApp", l.business, v === "No" ? "not on WhatsApp" : `on WhatsApp (${v})`);
      return json({ lead: l });
    } catch (e) { return json({ error: errMsg(e) }, 400); }
  }
  try {
    const before = await leads.byRow(row);
    const l = await leads.setStatus(row, String(b.status));
    await logActivity("Status", l.business, `${before?.status || "?"} → ${l.status}`);
    return json({ lead: l });
  } catch (e) { return json({ error: errMsg(e) }, 400); }
}
