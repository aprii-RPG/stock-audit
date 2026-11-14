# Google Sheets sync setup

The **Sync Approved to Google Sheets** button sends all currently approved audit items to a dedicated Google Sheets tab. Repeated syncs update existing rows by Audit Item ID instead of adding duplicates. This is a manual, one-way sync: click the button whenever you want to push the latest approvals.

## 1. Create a spreadsheet and Apps Script

1. Create a Google spreadsheet for this integration. Use a dedicated tab; do not put unrelated data in the tab because sync rewrites its data rows.
2. In the spreadsheet, choose **Extensions → Apps Script**.
3. Replace the editor contents with [`Code.gs`](./Code.gs), then save the project.
4. In Apps Script, open **Project Settings → Script properties** and add:
   - `SPREADSHEET_ID`: the value between `/d/` and `/edit` in the spreadsheet URL.
   - `SHEET_NAME`: `Approved Products` (or your chosen tab name).
   - `SYNC_SECRET`: a long, random secret (at least 32 characters). Keep it private.

## 2. Deploy the receiver

1. Click **Deploy → New deployment**.
2. Select **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**. The app does not expose the secret to the browser; the server sends it, and the script rejects requests with a wrong secret.
5. Click **Deploy**, authorize the script when prompted, then copy the web app URL ending in `/exec`.

## 3. Configure the app server

In the hosting provider's environment variables (for example, Vercel → Project → Settings → Environment Variables), add:

- `GOOGLE_SHEETS_WEB_APP_URL`: the deployed Apps Script `/exec` URL.
- `GOOGLE_SHEETS_SYNC_SECRET`: the exact same secret as the Apps Script `SYNC_SECRET`.

Redeploy the app after setting the variables. Do not put either value in a `VITE_` variable or frontend code.

## 4. Sync approved products

Sign in as an admin or back-office user, open **Reports & Export**, and click **Sync Approved to Google Sheets**. The sheet includes branch, product, count/variance, INR values, reason, and approver details. The button reports the number synced or displays an error if configuration/deployment is incomplete.

After redeploying the Apps Script, update `GOOGLE_SHEETS_WEB_APP_URL` if Google gives you a different deployment URL.
