"""Merge 2026 House results, Census Gazetteer (land area, centroids) and ACS
2024 5-year estimates into data/districts.csv: one row per congressional
district (435 voting seats)."""
import csv
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

USPS2FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08",
    "CT": "09", "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15",
    "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
    "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
    "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
    "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
    "WV": "54", "WI": "55", "WY": "56",
}


def est(acs, geoid, table, col):
    v = acs["data"].get(geoid, {}).get(table, {}).get("estimate", {}).get(col)
    return None if v is None else float(v)


def main():
    results = pd.read_csv(os.path.join(RAW, "house2026_raw.csv"))
    acs = json.load(open(os.path.join(RAW, "cr_acs_all.json")))
    gaz = {g["cr_geoid"]: g for g in json.load(open(os.path.join(RAW, "gaz120cd.json")))}

    med_age_key = "B01002001"

    rows = []
    for r in results.itertuples():
        fips = USPS2FIPS[r.state]
        geoid = f"50000US{fips}{r.cd:02d}"
        g = gaz.get(geoid, {})
        a = acs["data"].get(geoid, {})
        pop = est(acs, geoid, "B01003", "B01003001")
        land = g.get("aland_sqmi") or float("nan")
        total25 = est(acs, geoid, "B15003", "B15003001")
        ba_plus = sum(est(acs, geoid, "B15003", f"B15003{n:03d}") or 0 for n in (22, 23, 24, 25))
        race_tot = est(acs, geoid, "B02001", "B02001001")
        hisp_tot = est(acs, geoid, "B03003", "B03003001")
        pov_tot = est(acs, geoid, "B17001", "B17001001")
        occ_tot = est(acs, geoid, "B25003", "B25003001")
        commute_tot = est(acs, geoid, "B08006", "B08006001")
        clf = est(acs, geoid, "B23025", "B23025003")
        rows.append({
            "district": r.district,
            "state": r.state,
            "cd": int(r.cd),
            "cr_geoid": geoid,
            "cd_name": acs["geography"].get(geoid, {}).get("name", ""),
            "winner_party": r.winner_party if isinstance(r.winner_party, str) and r.winner_party else "Uncalled",
            "called": r.called == "yes",
            "caller": r.caller,
            "population": pop,
            "land_area_sqmi": land,
            "pop_density": (pop / land) if pop and land else None,
            "median_age": est(acs, geoid, "B01002", med_age_key),
            "median_hh_income": est(acs, geoid, "B19013", "B19013001"),
            "per_capita_income": est(acs, geoid, "B19301", "B19301001"),
            "gini_index": est(acs, geoid, "B19083", "B19083001"),
            "pct_ba_plus": (100 * ba_plus / total25) if total25 else None,
            "pct_white": (100 * (est(acs, geoid, "B02001", "B02001002") or 0) / race_tot) if race_tot else None,
            "pct_black": (100 * (est(acs, geoid, "B02001", "B02001003") or 0) / race_tot) if race_tot else None,
            "pct_asian": (100 * (est(acs, geoid, "B02001", "B02001005") or 0) / race_tot) if race_tot else None,
            "pct_hispanic": (100 * (est(acs, geoid, "B03003", "B03003003") or 0) / hisp_tot) if hisp_tot else None,
            "poverty_rate": (100 * (est(acs, geoid, "B17001", "B17001002") or 0) / pov_tot) if pov_tot else None,
            "pct_owner_occupied": (100 * (est(acs, geoid, "B25003", "B25003002") or 0) / occ_tot) if occ_tot else None,
            "median_home_value": est(acs, geoid, "B25077", "B25077001"),
            "median_gross_rent": est(acs, geoid, "B25064", "B25064001"),
            "pct_worked_from_home": (100 * (est(acs, geoid, "B08006", "B08006017") or 0) / commute_tot) if commute_tot else None,
            "unemployment_rate": (100 * (est(acs, geoid, "B23025", "B23025005") or 0) / clf) if clf else None,
            "lat": g.get("intptlat"),
            "lon": g.get("intptlong"),
        })

    df = pd.DataFrame(rows)
    df = df.sort_values(["state", "cd"]).reset_index(drop=True)
    out = os.path.join(DATA, "districts.csv")
    df.to_csv(out, index=False)
    print(f"wrote {out}: {len(df)} rows x {len(df.columns)} cols")
    print("called:", df["called"].sum(), "| winners:", df["winner_party"].value_counts().to_dict())
    print("nulls per feature column:")
    feats = [c for c in df.columns if c not in
             ("district", "state", "cd", "cr_geoid", "cd_name", "winner_party",
              "called", "caller", "lat", "lon")]
    print(df[feats].isna().sum().to_string())
    print(df[["district", "winner_party", "median_hh_income", "pct_ba_plus",
              "pop_density", "pct_white", "poverty_rate"]].head(8).to_string())


if __name__ == "__main__":
    main()
