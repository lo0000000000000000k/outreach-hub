// Outreach Hub capture popup: read page → clean + duplicate check → edit → save to the sheet.
const $ = (id) => document.getElementById(id);
const FIELDS = ["business", "founder", "title", "email", "phone", "whatsapp", "website", "instagram", "linkedin", "niche", "country"];
let settings = { appUrl: "", key: "" };
let sourceUrl = "";

const show = (id, on = true) => { $(id).hidden = !on; };
function fail(msg) { show("loading", false); $("error").textContent = msg; show("error"); }

async function call(path, payload) {
  const res = await fetch(settings.appUrl.replace(/\/$/, "") + path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Capture-Key": settings.key }, body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Server error ${res.status}`);
  return j;
}

function openSettings(msg = "") {
  ["loading", "form", "result", "error"].forEach((id) => show(id, false));
  $("appUrl").value = settings.appUrl; $("key").value = settings.key; $("settingsMsg").textContent = msg;
  chrome.storage.local.get(["draft_appUrl", "draft_key"]).then((d) => {
    if (d.draft_appUrl) $("appUrl").value = d.draft_appUrl;
    if (d.draft_key) $("key").value = d.draft_key;
  });
  show("settings");
}

async function start() {
  ["settings", "form", "result", "error"].forEach((id) => show(id, false));
  show("loading");
  if (!settings.appUrl || !settings.key) return openSettings("First, connect to your Outreach Hub.");
  let captured;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return fail("Open a website, LinkedIn, Instagram or Apollo page first.");
    // Some browsers (e.g. Brave) hide tab.url from the popup — read the address from the page itself instead.
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    captured = r?.result;
  } catch (e) { return fail("Can't read this tab. Open a normal website, LinkedIn, Instagram or Apollo page (not a browser or new-tab page), reload it, and try again."); }
  if (!captured || !/^https?:/.test(captured.pageUrl || "")) return fail("Couldn't read this page. Reload it and try again.");
  if (new URL(captured.pageUrl).origin === new URL(settings.appUrl).origin) return fail("This is Outreach Hub itself. Open a prospect's website, LinkedIn, Instagram or Apollo page, then click again.");
  sourceUrl = captured.pageUrl;
  if (captured.kind === "apollo") {
    show("loading", false);
    const n = captured.apollo?.length || 0;
    if (!n) return fail("Open a person in Apollo, or tick the people you want in the list.");
    $("resultMsg").textContent = `Saving ${n} ${n === 1 ? "person" : "people"} from Apollo…`;
    show("result");
    try {
      const j = await call("/api/capture/apollo", { items: captured.apollo, pageUrl: captured.pageUrl });
      const parts = [j.added && `${j.added} added`, j.updated && `${j.updated} updated`, j.duplicate && `${j.duplicate} already in sheet`, j.failed && `${j.failed} failed`].filter(Boolean);
      $("resultMsg").textContent = `${parts.join(" · ") || "Nothing saved"}${j.names?.length ? `\n${j.names.join(", ")}` : ""}${j.errors?.length ? `\n${j.errors[0]}` : ""}`;
      $("resultMsg").style.whiteSpace = "pre-line";
    } catch (e) { show("result", false); fail(e.message); }
    return;
  }
  try {
    const p = await call("/api/capture/preview", captured);
    FIELDS.forEach((f) => { $(f).value = p.draft[f] || ""; $(f).classList.remove("filled"); $(f).parentElement.querySelector(".from")?.remove(); });
    show("apolloBox", false);
    const fillList = (id, items) => { const dl = $(id); dl.replaceChildren(...items.map((n) => Object.assign(document.createElement("option"), { value: n }))); };
    fillList("niches", p.niches); fillList("countries", p.countries);
    if (p.duplicate) {
      $("dup").textContent = `Already in the sheet: ${p.duplicate.business} (${p.duplicate.status}, added ${p.duplicate.dateAdded}). Saving only fills its empty cells.`;
      show("dup");
    } else show("dup", false);
    const { lastNiche = "", useApollo = false } = await chrome.storage.local.get(["lastNiche", "useApollo"]);
    if (!$("niche").value) $("niche").value = lastNiche;
    $("apollo").checked = useApollo;
    show("loading", false); show("form");
    $("business").focus();
  } catch (e) { fail(e.message); }
}

$("form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("save").disabled = true; $("save").textContent = "Saving…";
  const lead = Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()]));
  lead.sourceUrl = sourceUrl;
  await chrome.storage.local.set({ lastNiche: lead.niche, useApollo: $("apollo").checked });
  try {
    const r = await call("/api/capture/save", { lead, apollo: false }); // in the popup, Apollo is the "Get from Apollo" button
    if (!r.ok) throw new Error(r.error);
    const what = r.action === "added" ? `Added to the sheet ✓` : r.action === "updated" ? `Already there — filled ${r.filled.join(", ")} ✓` : "Already in the sheet — nothing new to add";
    $("resultMsg").textContent = `${r.lead.business}: ${what}${r.notes?.length ? `\n${r.notes.join(" · ")}` : ""}`;
    $("resultMsg").style.whiteSpace = "pre-line";
    show("form", false); show("result");
  } catch (e) { fail(e.message); }
  $("save").disabled = false; $("save").textContent = "Save to sheet";
});

$("apollo").addEventListener("change", () => chrome.storage.local.set({ useApollo: $("apollo").checked }));

// ── "Get from Apollo": fill the form (nothing is saved until you press Save) ──
function fillFromApollo(fields) {
  const filled = [];
  for (const [k, v] of Object.entries(fields || {})) {
    if (!v || !FIELDS.includes(k)) continue;
    const el = $(k);
    if (el.value.trim()) continue; // never overwrite what's already in a box
    el.value = v; el.classList.add("filled");
    let tag = el.parentElement.querySelector(".from");
    if (!tag) { tag = document.createElement("span"); tag.className = "from"; el.parentElement.appendChild(tag); }
    tag.textContent = "from Apollo";
    filled.push(k === "founder" ? "name" : k);
  }
  return filled;
}

async function apolloLookup(payload) {
  const btn = $("getApollo");
  btn.disabled = true; btn.textContent = "Asking Apollo…";
  show("apolloBox"); $("apolloPeople").replaceChildren(); $("apolloMsg").textContent = "";
  try {
    const r = await call("/api/capture/apollo-lookup", payload);
    if (r.mode === "person") {
      const got = fillFromApollo(r.fields);
      $("apolloMsg").textContent = got.length
        ? `Apollo filled: ${got.join(", ")}.${r.fields.email ? "" : " No email in Apollo for this person."} Check it, then press Save.`
        : "Apollo found them, but had nothing new to add.";
    } else {
      $("apolloMsg").textContent = `${r.total.toLocaleString()} ${r.total === 1 ? "person" : "people"} at ${r.domain} in Apollo. Pick one to fill the form (may use ~1 credit for their email):`;
      if (!r.people.length) $("apolloMsg").textContent = `Apollo has no people for ${r.domain}.`;
      for (const p of r.people) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        const n = document.createElement("div"); n.textContent = p.name + (p.hasEmail ? "  ✉" : "");
        const t = document.createElement("div"); t.className = "t"; t.textContent = [p.title, p.location].filter(Boolean).join(" · ");
        b.append(n, t);
        b.addEventListener("click", () => { FIELDS.forEach((f) => { if (["founder", "title", "email", "linkedin"].includes(f)) $(f).value = ""; }); apolloLookup({ id: p.id }); });
        li.append(b); $("apolloPeople").append(li);
      }
    }
  } catch (e) { $("apolloMsg").textContent = e.message; }
  btn.disabled = false; btn.textContent = "Get from Apollo";
}
$("getApollo").addEventListener("click", () => apolloLookup({ lead: Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()])) }));

$("gear").addEventListener("click", () => openSettings());
$("again").addEventListener("click", start);
// Save each box as you type, so closing the popup (e.g. to copy something) loses nothing.
for (const id of ["appUrl", "key"]) {
  $(id).addEventListener("input", () => chrome.storage.local.set({ ["draft_" + id]: $(id).value }));
}
function fixUrl(u) { u = u.trim(); if (u && !/^https?:\/\//i.test(u)) u = (/^(localhost|127\.)/.test(u) ? "http://" : "https://") + u; return u; }

$("saveSettings").addEventListener("click", async () => {
  let url = fixUrl($("appUrl").value);
  try { url = new URL(url).origin; } catch { $("settingsMsg").textContent = "That address doesn't look right."; return; }
  settings = { appUrl: url, key: $("key").value.trim() };
  await chrome.storage.sync.set(settings);
  await chrome.storage.local.remove(["draft_appUrl", "draft_key"]);
  start();
});

chrome.storage.sync.get({ appUrl: "", key: "" }).then((s) => { settings = s; start(); });
