// The capture pipeline: page data → clean lead → (free website scan) → (Apollo, if asked) → sheet.
import { normalizeCapture, domainOf, pickEmail, pickPhone, igUrl, liUrl, type Captured, type LeadDraft } from "./extract";
import { leads, findDuplicate } from "./leads";
import { scanWebsite } from "./website";
import { findPerson, apolloById } from "./apollo";
import { logActivity } from "./activity";

export async function preview(c: Captured) {
  const draft = normalizeCapture(c);
  const all = await leads.all();
  const dup = findDuplicate(all, draft);
  const sm = leads.summary(all);
  return {
    draft,
    duplicate: dup ? { row: dup.row, business: dup.business, status: dup.status, dateAdded: dup.dateAdded } : null,
    niches: sm.niches, countries: sm.countries, demo: leads.isDemo(),
  };
}

/** Fill gaps: first the lead's own website (free), then Apollo (credits) only if allowed and still no email. */
export async function enrichDraft(d: LeadDraft, opts: { apollo: boolean }) {
  const notes: string[] = [];
  const out = { ...d };
  const domain = domainOf(out.website);
  if (domain && (!out.email || !out.instagram || !out.linkedin || !out.phone)) {
    const w = await scanWebsite(domain);
    if (w.pages) {
      const found: string[] = [];
      if (!out.email) { out.email = pickEmail(w.emails, domain); if (out.email) found.push("email"); }
      if (!out.phone) { out.phone = pickPhone(w.phones.filter((p) => !/wa\.me|whatsapp/i.test(p))); if (out.phone) found.push("phone"); }
      if (!out.whatsapp) { out.whatsapp = pickPhone(w.phones.filter((p) => /wa\.me|whatsapp/i.test(p))); if (out.whatsapp) found.push("WhatsApp"); }
      if (!out.instagram && w.instagram) { out.instagram = igUrl(w.instagram); if (out.instagram) found.push("Instagram"); }
      if (!out.linkedin && w.linkedin) { out.linkedin = liUrl(w.linkedin); if (out.linkedin) found.push("LinkedIn"); }
      if (!out.business && (w.siteName || w.title)) out.business = (w.siteName || w.title.split(/[|–—-]/)[0]).trim();
      if (found.length) notes.push(`Website: found ${found.join(", ")}`);
    }
  }
  if (opts.apollo && !out.email) {
    const m = await findPerson({ linkedin: /linkedin\.com\/in\//.test(out.linkedin) ? out.linkedin : undefined, name: out.founder || undefined, domain: domain || undefined, company: out.business || undefined });
    if (m?.email) {
      out.email = m.email;
      out.founder ||= m.name;
      out.title ||= m.title;
      out.website ||= domainOf(m.website);
      out.country ||= m.country;
      notes.push(`Apollo: found ${m.email}${m.emailStatus ? ` (${m.emailStatus})` : ""}`);
    } else notes.push("Apollo: no email found");
  }
  return { draft: out, notes };
}

export async function save(input: Partial<LeadDraft>, opts: { apollo: boolean; via: string }) {
  const base = normalizeCapture({ ...input, kind: "website", pageUrl: input.sourceUrl, emails: input.email ? [input.email] : [], phones: input.phone ? [input.phone] : [] } as Captured);
  // Keep the boss's own edits exactly (normalizeCapture only cleans the shape).
  const draft: LeadDraft = {
    ...base, business: (input.business || base.business || "").trim(), founder: (input.founder || "").trim(), title: (input.title || "").trim(),
    niche: (input.niche || "").trim(), country: (input.country || base.country || "").trim(),
    phone: base.phone, whatsapp: pickPhone([input.whatsapp || ""]) || (input.whatsapp === "No" ? "No" : ""),
  };
  if (!draft.business && !draft.website && !draft.instagram && !draft.linkedin && !draft.email)
    return { ok: false as const, error: "Nothing to save — add at least a name, website or profile." };
  const { draft: rich, notes } = await enrichDraft(draft, opts);
  const r = await leads.addOrMerge(rich);
  const detail = [r.action === "updated" ? `filled ${("filled" in r ? r.filled : []).join(", ")}` : "", ...notes, `via ${opts.via}`].filter(Boolean).join(" · ");
  await logActivity(r.action === "added" ? "Added" : r.action === "updated" ? "Updated" : "Duplicate", r.lead.business, detail);
  return { ok: true as const, action: r.action, lead: r.lead, filled: "filled" in r ? r.filled : [], notes };
}

/** Enrich a lead that's already in the sheet. */
export async function enrichRow(row: number, opts: { apollo: boolean; via: string }) {
  const l = await leads.byRow(row);
  if (!l) throw new Error("That lead isn't in the sheet any more.");
  const { draft, notes } = await enrichDraft({ business: l.business, founder: l.founder, title: l.title, website: l.website, email: l.email, phone: l.phone, whatsapp: l.whatsapp, instagram: l.instagram, linkedin: l.linkedin, niche: l.niche, country: l.country, sourceUrl: l.sourceUrl }, opts);
  const r = await leads.fill(row, draft);
  await logActivity("Enriched", l.business, [r.filled.length ? `filled ${r.filled.join(", ")}` : "nothing new", ...notes, `via ${opts.via}`].join(" · "));
  return { lead: r.lead, filled: r.filled, notes };
}

/** Instant save from the Apollo web app: ids → Apollo API → sheet. */
export async function captureApollo(items: { id: string; kind: "person" | "contact" }[], pageUrl: string, niche = "") {
  const out = { added: 0, updated: 0, duplicate: 0, failed: 0, names: [] as string[], errors: [] as string[] };
  for (const it of items.slice(0, 25)) {
    try {
      const a = await apolloById(it.id, it.kind);
      if (!a) { out.failed++; continue; }
      const r = await save({
        business: a.company || a.name, founder: a.name, title: a.title, email: a.email, website: a.domain, linkedin: a.linkedin,
        phone: a.phone, country: a.country, niche: niche || a.industry, sourceUrl: pageUrl,
      }, { apollo: false, via: "Apollo (Alt+Shift+S)" });
      if (!r.ok) { out.failed++; continue; }
      out[r.action === "added" ? "added" : r.action === "updated" ? "updated" : "duplicate"]++;
      out.names.push(r.lead.business);
    } catch (e) { out.failed++; out.errors.push(e instanceof Error ? e.message : String(e)); if (/refused|rate limit/i.test(String(e))) break; }
  }
  return out;
}
