"""Export data/provinces.csv as data/provinces.js (window.PROVINCES = [...])
so the static web app works from file:// without fetch/XHR."""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FIELDS = [
    "province_code", "province_name_th", "region_name_th", "party_name_th",
    "lat", "lon",
    "voters_not_came_rate_pct", "invalid_party_list_rate_pct",
    "invalid_constituency_rate_pct", "households_without_internet_rate_pct",
    "median_equivalised_monthly_household_income", "poverty_headcount_ratio",
    "equivalised_income_gini", "household_debt_to_monthly_income_ratio",
    "employment_yoy_change_rate", "agriculture_gpp_share",
    "manufacturing_gpp_share", "urban_population_pct",
    "population_age_60_plus_pct", "population_change_pct",
    "skip_generation_households_pct", "higher_edu_25plus_pct",
    "poverty_pct", "nfe_student_pct", "no_higher_edu_rate",
]
TEXT = {"province_name_th", "region_name_th", "party_name_th"}


def main():
    rows = []
    with open(os.path.join(ROOT, "data", "provinces.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out = {}
            for k in FIELDS:
                v = r[k]
                if k in TEXT:
                    out[k] = v if v not in ("", "nan") else None
                else:
                    out[k] = None if v in ("", "NaN", "nan") else (int(v) if k == "province_code" else round(float(v), 6))
            rows.append(out)
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    path = os.path.join(ROOT, "data", "provinces.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.PROVINCES = ")
        json.dump(rows, f, separators=(",", ":"), ensure_ascii=False)
        f.write(";\n")
    print(f"wrote {path}: {len(rows)} provinces, {os.path.getsize(path)} bytes")


if __name__ == "__main__":
    main()
