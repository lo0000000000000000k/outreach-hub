# Outreach Hub — project guide for Claude Code

Client-outreach tool for 91 Agency (AI Tool Kart · The Distro Co · video & content agency).
Only user: Priyanshu (the boss, non-technical). Built and maintained by Harshit.

## What it does (v1.4)
- **Chrome/Edge/Brave extension** (`extension/`): Alt+Shift+S = instant save of the prospect on the current page
  (Apollo person/ticked list, LinkedIn, Instagram, any website). Click icon = review popup with "Get from Apollo".
- **Dashboard** (Next.js, `app/`, `components/Dashboard.tsx`): pipeline counts, filters, status dropdown,
  "Find email", "People" (Apollo company people), WhatsApp check, activity log, Setup → Test Apollo.
- **Lead store = Google Sheet** (service account). Tab `Leads` + `Log`. Columns: Business Name, Person Name, Job Title,
  Website, Email, Phone, WhatsApp, Instagram, LinkedIn, Niche, Country, Source URL, Date Added, Status.
- **Daily cron** (`vercel.json`, `/api/cron/daily`, 9:00 IST): free website scan for missing emails; Apollo only if
  `AUTO_ENRICH_PER_DAY` > 0.

## Stack & layout
- Next.js 15 App Router + TypeScript, deployed on Vercel from GitHub `master` branch (auto-deploy on push).
- `lib/leads.ts` sheet backend + demo backend, dedupe (`findDuplicate`), `addOrMerge` (fills EMPTY cells only), header migration.
- `lib/extract.ts` page cleaning (pure functions). `lib/capture.ts` capture/enrich pipeline. `lib/apollo.ts` Apollo API.
- `lib/website.ts` free scan of /contact /about. `lib/activity.ts` Log tab. `lib/auth.ts` jose session (passcode).
- `extension/`: MV3 — `background.js` (Alt+Shift+S), `extract.js` (runs in page), `popup.*`.
- Tests: `npm test` (offline, tsx, demo mode). Always run `npx tsc --noEmit -p .` and `npm test` after changes.

## Rules (don't break these)
- Never commit `.env.local` or any key. Secrets live in Vercel env vars.
- Nothing is ever deleted from the sheet; enrichment never overwrites a filled cell (except WhatsApp check + status).
- Every change that spends credits or sends a message needs the boss's explicit click. No silent Apollo spend.
- The boss writes his own outreach messages — AI may research and suggest, never auto-write and send.
- LinkedIn/Facebook: no unofficial scraping or automation that risks his accounts. Use official APIs or Unipile with daily caps.
- Keep the UI simple for a non-technical user; plain-English error messages.
- Extension must work in Chrome, Edge and Brave (Brave hides tab.url — read the URL from the page).

## Deploy
`git add . && git commit -m "..." && git push` → Vercel builds `master`. Env var changes need a Redeploy.
Live: https://outreach-hub-pi.vercel.app

## Roadmap (v2)
1. Apollo phone fix: split "Company phone" (org) vs "Mobile" (person reveal, ~8 credits, button only).
2. Deeper lead details: Apollo org enrich (size, industry, revenue, socials), person seniority/history, deeper site scan,
   AI research brief (talking points only). Lead profile page.
3. LinkedIn send/receive via Unipile (€49/mo, 7-day trial) from a secondary account, 20–30 actions/day cap.
4. Per-lead timeline, follow-up reminders, saved templates with {name}/{company}, unified reply inbox.
5. Facebook: "copy + open Messenger" button (no cold-DM API exists). SMS: Telnyx foreign number, warm leads only,
   daytime-only sending, STOP opt-out, daily cap (US needs A2P 10DLC registration).
