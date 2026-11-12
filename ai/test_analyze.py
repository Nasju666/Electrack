"""Checks the analysis on simulated history, with no database.

    py ai\\test_analyze.py
"""
from datetime import date, timedelta

import pandas as pd

from analyze import analyze_household
from synth import STEP_MIN, profile_for, simulate

TODAY = date(2026, 11, 12)
DAYS = [TODAY - timedelta(days=n) for n in range(28, 0, -1)]
APPLIANCES = [
    {"appliance_id": 1, "household_id": 7, "appliance_name": "Aircon", "appliance_status": "Active", "category": "Air Conditioner", "device": "High-Power Plug", "outlet": 1},
    {"appliance_id": 2, "household_id": 7, "appliance_name": "Electric Fan", "appliance_status": "Active", "category": "Electric Fan", "device": "Power Strip", "outlet": 1},
    {"appliance_id": 3, "household_id": 7, "appliance_name": "Television", "appliance_status": "Active", "category": "Television", "device": "Power Strip", "outlet": 2},
    {"appliance_id": 4, "household_id": 7, "appliance_name": "Laptop", "appliance_status": "Active", "category": "Computer / Laptop", "device": "Power Strip", "outlet": 3},
]


def hourly_history():
    rows = []
    for a in APPLIANCES:
        profile = profile_for(a["appliance_name"], a["category"], a["device"], a["outlet"])
        for day, step, watts in simulate(profile, DAYS, TODAY, seed=a["appliance_id"]):
            hour = pd.Timestamp(day) + pd.Timedelta(minutes=step * STEP_MIN)
            rows.append((a["appliance_id"], hour.floor("h"), watts * STEP_MIN / 60 / 1000))
    frame = pd.DataFrame(rows, columns=["appliance_id", "hour_start", "kwh"])
    return frame.groupby(["appliance_id", "hour_start"], as_index=False)["kwh"].sum()


def main():
    insights = analyze_household(7, APPLIANCES, hourly_history(), TODAY)
    for i in insights:
        saving = f"  [~{i['estimated_savings_kwh']} kWh/month]" if i["estimated_savings_kwh"] else ""
        print(f"{i['insight_type']:<14} {i['recommendation_text']} {i['pattern_summary'] or ''}{saving}")

    def has(kind, appliance_id, text=""):
        return any(i["insight_type"] == kind and i["appliance_id"] == appliance_id and text in i["recommendation_text"] + (i["pattern_summary"] or "") for i in insights)

    unusual = {(i["appliance_id"], i["insight_date"]) for i in insights if i["insight_type"] == "Unusual Usage"}
    checks = {
        "household pattern exists": has("Usage Pattern", None, "kWh a day"),
        "every appliance has a pattern": all(has("Usage Pattern", a["appliance_id"]) for a in APPLIANCES),
        "aircon pattern is overnight": has("Usage Pattern", 1, "PM to"),
        "aircon's all-day run yesterday is flagged": (1, (TODAY - timedelta(days=1)).isoformat()) in unusual,
        "TV left on overnight 5 days ago is flagged": (3, (TODAY - timedelta(days=5)).isoformat()) in unusual,
        "the steady fan has no unusual days": not any(a == 2 for a, _ in unusual),
        "no more than 4 unusual days reported": len(unusual) <= 4,
        "TV standby recommendation": has("Energy Saving", 3, "off at the outlet"),
        "aircon timer recommendation": has("Energy Saving", 1, "timer"),
        "no standby advice for the fan (0 W when off)": not has("Energy Saving", 2, "off at the outlet"),
    }
    print()
    for name, ok in checks.items():
        print(("PASS  " if ok else "FAIL  ") + name)
    print("unusual:", sorted(unusual))
    raise SystemExit(0 if all(checks.values()) else 1)


if __name__ == "__main__":
    main()
