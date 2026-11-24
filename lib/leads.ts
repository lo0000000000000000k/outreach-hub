// The lead sheet. Talks to Google Sheets with a service account, or uses
// demo leads when the sheet isn't connected yet.
import { importPKCS8, SignJWT } from "jose";
import { env, NotConfigured, sheetConfigured } from "./env";
import { domainOf, igHandle, liKey } from "./extract";

export const STATUSES = ["New", "Contacted", "Replied", "Meeting", "Closed"] as const;
export type Status = (typeof STATUSES)[number];

export type Lead = {
  row: number; // sheet row number = stable id
  business: string; founder: string; title: string; website: string; email: string; phone: string; whatsapp: string;
  instagram: string; linkedin: string; niche: string; country: string;
  sourceUrl: string; dateAdded: string; status: Status | string;
};
export type NewLead = Partial<Omit<Lead, "row" | "dateAdded" | "status">>;

// Sheet header → field. Matching is case/space-insensitive so the boss can tidy headers.
// `founder` is shown as "Person Name" in the sheet (old sheets used "Founder" — still read, renamed automatically).
const COLUMNS: [Exclude<keyof Lead, "row">, string][] = [
  ["business", "Business Name"], ["founder", "Person Name"], ["title", "Job Title"], ["website", "Website"], ["email", "Email"],
  ["phone", "Phone"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["niche", "Niche"],
  ["country", "Country"], ["sourceUrl", "Source URL"], ["dateAdded", "Date Added"], ["status", "Status"],
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
// Old header names → new ones.
const RENAMES: Record<string, string> = { founder: "Person Name", phonewhatsapp: "Phone" };

// ── Dedupe ────────────────────────────────────────────────────────────
export function dedupeKeys(l: Partial<Lead>): string[] {
  const keys: string[] = [];
  const domain = domainOf(l.website || "");
  if (domain) keys.push(`d:${domain}`);
  if (l.email) keys.push(`e:${l.email.trim().toLowerCase()}`);
  const ig = igHandle(l.instagram || "");
  if (ig) keys.push(`i:${ig}`);
  const li = liKey(l.linkedin || "");
  if (li) keys.push(`l:${li}`);
  for (const ph of [l.phone, l.whatsapp]) {
    const d = (ph || "").replace(/\D/g, "");
    if (d.length >= 9) keys.push(`p:${d.slice(-9)}`);
  }
  return keys;
}
export function findDuplicate(existing: Lead[], incoming: Partial<Lead>): Lead | undefined {
  const keys = new Set(dedupeKeys(incoming));
  if (!keys.size) return existing.find((l) => l.business.trim().toLowerCase() === (incoming.business || "").trim().toLowerCase());
  return existing.find((l) => dedupeKeys(l).some((k) => keys.has(k)));
}

/** Pure: old header → new header (renames, then missing columns added at the end). */
export function migratedHeader(header: string[]): string[] {
  const next = header.map((h) => RENAMES[norm(h)] || h);
  const have = new Set(next.map(norm));
  for (const [, name] of COLUMNS) if (!have.has(norm(name))) next.push(name);
  return next;
}

// ── Google Sheets ─────────────────────────────────────────────────────
let tokenCache: { token: string; exp: number } | null = null;
async function googleToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const key = await importPKCS8(env.googleKey(), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.googleEmail()).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status})`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}
async function sheets(pathAndQuery: string, init: RequestInit = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.sheetId()}/${pathAndQuery}`, {
    ...init,
    headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sheet error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const colLetter = (i: number) => {
  let s = ""; i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
};

const sheetBackend = {
  async read(): Promise<{ leads: Lead[]; header: string[] }> {
    const tab = encodeURIComponent(env.sheetTab());
    const j = await sheets(`values/${tab}!A1:Z10000`);
    const [rawHeader = [], ...rows]: string[][] = j.values || [];
    const header = await this.migrateHeader(rawHeader);
    const idx = new Map(header.map((h, i) => [norm(h), i]));
    const leads = rows.map((r, i) => {
      const l: Record<string, unknown> = { row: i + 2 };
      for (const [field, name] of COLUMNS) l[field] = (r[idx.get(norm(name)) ?? -1] ?? "").trim();
      return l as Lead;
    }).filter((l) => l.business || l.email || l.website || l.instagram || l.linkedin);
    return { leads, header };
  },
  /** Renames old columns (Founder → Person Name, Phone/WhatsApp → Phone) and adds new ones at the end. Data stays put. */
  async migrateHeader(header: string[]): Promise<string[]> {
    if (!header.length) return header;
    const next = migratedHeader(header);
    if (next.join("\u0001") !== header.join("\u0001")) {
      const tab = encodeURIComponent(env.sheetTab());
      await sheets(`values/${tab}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [next] }) });
    }
    return next;
  },
  async ensureHeader(header: string[]): Promise<string[]> {
    if (header.length) return header;
    const names = COLUMNS.map(([, n]) => n);
    const tab = encodeURIComponent(env.sheetTab());
    await sheets(`values/${tab}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [names] }) });
    return names;
  },
  async append(l: Omit<Lead, "row">, header: string[]): Promise<number> {
    header = await this.ensureHeader(header);
    const byNorm = new Map(COLUMNS.map(([f, n]) => [norm(n), f]));
    const values = header.map((h) => { const f = byNorm.get(norm(h)); return f ? String(l[f] ?? "") : ""; });
    const tab = encodeURIComponent(env.sheetTab());
    const j = await sheets(`values/${tab}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST", body: JSON.stringify({ values: [values] }),
    });
    const m = /!(?:[A-Z]+)(\d+)/.exec(j.updates?.updatedRange || "");
    return m ? Number(m[1]) : 0;
  },
  async update(row: number, patch: Partial<Lead>, header: string[]) {
    const data = Object.entries(patch).flatMap(([field, value]) => {
      const name = COLUMNS.find(([f]) => f === field)?.[1];
      const i = name ? header.findIndex((h) => norm(h) === norm(name)) : -1;
      return i < 0 ? [] : [{ range: `${env.sheetTab()}!${colLetter(i)}${row}`, values: [[String(value ?? "")]] }];
    });
    if (!data.length) return;
    await sheets(`values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
  },
};

// ── Demo backend (until the sheet is connected) ───────────────────────
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
const DEMO_ROWS = [
  ["Northline Media", "Sarah Cole", "Founder", "northlinemedia.co.uk", "sarah@northlinemedia.co.uk", "", "", "https://instagram.com/northlinemedia", "https://linkedin.com/in/sarahcole", "Marketing agency", "UK", "", daysAgo(0), "New"],
  ["Peak Realty Dubai", "Omar Haddad", "Founder", "peakrealty.ae", "omar@peakrealty.ae", "+971500000001", "+971500000001", "https://instagram.com/peakrealtydxb", "", "Real estate", "UAE", "", daysAgo(0), "New"],
  ["FitForge", "Jake Turner", "Founder", "fitforge.com", "jake@fitforge.com", "", "", "https://instagram.com/fitforge", "", "Fitness coaching", "US", "", daysAgo(1), "Contacted"],
  ["Brightside Dental", "Dr. Emma Ross", "Founder", "brightsidedental.com.au", "", "", "", "", "https://linkedin.com/in/emmaross", "Dental clinic", "Australia", "", daysAgo(2), "Contacted"],
  ["Loop Studios", "Marcus Lee", "Founder", "loopstudios.io", "marcus@loopstudios.io", "", "", "https://instagram.com/loopstudios", "https://linkedin.com/in/marcuslee", "Podcast", "US", "", daysAgo(3), "Replied"],
  ["Coachly", "Priya Nair", "Founder", "coachly.ca", "priya@coachly.ca", "", "", "https://instagram.com/coachly", "", "Business coaching", "Canada", "", daysAgo(5), "Meeting"],
  ["Gritt Gym", "Tom Baker", "Founder", "grittgym.com", "", "", "", "https://instagram.com/grittgym", "", "Fitness coaching", "US", "", daysAgo(7), "Contacted"],
  ["Nova Creatives", "Lena Fischer", "Founder", "novacreatives.de", "lena@novacreatives.de", "", "", "", "", "Marketing agency", "Germany", "", daysAgo(9), "Closed"],
];
let demo: Lead[] = [];
export function resetDemo() {
  demo = DEMO_ROWS.map((r, i) => {
    const l: Record<string, unknown> = { row: i + 2 };
    COLUMNS.forEach(([f], j) => (l[f] = r[j]));
    return l as Lead;
  });
}
resetDemo();

const demoBackend = {
  async read() { return { leads: demo.map((l) => ({ ...l })), header: COLUMNS.map(([, n]) => n) }; },
  async append(l: Omit<Lead, "row">) { const row = demo.length + 2; demo.push({ ...l, row }); return row; },
  async update(row: number, patch: Partial<Lead>) { const l = demo.find((x) => x.row === row); if (l) Object.assign(l, patch); },
};

function backend() {
  if (sheetConfigured()) return { b: sheetBackend, demo: false };
  if (env.demoAllowed()) return { b: demoBackend, demo: true };
  throw new Error("The Google Sheet isn't connected yet: fill in GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and LEADS_SHEET_ID with your real values (SETUP.md step 2), or set DEMO=1 to try it with demo leads.");
}

const FILLABLE = ["business", "founder", "title", "website", "email", "phone", "whatsapp", "instagram", "linkedin", "niche", "country", "sourceUrl"] as const;
const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) : "");

// ── Public API ────────────────────────────────────────────────────────
export const leads = {
  isDemo: () => backend().demo,
  async all(): Promise<Lead[]> { return (await backend().b.read()).leads; },
  async byRow(row: number) { return (await this.all()).find((l) => l.row === row); },

  /** Adds a new lead, or — if it's already in the sheet — fills only its EMPTY cells (never overwrites). */
  async addOrMerge(input: NewLead): Promise<
    | { action: "added"; lead: Lead }
    | { action: "updated" | "duplicate"; lead: Lead; filled: string[] }
  > {
    const { b } = backend();
    const { leads: existing, header } = await b.read();
    const dup = findDuplicate(existing, input);
    if (dup) {
      const patch: Partial<Lead> = {};
      for (const f of FILLABLE) { const v = clean(input[f]); if (v && !dup[f]) (patch as any)[f] = v; }
      const filled = Object.keys(patch);
      if (filled.length) { await b.update(dup.row, patch, header); return { action: "updated", lead: { ...dup, ...patch }, filled }; }
      return { action: "duplicate", lead: dup, filled: [] };
    }
    const lead: Omit<Lead, "row"> = {
      business: clean(input.business) || clean(input.founder) || clean(input.website) || "Unknown",
      founder: clean(input.founder), title: clean(input.title), website: clean(input.website), email: clean(input.email),
      phone: clean(input.phone), whatsapp: clean(input.whatsapp), instagram: clean(input.instagram), linkedin: clean(input.linkedin),
      niche: clean(input.niche), country: clean(input.country), sourceUrl: clean(input.sourceUrl),
      dateAdded: new Date().toISOString().slice(0, 10), status: "New",
    };
    const row = await b.append(lead, header);
    return { action: "added", lead: { ...lead, row } };
  },

  /** Fill empty cells of one row (enrichment). */
  async fill(row: number, data: Partial<Lead>) {
    const { b } = backend();
    const { leads: existing, header } = await b.read();
    const l = existing.find((x) => x.row === row);
    if (!l) throw new Error("That lead isn't in the sheet any more.");
    const patch: Partial<Lead> = {};
    for (const f of FILLABLE) { const v = clean(data[f]); if (v && !l[f]) (patch as any)[f] = v; }
    if (Object.keys(patch).length) await b.update(row, patch, header);
    return { lead: { ...l, ...patch }, filled: Object.keys(patch) };
  },

  /** WhatsApp check result: the number (on WhatsApp) or "No". This field may be overwritten. */
  async setWhatsapp(row: number, value: string) {
    const { b } = backend();
    const { leads: existing, header } = await b.read();
    const l = existing.find((x) => x.row === row);
    if (!l) throw new Error("That lead isn't in the sheet any more.");
    await b.update(row, { whatsapp: value.slice(0, 40) }, header);
    return { ...l, whatsapp: value };
  },

  async setStatus(row: number, status: string) {
    if (!(STATUSES as readonly string[]).includes(status)) throw new Error("Unknown status");
    const { b } = backend();
    const { leads: existing, header } = await b.read();
    const l = existing.find((x) => x.row === row);
    if (!l) throw new Error("That lead isn't in the sheet any more.");
    await b.update(row, { status }, header);
    return { ...l, status };
  },

  summary(all: Lead[]) {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, all.filter((l) => l.status === s).length]));
    return {
      total: all.length, byStatus,
      addedToday: all.filter((l) => l.dateAdded === today).length,
      addedThisWeek: all.filter((l) => l.dateAdded >= weekAgo).length,
      missingEmail: all.filter((l) => !l.email).length,
      niches: [...new Set(all.map((l) => l.niche).filter(Boolean))].sort(),
      countries: [...new Set(all.map((l) => l.country).filter(Boolean))].sort(),
    };
  },
};

// Low-level access for the activity log tab.
export const sheetRaw = { sheets, enabled: sheetConfigured };
