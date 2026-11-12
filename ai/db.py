"""Tiny Supabase REST client for the AI scripts (standard library only).

Uses the project's SECRET key, which bypasses row-level security. That is why
these scripts run on a trusted machine (your PC or GitHub Actions), never in the app.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE = 1000  # Supabase returns at most 1000 rows per request


def load_env():
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key or "YOUR-PROJECT" in url or key.endswith("xxxxxxxx"):
        sys.exit("Missing SUPABASE_URL / SUPABASE_SECRET_KEY. Copy ai/.env.example to ai/.env and fill it in.")
    return url.rstrip("/"), key


class Db:
    def __init__(self):
        self.url, self.key = load_env()

    def _call(self, method, path, params=None, body=None, prefer=None):
        url = f"{self.url}/rest/v1/{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                text = response.read().decode()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            sys.exit(f"Supabase said {e.code} for {method} {path}: {e.read().decode()}")
        except urllib.error.URLError as e:
            sys.exit(f"Could not reach Supabase: {e.reason}")

    def select(self, table, **params):
        """All rows of a query, fetched page by page. Pass PostgREST filters as params."""
        rows, offset = [], 0
        while True:
            page = self._call("GET", table, {**params, "limit": PAGE, "offset": offset})
            rows += page
            if len(page) < PAGE:
                return rows
            offset += PAGE

    def rpc_rows(self, function, args, order):
        """All rows returned by a database function, fetched page by page."""
        rows, offset = [], 0
        while True:
            page = self._call("POST", f"rpc/{function}", {"order": order, "limit": PAGE, "offset": offset}, args)
            rows += page
            if len(page) < PAGE:
                return rows
            offset += PAGE

    def insert(self, table, rows, on_conflict=None):
        """Insert rows. With on_conflict, rows that already exist are skipped; returns the rows actually added."""
        if not rows:
            return []
        params = {"on_conflict": on_conflict} if on_conflict else None
        prefer = "return=representation" + (",resolution=ignore-duplicates" if on_conflict else "")
        return self._call("POST", table, params, rows, prefer) or []

    def insert_quiet(self, table, rows):
        """Bulk insert without reading the rows back (for large loads)."""
        self._call("POST", table, None, rows, "return=minimal")

    def delete(self, table, **params):
        self._call("DELETE", table, params)
