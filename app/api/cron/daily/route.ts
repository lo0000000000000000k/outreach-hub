import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/auth";
import { leads } from "@/lib/leads";
import { enrichRow } from "@/lib/capture";
import { logActivity } from "@/lib/activity";
import { errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby-safe

// Vercel runs this every morning (vercel.json). It:
//  1. reads every lead's website for missing emails/socials (free),
//  2. if AUTO_ENRICH_PER_DAY > 0, asks Apollo for still-missing emails (uses credits, capped),
//  3. writes a one-line daily summary to the Log tab.
export async function GET(req: NextRequest) {
  const want = env.cronSecret();
  if (!want || !safeEqual(req.headers.get("authorization") || "", `Bearer ${want}`)) return json({ error: "Not allowed" }, 401);
  const started = Date.now();
  try {
    const all = await leads.all();
    const missing = all.filter((l) => !l.email && l.status !== "Closed").slice(0, 40);
    let fixedFree = 0, fixedApollo = 0, apolloUsed = 0;
    const budget = env.autoEnrichPerDay();
    for (const l of missing) {
      if (Date.now() - started > 45_000) break; // stay inside the time limit
      const useApollo = apolloUsed < budget;
      const r = await enrichRow(l.row, { apollo: useApollo, via: "daily automation" }).catch(() => null);
      if (r?.notes.some((n) => n.startsWith("Apollo:"))) apolloUsed++;
      if (r?.filled.includes("email")) (r.notes.some((n) => n.startsWith("Apollo: found")) ? fixedApollo++ : fixedFree++);
    }
    const sm = leads.summary(await leads.all());
    const line = `${sm.total} leads · ${sm.addedToday} today · ${sm.missingEmail} missing email · emails found: ${fixedFree} from websites, ${fixedApollo} from Apollo`;
    await logActivity("Daily run", "—", line);
    return json({ ok: true, summary: line, checked: missing.length, apolloUsed });
  } catch (e) { return json({ error: errMsg(e) }, 500); }
}
