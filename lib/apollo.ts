// Apollo enrichment — finds a work email for a person. Spends Apollo credits, so it only
// runs when the boss ticks "find email" or the daily automation is switched on.
import { env, NotConfigured } from "./env";

export type ApolloMatch = { email: string; emailStatus: string; name: string; title: string; company: string; website: string; linkedin: string; country: string; phone: string };

export async function findPerson(q: { linkedin?: string; name?: string; domain?: string; company?: string }): Promise<ApolloMatch | null> {
  if (!env.apolloKey()) {
    if (!env.demoAllowed()) throw new NotConfigured("Apollo");
    if (!q.linkedin && !(q.name && (q.domain || q.company))) return null;
    const first = (q.name || "founder").split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") || "founder";
    return { email: `${first}@${q.domain || "example.com"}`, emailStatus: "demo", name: q.name || "", title: "Founder", company: q.company || "", website: q.domain || "", linkedin: q.linkedin || "", country: "", phone: "" };
  }
  const body: Record<string, unknown> = { reveal_personal_emails: false };
  if (q.linkedin) body.linkedin_url = q.linkedin;
  if (q.name) { const [first, ...rest] = q.name.split(" "); body.first_name = first; body.last_name = rest.join(" "); body.name = q.name; }
  if (q.domain) body.domain = q.domain;
  if (q.company) body.organization_name = q.company;
  if (!q.linkedin && !(q.name && (q.domain || q.company))) return null;
  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": env.apolloKey() },
    body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Apollo refused the key — use a master API key.");
  if (res.status === 429) throw new Error("Apollo rate limit — try again in a minute.");
  if (res.status === 422 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Apollo error ${res.status}`);
  const p = (await res.json()).person;
  if (!p) return null;
  return {
    email: p.email && !/email_not_unlocked/.test(p.email) ? p.email : "",
    emailStatus: p.email_status || "",
    name: [p.first_name, p.last_name].filter(Boolean).join(" "),
    title: p.title || "",
    company: p.organization?.name || "",
    website: p.organization?.primary_domain || p.organization?.website_url || "",
    linkedin: p.linkedin_url || "",
    country: p.country || "",
    phone: p.organization?.phone || "",
  };
}

/** A person/contact opened in the Apollo web app, fetched by its id. Email reveal may use a credit. */
export type ApolloLead = { name: string; title: string; email: string; linkedin: string; country: string; company: string; domain: string; industry: string; phone: string };

function mapPerson(p: any): ApolloLead {
  const o = p?.organization || p?.account || {};
  return {
    name: p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(" "),
    title: p?.title || "",
    email: p?.email && !/not_unlocked|domain\.com$/.test(p.email) ? p.email : "",
    linkedin: p?.linkedin_url || "",
    country: p?.country || "",
    company: o.name || p?.organization_name || "",
    domain: o.primary_domain || o.domain || o.website_url || "",
    industry: o.industry || "",
    phone: (p?.phone_numbers || [])[0]?.sanitized_number || "",
  };
}

async function apolloFetch(path: string, init: RequestInit) {
  const res = await fetch(`https://api.apollo.io/api/v1/${path}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": env.apolloKey() },
  });
  if (res.status === 401 || res.status === 403) throw new Error("Apollo refused the key — check it has People Enrichment (and Contacts) access.");
  if (res.status === 429) throw new Error("Apollo rate limit — wait a minute.");
  if (!res.ok) return null;
  return res.json();
}

export async function apolloById(id: string, kind: "person" | "contact"): Promise<ApolloLead | null> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  if (!env.apolloKey()) {
    if (!env.demoAllowed()) throw new NotConfigured("Apollo");
    return { name: "Demo Person", title: "Founder", email: `founder+${id.slice(-4)}@demo-${id.slice(-4)}.com`, linkedin: "", country: "UAE", company: `Demo Co ${id.slice(-4)}`, domain: `demo-${id.slice(-4)}.com`, industry: "Real estate", phone: "" };
  }
  if (kind === "contact") {
    const j = await apolloFetch(`contacts/${id}`, { method: "GET" });
    if (j?.contact) return mapPerson(j.contact);
  }
  const j = await apolloFetch("people/match", { method: "POST", body: JSON.stringify({ id, reveal_personal_emails: false }) });
  return j?.person ? mapPerson(j.person) : null;
}

/** Setup check: is the key valid, and which of our features can it use? Spends no credits. */
export async function apolloTest() {
  if (!env.apolloKey()) return { keySet: false, keyValid: false, peopleSearch: "no key", message: "APOLLO_API_KEY is empty. Add it in Vercel (or .env.local) and redeploy/restart." };
  const h = await fetch("https://api.apollo.io/api/v1/auth/health", { headers: { "x-api-key": env.apolloKey(), "Cache-Control": "no-cache" }, cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const hj = h ? await h.json().catch(() => ({})) : {};
  const keyValid = !!h?.ok && hj.is_logged_in !== false;
  if (!keyValid) return { keySet: true, keyValid: false, peopleSearch: "skipped", message: `Apollo didn't accept the key (${h?.status ?? "no answer"}). Copy it again from Apollo → Settings → Integrations → API, with no spaces.` };
  const s = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search?q_organization_domains_list[]=apollo.io&per_page=1", {
    method: "POST", headers: { "x-api-key": env.apolloKey(), "Content-Type": "application/json", "Cache-Control": "no-cache" }, cache: "no-store", signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const peopleSearch = s?.ok ? "ok" : s?.status === 403 ? "no access" : `error ${s?.status ?? "?"}`;
  return {
    keySet: true, keyValid: true, peopleSearch,
    message: peopleSearch === "ok"
      ? "Apollo is connected. Finding emails uses the People Enrichment permission, which can't be tested without spending a credit. Try \"Find email → + Apollo\" on one lead."
      : "The key works, but it can't list people at a company. In Apollo → Settings → Integrations → API, edit the key and add \"People API Search\" (or turn on master key).",
  };
}

export type CompanyPerson = { id: string; name: string; title: string; linkedin: string; location: string; hasEmail: boolean };

/** Everyone Apollo knows at a company (by domain). 0 credits — emails aren't included. */
export async function companyPeople(domain: string, page = 1): Promise<{ total: number; people: CompanyPerson[]; demo: boolean }> {
  const d = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  if (!d.includes(".")) throw new Error("This lead has no website, so I can't look up its company.");
  if (!env.apolloKey()) {
    if (!env.demoAllowed()) throw new NotConfigured("Apollo");
    const people = ["Founder & CEO", "Head of Marketing", "Operations Manager", "Sales Director"].map((t, i) => ({ id: `64f1a2b3c4d5e6f7a8b9c0${String(i).padStart(2, "0")}`.slice(0, 24), name: ["Ali Khan", "Sara Lee", "John Park", "Mia Wong"][i], title: t, linkedin: "", location: "Dubai, UAE", hasEmail: i < 3 }));
    return { total: 4, people, demo: true };
  }
  const q = new URLSearchParams();
  q.append("q_organization_domains_list[]", d);
  q.set("per_page", "25"); q.set("page", String(Math.max(1, Math.min(page, 20))));
  let j: any;
  try { j = await apolloFetch(`mixed_people/api_search?${q}`, { method: "POST", body: "{}" }); }
  catch (e) { throw new Error(/refused/.test(String(e)) ? "Your Apollo key can't list company people. Edit the key in Apollo and add \"People API Search\" (0 credits), or use a master key." : String(e instanceof Error ? e.message : e)); }
  if (!j) throw new Error("Apollo couldn't list people for this company. Run Setup → Test Apollo.");
  const people: CompanyPerson[] = (j.people || []).map((p: any) => ({
    id: p.id,
    name: [p.first_name, p.last_name || p.last_name_obfuscated].filter(Boolean).join(" "),
    title: p.title || "",
    linkedin: p.linkedin_url || "",
    location: [p.city, p.state, p.country].filter(Boolean).join(", "),
    hasEmail: p.has_email === true || !!p.email,
  }));
  return { total: j.total_entries ?? j.pagination?.total_entries ?? people.length, people, demo: false };
}
