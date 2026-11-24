"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const STATUSES = ["New", "Contacted", "Replied", "Meeting", "Closed"] as const;
type Lead = {
  row: number; business: string; founder: string; title: string; website: string; email: string; phone: string; whatsapp: string;
  instagram: string; linkedin: string; niche: string; country: string; sourceUrl: string; dateAdded: string; status: string;
};
type Summary = { total: number; byStatus: Record<string, number>; addedToday: number; addedThisWeek: number; missingEmail: number; niches: string[]; countries: string[] };
type Activity = { at: string; action: string; lead: string; detail: string };
type Status = { sheet: boolean; apollo: boolean; extensionKey: boolean; cron: boolean; autoEnrichPerDay: number };

const EMPTY = { business: "", founder: "", title: "", website: "", email: "", phone: "", whatsapp: "", instagram: "", linkedin: "", niche: "", country: "", sourceUrl: "" };
const digits = (p: string) => p.replace(/\D/g, "");
const href = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(m)) return "";
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  if (r.status === 401) { window.location.href = "/login"; throw new Error("logged out"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export default function Dashboard() {
  const [all, setAll] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [demo, setDemo] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fNiche, setFNiche] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const [adding, setAdding] = useState(false);
  const [setup, setSetup] = useState(false);
  const [enrichFor, setEnrichFor] = useState<number | null>(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [peopleFor, setPeopleFor] = useState<Lead | null>(null);
  const [waAsk, setWaAsk] = useState<number | null>(null);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast((x) => (x === t ? "" : x)), 5000); };

  const load = useCallback(async () => {
    try {
      const [l, a, s] = await Promise.all([api("/api/leads"), api("/api/activity"), api("/api/status")]);
      setAll(l.leads); setSummary(l.summary); setDemo(l.demo); setActivity(a.activity); setStatus(s); setError("");
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((l) =>
      (!fStatus || l.status === fStatus) && (!fNiche || l.niche === fNiche) && (!fCountry || l.country === fCountry) &&
      (!onlyMissing || !l.email) &&
      (!n || [l.business, l.founder, l.email, l.website, l.instagram, l.linkedin, l.niche, l.country].some((v) => v.toLowerCase().includes(n))));
  }, [all, q, fStatus, fNiche, fCountry, onlyMissing]);

  async function changeStatus(l: Lead, s: string) {
    setAll((xs) => xs.map((x) => (x.row === l.row ? { ...x, status: s } : x)));
    try { await api(`/api/leads/${l.row}`, { method: "PATCH", body: JSON.stringify({ status: s }) }); say(`${l.business} → ${s}`); load(); }
    catch (e) { say((e as Error).message); load(); }
  }

  async function enrich(l: Lead, apollo: boolean) {
    setEnrichFor(null); setBusyRow(l.row);
    try {
      const r = await api(`/api/leads/${l.row}/enrich`, { method: "POST", body: JSON.stringify({ apollo }) });
      say(r.filled.length ? `${l.business}: added ${r.filled.join(", ")}` : `${l.business}: nothing new found${r.notes.length ? ` (${r.notes.join("; ")})` : ""}`);
      load();
    } catch (e) { say((e as Error).message); }
    setBusyRow(null);
  }

  async function setWa(l: Lead, value: string) {
    setWaAsk(null);
    try { await api(`/api/leads/${l.row}`, { method: "PATCH", body: JSON.stringify({ whatsapp: value }) }); say(`${l.business}: ${value === "No" ? "not on WhatsApp" : "on WhatsApp ✓"}`); load(); }
    catch (e) { say((e as Error).message); }
  }

  const clearFilters = () => { setQ(""); setFStatus(""); setFNiche(""); setFCountry(""); setOnlyMissing(false); };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><img src="/icon.svg" alt="" width={28} height={28} /><span>Outreach Hub</span>{demo && <span className="badge warn">Demo data — connect your sheet</span>}</div>
        <div className="top-actions">
          <button className="btn" onClick={() => setSetup(true)}>Setup{status && (!status.sheet || !status.extensionKey) ? " ·  needs attention" : ""}</button>
          <button className="btn primary" onClick={() => setAdding(true)}>+ Add lead</button>
          <button className="btn ghost" onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}>Log out</button>
        </div>
      </header>

      {error && <div className="banner err" role="alert">{error}</div>}

      <section className="pipeline" aria-label="Pipeline">
        <button className={`stage total ${!fStatus ? "on" : ""}`} onClick={() => setFStatus("")}>
          <span className="n">{summary?.total ?? "–"}</span><span className="l">All leads</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s} className={`stage s-${s.toLowerCase()} ${fStatus === s ? "on" : ""}`} onClick={() => setFStatus(fStatus === s ? "" : s)} aria-pressed={fStatus === s}>
            <span className="n">{summary?.byStatus[s] ?? "–"}</span><span className="l">{s}</span>
          </button>
        ))}
        <div className="stage info"><span className="n">{summary?.addedToday ?? "–"}</span><span className="l">Added today</span></div>
        <button className={`stage info ${onlyMissing ? "on" : ""}`} onClick={() => setOnlyMissing(!onlyMissing)} aria-pressed={onlyMissing}>
          <span className="n">{summary?.missingEmail ?? "–"}</span><span className="l">Missing email</span>
        </button>
      </section>

      <div className="main">
        <section className="leads">
          <div className="toolbar">
            <label className="sr" htmlFor="search">Search</label>
            <input id="search" className="search" placeholder="Search name, email, website…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="sr" htmlFor="fn">Niche</label>
            <select id="fn" value={fNiche} onChange={(e) => setFNiche(e.target.value)}><option value="">All niches</option>{summary?.niches.map((n) => <option key={n}>{n}</option>)}</select>
            <label className="sr" htmlFor="fc">Country</label>
            <select id="fc" value={fCountry} onChange={(e) => setFCountry(e.target.value)}><option value="">All countries</option>{summary?.countries.map((n) => <option key={n}>{n}</option>)}</select>
            {(q || fStatus || fNiche || fCountry || onlyMissing) && <button className="btn ghost" onClick={clearFilters}>Clear</button>}
            <span className="count">{shown.length} of {all.length}</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>Business</th><th>Contact</th><th>Niche</th><th>Country</th><th>Added</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7} className="empty">Loading leads…</td></tr>}
                {!loading && shown.length === 0 && <tr><td colSpan={7} className="empty">{all.length ? "No leads match these filters." : "No leads yet — capture one with the extension or press + Add lead."}</td></tr>}
                {shown.map((l) => (
                  <tr key={l.row}>
                    <td><div className="biz">{l.business}</div>{(l.founder || l.title) && <div className="sub">{[l.founder, l.title].filter(Boolean).join(" · ")}</div>}</td>
                    <td>
                      {l.email ? <a href={`mailto:${l.email}`} className="email">{l.email}</a> : <span className="missing">No email</span>}
                      <div className="links">
                        {l.website && <a href={href(l.website)} target="_blank" rel="noreferrer">Web</a>}
                        {l.linkedin && <a href={href(l.linkedin)} target="_blank" rel="noreferrer">LinkedIn</a>}
                        {l.instagram && <a href={href(l.instagram)} target="_blank" rel="noreferrer">Instagram</a>}
                      </div>
                      {(l.phone || l.whatsapp) && (
                        <div className="links phone">
                          {l.phone && <a href={`tel:${l.phone}`}>{l.phone}</a>}
                          {l.whatsapp && l.whatsapp !== "No" && <a className="wa yes" href={`https://wa.me/${digits(l.whatsapp)}`} target="_blank" rel="noreferrer">WhatsApp ✓</a>}
                          {l.whatsapp === "No" && <span className="wa no">Not on WhatsApp</span>}
                          {!l.whatsapp && l.phone && (waAsk === l.row ? (
                            <span className="wa ask" role="group" aria-label="Is this number on WhatsApp?">On WhatsApp?
                              <button className="btn small" onClick={() => setWa(l, l.phone)}>Yes</button>
                              <button className="btn small" onClick={() => setWa(l, "No")}>No</button>
                            </span>
                          ) : (
                            <button className="btn small" onClick={() => { window.open(`https://wa.me/${digits(l.phone)}`, "_blank", "noopener"); setWaAsk(l.row); }}>Check WhatsApp</button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{l.niche || <span className="muted">—</span>}</td>
                    <td>{l.country || <span className="muted">—</span>}</td>
                    <td className="nowrap">{l.dateAdded}</td>
                    <td>
                      <label className="sr" htmlFor={`st-${l.row}`}>Status for {l.business}</label>
                      <select id={`st-${l.row}`} className={`status s-${l.status.toLowerCase()}`} value={l.status} onChange={(e) => changeStatus(l, e.target.value)}>
                        {[...new Set([...STATUSES, l.status])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="actions">
                      {l.website && <button className="btn small" onClick={() => setPeopleFor(l)} title="Everyone Apollo knows at this company">People</button>}{" "}
                      {!l.email && (busyRow === l.row ? <span className="muted">Searching…</span> : enrichFor === l.row ? (
                        <div className="pop" role="group" aria-label="Find email">
                          <button className="btn small" onClick={() => enrich(l, false)}>Website (free)</button>
                          <button className="btn small" onClick={() => enrich(l, true)} disabled={!status?.apollo && !demo}>+ Apollo (1 credit)</button>
                          <button className="btn small ghost" onClick={() => setEnrichFor(null)} aria-label="Cancel">×</button>
                        </div>
                      ) : <button className="btn small" onClick={() => setEnrichFor(l.row)}>Find email</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="activity" aria-label="Activity">
          <h2>Activity</h2>
          {activity.length === 0 && <p className="muted">Captures, updates and the daily automation show up here.</p>}
          <ol>
            {activity.map((a, i) => (
              <li key={i}>
                <div><span className={`tag t-${a.action.toLowerCase().replace(/\s/g, "-")}`}>{a.action}</span> <b>{a.lead}</b></div>
                {a.detail && <div className="sub">{a.detail}</div>}
                <div className="time">{ago(a.at)}</div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {adding && <AddLead niches={summary?.niches || []} countries={summary?.countries || []} apollo={!!status?.apollo || demo}
        onClose={() => setAdding(false)} onSaved={(msg) => { setAdding(false); say(msg); load(); }} />}
      {peopleFor && <CompanyPeople lead={peopleFor} onClose={() => setPeopleFor(null)} onAdded={(m) => { say(m); load(); }} />}
      {setup && status && <Setup s={status} demo={demo} onClose={() => setSetup(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function AddLead({ niches, countries, apollo, onClose, onSaved }: { niches: string[]; countries: string[]; apollo: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const [f, setF] = useState({ ...EMPTY });
  const [useApollo, setUseApollo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  // Paste any link → put it in the right box.
  function smartPaste(v: string) {
    const u = v.trim();
    if (/instagram\.com/i.test(u)) setF({ ...f, instagram: u, sourceUrl: u });
    else if (/linkedin\.com/i.test(u)) setF({ ...f, linkedin: u, sourceUrl: u });
    else if (/@/.test(u) && !/\//.test(u)) setF({ ...f, email: u });
    else if (u) setF({ ...f, website: u, sourceUrl: u });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await api("/api/leads", { method: "POST", body: JSON.stringify({ lead: f, apollo: useApollo }) });
      if (!r.ok) throw new Error(r.error);
      const what = r.action === "added" ? "Added to the sheet" : r.action === "updated" ? `Already there — filled ${r.filled.join(", ")}` : "Already in the sheet — nothing new";
      onSaved(`${r.lead.business}: ${what}${r.notes?.length ? ` · ${r.notes.join(" · ")}` : ""}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal card" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-labelledby="add-title">
        <h2 id="add-title">Add a lead</h2>
        <label htmlFor="paste">Paste a website, LinkedIn or Instagram link</label>
        <input id="paste" placeholder="e.g. peakrealty.ae or instagram.com/peakrealtydxb" onPaste={(e) => { e.preventDefault(); smartPaste(e.clipboardData.getData("text")); }} onBlur={(e) => { if (e.target.value) { smartPaste(e.target.value); e.target.value = ""; } }} />
        <div className="grid2">
          <div><label htmlFor="a-b">Business name</label><input id="a-b" value={f.business} onChange={set("business")} /></div>
          <div><label htmlFor="a-f">Person name</label><input id="a-f" value={f.founder} onChange={set("founder")} /></div>
          <div><label htmlFor="a-t">Job title</label><input id="a-t" value={f.title} onChange={set("title")} /></div>
          <div><label htmlFor="a-e">Email</label><input id="a-e" type="email" value={f.email} onChange={set("email")} /></div>
          <div><label htmlFor="a-p">Phone</label><input id="a-p" value={f.phone} onChange={set("phone")} /></div>
          <div><label htmlFor="a-wa">WhatsApp number</label><input id="a-wa" value={f.whatsapp} onChange={set("whatsapp")} placeholder="If different from phone" /></div>
          <div><label htmlFor="a-w">Website</label><input id="a-w" value={f.website} onChange={set("website")} /></div>
          <div><label htmlFor="a-i">Instagram</label><input id="a-i" value={f.instagram} onChange={set("instagram")} /></div>
          <div><label htmlFor="a-l">LinkedIn</label><input id="a-l" value={f.linkedin} onChange={set("linkedin")} /></div>
          <div><label htmlFor="a-n">Niche</label><input id="a-n" list="niches" value={f.niche} onChange={set("niche")} /><datalist id="niches">{niches.map((n) => <option key={n} value={n} />)}</datalist></div>
          <div><label htmlFor="a-c">Country</label><input id="a-c" list="countries" value={f.country} onChange={set("country")} placeholder="Guessed from the website if empty" /><datalist id="countries">{countries.map((n) => <option key={n} value={n} />)}</datalist></div>
        </div>
        <p className="muted small">Before saving, we read their website for a missing email, phone and socials (free). Duplicates are caught: if they're already in the sheet, only the empty cells get filled.</p>
        <label className="check"><input type="checkbox" checked={useApollo} disabled={!apollo} onChange={(e) => setUseApollo(e.target.checked)} /> Still no email? Ask Apollo (uses about 1 credit, only if it finds one){!apollo && " — Apollo not connected"}</label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row-end"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save to sheet"}</button></div>
      </form>
    </div>
  );
}

function Setup({ s, demo, onClose }: { s: Status; demo: boolean; onClose: () => void }) {
  const [test, setTest] = useState<{ keyValid: boolean; peopleSearch: string; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  async function runTest() { setTesting(true); try { setTest(await api("/api/apollo/test")); } catch (e) { setTest({ keyValid: false, peopleSearch: "?", message: (e as Error).message }); } setTesting(false); }
  const item = (ok: boolean, label: string, how: string) => (
    <li className={ok ? "ok" : "todo"}><span aria-hidden="true">{ok ? "✓" : "○"}</span><div><b>{label}</b>{!ok && <div className="sub">{how}</div>}</div></li>
  );
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="setup-title">
        <h2 id="setup-title">Setup</h2>
        <ul className="checklist">
          {item(s.sheet, "Google Sheet connected", "Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and LEADS_SHEET_ID, and share the sheet with the service account (SETUP.md, step 2).")}
          {item(s.extensionKey, "Chrome extension key set", "Add CAPTURE_KEY, then paste the same key into the extension's settings.")}
          {item(s.apollo, "Apollo connected (optional)", "Add APOLLO_API_KEY (a master key) to find missing emails.")}
          {item(s.cron, "Daily automation on", "Add CRON_SECRET. Vercel then runs it every morning at 9:00 IST.")}
        </ul>
        <div className="apollo-test">
          <button className="btn" onClick={runTest} disabled={testing}>{testing ? "Testing Apollo…" : "Test Apollo connection"}</button>
          {test && (
            <div className={`banner ${test.keyValid && test.peopleSearch === "ok" ? "ok" : "warn"}`} role="status">
              <b>{test.keyValid ? "Key works" : "Key not working"}</b>{test.keyValid && <> · Company people: {test.peopleSearch === "ok" ? "✓" : "✗"}</>}
              <div>{test.message}</div>
            </div>
          )}
        </div>
        <p className="muted small">Daily automation: reads the websites of leads missing an email (free){s.autoEnrichPerDay ? `, then asks Apollo for up to ${s.autoEnrichPerDay} a day` : ". Apollo auto-enrich is off (set AUTO_ENRICH_PER_DAY to turn it on)"}.</p>
        {demo && <p className="banner warn">You're looking at demo leads. Nothing is saved until the sheet is connected.</p>}
        <div className="row-end"><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

type Person = { id: string; name: string; title: string; linkedin: string; location: string; hasEmail: boolean };

function CompanyPeople({ lead, onClose, onAdded }: { lead: Lead; onClose: () => void; onAdded: (m: string) => void }) {
  const [data, setData] = useState<{ total: number; people: Person[]; demo: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null); setErr("");
    api(`/api/apollo/company?domain=${encodeURIComponent(lead.website)}&page=${page}`).then(setData).catch((e) => setErr((e as Error).message));
  }, [lead.website, page]);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function add() {
    setBusy(true);
    try {
      const r = await api("/api/apollo/add", { method: "POST", body: JSON.stringify({ ids: [...picked], niche: lead.niche, sourceUrl: `apollo: ${lead.website}` }) });
      const parts = [r.added && `${r.added} added`, r.updated && `${r.updated} updated`, r.duplicate && `${r.duplicate} already in sheet`, r.failed && `${r.failed} failed`].filter(Boolean);
      onAdded(`${lead.business}: ${parts.join(" · ") || "nothing saved"}${r.errors?.length ? ` — ${r.errors[0]}` : ""}`);
      onClose();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal card wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="pp-title">
        <h2 id="pp-title">People at {lead.business}</h2>
        <p className="muted small">{lead.website} · from Apollo{data?.demo ? " (demo data)" : ""}. Looking people up is free. Adding them to the sheet finds their email, which uses about 1 Apollo credit each, only if an email is found.</p>
        {err && <p className="err" role="alert">{err}</p>}
        {!data && !err && <p className="muted">Asking Apollo…</p>}
        {data && (
          <>
            <p className="total"><b>{data.total.toLocaleString()}</b> {data.total === 1 ? "person" : "people"} in Apollo at this company</p>
            <div className="table-wrap">
              <table className="people">
                <thead><tr><th><span className="sr">Pick</span></th><th>Name</th><th>Job title</th><th>Location</th><th>Email in Apollo</th></tr></thead>
                <tbody>
                  {data.people.length === 0 && <tr><td colSpan={5} className="empty">Apollo has no people for this company.</td></tr>}
                  {data.people.map((p) => (
                    <tr key={p.id}>
                      <td><input type="checkbox" aria-label={`Pick ${p.name}`} checked={picked.has(p.id)} onChange={() => toggle(p.id)} /></td>
                      <td>{p.linkedin ? <a href={p.linkedin} target="_blank" rel="noreferrer">{p.name}</a> : p.name}</td>
                      <td>{p.title || <span className="muted">—</span>}</td>
                      <td>{p.location || <span className="muted">—</span>}</td>
                      <td>{p.hasEmail ? "Yes" : <span className="muted">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-end">
              {page > 1 && <button className="btn ghost" onClick={() => setPage(page - 1)}>← Previous</button>}
              {data.total > page * 25 && <button className="btn ghost" onClick={() => setPage(page + 1)}>Next 25 →</button>}
              <button className="btn ghost" onClick={onClose}>Close</button>
              <button className="btn primary" disabled={!picked.size || busy} onClick={add}>{busy ? "Adding…" : `Add ${picked.size || ""} to sheet`}</button>
            </div>
          </>
        )}
        {!data && <div className="row-end"><button className="btn ghost" onClick={onClose}>Close</button></div>}
      </div>
    </div>
  );
}
