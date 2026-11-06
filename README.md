# 2026 US Midterm House — District Factor Explorer

Interactive dashboard to explore which **societal factors** predict whether a US
House of Representatives seat went **Republican or Democratic** in the midterm
election of **3 November 2026**.

## How it works

1. The user selects one or more factors (median income, urbanisation / population
   density, % university degree, race/ethnicity shares, poverty, housing, etc.) in
   the sidebar.
2. All 435 congressional districts are embedded with **UMAP using only the selected
   factors — the vote result is masked from the clustering**.
3. The 2026 result (red = Republican, blue = Democrat, grey = not yet called) is
   coloured **on top** of the embedding.
4. **HDBSCAN** clusters the embedding; per-cluster **purity** (share of the majority
   party) and an overall homogeneity score are shown. Homogeneous red/blue clusters
   mean the selected factors are good predictors; mixed clusters mean: try different
   factors.

Same idea as overlaying cell types on a scRNA-seq UMAP.

## Run

```bash
pip install -r requirements.txt
python scripts/fetch_results.py    # 2026 House results per district (web)
python scripts/fetch_features.py   # ACS 2024 5-yr district demographics + gazetteer
python scripts/build_dataset.py    # -> data/districts.csv
streamlit run app.py               # http://127.0.0.1:8501
```

`data/districts.csv` is already built and checked in, so only the last command is
needed to view the dashboard.

## Data

- **Results**: all 435 House races of 3 Nov 2026, winner party + call status, scraped
  from [usmidterm2026.com](https://usmidterm2026.com/house), which aggregates AP /
  Decision Desk HQ / state officials / network decision desks. As of 5 Nov 2026,
  10:43 p.m. ET: **252 Democratic, 160 Republican, 23 not yet called**.
- **Demographics** per congressional district: ACS 2024 5-year estimates (2020–2024)
  via the Census Reporter API (`acs2024_5yr`), land area and centroids from the
  Census Bureau 2026 Gazetteer (120th Congress districts).

## Factors (columns of `data/districts.csv`)

`pop_density` (urbanisation), `pct_worked_from_home`, `median_hh_income`,
`per_capita_income`, `gini_index`, `pct_ba_plus` (% bachelor's+), `pct_white`,
`pct_black`, `pct_asian`, `pct_hispanic`, `poverty_rate`, `pct_owner_occupied`,
`median_home_value`, `median_gross_rent`, `unemployment_rate`, `median_age`,
`population`; plus `winner_party` / `called` / `caller` for the 2026 result.

## Caveats

- 9 states (AL, CA, FL, LA, NC, OH, TN, TX, UT) used new district lines in 2026 and
  Missouri kept its 2022 lines; ACS district geographies may differ slightly from the
  2026 ballot lines in those states.
- 23 races were still uncalled at data time (incl. AK-AL ranked-choice tabulation and
  the LA-5 / LA-6 runoffs on 12 Dec); they are shown in grey and excluded from purity
  metrics.

## Layout

```
app.py                     Streamlit dashboard
scripts/fetch_results.py   2026 House results scraper
scripts/fetch_features.py  ACS + Gazetteer downloader
scripts/build_dataset.py   merges everything into data/districts.csv
data/districts.csv         435 districts x features + masked result
raw/                       raw downloads (results CSV, Census Reporter JSON, gazetteer)
```
