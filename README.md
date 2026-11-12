# ElecTrack

IoT smart energy monitoring: custom ESP32 + PZEM-004T devices → Supabase → Android app.

```
device (simulator now, ESP32 later)
   │  POST readings every few seconds
   ▼
supabase/functions/ingest      checks the device secret, stores readings
   ▼
Postgres (supabase/migrations) household · smart_plug · appliance · consumption_reading
   ▼  Realtime
app/ (Expo, Android)           live watts per appliance
```

| Folder | What it is |
|---|---|
| `supabase/migrations/` | Database schema, named after the manuscript's Data Dictionary |
| `supabase/functions/ingest/` | The one endpoint every device posts to |
| `simulator/` | Fake devices, so the software works before the hardware exists |
| `app/` | The Android app (Expo / React Native) |
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

The app shows four appliances with watts changing live. Stop the simulator and
after 90 seconds each one turns grey and reads "Offline".

## Things to know

- **Secrets stay out of Git.** `simulator/.env` and `app/.env.local` are ignored. Never commit them.
- **The slice has no login yet.** Anyone holding the publishable key can read the
  demo readings. Per-user security arrives with the accounts step, before any real household data.
- **Free Supabase projects pause** after about a week with no activity. Un-pause from the dashboard.
- **Energy is a running counter.** `reading_kwh` stores each meter channel's cumulative
  kWh, exactly as the PZEM-004T reports it. Energy used in a period = last − first.
