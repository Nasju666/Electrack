"""Simulated appliance behaviour, used to give the AI weeks of history before
real devices have collected any (backfill.py) and to test the analysis (test_analyze.py).

Each profile returns watts for every 5-minute step of one day. The profiles
have daily routines, weekday/weekend differences, standby draw and a few
deliberately odd days, so there is something real for the analysis to find.
"""
import random
from datetime import date

STEP_MIN = 5
STEPS = 24 * 60 // STEP_MIN  # 288 steps per day


def _span(start_hour, end_hour):
    """Step indexes between two clock times (end may be past midnight, e.g. 21.5 -> 29.5)."""
    return range(int(start_hour * 60 / STEP_MIN), int(end_hour * 60 / STEP_MIN))


def aircon(day: date, rng: random.Random, odd: bool):
    """Runs overnight; weekend afternoons too. Odd day: left on almost all day."""
    watts = [2.0] * STEPS  # plugged in, off
    on = set()
    bedtime, wake = 21.5 + rng.uniform(-0.5, 0.5), 5.5 + rng.uniform(-0.5, 0.5)
    on.update(s for s in _span(bedtime, 24))
    on.update(s for s in _span(0, wake))
    if day.weekday() >= 5:
        on.update(_span(13, 16))
    if odd:
        on.update(_span(8, 24))
    for s in on:
        compressor = (s % 12) < 8  # ~8 of every 12 steps the compressor runs
        watts[s] = rng.gauss(1250, 35) if compressor else rng.gauss(45, 2)
    return watts


def fan(day, rng, odd):
    watts = [0.0] * STEPS
    for s in _span(8 + rng.uniform(-1, 1), 22 + rng.uniform(-1, 0.5)):
        watts[s] = rng.gauss(55, 2)
    return watts


def television(day, rng, odd):
    """Evenings; weekend mornings. Draws standby power otherwise. Odd day: left on overnight."""
    watts = [rng.gauss(6, 0.3) for _ in range(STEPS)]
    spans = [_span(18 + rng.uniform(-0.5, 0.5), 23 + rng.uniform(-0.5, 0.4))]
    if day.weekday() >= 5:
        spans.append(_span(10, 12))
    if odd:
        spans.append(_span(0, 7))
    for span in spans:
        for s in span:
            watts[s] = rng.gauss(95, 8)
    return watts


def laptop(day, rng, odd):
    watts = [1.5] * STEPS  # charger left in the socket
    spans = [_span(9, 17)] if day.weekday() < 5 else []
    if rng.random() < 0.4:
        spans.append(_span(20, 22))
    for span in spans:
        for s in span:
            watts[s] = rng.gauss(60, 5)
    return watts


def generic(day, rng, odd):
    watts = [0.0] * STEPS
    for s in _span(18, 22):
        watts[s] = rng.gauss(40, 3)
    return watts


def profile_for(name: str, category: str | None, device_type: str, outlet_no: int):
    """Choose a behaviour from what the resident said is plugged in."""
    text = f"{name} {category or ''}".lower()
    if device_type == "High-Power Plug" or "air" in text:
        return aircon
    if "fan" in text:
        return fan
    if "tv" in text or "television" in text:
        return television
    if "laptop" in text or "computer" in text:
        return laptop
    return [fan, television, laptop][(outlet_no - 1) % 3] if device_type == "Power Strip" else generic


# Days (counted back from today) on which an appliance misbehaves.
ODD_DAYS = {aircon: {1, 9}, television: {5}}


def simulate(profile, days: list[date], today: date, seed: int):
    """Yield (day, step, watts) for each 5-minute step of the given days."""
    rng = random.Random(seed)
    for day in days:
        odd = (today - day).days in ODD_DAYS.get(profile, set())
        for step, watts in enumerate(profile(day, rng, odd)):
            yield day, step, max(0.0, watts)
