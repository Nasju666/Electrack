"""ElecTrack AI module: usage patterns, unusual-usage detection, energy-saving recommendations.

Run once a day (by hand, or by the GitHub Actions workflow):

    py ai\\analyze.py            # analyse every household and save the results
    py ai\\analyze.py --dry-run  # print the results without saving anything

How it works, per appliance, on the last 35 days of hourly energy:
  1. Usage levels   - K-Means (2 clusters) on hourly power learns the appliance's
                      own "idle" and "in use" levels, so no wattage thresholds are hard-coded.
  2. Usage pattern  - from the in-use hours: usual hours per day, usual times of day,
                      weekday vs weekend, share of the household's energy.
  3. Unusual usage  - Isolation Forest on each day's (energy, hours in use, overnight
                      energy, weekend?) flags days that do not look like the rest.
                      Only days that are also clearly ABOVE normal are reported.
  4. Recommendations - rules applied to the learned levels and patterns, each with an
                      estimated monthly saving in kWh.

Results go to the ai_recommendation table (the app's Insights tab). A newly found
unusual day from yesterday also creates a notification (the Alerts tab).
"""
import argparse
import sys
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest

MIN_DAYS_FOR_PATTERNS = 7    # complete days of data before saying anything
MIN_DAYS_FOR_UNUSUAL = 14    # complete days before judging a day unusual
REPORT_UNUSUAL_WITHIN_DAYS = 7
DAYS_PER_MONTH = 30


# ---------------------------------------------------------------- formatting
def clock(hour: int) -> str:
    hour %= 24
    return "12 AM" if hour == 0 else f"{hour} AM" if hour < 12 else "12 PM" if hour == 12 else f"{hour - 12} PM"


def hour_ranges(usual: np.ndarray) -> str:
    """Turn 24 true/false flags into text like '9 PM to 6 AM and 1 PM to 4 PM'."""
    if usual.all():
        return "all day"
    if not usual.any():
        return ""
    start = next(h for h in range(24) if usual[h] and not usual[h - 1])  # a run's first hour
    runs, h = [], start
    while True:
        if usual[h % 24] and not usual[(h - 1) % 24]:
            end = h
            while usual[(end + 1) % 24]:
                end += 1
            runs.append((h % 24, (end + 1) % 24))
            h = end
        h += 1
        if h % 24 == start:
            break
    runs.sort(key=lambda r: -((r[1] - r[0]) % 24))  # longest stretch first
    return " and ".join(f"{clock(a)} to {clock(b)}" for a, b in runs)


# ------------------------------------------------------------------ analysis
def prepare(hourly: pd.DataFrame, today: date) -> pd.DataFrame:
    """One appliance's hourly kWh on complete days only (today is still in progress)."""
    series = hourly.set_index("hour_start")["kwh"].astype(float).sort_index()
    series = series[series.index.date < today]
    if series.empty:
        return pd.DataFrame(columns=["kwh", "day", "hour"])
    days_with_data = set(series.index.date)
    grid = pd.date_range(series.index[0].normalize(), series.index[-1].normalize() + pd.Timedelta(hours=23), freq="h")
    frame = series.reindex(grid, fill_value=0.0).to_frame("kwh")
    frame["day"], frame["hour"] = frame.index.date, frame.index.hour
    return frame[frame["day"].isin(days_with_data)]  # a day with no readings at all is unknown, not zero


def learn_levels(frame: pd.DataFrame):
    """K-Means on hourly average power. Returns (idle watts, in-use watts, in-use flag per hour)."""
    watts = frame["kwh"].to_numpy() * 1000  # kWh in one hour = average kW
    if len(np.unique(np.round(watts, 1))) < 2:
        level = float(watts.mean())
        return level, level, np.full(len(watts), level >= 5)
    model = KMeans(n_clusters=2, n_init=10, random_state=0).fit(watts.reshape(-1, 1))
    idle_cluster = int(np.argmin(model.cluster_centers_.ravel()))
    idle_w, active_w = sorted(float(c) for c in model.cluster_centers_.ravel())
    if active_w - idle_w < max(5.0, 0.2 * active_w):  # no real difference: it is simply always on (or always off)
        return active_w, active_w, np.full(len(watts), active_w >= 5)
    in_use = model.labels_ != idle_cluster
    # The idle level is the typical idle hour, so hours that were only partly in use do not inflate it.
    return float(np.median(watts[~in_use])), active_w, in_use


def analyze_appliance(appliance: dict, hourly: pd.DataFrame, today: date, household_daily_kwh: float) -> list[dict]:
    frame = prepare(hourly, today)
    n_days = frame["day"].nunique() if not frame.empty else 0
    if n_days < MIN_DAYS_FOR_PATTERNS:
        return []

    name = appliance["appliance_name"]
    idle_w, active_w, in_use = learn_levels(frame)
    frame = frame.assign(in_use=in_use)

    days = frame.groupby("day").agg(
        kwh=("kwh", "sum"),
        hours=("in_use", "sum"),
        night_kwh=("kwh", lambda s: s[frame.loc[s.index, "hour"] < 5].sum()),
    )
    days["weekend"] = [d.weekday() >= 5 for d in days.index]
    usual_hours = frame.groupby("hour")["in_use"].mean().reindex(range(24), fill_value=0).to_numpy() >= 0.5
    typical_kwh, typical_hours = float(days["kwh"].median()), float(days["hours"].median())

    def row(kind, text, summary=None, savings=None, about=None):
        return {
            "household_id": appliance["household_id"], "appliance_id": appliance["appliance_id"],
            "insight_type": kind, "recommendation_text": text, "pattern_summary": summary,
            "estimated_savings_kwh": round(savings, 2) if savings is not None else None,
            "insight_date": about.isoformat() if about else None,
        }

    out = []

    # --- usage pattern
    when = hour_ranges(usual_hours)
    headline = (
        f"{name} is usually in use about {typical_hours:.0f} hours a day" + (f", mostly {when}." if when and when != "all day" else ".")
        if typical_hours >= 1 else f"{name} is rarely in use."
    )
    details = [f"A typical day is {typical_kwh:.2f} kWh."]
    weekday_kwh, weekend_kwh = days.loc[~days["weekend"], "kwh"].median(), days.loc[days["weekend"], "kwh"].median()
    if pd.notna(weekday_kwh) and pd.notna(weekend_kwh) and abs(weekend_kwh - weekday_kwh) > max(0.1, 0.2 * weekday_kwh):
        details.append(f"Weekends are {'higher' if weekend_kwh > weekday_kwh else 'lower'}: {weekend_kwh:.2f} kWh against {weekday_kwh:.2f} kWh on weekdays.")
    if household_daily_kwh > 0:
        details.append(f"That is about {100 * days['kwh'].mean() / household_daily_kwh:.0f}% of your monitored energy.")
    details.append(f"Based on {n_days} days of readings.")
    out.append(row("Usage Pattern", headline, " ".join(details)))

    # --- unusual usage
    if n_days >= MIN_DAYS_FOR_UNUSUAL:
        features = days[["kwh", "hours", "night_kwh"]].assign(weekend=days["weekend"].astype(int))
        flagged = IsolationForest(n_estimators=200, contamination=0.1, random_state=0).fit_predict(features) == -1
        for day, is_flagged in zip(days.index, flagged):
            if not is_flagged or (today - day).days > REPORT_UNUSUAL_WITHIN_DAYS:
                continue
            same_kind = days[days["weekend"] == days.loc[day, "weekend"]]
            if len(same_kind) < 3:
                same_kind = days
            usual_kwh, usual_hrs = float(same_kind["kwh"].median()), float(same_kind["hours"].median())
            kwh, hrs = float(days.loc[day, "kwh"]), float(days.loc[day, "hours"])
            if kwh < 1.3 * usual_kwh or kwh - usual_kwh < 0.2:  # report only clearly-above-normal days
                continue
            kind = "weekend day" if days.loc[day, "weekend"] else "weekday"
            text = (f"{name} used {kwh:.1f} kWh on {day.strftime('%a, %b')} {day.day}, "
                    f"about {kwh / usual_kwh:.1f} times its usual {usual_kwh:.1f} kWh for a {kind}.")
            summary = f"It was in use for about {hrs:.0f} hours that day; it is usually in use about {usual_hrs:.0f}."
            out.append(row("Unusual Usage", text, summary, about=day))

    # --- recommendations (rules applied to what was learned above)
    idle_hours = 24 - typical_hours
    if idle_w >= 3 and active_w > idle_w and idle_hours >= 6:
        saving = idle_w * idle_hours * DAYS_PER_MONTH / 1000
        out.append(row(
            "Energy Saving",
            f"Switch {name} off at the outlet when it is not in use.",
            f"It draws about {idle_w:.0f} W even when idle, for around {idle_hours:.0f} hours a day.", saving))
    if active_w >= 400 and typical_hours >= 6:
        saving = active_w * DAYS_PER_MONTH / 1000
        out.append(row(
            "Energy Saving",
            f"Use a timer so {name} stops one hour earlier each day.",
            f"It runs about {typical_hours:.0f} hours a day at roughly {active_w:,.0f} W on average.", saving))
    night_use = frame[frame["hour"] < 5].groupby("day")["in_use"].any()
    if active_w < 400 and active_w > idle_w and night_use.mean() >= 0.3:
        saving = float(days["night_kwh"].mean()) * DAYS_PER_MONTH
        out.append(row(
            "Energy Saving",
            f"Check whether {name} needs to be on after midnight.",
            f"It was in use between midnight and 5 AM on {int(night_use.sum())} of the last {n_days} days.", saving))
    return out


def analyze_household(household_id: int, appliances: list[dict], hourly: pd.DataFrame, today: date) -> list[dict]:
    """All insights for one household. `hourly` has columns appliance_id, hour_start, kwh."""
    active = [a for a in appliances if a["appliance_status"] == "Active"]
    mine = hourly[hourly["appliance_id"].isin([a["appliance_id"] for a in active])]
    complete = mine[mine["hour_start"].dt.date < today]
    n_days = complete["hour_start"].dt.date.nunique()
    household_daily = float(complete["kwh"].astype(float).sum()) / n_days if n_days else 0.0

    out = []
    for appliance in active:
        out += analyze_appliance(appliance, mine[mine["appliance_id"] == appliance["appliance_id"]], today, household_daily)

    if n_days >= MIN_DAYS_FOR_PATTERNS and household_daily > 0:
        by_hour = complete.assign(hour=complete["hour_start"].dt.hour).groupby("hour")["kwh"].sum().reindex(range(24), fill_value=0)
        busiest = by_hour.to_numpy() >= by_hour.quantile(0.75)
        by_appliance = complete.groupby("appliance_id")["kwh"].sum().astype(float)
        top = next(a for a in active if a["appliance_id"] == by_appliance.idxmax())
        out.insert(0, {
            "household_id": household_id, "appliance_id": None, "insight_type": "Usage Pattern",
            "recommendation_text": f"Your monitored appliances use about {household_daily:.1f} kWh a day.",
            "pattern_summary": (f"{top['appliance_name']} accounts for {100 * by_appliance.max() / by_appliance.sum():.0f}% of it. "
                                f"Your busiest hours are {hour_ranges(busiest)}."),
            "estimated_savings_kwh": None, "insight_date": None,
        })
    return out


# ------------------------------------------------------------------- running
def manila_today() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=8)).date()


def main():
    parser = argparse.ArgumentParser(description="ElecTrack AI analysis")
    parser.add_argument("--dry-run", action="store_true", help="print results, save nothing")
    args = parser.parse_args()

    from db import Db  # imported here so the analysis above can be tested without a database
    db = Db()
    today = manila_today()

    households = db.select("household", select="household_id,household_name,user_id")
    appliances = db.select("appliance", select="appliance_id,household_id,appliance_name,appliance_status")
    usage = pd.DataFrame(db.rpc_rows("ai_hourly_usage", {"p_days": 35}, order="hour_start,appliance_id"),
                         columns=["household_id", "appliance_id", "hour_start", "kwh"])
    usage["hour_start"] = pd.to_datetime(usage["hour_start"])
    print(f"{len(households)} households, {len(appliances)} appliances, {len(usage)} hourly rows. Today is {today}.")

    for household in households:
        hid = household["household_id"]
        insights = analyze_household(hid, [a for a in appliances if a["household_id"] == hid], usage, today)
        print(f"\n== {household['household_name']} ==")
        if not insights:
            print(f"  Not enough data yet (needs {MIN_DAYS_FOR_PATTERNS} complete days).")
        for i in insights:
            saving = f"  [saves ~{i['estimated_savings_kwh']} kWh/month]" if i["estimated_savings_kwh"] else ""
            print(f"  {i['insight_type']:<14} {i['recommendation_text']} {i['pattern_summary'] or ''}{saving}")
        if args.dry_run or not insights:
            continue

        # Patterns and recommendations are replaced by the fresh ones.
        db.delete("ai_recommendation", household_id=f"eq.{hid}", insight_type='in.("Usage Pattern","Energy Saving")')
        db.insert("ai_recommendation", [i for i in insights if i["insight_type"] != "Unusual Usage"])
        # Unusual days are kept as history; a day already recorded is skipped.
        added = db.insert("ai_recommendation", [i for i in insights if i["insight_type"] == "Unusual Usage"],
                          on_conflict="appliance_id,insight_type,insight_date")
        fresh = [a for a in added if a["insight_date"] and (today - date.fromisoformat(a["insight_date"])).days <= 1]
        db.insert("notification", [{
            "user_id": household["user_id"], "appliance_id": a["appliance_id"],
            "notification_type": "Unusual Usage", "notification_message": a["recommendation_text"],
        } for a in fresh])
        if fresh:
            print(f"  -> {len(fresh)} alert(s) sent")

    print("\nDone." + (" (dry run, nothing saved)" if args.dry_run else ""))


if __name__ == "__main__":
    sys.exit(main())
