import numpy as np
import pandas as pd
import plotly.express as px
import streamlit as st
from hdbscan import HDBSCAN
from sklearn.preprocessing import StandardScaler
from umap import UMAP

st.set_page_config(page_title="2026 House Midterms - District Factor Explorer",
                   layout="wide")

FEATURES = {
    "pop_density": ("Population density (people/sq mi, urbanisation)", "{:,.0f}"),
    "pct_worked_from_home": ("% worked from home", "{:.1f}%"),
    "median_hh_income": ("Median household income", "${:,.0f}"),
    "per_capita_income": ("Per-capita income", "${:,.0f}"),
    "gini_index": ("Gini index (income inequality)", "{:.3f}"),
    "pct_ba_plus": ("% bachelor's degree or higher", "{:.1f}%"),
    "pct_white": ("% White", "{:.1f}%"),
    "pct_black": ("% Black", "{:.1f}%"),
    "pct_asian": ("% Asian", "{:.1f}%"),
    "pct_hispanic": ("% Hispanic / Latino", "{:.1f}%"),
    "poverty_rate": ("Poverty rate", "{:.1f}%"),
    "pct_owner_occupied": ("% owner-occupied housing", "{:.1f}%"),
    "median_home_value": ("Median home value", "${:,.0f}"),
    "median_gross_rent": ("Median gross rent", "${:,.0f}"),
    "unemployment_rate": ("Unemployment rate", "{:.1f}%"),
    "median_age": ("Median age", "{:.1f}"),
    "population": ("Total population", "{:,.0f}"),
}

PARTY_COLORS = {"Democratic": "#2166ac", "Republican": "#b2182b", "Uncalled": "#999999"}


@st.cache_data
def load_data():
    df = pd.read_csv("data/districts.csv")
    return df


@st.cache_data
def run_umap(df, selected, n_neighbors, min_dist, seed):
    X = StandardScaler().fit_transform(df[list(selected)].to_numpy(dtype=float))
    emb = UMAP(n_neighbors=n_neighbors, min_dist=min_dist,
               n_components=2, random_state=seed).fit_transform(X)
    return emb


@st.cache_data
def run_clusters(emb, min_cluster_size):
    return HDBSCAN(min_cluster_size=min_cluster_size).fit_predict(emb)


def cohens_d(df, feats):
    called = df[df["called"]]
    d_win = called[called["winner_party"] == "Democratic"]
    r_win = called[called["winner_party"] == "Republican"]
    rows = []
    for f in feats:
        a, b = d_win[f].to_numpy(dtype=float), r_win[f].to_numpy(dtype=float)
        pooled = np.sqrt(((len(a) - 1) * a.var() + (len(b) - 1) * b.var())
                         / (len(a) + len(b) - 2))
        rows.append({"factor": FEATURES[f][0],
                     "d": (a.mean() - b.mean()) / pooled if pooled else 0.0})
    return pd.DataFrame(rows).sort_values("d", key=abs, ascending=False)


df = load_data()

st.title("2026 US Midterm House elections - which societal factors predict the winner?")
st.markdown(
    "Pick one or more **societal factors** in the sidebar. The 435 congressional "
    "districts are embedded with **UMAP using only those factors - the 3 Nov 2026 "
    "vote result is masked from the clustering** - and then coloured by the actual "
    "result on top. If the clusters come out homogeneously red or blue, the selected "
    "factors are good predictors; if they are mixed, try adding/removing factors."
)

with st.sidebar:
    st.header("Clustering factors")
    selected = st.multiselect(
        "Factors fed into UMAP (result is masked)",
        options=list(FEATURES),
        default=["pop_density", "pct_ba_plus", "median_hh_income", "pct_white"],
        format_func=lambda k: FEATURES[k][0],
    )
    st.header("UMAP")
    n_neighbors = st.slider("n_neighbors", 5, 60, 15)
    min_dist = st.slider("min_dist", 0.0, 0.9, 0.1, step=0.05)
    seed = st.number_input("random seed", value=42, step=1)
    st.header("Clusters (HDBSCAN on embedding)")
    min_cluster_size = st.slider("min_cluster_size", 5, 40, 10)
    color_by = st.radio("Colour points by", ["2026 result", "cluster"], index=0)

if not selected:
    st.warning("Select at least one factor in the sidebar.")
    st.stop()

emb = run_umap(df, tuple(selected), n_neighbors, min_dist, int(seed))
labels = run_clusters(emb, min_cluster_size)
plot_df = df.copy()
plot_df["UMAP1"] = emb[:, 0]
plot_df["UMAP2"] = emb[:, 1]
plot_df["cluster"] = np.where(labels >= 0, "C" + labels.astype(str), "noise")
plot_df["result"] = plot_df["winner_party"]

hover_cols = ["district", "result", "caller"] + list(selected)
plot_df["hover"] = plot_df.apply(
    lambda r: "<br>".join(
        [f"<b>{r['district']}</b> - {r['result']}" + (f" ({r['caller']})" if isinstance(r["caller"], str) and r["caller"] else "")]
        + [f"{FEATURES[c][0]}: {FEATURES[c][1].format(r[c])}" for c in selected]
    ), axis=1)

tab_umap, tab_map, tab_data = st.tabs(["UMAP explorer", "Geographic view", "Data"])

with tab_umap:
    col_plot, col_stats = st.columns([3, 2])
    with col_plot:
        color_col = "result" if color_by == "2026 result" else "cluster"
        cmap = PARTY_COLORS if color_by == "2026 result" else None
        fig = px.scatter(plot_df, x="UMAP1", y="UMAP2", color=color_col,
                         color_discrete_map=cmap,
                         hover_data={"hover": True, "UMAP1": False, "UMAP2": False,
                                     "result": False, "cluster": True},
                         custom_data=["hover"],
                         opacity=0.85, height=640)
        fig.update_traces(hovertemplate="%{customdata[0]}<extra></extra>")
        fig.update_layout(legend_title_text="2026 winner" if color_by == "2026 result" else "cluster",
                          margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(fig, width="stretch")
        st.caption(f"UMAP on {len(selected)} factor(s), standardized. "
                   f"Vote result was NOT used in the embedding.")

    with col_stats:
        st.subheader("Cluster homogeneity")
        called_mask = plot_df["called"].to_numpy()
        lab = labels.copy()
        cl = plot_df.assign(lab=lab)
        cl = cl[(cl["lab"] >= 0) & cl["called"]]
        if len(cl) == 0:
            st.info("No clusters found - lower min_cluster_size.")
        else:
            grp = cl.groupby("lab")
            rows = []
            for cid, gdf in grp:
                n = len(gdf)
                n_d = int((gdf["winner_party"] == "Democratic").sum())
                n_r = int((gdf["winner_party"] == "Republican").sum())
                maj = "Democratic" if n_d >= n_r else "Republican"
                rows.append({"cluster": f"C{cid}", "size": n,
                             "D": n_d, "R": n_r, "majority": maj,
                             "purity": max(n_d, n_r) / n})
            cdf = pd.DataFrame(rows).sort_values("size", ascending=False)
            overall = sum(max(r["D"], r["R"]) for r in rows) / sum(r["size"] for r in rows)
            noise_share = 1 - len(cl) / called_mask.sum()
            st.metric("Overall cluster purity (called races)",
                      f"{overall:.0%}",
                      help="Share of clustered districts whose winner matches the "
                           "cluster majority. 100% = every cluster is purely red or "
                           "purely blue = selected factors perfectly separate the result.")
            st.metric("Districts in clusters", f"{len(cl)} / {int(called_mask.sum())}",
                      help=f"Remaining {noise_share:.0%} are HDBSCAN noise points.")
            fig2 = px.bar(cdf, x="cluster", y="purity", color="majority",
                          color_discrete_map=PARTY_COLORS,
                          hover_data=["size", "D", "R"], range_y=[0, 1],
                          height=300)
            fig2.update_layout(margin=dict(l=10, r=10, t=10, b=10),
                               legend_title_text="majority party")
            st.plotly_chart(fig2, width="stretch")
            st.caption("Bar height = purity of each cluster; colour = majority party. "
                       "Tall single-colour bars = homogeneous clusters = good factors.")
            with st.expander("Cluster profiles (mean of each selected factor)"):
                prof = cl.groupby("lab")[selected].mean().round(2)
                prof.index = [f"C{i}" for i in prof.index]
                st.dataframe(prof, width="stretch")

with tab_map:
    figm = px.scatter_geo(plot_df, lat="lat", lon="lon", color="result",
                          color_discrete_map=PARTY_COLORS, scope="usa",
                          hover_data={"hover": True, "lat": False, "lon": False,
                                      "result": False},
                          custom_data=["hover"], opacity=0.8, height=600)
    figm.update_traces(hovertemplate="%{customdata[0]}<extra></extra>")
    figm.update_layout(legend_title_text="2026 winner",
                        margin=dict(l=10, r=10, t=10, b=10))
    st.plotly_chart(figm, width="stretch")
    st.caption("District centroids (Census 2026 Gazetteer, 120th Congress lines), "
               "coloured by 3 Nov 2026 result.")

with tab_data:
    st.subheader("Single-factor signal (Cohen's d, Democratic- vs Republican-won districts)")
    ddf = cohens_d(df, list(FEATURES))
    figd = px.bar(ddf, x="d", y="factor", orientation="h", height=480,
                  color=np.where(ddf["d"] > 0, "Democratic-leaning", "Republican-leaning"),
                  color_discrete_map={"Democratic-leaning": "#2166ac",
                                      "Republican-leaning": "#b2182b"})
    figd.update_layout(margin=dict(l=10, r=10, t=10, b=10), showlegend=True)
    st.plotly_chart(figd, width="stretch")
    st.caption("How far apart D-won and R-won districts are on each factor "
               "(standardized mean difference).")
    st.subheader("All districts")
    show_cols = ["district", "cd_name", "winner_party", "called", "caller"] + list(FEATURES)
    st.dataframe(df[show_cols].sort_values("district"), width="stretch",
                 hide_index=True)
    st.download_button("Download districts.csv", df.to_csv(index=False).encode(),
                       file_name="districts_2026_house.csv", mime="text/csv")

st.markdown("---")
st.caption(
    "Results: all 435 House races of 3 Nov 2026 as called by AP / Decision Desk HQ / "
    "state officials / network decision desks, aggregated by usmidterm2026.com "
    "(252 Democratic, 160 Republican, 23 not yet called as of 5 Nov 2026, 10:43 p.m. ET). "
    "Demographics: ACS 2024 5-year estimates (2020-2024) per congressional district via "
    "Census Reporter; land area and centroids from the Census Bureau 2026 Gazetteer "
    "(120th Congress districts). Note: 9 states (AL, CA, FL, LA, NC, OH, TN, TX, UT) used "
    "new district lines in 2026 and Missouri kept its 2022 lines, so ACS district vintages "
    "can differ slightly from the 2026 ballot lines in those states."
)
