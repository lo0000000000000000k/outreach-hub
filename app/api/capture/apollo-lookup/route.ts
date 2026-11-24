import { NextRequest } from "next/server";
import { findPerson, apolloById, companyPeople } from "@/lib/apollo";
import { domainOf } from "@/lib/extract";
import { CORS, body, captureKeyOk, errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

// Popup "Get from Apollo" button. Nothing is saved here — it only fills the form so the boss can check first.
//  • { id }            → that person's full record (may use ~1 credit for the email)
//  • person on the page → match them (may use ~1 credit)
//  • only a website     → list the people Apollo has at that company (0 credits) to pick from
export async function POST(req: NextRequest) {
  if (!captureKeyOk(req)) return json({ error: "Wrong or missing capture key — set it in the extension." }, 401, true);
  const b = await body(req);
  if (!b) return json({ error: "bad request" }, 400, true);
  const toFields = (a: { name: string; title: string; email: string; linkedin: string; country: string; company: string; domain?: string; website?: string; industry?: string; phone?: string }) => ({
    founder: a.name, title: a.title, email: a.email, linkedin: a.linkedin, country: a.country, business: a.company,
    website: domainOf(a.domain || a.website || ""), niche: a.industry || "", phone: a.phone || "",
  });
  try {
    if (typeof b.id === "string") {
      const a = await apolloById(b.id, "person");
      return a ? json({ mode: "person", fields: toFields(a) }, 200, true) : json({ error: "Apollo had no record for that person." }, 404, true);
    }
    const l = b.lead || {};
    const domain = domainOf(String(l.website || ""));
    const li = /linkedin\.com\/in\//.test(String(l.linkedin || "")) ? String(l.linkedin) : "";
    const name = String(l.founder || "").trim();
    if (li || (name && (domain || l.business))) {
      const m = await findPerson({ linkedin: li || undefined, name: name || undefined, domain: domain || undefined, company: String(l.business || "") || undefined });
      if (m) return json({ mode: "person", fields: toFields({ ...m, website: m.website }) }, 200, true);
      if (!domain) return json({ error: "Apollo couldn't find this person." }, 404, true);
    }
    if (!domain) return json({ error: "Add a website or a person's LinkedIn first, then try again." }, 400, true);
    const c = await companyPeople(domain);
    return json({ mode: "company", domain, total: c.total, people: c.people }, 200, true);
  } catch (e) { return json({ error: errMsg(e) }, 400, true); }
}
