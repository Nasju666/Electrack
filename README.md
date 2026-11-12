# ElecTrack

IoT smart energy monitoring: custom ESP32 + PZEM-004T devices → Supabase → Android app.

```
device (simulator now, ESP32 later)
   │  POST readings every few seconds
   ▼
supabase/functions/ingest      checks the device secret, stores readings
   ▼
Postgres (supabase/migrations) all tables from the Data Dictionary, per-user security
   ▼  Realtime
app/ (Expo, Android)           accounts, pairing, live watts per appliance
```

| Folder | What it is |
|---|---|
| `supabase/migrations/` | Database schema, named after the manuscript's Data Dictionary |
| `supabase/functions/ingest/` | The one endpoint every device posts to |
| `simulator/` | Fake devices, so the software works before the hardware exists |
| `app/` | The Android app (Expo / React Native) |
| `ai/` | Daily analysis: patterns, unusual usage, saving tips (Python, scikit-learn) |
| `hardware/` | Shopping list now; wiring and firmware later |

## One-time setup (Windows, PowerShell)

### 1. Install tools
- Node.js LTS — https://nodejs.org
- Python 3 — https://www.python.org (tick "Add python.exe to PATH")
- Git — https://git-scm.com
- **Expo Go** on your Android phone (Play Store)

### 2. Create the Supabase project (by hand, in the browser)
1. Sign up at https://supabase.com and create a project. Region: **Southeast Asia (Singapore)**.
2. Save the **database password** it shows you. You need it in step 3.
3. From the project settings, note three things:
   - **Project ref** — the random id in the dashboard URL (`supabase.com/dashboard/project/<ref>`)
   - **Project URL** — `https://<ref>.supabase.co`
   - **Publishable key** — Settings → API Keys, starts with `sb_publishable_`

### 3. Push the database and the ingest function
Run these in `D:\008-CapstoneProject\Electrack`. Pick your own long random text for the secret.

```powershell
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push --remote
npx supabase secrets set INGEST_SECRET=make-up-a-long-random-string
npx supabase functions deploy ingest
```

`db push` asks for the database password from step 2. `functions deploy` prints
"Docker is not running" as a warning; that is fine, it deploys anyway.

### 4. Configure the simulator and the app
```powershell
copy simulator\.env.example simulator\.env
copy app\.env.example app\.env.local
```
Open both new files in a text editor and fill in your project URL, the
publishable key, and the same `INGEST_SECRET` you chose in step 3.

```powershell
cd app
npm install
cd ..
```

## Run it

Two PowerShell windows, both starting in `D:\008-CapstoneProject\Electrack`.

**Window 1 — fake devices**
```powershell
py simulator\simulate.py
```
You should see a line per device every 5 seconds ending in `ok`.

**Window 2 — the app**
```powershell
cd app
npx expo start
```
Scan the QR code with Expo Go. Phone and PC must be on the same Wi-Fi; if the
phone cannot connect, use `npx expo start --tunnel` instead.

After you sign in and pair the devices (see Accounts below), the app shows your
appliances with watts changing live. Stop the simulator and after 90 seconds
each one turns grey and reads "Offline".

## Accounts (added after the first slice)

The app now has sign-up, sign-in, household setup and device pairing. Each
resident sees only their own household.

**One-time, by hand:** in the Supabase dashboard open Authentication → Sign In /
Providers → Email and turn **Confirm email** off. Supabase's built-in mailer
only sends a couple of emails per hour, which blocks testing. Turn it back on
(with your own SMTP sender) before real households use the app.

**Using it**
1. Open the app and create an account.
2. Set up your household.
3. Account tab → Devices and appliances → Pair a device → `ELT-PLUG-001`, then say what is plugged in.
4. Pair `ELT-STRIP-001` the same way and add an appliance to each outlet.
5. With the simulator running, the Home tab shows live watts.

Readings are stored only for outlets that have an appliance. A device nobody has
paired still reports in, but nothing is saved.

**Making an admin:** nobody can register as an admin. Create a normal account in
the app, then run this in the dashboard's SQL Editor with that account's email:

```sql
update users set user_role = 'Admin' where user_email = 'admin@example.com';
```

## History and bill estimate

- **History tab:** energy per hour (Today) or per day (7 / 30 days), for the whole
  household or one appliance.
- **Bill estimate (Home tab):** this month's energy so far, projected to month end,
  times the approved VECO rate. It covers monitored appliances only.

The estimate stays hidden until an approved rate exists. Until the admin screens
are built, add one by hand in the dashboard's SQL Editor (use the current VECO
residential rate):

```sql
insert into electricity_rate (rate_per_kwh, effective_from, rate_source, verification_status)
values (14.96, '2026-11-01', 'Manual', 'Approved');
```

## Alerts

- **High Usage:** an appliance stays above its alert level for two readings in a
  row. At most one alert per appliance every 30 minutes. Set the level per
  appliance under Account → Devices and appliances.
- **Device Offline:** a paired device is silent for 3 minutes. Checked once a
  minute by a scheduled job (Supabase Cron).

Alerts show on the Alerts tab with an unread badge. Phone push notifications are
a separate step.

To see one: set the aircon's alert level to 1000 W, keep the simulator running,
and wait for the compressor-on phase. Stop the simulator for 4 minutes to see
the offline alert.

## Admin side

Sign in with an admin account (see "Making an admin" above) to get three tabs:

- **Summary:** households, accounts, device status, total energy, alerts, and
  the log of admin actions.
- **Users:** deactivate or reactivate resident accounts.
- **VECO rate:** fetch the published rate, check it, and approve it. Bill
  estimates only ever use an approved rate.

**How the VECO fetch works.** The `fetch-veco-rate` function reads the Visayan
Electric newsroom feed, opens the newest rate announcement, and saves the
per-kWh figure it finds as a *pending* rate with a link to the article. It never
approves anything; an admin does, after checking the number.

**One-time setup for the daily automatic fetch**
1. Pick a second long random string and store it:
   `npx supabase secrets set CRON_SECRET=another-long-random-string`
2. In the Supabase dashboard open Integrations → Cron → create a job that runs
   once a day and calls the Edge Function `fetch-veco-rate` with method POST and
   the HTTP header `x-cron-secret` set to that same string.

The "Fetch from VECO" button in the app works without this setup.

## AI module (`ai/`)

`ai/analyze.py` studies the last 35 days of hourly energy per appliance and
fills the app's Insights tab:

- **Usage patterns:** K-Means learns each appliance's own idle and in-use power
  levels; from those come its usual hours, times of day and share of energy.
- **Unusual usage:** an Isolation Forest flags days that do not look like the
  rest; only days clearly above normal are reported. A new one from yesterday
  also raises an alert.
- **Ways to save:** rules applied to the learned levels and patterns, each with
  an estimated monthly saving.

**One-time setup**
```powershell
py -m pip install -r ai\requirements.txt
copy ai\.env.example ai\.env
```
Put your project URL and **secret key** (dashboard → Settings → API Keys →
Secret key) in `ai\.env`. The secret key bypasses every security rule: it stays
on your PC and in GitHub secrets, never in the app, never in Git.

**Try it before real data exists**
```powershell
py ai\test_analyze.py                              # checks the analysis, no database
py ai\backfill.py --email your-resident@email.com  # loads 28 days of simulated history
py ai\analyze.py                                   # analyses and saves the insights
```
`backfill.py` writes demo readings. Use it on test households only.

**Run it daily.** `.github/workflows/ai-analysis.yml` runs the analysis every
night once the repository is on GitHub and has two secrets, `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` (repository Settings → Secrets and variables → Actions).

## After pulling new code

```powershell
npx supabase db push --remote
npx supabase functions deploy ingest
npx supabase functions deploy fetch-veco-rate
cd app
npm install
npx expo start -c
```

## Things to know

- **Secrets stay out of Git.** `simulator/.env` and `app/.env.local` are ignored. Never commit them.
- **Device codes are the pairing password.** Anyone with an account who knows an
  unpaired device's code can claim it, so real devices should get codes that are hard to guess.
- **Free Supabase projects pause** after about a week with no activity. Un-pause from the dashboard.
- **Energy is a running counter.** `reading_kwh` stores each meter channel's cumulative
  kWh, exactly as the PZEM-004T reports it. Energy used in a period = last − first.
