// Turning messy page data into clean lead fields. Pure functions — easy to test.

const SOCIAL = /(^|\.)(instagram|linkedin|facebook|fb|twitter|x|tiktok|youtube|wa|whatsapp|linktr|t)\.(com|me|ee|co)$/i;

export function domainOf(u: string): string {
  const s = (u || "").trim().toLowerCase();
  if (!s || s.includes("@")) return "";
  return s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
}

export function igHandle(u: string): string {
  const s = (u || "").trim().toLowerCase();
  if (!s) return "";
  const m = /instagram\.com\/([a-z0-9._]{1,30})/.exec(s);
  const h = m ? m[1] : s.replace(/^@/, "");
  return /^[a-z0-9._]{1,30}$/.test(h) && !["p", "reel", "reels", "explore", "stories", "accounts"].includes(h) ? h : "";
}

export function liKey(u: string): string {
  const m = /linkedin\.com\/(in|company|school)\/([^/?#]+)/i.exec(u || "");
  return m ? `${m[1].toLowerCase()}/${decodeURIComponent(m[2]).toLowerCase()}` : "";
}

export const cleanUrl = (u: string) => {
  const d = domainOf(u);
  return d && d.includes(".") ? d : "";
};
export const igUrl = (u: string) => { const h = igHandle(u); return h ? `https://instagram.com/${h}` : ""; };
export const liUrl = (u: string) => { const k = liKey(u); return k ? `https://www.linkedin.com/${k}` : ""; };

const FREEMAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|aol|proton|protonmail|zoho|gmx|mail|yandex|rediffmail)\./i;
const JUNK_EMAIL = /(example\.|sentry|wixpress|godaddy|domain\.com|email\.com|yourdomain|@2x|\.(png|jpe?g|gif|webp|svg)$|noreply|no-reply|donotreply)/i;
export function pickEmail(cands: string[], domain = ""): string {
  const list = [...new Set(cands.map((c) => c.trim().toLowerCase().replace(/^mailto:/, "").split("?")[0]))]
    .filter((c) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(c) && !JUNK_EMAIL.test(c));
  const own = list.filter((c) => domain && c.endsWith("@" + domain));
  const pool = own.length ? own : list;
  // A person beats a generic inbox.
  const generic = /^(info|hello|contact|support|admin|office|team|sales|enquiries|enquiry|help|mail)@/;
  return pool.find((c) => !generic.test(c)) || pool[0] || "";
}

export function pickPhone(cands: string[]): string {
  for (const c of cands) {
    const raw = c.replace(/^tel:/, "").replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)\/?/, "");
    const digits = raw.replace(/[^\d+]/g, "");
    if (digits.replace(/\D/g, "").length >= 8 && digits.replace(/\D/g, "").length <= 15) return digits.startsWith("+") ? digits : digits;
  }
  return "";
}

const TLD_COUNTRY: [RegExp, string][] = [
  [/\.ae$/, "UAE"], [/\.(co\.)?uk$/, "UK"], [/\.au$/, "Australia"], [/\.ca$/, "Canada"], [/\.de$/, "Germany"],
  [/\.fr$/, "France"], [/\.in$/, "India"], [/\.sa$/, "Saudi Arabia"], [/\.qa$/, "Qatar"], [/\.sg$/, "Singapore"],
  [/\.nz$/, "New Zealand"], [/\.ie$/, "Ireland"], [/\.nl$/, "Netherlands"], [/\.es$/, "Spain"], [/\.it$/, "Italy"],
  [/\.za$/, "South Africa"], [/\.us$/, "US"],
];
const PLACE_COUNTRY: [RegExp, string][] = [
  [/\b(dubai|abu dhabi|sharjah|uae|united arab emirates)\b/i, "UAE"], [/\b(london|manchester|uk|united kingdom|england|scotland)\b/i, "UK"],
  [/\b(united states|usa|new york|california|texas|florida|los angeles|chicago|miami)\b/i, "US"], [/\b(canada|toronto|vancouver)\b/i, "Canada"],
  [/\b(australia|sydney|melbourne|brisbane)\b/i, "Australia"], [/\b(india|mumbai|delhi|bangalore|bengaluru)\b/i, "India"],
  [/\b(germany|berlin|munich)\b/i, "Germany"], [/\b(france|paris)\b/i, "France"], [/\b(singapore)\b/i, "Singapore"],
  [/\b(saudi|riyadh|jeddah)\b/i, "Saudi Arabia"], [/\b(qatar|doha)\b/i, "Qatar"],
];
export function guessCountry(domain: string, location = ""): string {
  for (const [re, c] of PLACE_COUNTRY) if (re.test(location)) return c;
  for (const [re, c] of TLD_COUNTRY) if (re.test(domain)) return c;
  return "";
}

/** What the extension (or the website fetcher) found on a page. */
export type Captured = {
  pageUrl?: string; pageTitle?: string; kind?: "linkedin-person" | "linkedin-company" | "instagram" | "website";
  business?: string; founder?: string; title?: string; headline?: string; location?: string;
  website?: string; emails?: string[]; phones?: string[]; instagram?: string; linkedin?: string; bio?: string;
  niche?: string; country?: string;
};

export type LeadDraft = {
  business: string; founder: string; title: string; website: string; email: string; phone: string; whatsapp: string;
  instagram: string; linkedin: string; niche: string; country: string; sourceUrl: string;
};

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) as string[] : []);

export function normalizeCapture(c: Captured): LeadDraft {
  const page = s(c.pageUrl, 1000);
  const pageDomain = domainOf(page);
  let website = cleanUrl(s(c.website, 500));
  if (!website && pageDomain && !SOCIAL.test(pageDomain)) website = pageDomain;
  if (website && SOCIAL.test(website)) website = "";
  const instagram = igUrl(s(c.instagram, 300) || (/instagram\.com/.test(page) ? page : ""));
  const linkedin = liUrl(s(c.linkedin, 300) || (/linkedin\.com\/(in|company)\//.test(page) ? page : ""));
  const emails = [...arr(c.emails), ...((s(c.bio, 2000).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) || [])];
  let business = s(c.business, 120);
  let founder = s(c.founder, 80);
  if (c.kind === "linkedin-person" && !business && c.headline) {
    const m = /\b(?:at|@)\s+([^|·,]+)/i.exec(c.headline);
    if (m) business = m[1].trim();
  }
  if (!business && website) business = website.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
  if (!website) { // a business email's domain is their website (not gmail etc.)
    const d = (emails.map((e) => e.toLowerCase().replace(/^mailto:/, "").split("@")[1] || "").find((d) => d && !FREEMAIL.test(d)) || "").split("?")[0];
    if (d && d.includes(".")) website = d;
  }
  if (!business && founder) business = founder;
  if (c.kind === "linkedin-company" || c.kind === "website") founder = founder || "";
  return {
    business, founder, website,
    email: pickEmail(emails, website),
    title: s(c.title, 100) || (c.kind === "linkedin-person" ? s((c.headline || "").split(/\s+(?:at|@)\s+/i)[0], 100) : ""),
    phone: pickPhone(arr(c.phones).filter((p) => !/wa\.me|whatsapp/i.test(p))) || pickPhone(arr(c.phones)),
    whatsapp: pickPhone(arr(c.phones).filter((p) => /wa\.me|whatsapp/i.test(p))),
    instagram, linkedin,
    niche: s(c.niche, 60),
    country: s(c.country, 40) || guessCountry(website, s(c.location, 120)),
    sourceUrl: page,
  };
}

/** Pull emails / phones / socials out of raw HTML (used when the server reads a website's contact page). */
export function scanHtml(html: string) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const hrefs = [...text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const emails = [
    ...hrefs.filter((h) => /^mailto:/i.test(h)),
    ...(text.replace(/<[^>]+>/g, " ").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []),
  ];
  const phones = hrefs.filter((h) => /^tel:|wa\.me|api\.whatsapp\.com/i.test(h));
  const instagram = hrefs.find((h) => igHandle(h) && /instagram\.com/i.test(h)) || "";
  const linkedin = hrefs.find((h) => /linkedin\.com\/(company|in)\//i.test(h)) || "";
  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || "").trim();
  const siteName = (/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] || "").trim();
  return { emails, phones, instagram, linkedin, title, siteName };
}
