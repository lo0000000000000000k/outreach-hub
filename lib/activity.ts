// Activity log: every capture, enrichment and automation run. Kept in a "Log" tab of the same sheet
// (so the boss can see it there too), or in memory in demo mode.
import { env } from "./env";
import { sheetRaw } from "./leads";

export type Activity = { at: string; action: string; lead: string; detail: string };
const memory: Activity[] = [];

async function ensureLogTab() {
  // Fails if the tab is already there — then leave it alone (writing the header could overwrite its first row).
  const made = await sheetRaw.sheets(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: env.logTab() } } }] }) }).catch(() => null);
  if (!made) return;
  const tab = encodeURIComponent(env.logTab());
  await sheetRaw.sheets(`values/${tab}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [["Time", "Action", "Lead", "Detail"]] }) });
}

export async function logActivity(action: string, lead: string, detail = "") {
  const a: Activity = { at: new Date().toISOString(), action, lead: lead.slice(0, 120), detail: detail.slice(0, 300) };
  memory.unshift(a); memory.splice(200);
  if (!sheetRaw.enabled()) return;
  const tab = encodeURIComponent(env.logTab());
  const send = () => sheetRaw.sheets(`values/${tab}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", body: JSON.stringify({ values: [[a.at, a.action, a.lead, a.detail]] }),
  });
  try { await send(); } catch { try { await ensureLogTab(); await send(); } catch { /* logging never breaks the app */ } }
}

export async function recentActivity(limit = 30): Promise<Activity[]> {
  if (!sheetRaw.enabled()) return memory.slice(0, limit);
  try {
    const tab = encodeURIComponent(env.logTab());
    const j = await sheetRaw.sheets(`values/${tab}!A2:D5000`);
    return ((j.values || []) as string[][]).slice(-limit).reverse().map((r) => ({ at: r[0] || "", action: r[1] || "", lead: r[2] || "", detail: r[3] || "" }));
  } catch { return memory.slice(0, limit); }
}
