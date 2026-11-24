// Free enrichment: read the lead's own website (home, contact, about) for an email, phone and socials.
import { scanHtml } from "./extract";

const PAGES = ["", "/contact", "/contact-us", "/about", "/about-us"];

function safeDomain(d: string) {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d) && !/^(localhost|.*\.local|.*\.internal)$/i.test(d) && !/^\d+(\.\d+){3}$/.test(d);
}

export async function scanWebsite(domain: string) {
  const out = { emails: [] as string[], phones: [] as string[], instagram: "", linkedin: "", title: "", siteName: "", pages: 0 };
  if (!safeDomain(domain)) return out;
  for (const p of PAGES) {
    try {
      const res = await fetch(`https://${domain}${p}`, {
        redirect: "follow", signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OutreachHub/1.0)", Accept: "text/html" },
      });
      if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) continue;
      const html = (await res.text()).slice(0, 600_000);
      const r = scanHtml(html);
      out.pages++;
      out.emails.push(...r.emails); out.phones.push(...r.phones);
      out.instagram ||= r.instagram; out.linkedin ||= r.linkedin;
      if (p === "") { out.title = r.title; out.siteName = r.siteName; }
      if (out.emails.length && p !== "") break; // found a contact email — good enough
    } catch { /* site down / slow — try the next page */ }
  }
  return out;
}
