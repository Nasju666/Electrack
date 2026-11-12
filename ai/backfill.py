"""Load simulated history for one household, so the History tab and the AI
have weeks of data before real devices have been running that long.

    py ai\\backfill.py --email resident@example.com            # 28 days
    py ai\\backfill.py --email resident@example.com --days 42

For each active appliance of that resident it writes one reading every
5 minutes, from N days ago up to the appliance's first existing reading.
Appliances that already have more than a day of history are left alone.
This is DEMO data: only run it on test households.
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone

from db import Db
from synth import STEP_MIN, profile_for, simulate

MANILA = timezone(timedelta(hours=8))
BATCH = 500


def main():
    parser = argparse.ArgumentParser(description="ElecTrack demo history loader")
    parser.add_argument("--email", required=True, help="email of the resident account to fill")
    parser.add_argument("--days", type=int, default=28)
    args = parser.parse_args()

    db = Db()
    users = db.select("users", select="user_id", user_email=f"eq.{args.email}")
    if not users:
        sys.exit(f"No account with email {args.email}.")
    households = db.select("household", select="household_id,household_name", user_id=f"eq.{users[0]['user_id']}")
    if not households:
        sys.exit("That account has not set up a household yet.")
    household = households[0]
    appliances = db.select(
        "appliance",
        select="appliance_id,smartplug_id,outlet_no,appliance_name,appliance_category,smart_plug(device_type)",
        household_id=f"eq.{household['household_id']}", appliance_status="eq.Active",
    )
    if not appliances:
        sys.exit("That household has no appliances yet. Pair the devices and add appliances in the app first.")

    now = datetime.now(MANILA)
    today = now.date()
    days = [today - timedelta(days=n) for n in range(args.days, -1, -1)]
    print(f"Filling {household['household_name']}: {len(appliances)} appliances, {args.days} days.")

    for a in appliances:
        first = db._call("GET", "consumption_reading", {
            "select": "reading_timestamp", "appliance_id": f"eq.{a['appliance_id']}",
            "order": "reading_timestamp.asc", "limit": 1,
        })
        until = datetime.fromisoformat(first[0]["reading_timestamp"]).astimezone(MANILA) if first else now
        if until < now - timedelta(days=1):
            print(f"  {a['appliance_name']:<20} already has history, skipped")
            continue

        profile = profile_for(a["appliance_name"], a["appliance_category"], a["smart_plug"]["device_type"], a["outlet_no"])
        rows, kwh, written = [], 0.0, 0
        for day, step, watts in simulate(profile, days, today, seed=a["appliance_id"]):
            at = datetime(day.year, day.month, day.day, tzinfo=MANILA) + timedelta(minutes=step * STEP_MIN)
            if at >= until:
                break
            kwh += watts * STEP_MIN / 60 / 1000
            rows.append({
                "smartplug_id": a["smartplug_id"], "appliance_id": a["appliance_id"],
                "reading_watts": round(watts, 1), "reading_kwh": round(kwh, 4),
                "reading_voltage": 229.0, "reading_current": round(watts / (229.0 * 0.9), 3),
                "reading_timestamp": at.isoformat(),
            })
            if len(rows) == BATCH:
                db.insert_quiet("consumption_reading", rows)
                written, rows = written + len(rows), []
        if rows:
            db.insert_quiet("consumption_reading", rows)
            written += len(rows)
        print(f"  {a['appliance_name']:<20} {profile.__name__:<11} {written:>6} readings, {kwh:.1f} kWh")

    print("Done. Now run:  py ai\\analyze.py")


if __name__ == "__main__":
    main()
