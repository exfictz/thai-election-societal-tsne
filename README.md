# 2026 US Midterm House — District Factor Explorer (t-SNE web app)

A fully **client-side web app** (plain HTML/JS, no server, no build step) to explore
which **societal factors** predict whether a US House of Representatives seat went
**Republican or Democratic** in the midterm election of **3 November 2026**.

## Run it

Open `index.html` in any browser — that's it (works from `file://`; no fetch/XHR,
all libraries and data are bundled locally). Or serve it statically, e.g.:

```bash
python -m http.server 8000        # then http://127.0.0.1:8000
```

or enable GitHub Pages on this repo (root of the default branch) to get a public URL.

## How it works

1. Select one or more factors (median income, urbanisation via population density,
   % university degree, race/ethnicity shares, poverty, Gini, housing, etc.) in the
   sidebar.
2. Press **Run t-SNE**: all 435 congressional districts are embedded with **t-SNE
   using only the selected, standardized factors — the vote result is masked from
   the embedding**.
3. The 2026 result (blue = Democrat, red = Republican, grey = not called) is coloured
   **on top** of the embedding.
4. **k-means** clusters the embedding; per-cluster **purity** and an overall
   homogeneity score are shown. Homogeneous red/blue clusters = the selected factors
   are good predictors; mixed clusters = try different factors.

Same idea as overlaying cell types on a scRNA-seq t-SNE/UMAP plot.

Features: perplexity / iterations / learning-rate / seed sliders, factor multiselect,
colour-by-result-or-cluster, hover tooltips, drag-pan + wheel-zoom, geographic
centroid map view, cluster profile table, per-factor Cohen's d chart, full data table
and CSV download.

## Files

```
index.html            web app shell
app.js                app logic (t-SNE run, k-means, purity, Cohen's d, rendering)
vendor/tsne.js        t-SNE implementation (karpathy tsne, bundled locally)
data/districts.js     generated: window.DISTRICTS (435 districts, from districts.csv)
data/districts.csv    the dataset (435 districts x 17 factors + masked result)
scripts/              data pipeline (see below)
raw/                  raw downloads (race calls, gazetteer, Census Reporter JSON)
```

## Data pipeline (to regenerate the dataset)

```bash
pip install -r requirements.txt
python scripts/fetch_results.py     # 2026 House results per district (web)
python scripts/fetch_features.py    # ACS 2024 5-yr district demographics + gazetteer
python scripts/build_dataset.py     # -> data/districts.csv
python scripts/build_web_data.py    # -> data/districts.js (for the web app)
```

## Data

- **Results**: all 435 House races of 3 Nov 2026, winner party + call status, scraped
  from [usmidterm2026.com](https://usmidterm2026.com/house), which aggregates AP /
  Decision Desk HQ / state officials / network decision desks. As of 5 Nov 2026,
  10:43 p.m. ET: **252 Democratic, 160 Republican, 23 not yet called**.
- **Demographics** per congressional district: ACS 2024 5-year estimates (2020–2024)
  via the Census Reporter API (`acs2024_5yr`); land area and centroids from the
  Census Bureau 2026 Gazetteer (120th Congress districts).

## Factors

`pop_density` (urbanisation), `pct_worked_from_home`, `median_hh_income`,
`per_capita_income`, `gini_index`, `pct_ba_plus`, `pct_white`, `pct_black`,
`pct_asian`, `pct_hispanic`, `poverty_rate`, `pct_owner_occupied`, `median_home_value`,
`median_gross_rent`, `unemployment_rate`, `median_age`, `population`; plus
`winner_party` / `called` / `caller` for the 2026 result.

## Caveats

- 9 states (AL, CA, FL, LA, NC, OH, TN, TX, UT) used new district lines in 2026 and
  Missouri kept its 2022 lines; ACS district geographies may differ slightly from the
  2026 ballot lines in those states.
- 23 races were still uncalled at data time (incl. AK-AL ranked-choice tabulation and
  the LA-5 / LA-6 runoffs on 12 Dec); shown grey and excluded from purity metrics.
- t-SNE is stochastic; use the seed slider to reproduce a layout.
