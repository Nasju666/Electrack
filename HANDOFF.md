# ElecTrack — handoff and remaining-work plan

Written 2026-11-12. This file is for whoever continues the build: another AI
assistant or a developer. Read it top to bottom once; it replaces the chat
history. `README.md` has the setup and run commands; this file has the state,
the reasoning, and the plan.

**No secrets are in this file.** Keys live in `app/.env.local`,
`simulator/.env`, `ai/.env` (all git-ignored), Supabase function secrets, and
GitHub repository secrets.

---

## 1. What this project is

ElecTrack is a BSIT capstone: an IoT smart energy **monitoring** system
(no switching, no remote control). One developer (Nasju) is building it solo,
as fast as possible. The team's manuscript is the feature spec only (Scope and
Delimitation, List of Modules, ERD / Data Dictionary). Its sprint plan, tech
stack and hardware were explicitly a first draft.

Approved scope, all of which must work:

- Appliance-level monitoring: real time plus history per appliance.
- One heavy appliance (up to ~1,760 W, e.g. 1.5 HP aircon) on a High-Power
  Plug, plus up to three light appliances (150 W each or less) on a 3-outlet
  Power Strip.
- Monthly bill estimate at the VECO residential rate, which an admin approves
  before it is used.
- High-usage alerts, as push notifications.
- AI: usage patterns, unusual-usage detection, energy-saving recommendations.
- Android app for residents, plus an admin side (users, rate approval, summary
  reports).

Rule for all work: simplest thing that works, nothing outside the scope.

## 2. How the owner likes to work

- Direct, informal, short messages. Often replies just "ok".
- Wants a short scoped plan before a big build, then says go.
- Beginner at electronics. Comfortable following exact commands.
- Runs commands in Windows **Command Prompt**, from
  `D:\008-CapstoneProject\Electrack`. Python is `py`, not `python`.
- Sends screenshots or pasted terminal output when something breaks. Ask for
  that; it is reliable.
- Flag everything that must be done by hand, with exact commands.

## 3. Where everything is

| Thing | Location |
|---|---|
| Code on the owner's PC | `D:\008-CapstoneProject\Electrack` (git repo, branch `master`) |
| GitHub | `https://github.com/Nasju666/Electrack` (should be private) |
| Manuscript | `D:\008-CapstoneProject\ElectrackResearchDoc.docx` |
| Figma exports (37 PNGs) | `D:\008-CapstoneProject\figma\` and `figma\admin\` |
| Supabase project | ref `jryveajndyxjsqdfqzuz`, URL `https://jryveajndyxjsqdfqzuz.supabase.co`, region Sydney (chosen by "Auto"; cannot be changed) |
| Test devices in the database | `ELT-PLUG-001` (High-Power Plug), `ELT-STRIP-001` (Power Strip) |

Last commit when this was written: `3849689 Figma redesign, splash and intro`.

## 4. Architecture

```
device (simulator today, ESP32 later)
   |  HTTPS POST every 5-30 s, header x-device-secret
   v
Supabase Edge Function `ingest`      validates, stores readings, marks device Online
   v
Postgres (8 migrations)              tables from the Data Dictionary, row-level security,
   |                                 alert trigger, cron job, RPC functions
   |-- Realtime ------------------>  app (live watts, alerts badge)
   |-- RPC / REST ----------------->  app (history, bill, admin)
   v
ai/analyze.py (daily, GitHub Actions) reads hourly usage, writes insights + alerts

Edge Function `fetch-veco-rate`      reads VECO newsroom RSS, saves a PENDING rate
```

Stack: **Supabase** (Postgres, Auth, Realtime, Edge Functions, Cron) +
**Expo SDK 58** app with Expo Router + **Python** (pandas, scikit-learn) for AI.
FastAPI from the draft stack was cut: there is no server to host.

### Repository map

| Path | Contents |
|---|---|
| `supabase/migrations/` | 8 SQL files, applied in name order. Never edit an applied one; add a new file. |
| `supabase/functions/ingest/` | Device endpoint |
| `supabase/functions/fetch-veco-rate/` | `index.ts`, `parse.ts` (pure text logic), `parse_test.ts` (Deno tests) |
| `supabase/config.toml` | Both functions have `verify_jwt = false`; they do their own checks |
| `simulator/simulate.py` | Fake devices, standard library only |
| `ai/` | `analyze.py`, `backfill.py`, `synth.py`, `db.py`, `test_analyze.py`, `ai-analysis.workflow.yml` |
| `app/src/app/` | Screens (Expo Router file routes) |
| `app/src/lib/` | Shared code: `ui.tsx` (design system), `auth.tsx`, `live.tsx`, `usage.ts`, `format.ts`, `appliances.ts`, `alerts.ts`, `splash.tsx`, `welcome.ts`, `tabs.tsx`, `steps.tsx`, `admin.ts`, `types.ts`, `supabase.ts` |
| `firmware/` | ESP32 sketches: `electrack/` (device firmware), `set_pzem_address/` (one-off tool), `README.md` (flashing steps) |
| `hardware/SHOPPING_LIST.md` | Parts list with estimated prices |

### Device-to-server contract (the firmware must match this exactly)

```
POST https://jryveajndyxjsqdfqzuz.supabase.co/functions/v1/ingest
Content-Type: application/json
x-device-secret: <INGEST_SECRET>

{ "code": "ELT-STRIP-001", "fw": "0.1.0",
  "readings": [ { "outlet": 1, "watts": 54.2, "kwh": 1.2345,
                  "voltage": 229.8, "current": 0.262 } ] }
```

- `kwh` is the meter channel's **cumulative** counter, exactly what the
  PZEM-004T reports. Never send per-interval energy.
- The server sets the timestamp, so devices need no clock.
- Readings are stored only for outlets that have an Active appliance. An
  unpaired device is acknowledged (and marked Online) but stores nothing.
- Responses: 200 `{stored, skipped}`, 401 bad secret, 404 unknown code,
  400 bad body.

### Database: things that are not obvious

- **Energy maths.** Energy used = sum of (counter - previous counter) per
  appliance, negatives treated as zero (a counter reset). Implemented in
  `usage_buckets(p_from, p_to, p_bucket)`, `admin_summary()`,
  `ai_hourly_usage(p_days)`. All days and months are `Asia/Manila`.
- **Security model.** Every table has RLS. Residents see only their household
  (`my_household_id()`), admins see everything (`is_admin()`), a deactivated
  account sees nothing. Sensitive writes go through SECURITY DEFINER functions:
  `pair_smart_plug`, `unpair_smart_plug`, `admin_set_account_status`,
  `admin_approve_rate`, `admin_reject_rate`, `refresh_bill_estimate`.
- **Rates.** The rate in use is the **most recently approved** rate whose start
  date is not in the future (`current_rate()`). Approving retires whatever was
  in use. Fetched rates are saved Pending with `source_url` (unique) and
  `source_note`. A rejected fetched rate still occupies its `source_url`, so the
  same article is never fetched twice.
- **Alerts.** Trigger `check_high_usage` on `consumption_reading`: two
  consecutive readings above the appliance's `usage_threshold_w`, at most one
  alert per appliance per 30 minutes, and only for readings newer than 5
  minutes (so backfilled history cannot alert). `mark_offline_plugs()` runs
  every minute via pg_cron: silent for 3 minutes means Offline plus one alert.
- **Appliance lifecycle.** Removing an appliance sets `appliance_status =
  'Removed'`; history is kept. A partial unique index allows a new appliance on
  the same outlet.
- **Making an admin.** Nobody can register as admin. Register normally, then in
  the SQL Editor:
  `update users set user_role = 'Admin' where user_email = '...';`

### Deliberate differences from the manuscript (the manuscript needs updating)

1. `users.user_id` is a UUID (the Supabase Auth id), not INT. There is no
   password column; Supabase Auth stores the hash.
2. `smart_plug.household_id` is nullable: an unpaired device has no household.
3. `electricity_rate` has no `household_id` (one VECO rate for everyone, per the
   ERD text; Data Dictionary Table 12 is stale). It has `rate_source`,
   `verification_status`, `approved_by`, `approved_at`, `source_url`,
   `source_note`.
4. `ai_recommendation` has an extra `insight_date`.
5. Pairing is by typing (later scanning) the device code. The manuscript says
   users "search for or select an available smart plug"; listing unpaired
   devices to everyone would be unsafe.
6. The bill estimate uses the calendar month, monitored appliances only, energy
   charge only. Real VECO cycles run mid-month to mid-month.
7. "AI" precisely: K-Means learns each appliance's idle and in-use power levels;
   Isolation Forest flags unusual days; the saving tips are rules applied to
   what those two learned. Say it that way to the panel.

### App design decisions

- Follows the team's Figma mockup (dark theme). All styling comes from
  `app/src/lib/ui.tsx`.
- Resident tabs: Home, Appliances, Insights, Alerts, Profile. Admin tabs:
  Dashboard, Users, Rate, Reports, Profile. One sign-in screen for both roles.
- Dropped from the mockup, on purpose: separate admin login and "Access
  denied", Continue with Apple, Remember me, Forgot password, the "Ask your
  coach" chat, the separate Energy history screen (merged into Insights),
  currency picker, bill "likely range", appliance "on time", the 6-month
  reports chart.
- Added: naming a strip outlet with a heavy appliance word (aircon, ref, rice
  cooker, heater, ...) shows a warning and blocks saving
  (`looksHeavy` in `app/src/lib/appliances.ts`).
- First launch shows an animated splash then a 3-slide introduction
  (`(auth)/welcome.tsx`), remembered in AsyncStorage key
  `electrack.welcomeSeen`.

## 5. Status

### Done and seen working on the owner's phone

- Simulator to ingest to database to live watts.
- Sign-up, sign-in, household setup, pairing both test devices, adding
  appliances.
- Bill estimate card, admin sign-in, VECO fetch against the live site (it read
  15.30 from the October article), rate approval.

### Built and tested off-device, not yet confirmed on the phone

- **The Figma redesign and the splash/introduction.** Rendered in a browser
  with sample data only. The first phone run crashed on a duplicate Realtime
  channel name; that is fixed (`useId` suffix in `alerts.ts`) but the owner has
  not confirmed the result. **First task for whoever picks this up: get a
  screenshot of Home after a reload.**
- Insights (merged history), AI Energy Coach, Alerts filters, appliance
  details, admin user details, reports, change password.

### Unknown; ask the owner

- Did `npx supabase db push --remote` succeed for all 8 migrations, including
  `20261112300001_offline_check_schedule.sql` (needs the pg_cron extension)?
- Was `ai/backfill.py` run with the real resident email, then `ai/analyze.py`?
- Does the GitHub Actions workflow have its two secrets and a green run?
- Is "Confirm email" turned off in Supabase Auth?

### Known risks to check on the phone

1. Tab bar labels sat a few pixels low in the browser render.
2. Opening the app signed out: the browser preview showed "Unmatched Route" at
   `/` when the only reachable route was the `(auth)` group. The same guard
   structure worked on the phone before the introduction screen was added. If
   the phone shows that page, the fix is to give signed-out users an explicit
   landing: add `export const unstable_settings = { initialRouteName: 'login' }`
   in `(auth)/_layout.tsx`, or redirect from the root layout with
   `<Redirect href="/login" />` when not signed in.
3. Bottom sheets (`Sheet` in `ui.tsx`) use `Modal`; check they slide and dim.

## 6. Hard-won lessons (read before changing anything)

- **Expo SDK 58 is newer than most training data.** `app/AGENTS.md` says the
  same. Check `node_modules/expo/bundledNativeModules.json` for the right
  version of any package before installing it. Specifics already hit:
  - Tabs come from `expo-router/js-tabs`, not `expo-router`.
  - `react-dom` is pinned to `19.3.0` in `package.json`; without it
    `npm install` fails with a peer-dependency conflict.
  - Protected routes use `<Stack.Protected guard={...}>` in
    `app/src/app/_layout.tsx`.
- **Supabase CLI.** `db push` needs `--remote`. `functions deploy` prints
  "Docker is not running" as a harmless warning. New projects use
  `sb_publishable_...` and `sb_secret_...` keys; Edge Functions read the secret
  from `SUPABASE_SECRET_KEYS` (JSON, key `default`) with a fallback to
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Realtime channel names must be unique per subscription.** Two components
  using the same name share one channel, and adding a listener after
  `subscribe()` throws.
- **The server returns at most 1000 rows per request.** `fetchUsage` in
  `usage.ts` and `Db.select` / `Db.rpc_rows` in `ai/db.py` page through
  results. Do the same in new code.
- **Expo Go cannot receive push notifications on Android.** Push needs a
  development or production build (section 7C).
- **If an AI assistant writes files to the PC through a file-sync tool, verify
  the content afterwards** (compare checksums). One sync reported success but
  wrote a stale copy, which cost a debugging round.
- **The assistant could not write into `.github/` on the PC.** The workflow
  lives at `ai/ai-analysis.workflow.yml` and the owner copied it to
  `.github/workflows/ai-analysis.yml` by hand.

### How things were tested without the owner's phone or database

These worked well; reuse them.

- **SQL:** run all migrations in an in-memory Postgres (`@electric-sql/pglite`
  in Node). Before the migrations, create roles `anon`, `authenticated`,
  `service_role` (with `bypassrls`), a stub `auth.users` table, an `auth.uid()`
  that reads `current_setting('request.jwt.claim.sub')`, and the publication
  `supabase_realtime`. Skip the pg_cron migration. Then act as different users
  with `set role authenticated` and assert what each can and cannot do.
- **Edge Functions:** `deno test` for pure logic; `deno run` the function
  against a tiny fake PostgREST server for request/response behaviour.
- **AI:** `py ai\test_analyze.py` runs the analysis on simulated history with
  no database and prints PASS/FAIL lines.
- **App:** `npx tsc --noEmit`, then
  `npx expo export --platform android` to prove it bundles.
- **App visuals:** temporarily install `react-native-web` and
  `@expo/metro-runtime` (versions from `bundledNativeModules.json`),
  temporarily replace `src/lib/supabase.ts` with a fake client that returns
  sample data, `npx expo export --platform web`, serve the output with an
  index.html fallback, and screenshot each route in headless Chrome at
  390x844. **Restore `supabase.ts`, `package.json` and `package-lock.json`
  afterwards.** A fake client has no real Realtime, so it will not catch
  channel bugs.

---

## 7. Remaining work, in order

Order rationale: hardware delivery is the long pole, so order parts first and
build everything else while they ship.

### 7A. Firmware and hardware build

**Buy** (see `hardware/SHOPPING_LIST.md`): 2 ESP32 DevKit V1 (plus a spare),
4 PZEM-004T **v3.0** with the 100 A **closed-ring** CT, 2 HLK-PM01, fuse
holders and fuses, outlets, cords, enclosures, Wago connectors. Add to the
list: 1 kΩ and 2 kΩ resistors, 2 electrolytic capacitors 470 µF 10 V or
higher, 2 small fuses 0.5 A slow-blow for the HLK-PM01 inputs, a plug-in watt
meter (reference), a multimeter, and a portable RCD/ELCB adapter.

**Decision already made and why:** ESP32 + PZEM-004T v3 (100 A CT). Factory
calibrated, the load current never passes through hand-made wiring (the CT
clamps around the wire), the serial side is opto-isolated, and it matches the
manuscript's "custom-developed" wording. Alternatives rejected: ACS712/SCT-013
+ ZMPT101B (needs calibration, poor at low loads), off-the-shelf smart plugs
(not custom, many cannot be flashed, contain relays).

#### Firmware (written: `firmware/electrack/`, steps in `firmware/README.md`)

**Status:** written on 2026-11-13 and type-checked with g++ against stand-in
headers that copy the real signatures of `PZEM004Tv30` 1.2.1 and `WiFiManager`
2.0.17. It has **not** been compiled with the ESP32 toolchain or run on a
board (installing the Arduino compiler was not permitted in the assistant's
sandbox). First real compile is in the Arduino IDE on the owner's PC; expect
that small fixes may be needed. A `FAKE_READINGS 1` setting lets a bare ESP32
be tested against the app before any mains wiring.

The design it implements:

- **Toolchain:** Arduino IDE 2 with the "esp32 by Espressif" board package,
  board "ESP32 Dev Module". Libraries: `PZEM004Tv30` (Jakub Mandula) and
  `WiFiManager` (tzapu). HTTPS with the built-in `WiFiClientSecure` +
  `HTTPClient`. Confirm current library names and versions when building.
- **One firmware, two builds,** chosen in `config.h` (git-ignored; ship
  `config.example.h`):
  ```
  #define DEVICE_CODE   "ELT-PLUG-001"   // or the strip's code
  #define OUTLET_COUNT  1                // 1 = plug, 3 = strip
  #define INGEST_URL    "https://jryveajndyxjsqdfqzuz.supabase.co/functions/v1/ingest"
  #define INGEST_SECRET "..."            // same value as the Supabase secret
  #define REPORT_EVERY_MS 30000          // manuscript: every 30 seconds
  #define FW_VERSION    "0.1.0"
  ```
- **Pins (ESP32 DevKit V1):** `Serial2`, RX2 = GPIO16 (from PZEM TX), TX2 =
  GPIO17 (to PZEM RX), 9600 baud 8N1. Status LED = GPIO2 (on-board). BOOT
  button = GPIO0: hold 5 s to erase Wi-Fi settings.
- **PZEM addressing:** on the strip, Modbus address = outlet number (1, 2, 3).
  The plug's single meter is read on the general address 0xF8 and needs no
  setup. A brand-new PZEM answers on the general address, so each strip
  PZEM must be given its address **one at a time, alone on the bus**, using a
  small one-off `set_address` sketch (`pzem.setAddress(n)`), before the three
  are wired together. Label each module.
- **Wi-Fi setup:** with no saved network, the device starts a hotspot named
  `ElecTrack-Setup-XXXX` (last 4 of the chip id) and serves a page to pick the
  home Wi-Fi (WiFiManager's `autoConnect`). No Bluetooth, no app code.
- **Loop, every `REPORT_EVERY_MS`:**
  1. For each outlet: read voltage, current, power, energy. If a value is
     `NaN` (PZEM not answering or mains off), skip that outlet.
  2. Build the JSON in section 4 and POST it. 15 s timeout.
  3. On failure do nothing special: the PZEM keeps the cumulative counter, so
     no energy is lost; the next successful post carries it.
- **Never call `resetEnergy()`** in normal firmware. The server depends on the
  counter only going up.
- **LED:** slow blink = setup hotspot, fast blink = connecting, solid =
  last post succeeded, double-blink = last post failed.
- **Robustness:** `WiFi.setAutoReconnect(true)`; restart after 15 minutes
  without an accepted report. No explicit watchdog (its API differs between
  ESP32 core 2.x and 3.x).
- **TLS:** simplest is `client.setInsecure()` (encrypted but the server is not
  verified). State this as a known limitation, or pin the root CA if time
  allows. The shared secret in the header is what authenticates the device.
- **Test before any mains wiring:** flash an ESP32 with nothing attached and a
  build flag that fakes readings; it should appear Online in the app exactly
  like the simulator. That proves Wi-Fi, TLS, secret and JSON.

#### Wiring, High-Power Plug (1 outlet)

```
INPUT CORD                                             OUTLET
  L  ---[FUSE 10 A slow-blow]---+----( through CT ring )------- L
                                |
                                +--- PZEM voltage terminal L
                                |
                                +---[FUSE 0.5 A]--- HLK-PM01 AC (L)

  N  ---------------------------+------------------------------ N
                                |
                                +--- PZEM voltage terminal N
                                |
                                +------------------ HLK-PM01 AC (N)

  E  (if the cord has earth) ---------------------------------- E

LOW-VOLTAGE SIDE
  HLK-PM01 +Vo (5 V) ---+--- ESP32 VIN (5V pin)
                        +--- PZEM 5V
                        +--- 470 uF capacitor (+)
  HLK-PM01 -Vo (GND) ---+--- ESP32 GND
                        +--- PZEM GND
                        +--- 470 uF capacitor (-)
  PZEM TX ---[1 kΩ]---+--- ESP32 GPIO16 (RX2)
                      |
                    [2 kΩ]
                      |
                     GND          (divider: 5 V signal down to ~3.3 V)
  PZEM RX ------------------- ESP32 GPIO17 (TX2)
  PZEM CT terminals --------- the two CT leads
```

Only the **live** wire to the outlet goes through the CT ring, once. Mains
wiring in the load path: 2.0 mm² (14 AWG). The PZEM voltage taps and the HLK
feed carry milliamps; 0.75 mm² is plenty, but they sit after the 10 A fuse, so
the HLK gets its own 0.5 A fuse.

#### Wiring, Power Strip (3 outlets)

Same as the plug with these changes:

- One input fuse, **5 A**, feeding all three outlets (3 x 150 W is about 2 A).
- Three PZEMs. Their voltage terminals are all paralleled on the fused L and N.
- Each outlet's live wire passes through **its own** CT: outlet 1 through the
  CT of the PZEM with address 1, and so on. Neutrals join directly.
- The four TTL lines are a shared bus: all PZEM 5V together, all GND together,
  all TX together into the one divider to GPIO16, all RX together from GPIO17.
- One HLK-PM01 and one ESP32.

#### Bench checks the builder must make (uncertain points, do not skip)

1. **Logic levels.** The ESP32 is a 3.3 V device. The divider above assumes
   the PZEM TX idles near 5 V. Measure it with the multimeter before
   connecting to GPIO16. Some builders instead power the PZEM's 5V pin from
   the ESP32's 3.3 V pin and wire TX directly; that works on some module
   batches and not others. Use the divider unless it proves unreliable.
2. **Three PZEMs on one bus.** GPIO17 drives three opto LEDs in parallel. If
   only one or two PZEMs answer, add a simple NPN transistor buffer on the TX
   line or raise drive strength; test all three on the bench first.
3. **Low-load accuracy on the strip.** A 100 A CT at 0.2-0.7 A is at the bottom
   of its range. Compare with the reference watt meter at about 40 W, 100 W and
   150 W. If error is more than a few percent, pass the live wire through the
   CT ring 3 times and divide current and power by 3 in firmware (a
   `CT_TURNS` constant); energy must then also be divided by 3.
4. **PZEM terminal labels** differ between sellers. Follow the silkscreen and
   the seller's diagram for which pair is voltage and which is CT.

#### Mains safety checklist (print it; the owner is a beginner)

Mains is 230 V and can kill. Each item below is a real risk in this build.

1. **Never work on it plugged in.** Unplug, then wait 30 seconds (the HLK-PM01
   capacitors hold charge) before touching anything.
2. **Do the first power-up through the RCD/ELCB adapter**, with the lid
   closed, standing clear, one hand away.
3. **Continuity-test before first power-up** with the multimeter, unplugged:
   L to N must NOT beep (no short); input L to outlet L must beep; input N to
   outlet N must beep; neither L nor N may beep to any low-voltage pin or to
   the ESP32 USB shell.
4. **Fuse on the live wire, first thing after the cord enters the box.** 10 A
   slow-blow for the plug, 5 A for the strip, 0.5 A for each HLK-PM01. Never
   "upgrade" a fuse that blows; find the fault.
5. **Every part in the load path rated for the job:** plug, cord, outlet,
   connectors and fuse holder rated 10 A or more at 250 V for the High-Power
   Plug (it carries about 8 A continuously, for hours). Use branded outlets.
   Cheap outlets and thin cords are what melt.
6. **Wire size:** 2.0 mm² (14 AWG) for the plug's load path. No thinner.
7. **No twisted-and-taped joints.** Use Wago 221 lever connectors or screw
   terminals, fully inserted, tug-tested. Tin nothing that goes under a screw.
8. **Strain relief** on every cord where it enters the enclosure (cable gland
   or clamp), so a pull on the cord cannot reach a terminal.
9. **Plastic (ABS) enclosure with a screwed lid.** Nothing live reachable with
   the lid on. No metal box unless it is earthed.
10. **Keep mains and low voltage apart inside the box.** At least 6 mm of air
    between any mains conductor and the ESP32, jumper wires or USB port. Mount
    the HLK-PM01 and PZEMs on standoffs; hot-glue or screw everything down so
    nothing can shift.
11. **Never connect the ESP32's USB to a computer while the device is plugged
    into mains.** Flash and debug with mains unplugged. (The HLK-PM01 and the
    PZEM are isolated, but a wiring mistake would put mains on the laptop.)
12. **Earth:** if the input cord has an earth pin, connect it straight through
    to the outlet's earth. Do not connect earth to the low-voltage ground.
13. **CT handling:** never leave a CT's leads disconnected while current flows
    through its ring; connect the CT to the PZEM first.
14. **Heat test:** run the plug at full load (aircon, or a 1,000-1,500 W
    kettle or rice cooker for the test) for 30 minutes, unplug, wait, then
    feel the plug, cord, connectors and outlet. Anything more than warm means
    a bad contact; fix it before any long run.
15. **Do not exceed the validated limits:** 1,760 W on the plug, 150 W per
    strip outlet. The app warns when naming a heavy appliance on the strip,
    but nothing physically stops a user.
16. **Never leave the prototype running unattended overnight** until it has
    passed the heat test and several supervised days.
17. **Indoors, dry, ventilated.** No sealing the box airtight; the HLK-PM01
    and PZEMs need some airflow.

### 7B. QR pairing (small; testable without hardware)

- **App:** add a "Scan QR code" button to `app/src/app/pair.tsx` using
  `expo-camera` (take the version from `bundledNativeModules.json`; it works in
  Expo Go). The scanned text is passed to the existing `pair_smart_plug` RPC.
  Typing stays as the fallback. Needs an `npm install` and a camera permission
  prompt.
- **Script `tools/register_devices.py`:** using the secret key (reuse
  `ai/db.py`), insert `smart_plug` rows with codes like `ELT-P-7K4Q-9XWM`
  (unguessable), and write a printable HTML sticker sheet with each code as a
  QR plus text (Python `qrcode` package).
- **Simulator:** let `simulate.py` take device codes from `simulator/.env` so
  a scanned sticker can be tested end to end.
- Why: today's codes are guessable, and anyone with an account can claim an
  unpaired device by guessing its code.

### 7C. Push notifications and the installable APK (about 1 hour of the owner's hands)

Check current Expo and Supabase documentation while doing this; details move.

1. **Accounts (by hand):** an Expo account; a Firebase project with an Android
   app whose package name matches `android.package` in `app.json` (add one,
   e.g. `com.electrack.app`); download `google-services.json`; create an FCM
   V1 service-account key and upload it to EAS credentials.
2. **App:** install `expo-notifications` and `expo-device` (bundled versions).
   After sign-in, request permission, get the Expo push token, and upsert it
   into a new table. Create an Android notification channel.
3. **Database (new migration):** `push_token (user_id uuid, token text,
   updated_at)`, primary key `(user_id, token)`, RLS: a user manages only
   their own rows.
4. **Edge Function `push`:** given a notification row, look up the user's
   tokens and POST to the Expo push API. Remove tokens the API reports as
   invalid.
5. **Trigger:** a Supabase Database Webhook on `notification` INSERT calling
   `push` (with a shared secret header). This covers all three alert types
   with no change to the alert logic.
6. **Build:** `eas build -p android --profile preview` produces an APK.
   From then on the owner tests with that build instead of Expo Go for
   anything involving push.
7. **While here:** set the real app icon and the native splash screen in
   `app.json` to match the in-app splash (background `#07111F`).

### 7D. Loose ends (minutes each)

- Schedule the daily VECO fetch: `npx supabase secrets set CRON_SECRET=...`,
  then in the dashboard Integrations > Cron, a daily job calling the Edge
  Function `fetch-veco-rate` with POST and header `x-cron-secret`.
- Confirm the nightly AI workflow is green on GitHub.
- Confirm the repository is private.
- Optional: "Forgot password". Needs a real email sender (custom SMTP in
  Supabase Auth); the built-in one sends only a couple of emails per hour.
  Turn "Confirm email" back on at the same time.
- Optional: hide or delete the admin test account's leftover household.

### 7E. Manuscript updates (a document the team can paste from)

- Data Dictionary: the seven differences in section 4.
- Pairing description and use case: code entry / QR scan.
- Tech stack chapter: Supabase Edge Functions instead of FastAPI; Expo Router;
  Expo Notifications over FCM; scikit-learn as a scheduled job.
- AI chapter: K-Means + Isolation Forest + rule-based recommendations, minimum
  data needed (7 days for patterns, 14 for unusual-usage), trained and checked
  on simulated history, then real data.
- VECO rate flow: RSS feed, pending rate, admin verification, manual fallback.
- Screens: the list of mockup items dropped or merged (section 4).
- Delimitations: calendar-month estimate, monitored appliances only, energy
  charge only; TLS without certificate pinning if `setInsecure()` is kept.

### 7F. Validation with real hardware

1. **Accuracy:** for each channel, compare ElecTrack with the reference watt
   meter at several loads (strip: ~40 W, ~100 W, ~150 W; plug: ~500 W,
   ~1,000 W, aircon). Record watts and, over a 30-60 minute run, kWh. Report
   percent error per load in a table. This is the manuscript's "validated
   load" evidence.
2. **Alerts:** set a low alert level and show the alert arriving; unplug a
   device and show the Offline alert after about 3-4 minutes.
3. **Soak:** run both devices for at least a week. Watch for gaps in History.
4. **AI on real data:** after 7 days patterns appear; after 14 days
   unusual-usage detection is active. Before that, be explicit with the panel
   that results shown come from simulated history
   (`ai/backfill.py` writes demo readings; use it on test households only).
5. **Defense demo script:** sign in as resident; live watts change when an
   appliance is switched on; history and bill estimate; trigger an alert;
   AI Energy Coach; sign in as admin; fetch and approve the VECO rate; reports;
   deactivate and reactivate a user.

### Suggested sequence

1. Confirm the redesign runs on the phone; fix anything from section 5.
2. Order hardware.
3. Firmware (7A): it is written; compile it in the Arduino IDE and run the
   fake-readings test on a bare ESP32. Then QR pairing (7B).
4. Push and APK (7C), then loose ends (7D).
5. Parts arrive: build the plug first (simpler), pass the safety checklist,
   then the strip.
6. Validation (7F) and manuscript updates (7E) in parallel.
