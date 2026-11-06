"""Fetch ACS 2024 5-year (2020-2024) estimates for all 120th-Congress districts
via the Census Reporter API, plus land area / centroids from the Census 2026
Gazetteer. Saves raw JSON responses under raw/ and a parsed gazetteer CSV."""
import io
import json
import os
import time
import urllib.parse
import urllib.request
import zipfile

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) research/1.0"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
os.makedirs(RAW, exist_ok=True)

TABLES = [
    "B01002", "B01003", "B02001", "B03003", "B08006", "B15003", "B17001",
    "B19013", "B19083", "B19301", "B23025", "B25003", "B25064", "B25077",
]
RELEASE = "acs2024_5yr"

USPS2FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08",
    "CT": "09", "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15",
    "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27",
    "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
    "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
    "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
    "WV": "54", "WI": "55", "WY": "56", "PR": "72",
}


def get(url, timeout=120):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout).read()


def fetch_gazetteer():
    out = os.path.join(RAW, "gaz120cd.txt")
    if not os.path.exists(out):
        raw = get("https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
                  "2026_Gazetteer/2026_Gaz_120CDs_national.zip")
        z = zipfile.ZipFile(io.BytesIO(raw))
        with open(out, "wb") as f:
            f.write(z.read(z.namelist()[0]))
    geos = []
    with open(out) as f:
        header = f.readline().strip().split("|")
        for line in f:
            parts = line.strip().split("|")
            rec = dict(zip(header, parts))
            usps, geoid = rec["USPS"], rec["GEOID"]
            if usps in USPS2FIPS and len(geoid) == 4:
                geos.append({
                    "usps": usps,
                    "fips": USPS2FIPS[usps],
                    "cd": geoid[2:],
                    "cr_geoid": "50000US" + geoid,
                    "aland_sqmi": float(rec["ALAND_SQMI"]),
                    "intptlat": float(rec["INTPTLAT"]),
                    "intptlong": float(rec["INTPTLONG"]),
                })
    with open(os.path.join(RAW, "gaz120cd.json"), "w") as f:
        json.dump(geos, f)
    return geos


def fetch_acs(geos):
    ids = [g["cr_geoid"] for g in geos]
    chunks = [ids[i:i + 60] for i in range(0, len(ids), 60)]
    merged = {"data": {}, "geography": {}, "tables": {}, "release": {}}
    for i, chunk in enumerate(chunks):
        path = os.path.join(RAW, f"cr_acs_{i:02d}.json")
        if os.path.exists(path):
            d = json.load(open(path))
        else:
            q = urllib.parse.urlencode({
                "table_ids": ",".join(TABLES),
                "geo_ids": ",".join(chunk),
            })
            url = f"https://api.censusreporter.org/1.0/data/show/{RELEASE}?{q}"
            d = json.loads(get(url))
            with open(path, "w") as f:
                json.dump(d, f)
            time.sleep(0.3)
        merged["data"].update(d.get("data", {}))
        merged["geography"].update(d.get("geography", {}))
        merged["tables"].update(d.get("tables", {}))
        merged["release"] = d.get("release", {})
        print(f"chunk {i + 1}/{len(chunks)}: {len(d.get('data', {}))} geos")
    with open(os.path.join(RAW, "cr_acs_all.json"), "w") as f:
        json.dump(merged, f)
    return merged


if __name__ == "__main__":
    geos = fetch_gazetteer()
    print(f"gazetteer: {len(geos)} CD geographies")
    merged = fetch_acs(geos)
    print(f"ACS: {len(merged['data'])} geographies, "
          f"release={merged['release'].get('id')} {merged['release'].get('name')}")
