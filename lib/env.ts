// All settings come from environment variables (see .env.example).
const e = (k: string) => (process.env[k] ?? "").trim();

export const env = {
  passcode: () => e("OUTREACH_PASSCODE"),
  sessionSecret: () => e("SESSION_SECRET") || "dev-only-secret-change-me-please-1234",
  /** The Chrome extension sends this key with every capture. */
  captureKey: () => e("CAPTURE_KEY"),
  cronSecret: () => e("CRON_SECRET"),
  /** Demo leads when the sheet isn't connected (set DEMO=0 in production). */
  demoAllowed: () => e("DEMO") !== "0",

  googleEmail: () => e("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
  // Works whether the key is pasted with or without surrounding quotes (Vercel keeps them literally).
  googleKey: () => e("GOOGLE_PRIVATE_KEY").replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
  sheetId: () => e("LEADS_SHEET_ID"),
  sheetTab: () => e("LEADS_SHEET_TAB") || "Leads",
  logTab: () => e("LOG_SHEET_TAB") || "Log",

  apolloKey: () => e("APOLLO_API_KEY"),
  /** Daily automation: how many leads without an email to enrich with Apollo (credits!). 0 = off. */
  autoEnrichPerDay: () => Math.max(0, Math.min(200, Number(e("AUTO_ENRICH_PER_DAY") || 0) || 0)),
  timezone: () => e("BOSS_TIMEZONE") || "Asia/Kolkata",
};

/** True only when real Google credentials are filled in (not the .env.example placeholders). */
export function sheetConfigured() {
  const k = env.googleKey(), em = env.googleEmail(), id = env.sheetId();
  return !!(k && em && id) && k.includes("BEGIN PRIVATE KEY") && k.length > 500 && !em.includes("your-project") && id !== "the-long-id-in-the-sheet-url";
}

export function integrationStatus() {
  return {
    sheet: sheetConfigured(),
    apollo: !!env.apolloKey(),
    extensionKey: !!env.captureKey(),
    cron: !!env.cronSecret(),
    autoEnrichPerDay: env.autoEnrichPerDay(),
  };
}

export class NotConfigured extends Error {
  constructor(what: string) { super(`${what} isn't connected yet — see SETUP.md.`); }
}
