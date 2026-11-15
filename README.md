# 2026 Thai General Election — Province Factor Explorer (t-SNE web app)

A fully **client-side web app** (plain HTML/JS, no server, no build step) to explore
which **societal factors** predict which **party won the most raw votes** in each of
Thailand's **77 provinces** in the **2026 general election**.

## Run it

Open `index.html` in any browser — that's it (works from `file://`; no fetch/XHR,
all libraries and data are bundled locally). Or serve it statically, e.g.:

```bash
python -m http.server 8000        # then http://127.0.0.1:8000
```

or enable GitHub Pages on this repo (root of the default branch) to get a public URL.

### Deploy on Vercel

The repo root contains `requirements.txt` (for the data pipeline), which makes
Vercel auto-detect a Python project and fail with "No python entrypoint found".
`vercel.json` in this repo explicitly declares a static build (`@vercel/static`)
of just the web-app files, which overrides that detection — push/redeploy and the
app is served as a static site. (Alternatively, in the Vercel project settings set
Framework Preset to "Other".)

## How it works

1. The main area has two windows side by side (no zooming or panning):
   - **Left — geographic map**: the 77 province centroids (equirectangular
     projection), coloured by the winning party.
   - **Right — t-SNE**: before any run it shows the same centroid map.
2. Select one or more factors (region, median income, urbanisation, education, poverty,
   Gini, household debt, agriculture/manufacturing GPP shares, invalid ballots,
   turnout, etc.) in the sidebar.
3. All 77 provinces are embedded with **t-SNE using Gower distance over only
   the selected heterogeneous factors — the winning party is masked from the
   embedding** — and the points **animate** from their geographic positions into
   the embedding.
4. **k-means** clusters the embedding; per-cluster **purity** (share of provinces
   matching their cluster's majority party) and an overall homogeneity score are
   shown. Homogeneous single-party clusters = the selected factors are good
   predictors; mixed clusters = try different factors.

Same idea as overlaying cell types on a scRNA-seq t-SNE/UMAP plot.

Features: factor multiselect, k-means k slider (2–6), colour-by-party-or-cluster,
hover tooltips, animated map → t-SNE transition, cluster purity bars, cluster
profile table, full data table and CSV download. t-SNE parameters are fixed
(perplexity 25, 1000 iterations, learning rate 100, seed 42).

## Files

```
index.html              web app shell
app.js                  app logic (Gower distance, t-SNE run, k-means, purity, Cohen's d, rendering)
vendor/tsne.js          t-SNE implementation (karpathy tsne, bundled locally)
data/provinces.js       generated: window.PROVINCES (77 provinces, from provinces.csv)
data/provinces.csv      the dataset (77 provinces × 18 factors + region + masked winner)
scripts/build_web_data.py   -> data/provinces.js (for the web app)
```

## Data pipeline (to regenerate the web data)

```bash
python scripts/build_web_data.py    # -> data/provinces.js (for the web app)
```

## Factors

`region_name_th` (categorical), `voters_not_came_rate_pct` (1 − turnout),
`invalid_party_list_rate_pct`, `invalid_constituency_rate_pct`,
`households_without_internet_rate_pct`,
`median_equivalised_monthly_household_income`, `poverty_headcount_ratio`,
`equivalised_income_gini`, `household_debt_to_monthly_income_ratio`,
`employment_yoy_change_rate`, `agriculture_gpp_share`, `manufacturing_gpp_share`,
`urban_population_pct`, `population_age_60_plus_pct`, `population_change_pct`,
`skip_generation_households_pct`, `higher_edu_25plus_pct`, `poverty_pct`,
`nfe_student_pct`, `no_higher_edu_rate`; plus `party_name_th` (party with the most
raw votes — masked from the embedding) and province lat/lon for the map view.

## Caveats

- The winner is the party with the most raw votes at the **province** level; Thai
  general elections are decided per constituency and per party list, so this is a
  provincial-summary view, not the official seat allocation.
- t-SNE is stochastic; use the seed slider to reproduce a layout.
