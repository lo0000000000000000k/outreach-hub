// Alt+Shift+S = save this page's prospect straight to the sheet (no popup). Works on Apollo, LinkedIn,
// Instagram and any website. A small message appears on the page with the result.
importScripts("extract.js");

function toast(message, ok) {
  const id = "__outreach_hub_toast";
  document.getElementById(id)?.remove();
  const d = document.createElement("div");
  d.id = id;
  d.textContent = message;
  d.setAttribute("role", "status");
  Object.assign(d.style, {
    position: "fixed", zIndex: 2147483647, right: "20px", bottom: "20px", maxWidth: "380px", padding: "12px 16px",
    borderRadius: "10px", font: "14px/1.4 system-ui, sans-serif", color: "#fff", whiteSpace: "pre-line",
    background: ok ? "#1e3a5f" : "#9b1c1c", boxShadow: "0 6px 24px rgba(0,0,0,.25)",
  });
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ok ? 5000 : 8000);
}

async function show(tabId, message, ok = true) {
  try { await chrome.scripting.executeScript({ target: { tabId }, func: toast, args: [message, ok] }); } catch (e) { /* page doesn't allow scripts */ }
  chrome.action.setBadgeText({ tabId, text: ok ? "✓" : "!" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? "#0f6e5a" : "#9b1c1c" });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }), 4000);
}

async function post(settings, path, payload) {
  const res = await fetch(settings.appUrl.replace(/\/$/, "") + path, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Capture-Key": settings.key }, body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Server error ${res.status}`);
  return j;
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "quick-save" || !tab?.id) return;
  const settings = await chrome.storage.sync.get({ appUrl: "", key: "" });
  if (!settings.appUrl || !settings.key) return show(tab.id, "Outreach Hub: click the extension icon → Settings, and add the app address + capture key first.", false);
  await show(tab.id, "Outreach Hub: saving…");
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    const captured = r?.result;
    if (!captured) throw new Error("Couldn't read this page. Reload it and try again.");
    if (new URL(captured.pageUrl).origin === new URL(settings.appUrl).origin) throw new Error("this is the app itself. Open a prospect's page (Apollo, LinkedIn, Instagram or a website) and press Alt+Shift+S there.");
    const { lastNiche = "", useApollo = false } = await chrome.storage.local.get(["lastNiche", "useApollo"]);

    if (captured.kind === "apollo") {
      if (!captured.apollo?.length) throw new Error("Open a person in Apollo, or tick the people you want in the list, then press Alt+Shift+S.");
      const j = await post(settings, "/api/capture/apollo", { items: captured.apollo, pageUrl: captured.pageUrl, niche: "" });
      const parts = [j.added && `${j.added} added`, j.updated && `${j.updated} updated`, j.duplicate && `${j.duplicate} already in sheet`, j.failed && `${j.failed} failed`].filter(Boolean);
      return show(tab.id, `Outreach Hub ✓ ${parts.join(" · ") || "nothing saved"}${j.names?.length ? `\n${j.names.slice(0, 5).join(", ")}${j.names.length > 5 ? "…" : ""}` : ""}${j.errors?.length ? `\n${j.errors[0]}` : ""}`, !j.failed || j.added + j.updated + j.duplicate > 0);
    }

    const j = await post(settings, "/api/capture/quick", { captured, niche: lastNiche, apollo: useApollo });
    if (!j.ok) throw new Error(j.error);
    const what = j.action === "added" ? "added to the sheet" : j.action === "updated" ? `already there — filled ${j.filled.join(", ")}` : "already in the sheet";
    show(tab.id, `Outreach Hub ✓ ${j.lead.business}: ${what}${j.lead.email ? `\n${j.lead.email}` : "\nNo email found"}`);
  } catch (e) {
    show(tab.id, `Outreach Hub: ${e.message}`, false);
  }
});
