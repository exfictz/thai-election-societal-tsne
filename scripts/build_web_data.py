"""Export data/districts.csv as data/districts.js (window.DISTRICTS = [...])
so the static web app works from file:// without fetch/XHR."""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FIELDS = [
    "district", "state", "cd", "cd_name", "winner_party", "called", "caller",
    "lat", "lon",
    "population", "land_area_sqmi", "pop_density", "median_age",
    "median_hh_income", "per_capita_income", "gini_index", "pct_ba_plus",
    "pct_white", "pct_black", "pct_asian", "pct_hispanic", "poverty_rate",
    "pct_owner_occupied", "median_home_value", "median_gross_rent",
    "pct_worked_from_home", "unemployment_rate",
]
NUM = {f for f in FIELDS if f not in ("district", "state", "cd_name", "winner_party", "caller", "called")}


def main():
    rows = []
    with open(os.path.join(ROOT, "data", "districts.csv")) as f:
        for r in csv.DictReader(f):
            out = {}
            for k in FIELDS:
                v = r[k]
                if k in NUM:
                    out[k] = None if v in ("", "NaN", "nan") else (int(v) if k == "cd" else round(float(v), 4))
                elif k == "called":
                    out[k] = v == "True"
                else:
                    out[k] = v if v not in ("", "nan") else None
            rows.append(out)
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    path = os.path.join(ROOT, "data", "districts.js")
    with open(path, "w") as f:
        f.write("window.DISTRICTS = ")
        json.dump(rows, f, separators=(",", ":"))
        f.write(";\n")
    print(f"wrote {path}: {len(rows)} districts, {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()
