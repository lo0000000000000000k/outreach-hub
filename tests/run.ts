// Offline tests: no Google, no Apollo, no internet. Run: npm test
process.env.DEMO = "1";
process.env.CAPTURE_KEY = "test-key";
process.env.CRON_SECRET = "cron-secret";
process.env.OUTREACH_PASSCODE = "pass";

let passed = 0, failed = 0;
function ok(name: string, cond: unknown, info?: unknown) {
  if (cond) { passed++; console.log("  ✓", name); } else { failed++; console.log("  ✗", name, info ?? ""); }
}

// Fake websites for the free "read their website" step.
const SITES: Record<string, string> = {
  "https://peakrealty.ae/contact": `<a href="mailto:omar@peakrealty.ae">Email</a><a href="https://instagram.com/peakrealtydxb">IG</a>`,
  "https://brightsidedental.com.au/contact": `<p>Write to hello@brightsidedental.com.au or emma@brightsidedental.com.au</p>`,
  "https://newagency.co.uk": `<title>New Agency | Video</title><meta property="og:site_name" content="New Agency"><a href="tel:+44 20 1234 5678">call</a>`,
  "https://newagency.co.uk/contact": `<p>info@newagency.co.uk</p><img src="logo@2x.png">`,
};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const u = String(input);
  if (u in SITES) return new Response(SITES[u], { status: 200, headers: { "content-type": "text/html" } });
  if (/^https:\/\/[^/]+(\/(contact|contact-us|about|about-us))?$/.test(u)) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  return realFetch(input, init);
}) as typeof fetch;

async function main() {
  const { normalizeCapture, pickEmail, guessCountry, igHandle, liKey } = await import("../lib/extract");
  const { leads, resetDemo, findDuplicate } = await import("../lib/leads");
  const { save, preview, enrichRow } = await import("../lib/capture");
  const { NextRequest } = await import("next/server");

  console.log("\nCleaning captured pages");
  {
    const li = normalizeCapture({ kind: "linkedin-person", pageUrl: "https://www.linkedin.com/in/sarah-cole-123/?utm=x", founder: "Sarah Cole", headline: "Founder at Northline Media | Video for brands", location: "London, England, United Kingdom" });
    ok("LinkedIn: company from headline", li.business === "Northline Media", li);
    ok("LinkedIn: clean profile URL", li.linkedin === "https://www.linkedin.com/in/sarah-cole-123");
    ok("LinkedIn: country from location", li.country === "UK");
    ok("LinkedIn page is not a website", li.website === "");
    const ig = normalizeCapture({ kind: "instagram", pageUrl: "https://www.instagram.com/peakrealtydxb/", business: "Peak Realty", bio: "Luxury homes in Dubai ✉ omar@peakrealty.ae", website: "https://www.peakrealty.ae/listings?ref=ig" });
    ok("Instagram: email from bio", ig.email === "omar@peakrealty.ae");
    ok("Instagram: handle URL", ig.instagram === "https://instagram.com/peakrealtydxb");
    ok("Instagram: bio link → website domain", ig.website === "peakrealty.ae");
    ok("Instagram: country from .ae", ig.country === "UAE");
    const web = normalizeCapture({ kind: "website", pageUrl: "https://www.fitforge.com/about", business: "FitForge", emails: ["mailto:jake@fitforge.com?subject=hi", "info@fitforge.com", "noreply@fitforge.com", "logo@2x.png", "someone@gmail.com"], phones: ["tel:+1 (555) 010-2030"] });
    ok("Website: person email beats info@ and junk", web.email === "jake@fitforge.com", web.email);
    ok("Website: phone cleaned", web.phone === "+15550102030", web.phone);
    ok("Website: domain from page", web.website === "fitforge.com");
    ok("pickEmail prefers own domain", pickEmail(["x@gmail.com", "info@acme.io"], "acme.io") === "info@acme.io");
    ok("guessCountry", guessCountry("shop.com.au") === "Australia" && guessCountry("x.com", "Dubai, UAE") === "UAE");
    ok("igHandle ignores post links", igHandle("https://instagram.com/p/abc123") === "");
    ok("liKey", liKey("https://uk.linkedin.com/company/acme-ltd/about/") === "company/acme-ltd");
  }

  console.log("\nDuplicates + merge");
  {
    resetDemo();
    const all = await leads.all();
    ok("dupe by domain (www/https ignored)", findDuplicate(all, { website: "https://www.fitforge.com/" })?.business === "FitForge");
    ok("dupe by Instagram handle", findDuplicate(all, { instagram: "@grittgym" })?.business === "Gritt Gym");
    ok("dupe by phone", findDuplicate(all, { phone: "00971 500 000 001" })?.business === "Peak Realty Dubai");
    ok("no false dupe", !findDuplicate(all, { website: "brandnew.io" }));

    const before = (await leads.all()).length;
    const r1 = await save({ business: "New Agency", website: "https://newagency.co.uk", niche: "Marketing agency" }, { apollo: false, via: "test" });
    ok("new lead added", r1.ok && r1.action === "added" && (await leads.all()).length === before + 1, r1);
    ok("website scan found phone (free)", r1.ok && r1.lead.phone === "+442012345678", r1.ok && r1.lead);
    ok("website scan found info@ email, skipped junk", r1.ok && r1.lead.email === "info@newagency.co.uk", r1.ok && r1.lead.email);
    ok("country guessed from .co.uk", r1.ok && r1.lead.country === "UK");
    ok("new lead starts as New with today's date", r1.ok && r1.lead.status === "New" && r1.lead.dateAdded === new Date().toISOString().slice(0, 10));

    const r2 = await save({ website: "newagency.co.uk", founder: "Ava Price", email: "ava@other.com" }, { apollo: false, via: "test" });
    ok("same site again → no new row", (await leads.all()).length === before + 1);
    ok("…fills only EMPTY cells", r2.ok && r2.action === "updated" && r2.filled.join() === "founder" && r2.lead.email === "info@newagency.co.uk", r2);
    const r3 = await save({ website: "newagency.co.uk" }, { apollo: false, via: "test" });
    ok("nothing new → duplicate", r3.ok && r3.action === "duplicate");
    const r4 = await save({}, { apollo: false, via: "test" });
    ok("empty capture refused", !r4.ok);
  }

  console.log("\nEnrichment");
  {
    resetDemo();
    const dental = (await leads.all()).find((l) => l.business === "Brightside Dental")!;
    const r = await enrichRow(dental.row, { apollo: false, via: "test" });
    ok("free website enrich finds the person's email", r.lead.email === "emma@brightsidedental.com.au", r);
    const gym = (await leads.all()).find((l) => l.business === "Gritt Gym")!;
    const noApollo = await enrichRow(gym.row, { apollo: false, via: "test" });
    ok("no Apollo unless asked", !noApollo.lead.email && !noApollo.notes.some((n) => n.startsWith("Apollo")));
    const withApollo = await enrichRow(gym.row, { apollo: true, via: "test" });
    ok("Apollo (demo) fills email when asked", withApollo.lead.email === "tom@grittgym.com", withApollo);
    ok("enrich never overwrites", (await leads.byRow(dental.row))!.email === "emma@brightsidedental.com.au");
  }

  console.log("\nApollo + instant save");
  {
    resetDemo();
    const { captureApollo } = await import("../lib/capture");
    const before = (await leads.all()).length;
    const r = await captureApollo([{ id: "64f1a2b3c4d5e6f7a8b9c0d1", kind: "person" }, { id: "64f1a2b3c4d5e6f7a8b9c0d2", kind: "contact" }, { id: "not-an-id", kind: "person" }], "https://app.apollo.io/#/people", "");
    ok("Apollo ids → 2 leads added, bad id skipped", r.added === 2 && r.failed === 1 && (await leads.all()).length === before + 2, r);
    const again = await captureApollo([{ id: "64f1a2b3c4d5e6f7a8b9c0d1", kind: "person" }], "https://app.apollo.io/#/people", "");
    ok("same Apollo person again → no duplicate row", again.duplicate === 1 && (await leads.all()).length === before + 2, again);
    const q = await import("../app/api/capture/quick/route");
    const qr = await q.POST(new NextRequest("http://x/api/capture/quick", { method: "POST", headers: { "content-type": "application/json", "x-capture-key": "test-key" }, body: JSON.stringify({ captured: { kind: "website", pageUrl: "https://www.acme-films.io/", business: "Acme Films", emails: ["ceo@acme-films.io"] }, niche: "Video" }) }));
    const qj = await qr.json();
    ok("instant save from any website", qr.status === 200 && qj.action === "added" && qj.lead.email === "ceo@acme-films.io" && qj.lead.niche === "Video", qj);
    const ap = await import("../app/api/capture/apollo/route");
    ok("Apollo capture needs the key", (await ap.POST(new NextRequest("http://x/api/capture/apollo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [] }) }))).status === 401);
  }

  console.log("\nSheet columns, WhatsApp, company people");
  {
    const { migratedHeader } = await import("../lib/leads");
    const old = ["Business Name", "Founder", "Website", "Email", "Phone/WhatsApp", "Instagram", "LinkedIn", "Niche", "Country", "Source URL", "Date Added", "Status"];
    const m = migratedHeader(old);
    ok("Founder → Person Name, Phone/WhatsApp → Phone, data columns stay in place", m[1] === "Person Name" && m[4] === "Phone" && m.length === old.length + 2, m);
    ok("Job Title + WhatsApp added at the end", m.slice(-2).join() === "Job Title,WhatsApp", m.slice(-2));
    ok("already-new header unchanged", JSON.stringify(migratedHeader(m)) === JSON.stringify(m));
    const w = normalizeCapture({ kind: "website", pageUrl: "https://shop.ae/", phones: ["tel:+971 4 123 4567", "https://wa.me/971501112233"] });
    ok("phone and WhatsApp kept apart", w.phone === "+97141234567" && w.whatsapp === "971501112233", w);
    resetDemo();
    const l = (await leads.all())[0];
    await leads.setWhatsapp(l.row, "No");
    ok("WhatsApp check result saved", (await leads.byRow(l.row))!.whatsapp === "No");
    const { companyPeople, apolloTest } = await import("../lib/apollo");
    const cp = await companyPeople("https://www.peakrealty.ae/about");
    ok("company people (demo) → count + names + titles", cp.total === 4 && cp.people[0].name && cp.people[0].title, cp);
    let threw = false; try { await companyPeople(""); } catch { threw = true; }
    ok("company people needs a website", threw);
    const t = await apolloTest();
    ok("Apollo test explains a missing key", !t.keySet && /APOLLO_API_KEY/.test(t.message));
    const r = await save({ business: "Dial Co", phone: "+44 20 7946 0000", whatsapp: "+44 7700 900000", founder: "Ana Ruiz", title: "CEO" }, { apollo: false, via: "test" });
    ok("save keeps person, title, phone, WhatsApp", r.ok && r.lead.founder === "Ana Ruiz" && r.lead.title === "CEO" && r.lead.phone === "+442079460000" && r.lead.whatsapp === "+447700900000", r.ok && r.lead);
  }

  console.log("\nGet from Apollo button");
  {
    const lk = await import("../app/api/capture/apollo-lookup/route");
    const call = async (b: unknown) => { const r = await lk.POST(new NextRequest("http://x/api/capture/apollo-lookup", { method: "POST", headers: { "content-type": "application/json", "x-capture-key": "test-key" }, body: JSON.stringify(b) })); return { status: r.status, j: await r.json() }; };
    const company = await call({ lead: { business: "Claude", website: "claude.ai" } });
    ok("website only → list of company people to pick from", company.status === 200 && company.j.mode === "company" && company.j.total === 4 && company.j.people.length === 4, company.j);
    const person = await call({ lead: { founder: "Sara Lee", website: "claude.ai" } });
    ok("person on the page → their details", person.j.mode === "person" && /@claude\.ai$/.test(person.j.fields.email), person.j);
    const byId = await call({ id: company.j.people[0].id });
    ok("picked person → fields to fill", byId.j.mode === "person" && byId.j.fields.founder && byId.j.fields.business, byId.j);
    const none = await call({ lead: { business: "X" } });
    ok("nothing to look up → clear message", none.status === 400 && /website or a person/.test(none.j.error));
    ok("nothing saved by lookup", !(await leads.all()).some((l) => l.website === "claude.ai"));
  }

  console.log("\nOne row per person");
  {
    resetDemo();
    const { captureApollo } = await import("../lib/capture");
    // Pretend Apollo: four people, all at peakrealty.ae (Omar Haddad is already in the sheet with omar@).
    const PEOPLE: Record<string, any> = {
      "64f1a2b3c4d5e6f7a8b9c001": { name: "Ali Khan", email: "ali@peakrealty.ae", linkedin_url: "http://www.linkedin.com/in/alikhan" },
      "64f1a2b3c4d5e6f7a8b9c002": { name: "Sara Lee", email: "sara@peakrealty.ae", linkedin_url: "http://www.linkedin.com/in/saralee" },
      "64f1a2b3c4d5e6f7a8b9c003": { name: "John Park", email: "", linkedin_url: "http://www.linkedin.com/in/johnpark" },
      "64f1a2b3c4d5e6f7a8b9c004": { name: "Omar Haddad", email: "omar@peakrealty.ae", linkedin_url: "http://www.linkedin.com/in/omarhaddad" },
    };
    const mocked = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      if (String(input) === "https://api.apollo.io/api/v1/people/match") {
        const p = PEOPLE[JSON.parse(init.body).id];
        return Response.json({ person: p && { ...p, organization: { name: "Peak Realty Dubai", primary_domain: "peakrealty.ae" } } });
      }
      return mocked(input, init);
    }) as typeof fetch;
    process.env.APOLLO_API_KEY = "fake";
    const add = (ids: string[]) => captureApollo(ids.map((id) => ({ id, kind: "person" as const })), "apollo: peakrealty.ae", "");
    const before = (await leads.all()).length;
    const r = await add(Object.keys(PEOPLE));
    const rows = (await leads.all()).filter((l) => l.website === "peakrealty.ae");
    const who = (n: string) => rows.filter((l) => l.founder === n);
    ok("3 new people at one company → 3 new rows", r.added === 3 && (await leads.all()).length === before + 3, r);
    ok("person already in the sheet → no second row", r.updated + r.duplicate === 1 && who("Omar Haddad").length === 1, r);
    ok("each person keeps their own email", who("Ali Khan")[0]?.email === "ali@peakrealty.ae" && who("Sara Lee")[0]?.email === "sara@peakrealty.ae", rows);
    ok("website scan doesn't give John Omar's email", who("John Park")[0]?.email === "", who("John Park"));
    const r2 = await add(Object.keys(PEOPLE));
    ok("adding them all again → nothing new", r2.added === 0 && (await leads.all()).length === before + 3, r2);
    delete process.env.APOLLO_API_KEY; globalThis.fetch = mocked;
    const john = who("John Park")[0];
    const jr = john ? await enrichRow(john.row, { apollo: false, via: "test" }) : null;
    ok("Find email (website) doesn't give John Omar's email either", jr?.lead.email === "", jr);

    const all = await leads.all();
    const dup = (x: object) => findDuplicate(all, x)?.founder;
    ok("different person, same company phone → not a duplicate", dup({ founder: "Zed Q", phone: "+971500000001" }) === undefined);
    ok("same person: Mr. and a shortened surname don't matter", dup({ founder: "Mr. Omar H.", website: "peakrealty.ae" }) === "Omar Haddad");
    ok("same email beats a nickname", dup({ founder: "Johnny Doe", email: "ALI@peakrealty.ae" }) === "Ali Khan");
    ok("no name → company match still found", dup({ website: "peakrealty.ae" }) === "Omar Haddad");
    const mk = (x: object) => ({ row: 2, business: "Co", founder: "", title: "", website: "co.io", email: "", phone: "", whatsapp: "", instagram: "", linkedin: "", niche: "", country: "", sourceUrl: "", dateAdded: "", status: "New", ...x });
    ok("company-only row can take a person", !!findDuplicate([mk({ email: "info@co.io" })], { founder: "Ali Khan", website: "co.io", email: "ali@co.io" }));
    ok("…but not when it holds someone else's email", !findDuplicate([mk({ email: "jane@co.io" })], { founder: "Ali Khan", website: "co.io", email: "ali@co.io" }));
    ok("shared info@ inbox doesn't merge two people", !findDuplicate([mk({ founder: "Jane Roe", email: "info@co.io" })], { founder: "Ali Khan", email: "info@co.io" }));
    ok("different LinkedIn people never merge on a wrong email", !findDuplicate([mk({ founder: "Ali Khan", email: "emma@co.io", linkedin: "linkedin.com/in/ali" })], { founder: "Emma Ross", email: "emma@co.io", linkedin: "linkedin.com/in/emma" }));
    ok("company LinkedIn page doesn't merge two people", !findDuplicate([mk({ founder: "Jane Roe", linkedin: "linkedin.com/company/co" })], { founder: "Ali Khan", linkedin: "linkedin.com/company/co" }));
    ok("no keys: same business, different person → not a duplicate", !findDuplicate([mk({ founder: "Jane Roe" })], { founder: "Ali Khan", business: "Co" }));
  }

  console.log("\nLog tab");
  {
    const { generateKeyPairSync } = await import("node:crypto");
    const { logActivity, recentActivity } = await import("../lib/activity");
    const mocked = globalThis.fetch;
    const saved = { ...process.env };
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "bot@test.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.LEADS_SHEET_ID = "SHEET";
    // Pretend Google Sheets: exact URLs only, and no Log tab at first.
    let tab: string[][] | null = null, headerWrites = 0, failAppends = 0;
    const rowsNow = () => (tab || []) as string[][];
    const base = "https://sheets.googleapis.com/v4/spreadsheets/SHEET";
    globalThis.fetch = (async (input: any, init?: any) => {
      const u = String(input), b = init?.body && u.startsWith(base) ? JSON.parse(init.body) : null;
      if (u === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "t", expires_in: 3600 });
      if (u === `${base}:batchUpdate`) { if (tab) return new Response("already exists", { status: 400 }); tab = []; return Response.json({}); }
      if (tab && u.startsWith(`${base}/values/Log!A1:append`)) { if (failAppends-- > 0) return new Response("busy", { status: 503 }); tab.push(...b.values); return Response.json({}); }
      if (tab && u.startsWith(`${base}/values/Log!A1?`)) { headerWrites++; tab[0] = b.values[0]; return Response.json({}); }
      if (tab && u === `${base}/values/Log!A2:D5000`) return Response.json({ values: tab.slice(1) });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    await logActivity("Added", "First Co", "one");
    ok("missing Log tab is created with its header", rowsNow()[0]?.join() === "Time,Action,Lead,Detail", tab);
    ok("the first entry is kept", rowsNow()[1]?.[2] === "First Co", tab);
    await logActivity("Added", "Second Co", "two");
    ok("next entry appended, header written once", rowsNow().length === 3 && headerWrites === 1, tab);
    ok("dashboard reads them back, newest first", (await recentActivity(5)).map((a) => a.lead).join() === "Second Co,First Co");
    tab = [["2026-01-01", "Added", "Old Co", "no header row"]]; failAppends = 1;
    await logActivity("Added", "Third Co", "three");
    ok("a hiccup never overwrites an existing Log tab", rowsNow()[0][2] === "Old Co" && rowsNow()[1]?.[2] === "Third Co", tab);
    globalThis.fetch = mocked;
    for (const k of ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "LEADS_SHEET_ID"]) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }

  console.log("\nStatus");
  {
    resetDemo();
    const l = (await leads.all())[0];
    await leads.setStatus(l.row, "Replied");
    ok("status changes", (await leads.byRow(l.row))!.status === "Replied");
    let threw = false; try { await leads.setStatus(l.row, "Hacked"); } catch { threw = true; }
    ok("unknown status refused", threw);
  }

  console.log("\nSecurity");
  {
    const prev = await import("../app/api/capture/preview/route");
    const savR = await import("../app/api/capture/save/route");
    const cron = await import("../app/api/cron/daily/route");
    const mk = (url: string, headers: Record<string, string>, body?: unknown) =>
      new NextRequest(url, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    ok("capture preview needs the key", (await prev.POST(mk("http://x/api/capture/preview", {}, { pageUrl: "https://a.com" }))).status === 401);
    ok("capture save rejects a wrong key", (await savR.POST(mk("http://x/api/capture/save", { "x-capture-key": "nope" }, { lead: { business: "X" } }))).status === 401);
    const p = await prev.POST(mk("http://x/api/capture/preview", { "x-capture-key": "test-key" }, { kind: "website", pageUrl: "https://www.fitforge.com/" }));
    const pj = await p.json();
    ok("preview with key works + flags duplicate", p.status === 200 && pj.duplicate?.business === "FitForge", pj);
    ok("preview sends CORS header for the extension", p.headers.get("access-control-allow-origin") === "*");
    ok("cron needs the secret", (await cron.GET(mk("http://x/api/cron/daily", {}))).status === 401);
    resetDemo();
    const c = await cron.GET(mk("http://x/api/cron/daily", { authorization: "Bearer cron-secret" }));
    const cj = await c.json();
    ok("cron runs: fills website emails, no Apollo by default", c.status === 200 && cj.apolloUsed === 0 && /emails found: 1 from websites, 0 from Apollo/.test(cj.summary), cj);
    const mw = await import("../middleware");
    const res = await mw.middleware(mk("http://x/api/leads", {}));
    ok("dashboard API locked without login", res.status === 401);
    const res2 = await mw.middleware(mk("http://x/", {}));
    ok("pages redirect to login", res2.status === 307 && /\/login$/.test(res2.headers.get("location") || ""));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
