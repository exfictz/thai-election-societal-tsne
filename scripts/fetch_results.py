"""Scrape the 2026 US House election results (all 435 seats, winner party and
call status per district) from usmidterm2026.com, which aggregates AP / DDHQ /
state officials / network decision-desk calls. Saves raw/house2026_raw.csv."""
import csv
import os
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) research/1.0"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
os.makedirs(RAW, exist_ok=True)

URL = "https://usmidterm2026.com/house"


def main():
    req = urllib.request.Request(URL, headers=UA)
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")
    pat = re.compile(
        r'<span class="sm-koltuk sm-koltuk--([A-Za-z]+)[^"]*" '
        r'data-yaris="([^"]+)" data-ipucu="([^"]+)"[^>]*data-bolge="([^"]+)"',
        re.S,
    )
    rows = pat.findall(html)
    assert len(rows) == 435, f"expected 435 seats, got {len(rows)}"
    out = []
    for cls, yaris, ipucu, bolge in rows:
        m = re.match(r"2026-H-([A-Z]{2})-(\d+)", yaris)
        state, num = m.group(1), int(m.group(2))
        party = {"D": "Democratic", "R": "Republican", "I": "Independent"}.get(cls)
        caller = ""
        mm = re.search(r"Won \(([^)]+)\)", ipucu)
        if mm:
            caller = mm.group(1)
        status = ipucu.split("\u00b7")[1].strip() if "\u00b7" in ipucu else ""
        out.append({
            "district": bolge, "state": state, "cd": num, "race_id": yaris,
            "winner_party": party or "", "called": "yes" if party else "no",
            "status": status, "caller": caller, "tooltip": ipucu,
        })
    path = os.path.join(RAW, "house2026_raw.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=out[0].keys())
        w.writeheader()
        w.writerows(out)
    from collections import Counter
    print(f"wrote {path}: {len(out)} seats,",
          dict(Counter(r["winner_party"] or "uncalled" for r in out)))


if __name__ == "__main__":
    main()
