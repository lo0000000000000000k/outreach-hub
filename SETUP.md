# Outreach Hub — setup (about 20 minutes)

**What it does (v1):** one click on any LinkedIn profile, Instagram profile or website saves that prospect to the
Google Sheet. Missing email, phone or socials are found on their own website (free), or with Apollo if you tick it.
Duplicates are caught (by website, email, Instagram, LinkedIn or phone). When a prospect is already in the sheet,
only its empty cells are filled and nothing is overwritten. The dashboard shows the pipeline, filters, status changes
and an activity log. Every morning an automation fills missing emails.

Coming next (v2): sequences on email, LinkedIn and Instagram, one inbox for replies, and status sync.

## 1. Deploy
1. Push this folder to GitHub → Vercel → **New Project** → import it.
2. Add every variable from `.env.example` in Vercel → Settings → Environment Variables. To make random strings,
   run `openssl rand -hex 24` (or mash the keyboard; 32+ characters).
3. Deploy. Open the URL, log in with `OUTREACH_PASSCODE`. Until the sheet is connected you'll see demo leads.

## 2. Connect the Google Sheet
1. Google Cloud Console → new project → enable **Google Sheets API**.
2. IAM → Service Accounts → create one → Keys → Add key → JSON. Copy `client_email` into
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` into `GOOGLE_PRIVATE_KEY` (keep the `\n`s).
3. Open the lead sheet → **Share** → paste the service-account email → **Editor**.
4. `LEADS_SHEET_ID` = the long id in the sheet's URL (between `/d/` and `/edit`). Tab name → `LEADS_SHEET_TAB`.
5. Columns (any order; an empty tab gets them automatically): **Business Name, Person Name, Job Title, Website, Email,
   Phone, WhatsApp, Instagram, LinkedIn, Niche, Country, Source URL, Date Added, Status**.
   Older sheets are upgraded on their own: "Founder" becomes "Person Name", "Phone/WhatsApp" becomes "Phone", and
   Job Title + WhatsApp are added at the end. No data moves.
   Status values: New, Contacted, Replied, Meeting, Closed.
6. A **Log** tab is created by itself. It records every capture, update and daily run.
7. Set `DEMO=0` and redeploy.

## 3. Install the Chrome extension (Chrome or Edge)
1. `chrome://extensions` (or `edge://extensions`) → **Developer mode** on → **Load unpacked** → pick the `extension` folder.
2. Pin it. Click it → **Settings** → paste the app address and the `CAPTURE_KEY` → Save.
3. Use:
   - **Alt+Shift+S = instant save, no popup.** On Apollo, it saves the person whose page or side panel is open, or every person you've **ticked** in a list (up to 25). The full record comes from the Apollo API, so `APOLLO_API_KEY` must be set. On LinkedIn, Instagram or any website, it saves what the page shows. A message on the page confirms what happened.
   - **Click the icon (or Alt+Shift+O)** = review popup, where you can check and edit the fields before saving.
   - Shortcut not working? Open `chrome://extensions/shortcuts` (Edge: `edge://extensions/shortcuts`) and set Alt+Shift+S for "Save this prospect to the sheet instantly". Chrome skips a shortcut that another extension already uses.
   - LinkedIn: open their **Contact info** popup first and the extension also grabs their email/website.
   - "Already in the sheet" shows before you save.

## 4. Apollo (optional)
Create the key in Apollo → Settings → Integrations → API, with these APIs ticked: **People Enrichment** (find emails,
about 1 credit each, only when one is found), **People API Search** ("People at this company", 0 credits) and
**View a Contact**. Then go to Dashboard → Setup → **Test Apollo connection**.

`APOLLO_API_KEY` = a **master** API key (Apollo → Settings → API). Each email found costs about 1 credit.
It's only used when the box is ticked, when someone presses **Find email → + Apollo**, or by the daily automation
if `AUTO_ENRICH_PER_DAY` is above 0.

## 5. Daily automation
`vercel.json` runs `/api/cron/daily` at 03:30 UTC (9:00 IST). For leads with no email (up to 40 a day), it reads
their website for free. Then, if you allowed it, it asks Apollo for up to `AUTO_ENRICH_PER_DAY`. A summary line goes to the Log tab.
Run it by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP/api/cron/daily`.

## Security
- The dashboard needs the passcode (5 wrong tries → 5-minute lock).
- The extension can only add or fill leads, using `CAPTURE_KEY`. It can't read the sheet, change statuses or delete.
- Nothing is ever deleted, and enrichment only fills empty cells (it never overwrites what is there).
- The extension reads a page only when you click it (`activeTab`) and has no access to your other tabs.
