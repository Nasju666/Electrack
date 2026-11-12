# ElecTrack firmware

Two Arduino sketches for the ESP32:

| Folder | What it is |
|---|---|
| `electrack/` | The device firmware. The same sketch runs the High-Power Plug and the Power Strip; `config.h` says which. |
| `set_pzem_address/` | One-off tool to number the strip's three meters 1, 2 and 3. |

Status: written and type-checked against the two libraries' interfaces. It has
**not** been compiled with the real ESP32 toolchain or run on a board yet.

## One-time setup (Windows)

1. Install **Arduino IDE 2** from https://www.arduino.cc/en/software
2. Boards: Tools → Board → Boards Manager → search `esp32` → install
   **esp32 by Espressif Systems**.
3. Libraries: Tools → Manage Libraries → install
   **PZEM004Tv30** (by Jakub Mandula) and **WiFiManager** (by tzapu).
4. If the ESP32 does not show up as a COM port when plugged in, install the USB
   driver for its chip (CP210x or CH340; the chip name is printed near the USB
   socket). Use a **data** USB cable; charge-only cables do not work.

## Step 1: prove the software path with a bare ESP32 (no meter, no mains)

1. In `firmware\electrack`, copy `config.example.h` to `config.h`.
2. Edit `config.h`:
   - `DEVICE_CODE` → `ELT-PLUG-001`
   - `INGEST_URL` → your project's ingest URL
   - `INGEST_SECRET` → the same value as in `simulator\.env`
   - leave `FAKE_READINGS 1`
3. Stop the simulator (two senders with one device code would mix readings).
4. Open `electrack.ino`, choose Tools → Board → **ESP32 Dev Module** and the
   right Port, click **Upload**. If it sticks at "Connecting…", hold the BOOT
   button on the board until the upload starts.
5. Open Tools → Serial Monitor at **115200**.
6. On your phone, join the Wi-Fi network **ElecTrack-Setup-XXXX**, pick your
   home Wi-Fi on the page that opens, and enter its password.
7. The Serial Monitor should print `Server said 200: {"stored":1,"skipped":0}`
   every 30 seconds and the blue LED stays on. In the app the appliance shows
   about 850 W, live.

If that works, Wi-Fi, HTTPS, the secret and the message format are all proven
before any mains wiring.

| Serial Monitor says | Meaning |
|---|---|
| `Server said 401` | `INGEST_SECRET` does not match the Supabase secret |
| `Server said 404` | `DEVICE_CODE` is not in the `smart_plug` table |
| `Server said 200` with `"stored":0` | Device not paired, or no appliance on that outlet in the app |
| `Server said -1` (or another negative) | No internet, or the URL is wrong |

## Step 2: the real device

Only after the build passes the safety checklist in `HANDOFF.md` (section 7A).

1. **Strip only:** number the meters first. With ONE meter connected at a time,
   upload `set_pzem_address` with `NEW_ADDRESS` 1, then 2, then 3, and label
   each meter.
2. In `config.h` set `FAKE_READINGS 0`, the right `DEVICE_CODE`, and
   `OUTLET_COUNT` (1 for the plug, 3 for the strip). Upload.
3. **Unplug the USB cable before the device is plugged into mains.** Never
   have both connected.

## Status light

| Blue LED | Meaning |
|---|---|
| Slow blink | Setup hotspot is open, waiting for Wi-Fi details |
| Fast blink | Connecting to Wi-Fi |
| Steady on | Last report accepted |
| Two quick blinks | Last report failed |

Hold the **BOOT** button for 5 seconds to forget the Wi-Fi and reopen the setup
hotspot.

## Notes for whoever maintains this

- The firmware never resets the meter's energy counter. The server depends on
  it only going up.
- A failed report loses nothing: the meter keeps counting and the next
  accepted report carries the total.
- The plug's single meter is read on the PZEM general address (0xF8), so it
  needs no address setup. The strip's meters use addresses 1 to 3.
- HTTPS uses `setInsecure()`: encrypted, but the server certificate is not
  verified. Listed as a limitation in `HANDOFF.md`.
- No explicit watchdog is used (its API differs between ESP32 core 2.x and
  3.x). Instead the device restarts itself after 15 minutes without an
  accepted report.
