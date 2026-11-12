"""ElecTrack device simulator.

Pretends to be the two prototype devices and POSTs readings to the same
`ingest` endpoint the real ESP32 firmware will use:

  ELT-PLUG-001   High-Power Plug  outlet 1: aircon (compressor cycles on/off)
  ELT-STRIP-001  Power Strip      outlets 1-3: fan, TV, laptop charger

No packages to install (Python 3.9+ standard library only).

  python simulate.py                 # one reading every 5 s (good for demos)
  python simulate.py --interval 30   # same pace as the real firmware

Settings come from simulator/.env (copy .env.example) or environment variables:
  INGEST_URL     https://<project-ref>.supabase.co/functions/v1/ingest
  INGEST_SECRET  the value you set with `supabase secrets set INGEST_SECRET=...`
"""
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / ".sim_state.json"  # keeps the kWh counters across restarts, like a real meter


def load_env():
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class Channel:
    """One metered outlet. Produces watts, and integrates them into a kWh counter."""

    def __init__(self, outlet, kwh=0.0):
        self.outlet = outlet
        self.kwh = kwh

    def watts(self, t):
        raise NotImplementedError

    def read(self, t, dt_seconds):
        watts = max(0.0, self.watts(t))
        self.kwh += watts * dt_seconds / 3_600_000  # W*s -> kWh
        voltage = random.gauss(229.0, 1.5)
        power_factor = 0.9
        return {
            "outlet": self.outlet,
            "watts": round(watts, 1),
            "kwh": round(self.kwh, 4),
            "voltage": round(voltage, 1),
            "current": round(watts / (voltage * power_factor), 3),
        }


class Aircon(Channel):
    """1.5HP window-type: ~8 min compressor on (~1.25 kW), ~4 min fan only (~45 W)."""

    def watts(self, t):
        compressor_on = (t % 720) < 480
        return random.gauss(1250, 35) if compressor_on else random.gauss(45, 2)


class Steady(Channel):
    """A light appliance drawing a roughly constant load."""

    def __init__(self, outlet, base, noise, kwh=0.0):
        super().__init__(outlet, kwh)
        self.base, self.noise = base, noise

    def watts(self, t):
        return random.gauss(self.base, self.noise)


def build_devices(state):
    def kwh(code, outlet):
        return state.get(f"{code}:{outlet}", 0.0)

    return {
        "ELT-PLUG-001": [Aircon(1, kwh("ELT-PLUG-001", 1))],
        "ELT-STRIP-001": [
            Steady(1, 55, 2, kwh("ELT-STRIP-001", 1)),   # electric fan
            Steady(2, 95, 8, kwh("ELT-STRIP-001", 2)),   # television
            Steady(3, 60, 5, kwh("ELT-STRIP-001", 3)),   # laptop charger
        ],
    }


def post(url, secret, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-device-secret": secret},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except (urllib.error.URLError, TimeoutError) as e:
        return None, str(e)


def main():
    load_env()
    parser = argparse.ArgumentParser(description="ElecTrack device simulator")
    parser.add_argument("--interval", type=float, default=5, help="seconds between readings (default 5)")
    parser.add_argument("--url", default=os.environ.get("INGEST_URL"))
    parser.add_argument("--secret", default=os.environ.get("INGEST_SECRET"))
    args = parser.parse_args()
    if not args.url or not args.secret:
        sys.exit("Missing INGEST_URL / INGEST_SECRET. Copy simulator/.env.example to simulator/.env and fill it in.")

    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    devices = build_devices(state)
    print(f"Sending to {args.url} every {args.interval:g}s. Ctrl+C to stop.")

    start = time.time()
    try:
        while True:
            t = time.time() - start
            for code, channels in devices.items():
                readings = [c.read(t, args.interval) for c in channels]
                status, text = post(args.url, args.secret, {"code": code, "fw": "sim-0.1", "readings": readings})
                watts = "  ".join(f"{r['watts']:>7.1f}W" for r in readings)
                result = "ok" if status == 200 else f"FAILED ({status}) {text}"
                print(f"{time.strftime('%H:%M:%S')}  {code:<14}{watts}   {result}")
                for c in channels:
                    state[f"{code}:{c.outlet}"] = c.kwh
            STATE_FILE.write_text(json.dumps(state))
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
