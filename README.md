# PBAT D2D Office Attendance

QR attendance that only works on the venue's WiFi.

- **Organiser** (`/admin`): log in with `ADMIN_PASSWORD`, add venues, and at each venue tap **Use this network** while connected to its WiFi.
- **QR screen** (`/admin/display/<venue>`): shows today's code. It changes every day at midnight (`TIMEZONE`, default Africa/Lagos). Leave it on a TV/laptop, or print it each morning.
- **Attendees** scan the code with their phone camera. The first time they add their name and the last 4 digits of their PBAT-D2D number (`PBAT-D2D-2027-` is filled in; change it with `NUMBER_PREFIX` / `NUMBER_DIGITS`); after that one scan checks them in. A scan only counts if the phone is on the venue's WiFi, the code is today's, and they haven't already checked in there today.

## How the WiFi check works
Websites can't see a phone's WiFi name, so the app uses the venue's **internet address**: every phone on the same WiFi reaches the internet through the same router, so they share one public IPv4 address (or IPv6 /64 prefix). "Use this network" saves it; check-ins from any other address (mobile data, home WiFi) are refused.
- If the router restarts and gets a new address, check-ins will fail until you tap **Use this network** again at the venue.
- A venue can have several saved networks (e.g. two routers).
- Phones on mobile data are refused, which is why attendees are told to turn mobile data off.

## Cheating protections
- The code changes daily, so a photo of yesterday's code doesn't work.
- A code sent to someone at home doesn't work (wrong network).
- Each phone is linked to one person, and each person can check in once per venue per day.
- If someone registers a new phone with a PBAT-D2D number that is already in use, the check-in is marked **new phone** and the person shows more than one phone, so you can spot it.

## Run locally
```bash
npm install
npm start          # http://localhost:3000, admin password "admin"
```
Needs Node.js 22.13+.

## Deploy on Render (free)
1. Create a free Postgres database on **Neon** and copy its connection string.
2. Push this folder to a new GitHub repo.
3. Render → **New → Web Service** → pick the repo. Build `npm ci`, start `npm start`.
4. Environment: `NODE_ENV=production`, `NODE_VERSION=22`, `DATABASE_URL`, `ADMIN_PASSWORD`, and `SECRET` (any long random text).
5. Open `/admin`, log in, add a venue **while on the venue WiFi**.

**Check after deploying:** the dashboard shows *Your network right now*. Open it on the venue WiFi, then on mobile data: the address must change. If it doesn't, open `/api/admin/whoami` and send the output to whoever maintains the app.

## Check-out
The first scan of the day checks a person in. From `CHECKOUT_TIME` (default `17:00`, 24-hour, in `TIMEZONE`) the next scan checks them out. Earlier scans just say they're already checked in. The attendance list and CSV show time in, time out and hours.

## Admin password
It starts as `ADMIN_PASSWORD`. Use **Change password** in the dashboard to set a new one (stored as a hash in the database; other logged-in devices are logged out). Forgot it? Change `ADMIN_PASSWORD` on Render and redeploy: the new value replaces the dashboard password.

## Office list (who may sign in)
In **People**, click **Upload office list** and choose an Excel (.xlsx) or CSV file with a name column (or Surname + First name columns) and a PBAT number column. You see a preview (new / updated / skipped rows) before saving. **+ Add person** adds one person by hand.
Once the list has anyone on it:
- only numbers on the list can register, and the name typed must match the list (any order, any case; an extra middle name is fine),
- each number can be linked to **one phone only**. To move someone to a new phone, use **Reset phone**.

## Downloads
**Attendance → Download Excel** gives a formatted .xlsx with an Attendance sheet (date, name, number, office, time in/out, hours) and a Summary sheet (days present and total hours per person). A **PDF** report (logo, table, page numbers) is next to it for printing or sending.

## Signing someone in from the dashboard
For people without a smartphone: **People → Sign in** (and later **Sign out**) next to their name. It records the current time at the chosen office and is marked **by admin** in the attendance list, Excel and CSV.
