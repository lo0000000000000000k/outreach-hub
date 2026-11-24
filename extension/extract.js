// Runs INSIDE the page you're on (only when you click the extension). Reads what's visible; changes nothing.
function extractPage() {
  const url = location.href, host = location.hostname.replace(/^www\./, "");
  const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.getAttribute("content") || "";
  const txt = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();
  // Text with a space between every text node (so "a@b.com" and the next word never glue together).
  const spaced = (el) => {
    if (!el) return "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const parts = [];
    while (w.nextNode() && parts.length < 3000) parts.push(w.currentNode.nodeValue);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };
  const links = [...document.querySelectorAll("a[href]")].slice(0, 4000).map((a) => a.href);
  const emailRe = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  const out = { pageUrl: url, pageTitle: document.title, emails: [], phones: [], kind: "website" };

  const socials = () => {
    out.instagram = links.find((h) => /instagram\.com\/[A-Za-z0-9._]+\/?$/.test(h)) || "";
    out.linkedin = links.find((h) => /linkedin\.com\/(company|in)\//.test(h)) || "";
  };

  if (host.endsWith("apollo.io")) {
    // Apollo web app: collect person/contact ids — the server gets their full record from the Apollo API.
    out.kind = "apollo";
    const ID = /#\/(people|contacts)\/([a-f0-9]{24})/i;
    const idOf = (href) => { const m = ID.exec(href || ""); return m ? { id: m[2], kind: m[1] === "contacts" ? "contact" : "person" } : null; };
    const found = new Map();
    // 1) People ticked in a list / search.
    for (const box of document.querySelectorAll('input[type="checkbox"]:checked')) {
      let el = box;
      for (let i = 0; i < 10 && el; i++) {
        el = el.parentElement;
        const ls = el ? [...el.querySelectorAll('a[href*="#/people/"], a[href*="#/contacts/"]')].map((a) => idOf(a.getAttribute("href"))).filter(Boolean) : [];
        const uniq = [...new Map(ls.map((x) => [x.id, x])).values()];
        if (uniq.length === 1) { found.set(uniq[0].id, uniq[0]); break; }
        if (uniq.length > 1) break; // reached the whole table: this box is "select all"
      }
    }
    // 2) Nothing ticked: the person whose page / side panel is open.
    if (!found.size) { const me = idOf(location.href); if (me) found.set(me.id, me); }
    out.apollo = [...found.values()].slice(0, 25);
    return out;
  }

  if (host.endsWith("linkedin.com") && /^\/in\//.test(location.pathname)) {
    out.kind = "linkedin-person";
    out.linkedin = url.split("?")[0];
    const main = document.querySelector("main") || document.body;
    out.founder = txt(main.querySelector("h1")) || document.title.split(/[|–-]/)[0].trim();
    out.headline = txt(main.querySelector(".text-body-medium"));
    out.location = txt(main.querySelector(".text-body-small.inline"));
    const cur = main.querySelector('[aria-label^="Current company"]');
    if (cur) out.business = (cur.getAttribute("aria-label") || "").replace(/^Current company:\s*/i, "").replace(/\.?\s*Click.*$/i, "").trim();
    // The contact-info popup (if open) has the real email/website.
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      out.emails = [...dialog.querySelectorAll('a[href^="mailto:"]')].map((a) => a.href);
      const site = [...dialog.querySelectorAll("a[href]")].map((a) => a.href).find((h) => /^https?:/.test(h) && !/linkedin\.com|lnkd\.in/.test(h));
      if (site) out.website = site;
    }
  } else if (host.endsWith("linkedin.com") && /^\/company\//.test(location.pathname)) {
    out.kind = "linkedin-company";
    out.linkedin = url.split("?")[0].replace(/\/(about|posts|people|jobs)\/?$/, "/");
    const main = document.querySelector("main") || document.body;
    out.business = txt(main.querySelector("h1")) || document.title.split("|")[0].trim();
    const site = [...main.querySelectorAll("a[href]")].map((a) => a.href).find((h) => /^https?:/.test(h) && !/linkedin\.com|lnkd\.in|bing\.com|microsoft\.com/.test(h));
    if (site) out.website = site;
    out.location = txt(main.querySelector(".org-top-card-summary-info-list"));
  } else if (host.endsWith("instagram.com")) {
    out.kind = "instagram";
    const handle = location.pathname.split("/").filter(Boolean)[0] || "";
    out.instagram = handle ? `https://instagram.com/${handle}` : "";
    const ogt = meta("og:title");
    out.business = (ogt.split(/\s*\(@/)[0] || handle).trim();
    const header = document.querySelector("header");
    out.bio = spaced(header).slice(0, 1500) + " " + meta("og:description");
    const ext = links.find((h) => /l\.instagram\.com\/\?u=/.test(h));
    if (ext) { try { out.website = decodeURIComponent(new URL(ext).searchParams.get("u") || ""); } catch (e) { /* */ } }
    out.emails = out.bio.match(emailRe) || [];
  } else {
    out.kind = "website";
    out.business = meta("og:site_name") || document.title.split(/\s[|–—-]\s/)[0].trim();
    const body = (document.body?.innerText || "").slice(0, 200000);
    out.emails = [...links.filter((h) => h.startsWith("mailto:")), ...(body.match(emailRe) || [])].slice(0, 40);
    out.phones = links.filter((h) => /^tel:|wa\.me\/|api\.whatsapp\.com/.test(h)).slice(0, 5);
    out.website = location.origin;
    socials();
  }
  return out;
}
