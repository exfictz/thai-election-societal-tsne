(function (global) {
  "use strict";

  var FEATURES = [
    { key: "region_name_th", label: "Region (one-hot encoded)", onehot: true, fmt: function (v) { return v || "n/a"; } },
    { key: "voters_not_came_rate_pct", label: "Voters who did not turn out (%)", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "invalid_party_list_rate_pct", label: "Invalid party-list ballots (%)", fmt: function (v) { return v.toFixed(2) + "%"; } },
    { key: "invalid_constituency_rate_pct", label: "Invalid constituency ballots (%)", fmt: function (v) { return v.toFixed(2) + "%"; } },
    { key: "households_without_internet_rate_pct", label: "Households without internet (%)", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "median_equivalised_monthly_household_income", label: "Median equivalised monthly household income (THB)", fmt: function (v) { return v.toLocaleString() + " ฿"; } },
    { key: "poverty_headcount_ratio", label: "Poverty headcount ratio", fmt: function (v) { return v.toFixed(4); } },
    { key: "equivalised_income_gini", label: "Equivalised income Gini", fmt: function (v) { return v.toFixed(3); } },
    { key: "household_debt_to_monthly_income_ratio", label: "Household debt / monthly income", fmt: function (v) { return v.toFixed(2) + "×"; } },
    { key: "employment_yoy_change_rate", label: "Employment change (YoY)", fmt: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; } },
    { key: "agriculture_gpp_share", label: "Agriculture share of GPP", fmt: function (v) { return v.toFixed(3); } },
    { key: "manufacturing_gpp_share", label: "Manufacturing share of GPP", fmt: function (v) { return v.toFixed(3); } },
    { key: "urban_population_pct", label: "Urban population (%)", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "population_age_60_plus_pct", label: "Population aged 60+ (%)", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "population_change_pct", label: "Population change (%)", fmt: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; } },
    { key: "skip_generation_households_pct", label: "Skip-generation households (%)", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "higher_edu_25plus_pct", label: "Higher education, age 25+ (%)", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "poverty_pct", label: "Poverty (%)", fmt: function (v) { return v.toFixed(2) + "%"; } },
    { key: "nfe_student_pct", label: "Non-formal education students (%)", fmt: function (v) { return v.toFixed(2) + "%"; } },
    { key: "no_higher_edu_rate", label: "No higher education rate (%)", fmt: function (v) { return v.toFixed(1) + "%"; } }
  ];
  var FEATURE_MAP = {};
  FEATURES.forEach(function (f) { FEATURE_MAP[f.key] = f; });

  var PARTY_COLORS = {
    "ประชาชน": "#e6851a",
    "เพื่อไทย": "#b2182b",
    "ภูมิใจไทย": "#2166ac",
    "ประชาธิปัตย์": "#1b7837",
    "ประชาชาติ": "#762a83",
    "กล้าธรรม": "#d95f02"
  };
  var FALLBACK_PALETTE = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3"];
  var CLUSTER_PALETTE = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666", "#8da0cb", "#fc8d62", "#66c2a5", "#ffd92f", "#b3b3b3", "#e41a1c", "#377eb8"];

  function partyColor(party) {
    if (party == null) return "#999999";
    if (PARTY_COLORS[party]) return PARTY_COLORS[party];
    var used = Object.keys(PARTY_COLORS);
    return FALLBACK_PALETTE[used.length % FALLBACK_PALETTE.length];
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function withSeed(seed, fn) {
    var orig = Math.random;
    Math.random = mulberry32(seed);
    try { return fn(); } finally { Math.random = orig; }
  }

  function onehotRegions(rows) {
    var seen = [];
    rows.forEach(function (r) {
      if (r.region_name_th && seen.indexOf(r.region_name_th) < 0) seen.push(r.region_name_th);
    });
    return seen.sort();
  }

  function expandFeatures(rows, feats) {
    var cols = [];
    feats.forEach(function (f) {
      var def = FEATURE_MAP[f];
      if (def && def.onehot) {
        onehotRegions(rows).forEach(function (rg) {
          cols.push({ name: f + "=" + rg, get: function (r) { return r[f] === rg ? 1 : 0; } });
        });
      } else {
        cols.push({ name: f, get: function (r) { return r[f]; } });
      }
    });
    return cols;
  }

  function standardize(rows, feats) {
    var cols = expandFeatures(rows, feats);
    var n = rows.length, d = cols.length;
    var mean = [], sd = [];
    for (var j = 0; j < d; j++) {
      var s = 0, s2 = 0, cnt = 0;
      for (var i = 0; i < n; i++) { var v = cols[j].get(rows[i]); if (v !== null && v !== undefined && !isNaN(v)) { s += v; s2 += v * v; cnt++; } }
      mean[j] = cnt ? s / cnt : 0;
      var varr = cnt > 1 ? (s2 / cnt - mean[j] * mean[j]) : 0;
      sd[j] = Math.sqrt(Math.max(varr, 1e-12));
    }
    var X = new Array(n);
    for (var i2 = 0; i2 < n; i2++) {
      X[i2] = new Array(d);
      for (var j2 = 0; j2 < d; j2++) {
        var v2 = cols[j2].get(rows[i2]);
        X[i2][j2] = (v2 === null || v2 === undefined || isNaN(v2)) ? 0 : (v2 - mean[j2]) / sd[j2];
      }
    }
    return X;
  }

  function runTSNE(X, opts, onProgress) {
    var tsnejs = global.tsnejs;
    var model = new tsnejs.tSNE({
      epsilon: opts.learningRate,
      perplexity: opts.perplexity,
      dim: 2
    });
    return withSeed(opts.seed, function () {
      model.initDataRaw(X);
      var total = opts.nIter;
      var done = 0;
      function chunk() {
        var end = Math.min(total, done + 25);
        for (; done < end; done++) model.step();
        if (onProgress) onProgress(done / total);
        if (done < total) {
          return new Promise(function (res) { setTimeout(function () { res(chunk()); }, 0); });
        }
        return Promise.resolve();
      }
      return chunk().then(function () {
        return { Y: model.getSolution(), cost: model.cost, iter: done };
      });
    });
  }

  function dist2(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; }

  function kmeans(Y, k, seed) {
    var rng = mulberry32(seed);
    var n = Y.length;
    var cents = [Y[Math.floor(rng() * n)].slice()];
    while (cents.length < k) {
      var d2 = Y.map(function (p) {
        var best = Infinity;
        cents.forEach(function (c) { var dd = dist2(p, c); if (dd < best) best = dd; });
        return best;
      });
      var sum = d2.reduce(function (a, b) { return a + b; }, 0) || 1;
      var r = rng() * sum, idx = 0;
      while (idx < n - 1 && r > d2[idx]) { r -= d2[idx]; idx++; }
      cents.push(Y[idx].slice());
    }
    var labels = new Array(n).fill(0);
    for (var it = 0; it < 60; it++) {
      var changed = 0;
      for (var i = 0; i < n; i++) {
        var bi = 0, bd = Infinity;
        for (var c = 0; c < k; c++) { var dd = dist2(Y[i], cents[c]); if (dd < bd) { bd = dd; bi = c; } }
        if (labels[i] !== bi) { labels[i] = bi; changed++; }
      }
      var sums = cents.map(function () { return [0, 0, 0]; });
      for (var i2 = 0; i2 < n; i2++) { sums[labels[i2]][0] += Y[i2][0]; sums[labels[i2]][1] += Y[i2][1]; sums[labels[i2]][2]++; }
      for (var c2 = 0; c2 < k; c2++) {
        if (sums[c2][2] > 0) { cents[c2] = [sums[c2][0] / sums[c2][2], sums[c2][1] / sums[c2][2]]; }
      }
      if (!changed) break;
    }
    return labels;
  }

  function purityStats(rows, labels) {
    var byCluster = {};
    rows.forEach(function (r, i) {
      if (!r.party_name_th) return;
      var c = labels[i];
      if (!byCluster[c]) byCluster[c] = { size: 0, counts: {} };
      byCluster[c].size++;
      byCluster[c].counts[r.party_name_th] = (byCluster[c].counts[r.party_name_th] || 0) + 1;
    });
    var clusters = Object.keys(byCluster).map(function (c) {
      var g = byCluster[c];
      var majority = null, best = 0;
      Object.keys(g.counts).forEach(function (p) {
        if (g.counts[p] > best) { best = g.counts[p]; majority = p; }
      });
      return {
        cluster: +c, size: g.size, counts: g.counts, majority: majority,
        majorityCount: best, purity: best / g.size
      };
    }).sort(function (a, b) { return b.size - a.size; });
    var overall = clusters.reduce(function (a, c) { return a + c.majorityCount; }, 0) /
      (clusters.reduce(function (a, c) { return a + c.size; }, 0) || 1);
    return { clusters: clusters, overall: overall };
  }

  function parties(rows, minCount) {
    var counts = {};
    rows.forEach(function (r) { if (r.party_name_th) counts[r.party_name_th] = (counts[r.party_name_th] || 0) + 1; });
    return Object.keys(counts).filter(function (p) { return counts[p] >= (minCount || 1); })
      .sort(function (a, b) { return counts[b] - counts[a]; });
  }

  function cohensD(rows, feats, partyList) {
    return partyList.map(function (party) {
      var ds = feats.map(function (f) {
        var def = FEATURE_MAP[f];
        if (def && def.onehot) return { key: f, label: def.label, d: 0 };
        var a = rows.filter(function (r) { return r.party_name_th === party; }).map(function (r) { return r[f]; }).filter(function (v) { return v !== null && !isNaN(v); });
        var b = rows.filter(function (r) { return r.party_name_th !== party; }).map(function (r) { return r[f]; }).filter(function (v) { return v !== null && !isNaN(v); });
        if (a.length < 2 || b.length < 2) return { key: f, label: def.label, d: 0 };
        var ma = a.reduce(function (s, v) { return s + v; }, 0) / a.length;
        var mb = b.reduce(function (s, v) { return s + v; }, 0) / b.length;
        var va = a.reduce(function (s, v) { return s + (v - ma) * (v - ma); }, 0) / (a.length - 1);
        var vb = b.reduce(function (s, v) { return s + (v - mb) * (v - mb); }, 0) / (b.length - 1);
        var pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
        return { key: f, label: def.label, d: pooled ? (ma - mb) / pooled : 0 };
      }).sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
      return { party: party, factors: ds };
    });
  }

  function clusterProfiles(rows, labels, feats) {
    var groups = {};
    rows.forEach(function (r, i) { (groups[labels[i]] = groups[labels[i]] || []).push(r); });
    return Object.keys(groups).map(function (c) {
      var g = groups[c];
      var means = {};
      feats.forEach(function (f) {
        var def = FEATURE_MAP[f];
        if (def && def.onehot) {
          means[f] = null;
          return;
        }
        var vals = g.map(function (r) { return r[f]; }).filter(function (v) { return v !== null && !isNaN(v); });
        means[f] = vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : null;
      });
      return { cluster: +c, size: g.length, means: means };
    }).sort(function (a, b) { return b.size - a.size; });
  }

  var api = {
    FEATURES: FEATURES, FEATURE_MAP: FEATURE_MAP, PARTY_COLORS: PARTY_COLORS,
    CLUSTER_PALETTE: CLUSTER_PALETTE, partyColor: partyColor,
    mulberry32: mulberry32, standardize: standardize, expandFeatures: expandFeatures,
    onehotRegions: onehotRegions, runTSNE: runTSNE, kmeans: kmeans,
    purityStats: purityStats, parties: parties, cohensD: cohensD, clusterProfiles: clusterProfiles
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.APP = api;

  if (typeof document === "undefined") return;

  var rows = global.PROVINCES;
  var state = {
    selected: ["region_name_th", "median_equivalised_monthly_household_income", "higher_edu_25plus_pct", "urban_population_pct"],
    perplexity: 12, nIter: 1000, learningRate: 200, seed: 42, k: 6,
    colorBy: "result", view: "embed",
    Y: null, labels: null, purity: null, running: false
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

  function buildControls() {
    var box = $("factors");
    api.FEATURES.forEach(function (f) {
      var lab = el("label", "factor");
      var cb = el("input"); cb.type = "checkbox"; cb.value = f.key;
      cb.checked = state.selected.indexOf(f.key) >= 0;
      cb.addEventListener("change", function () {
        state.selected = Array.prototype.slice.call(box.querySelectorAll("input:checked")).map(function (i) { return i.value; });
        $("sel-count").textContent = state.selected.length;
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" " + f.label));
      box.appendChild(lab);
    });
    $("sel-count").textContent = state.selected.length;

    function slider(id, key, min, max, step) {
      var s = $(id);
      s.min = min; s.max = max; s.step = step; s.value = state[key];
      $(id + "-val").textContent = s.value;
      s.addEventListener("input", function () { state[key] = +s.value; $(id + "-val").textContent = s.value; });
    }
    slider("perplexity", "perplexity", 5, 30, 1);
    slider("niter", "nIter", 250, 2000, 50);
    slider("lr", "learningRate", 50, 500, 10);
    slider("seed", "seed", 1, 9999, 1);
    slider("k", "k", 2, 15, 1);

    Array.prototype.forEach.call(document.querySelectorAll('input[name="colorby"]'), function (r) {
      r.checked = r.value === state.colorBy;
      r.addEventListener("change", function () { state.colorBy = r.value; draw(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="view"]'), function (r) {
      r.checked = r.value === state.view;
      r.addEventListener("change", function () { state.view = r.value; draw(); });
    });
    $("run").addEventListener("click", runAll);
    $("dl").addEventListener("click", downloadCSV);
  }

  function runAll() {
    if (state.running) return;
    if (!state.selected.length) { alert("Select at least one factor."); return; }
    state.running = true;
    $("run").disabled = true;
    $("progress-wrap").style.display = "block";
    $("progress-bar").style.width = "0%";
    var nDims = api.expandFeatures(rows, state.selected).length;
    $("status").textContent = "Standardizing " + nDims + " column(s) (region one-hot encoded) and running t-SNE (winning party masked)…";
    var X = api.standardize(rows, state.selected);
    api.runTSNE(X, { perplexity: state.perplexity, nIter: state.nIter, learningRate: state.learningRate, seed: state.seed },
      function (p) {
        $("progress-bar").style.width = (p * 100).toFixed(0) + "%";
        $("status").textContent = "t-SNE iteration " + Math.round(p * state.nIter) + " / " + state.nIter + "…";
      })
      .then(function (res) {
        state.Y = res.Y;
        state.labels = api.kmeans(res.Y, state.k, state.seed);
        state.purity = api.purityStats(rows, state.labels);
        state.running = false;
        $("run").disabled = false;
        $("progress-wrap").style.display = "none";
        $("status").textContent = "t-SNE done: " + res.iter + " iterations on " + nDims + " column(s). k-means k=" + state.k +
          " → overall cluster purity " + (state.purity.overall * 100).toFixed(0) + "% (share of provinces in their cluster's majority party).";
        draw();
        renderStats();
      });
  }

  function projectEmbed(p, view) {
    var w = view.w, h = view.h, m = view.margin;
    var xs = state.Y.map(function (q) { return q[0]; });
    var ys = state.Y.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var sx = (w - 2 * m) / Math.max(x1 - x0, 1e-9), sy = (h - 2 * m) / Math.max(y1 - y0, 1e-9);
    var s = Math.min(sx, sy);
    var ox = m + (w - 2 * m - (x1 - x0) * s) / 2, oy = m + (h - 2 * m - (y1 - y0) * s) / 2;
    return [ox + (p[0] - x0) * s, h - (oy + (p[1] - y0) * s)];
  }

  function projectMap(p, view) {
    var w = view.w, h = view.h, m = view.margin;
    var lons = rows.map(function (r) { return r.lon; });
    var lats = rows.map(function (r) { return r.lat; });
    var lon0 = Math.min.apply(null, lons), lon1 = Math.max.apply(null, lons);
    var lat0 = Math.min.apply(null, lats), lat1 = Math.max.apply(null, lats);
    var latC = (lat0 + lat1) / 2 * Math.PI / 180;
    var spanX = (lon1 - lon0) * Math.cos(latC), spanY = lat1 - lat0;
    var s = Math.min((w - 2 * m) / Math.max(spanX, 1e-9), (h - 2 * m) / Math.max(spanY, 1e-9));
    var ox = m + (w - 2 * m - spanX * s) / 2, oy = m + (h - 2 * m - spanY * s) / 2;
    return [ox + (p[0] - lon0) * Math.cos(latC) * s, h - (oy + (p[1] - lat0) * s)];
  }

  var view = { w: 900, h: 620, margin: 40, scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0, pts: [] };

  function draw() {
    var canvas = $("plot");
    var dpr = global.devicePixelRatio || 1;
    var cw = canvas.clientWidth || 900, ch = canvas.clientHeight || 620;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    view.w = cw; view.h = ch;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch);

    var proj = state.view === "map" ? projectMap : projectEmbed;
    var dataPts = state.view === "map"
      ? rows.map(function (r) { return [r.lon, r.lat]; })
      : (state.Y || []);
    if (!dataPts.length) {
      ctx.fillStyle = "#666"; ctx.font = "15px sans-serif";
      ctx.fillText("Press “Run t-SNE” to compute the embedding.", 20, 30);
      return;
    }
    view.pts = dataPts.map(function (p, i) { var q = proj(p, view); return { x: q[0] * view.scale + view.tx, y: q[1] * view.scale + view.ty, i: i }; });

    ctx.strokeStyle = "#ccc"; ctx.strokeRect(view.margin, view.margin, cw - 2 * view.margin, ch - 2 * view.margin);
    ctx.fillStyle = "#555"; ctx.font = "12px sans-serif";
    ctx.fillText(state.view === "map" ? "longitude (equirectangular, province centroids)" : "t-SNE dimension 1", view.margin, ch - 12);
    ctx.save(); ctx.translate(12, ch - view.margin); ctx.rotate(-Math.PI / 2);
    ctx.fillText(state.view === "map" ? "latitude" : "t-SNE dimension 2", 0, 0); ctx.restore();

    view.pts.forEach(function (pt) {
      var r = rows[pt.i];
      var color;
      if (state.view === "map" || state.colorBy === "result") color = api.partyColor(r.party_name_th);
      else color = api.CLUSTER_PALETTE[(state.labels ? state.labels[pt.i] : 0) % api.CLUSTER_PALETTE.length];
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, state.view === "map" ? 4 : 4.5, 0, 2 * Math.PI);
      ctx.globalAlpha = r.party_name_th ? 0.9 : 0.35;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.6; ctx.strokeStyle = "#fff"; ctx.stroke();
    });

    var legend = state.view === "map" || state.colorBy === "result"
      ? api.parties(rows).map(function (p) { return [p, api.partyColor(p)]; })
      : state.labels ? Array.from(new Set(state.labels)).sort().map(function (c) { return ["cluster C" + c, api.CLUSTER_PALETTE[c % api.CLUSTER_PALETTE.length]]; }) : [];
    var lx = cw - 170, ly = view.margin + 8;
    legend.forEach(function (L, i) {
      ctx.fillStyle = L[1]; ctx.beginPath(); ctx.arc(lx + 6, ly + i * 18 + 5, 5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = "#333"; ctx.font = "11px sans-serif"; ctx.fillText(L[0], lx + 16, ly + i * 18 + 9);
    });
  }

  function bindPlot() {
    var canvas = $("plot");
    canvas.addEventListener("mousedown", function (e) { view.dragging = true; view.lastX = e.clientX; view.lastY = e.clientY; });
    global.addEventListener("mouseup", function () { view.dragging = false; });
    global.addEventListener("mousemove", function (e) {
      if (view.dragging) {
        view.tx += e.clientX - view.lastX; view.ty += e.clientY - view.lastY;
        view.lastX = e.clientX; view.lastY = e.clientY;
        draw();
        return;
      }
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var best = null, bd = 12 * 12;
      (view.pts || []).forEach(function (pt) {
        var dd = (pt.x - mx) * (pt.x - mx) + (pt.y - my) * (pt.y - my);
        if (dd < bd) { bd = dd; best = pt; }
      });
      var tip = $("tooltip");
      if (best) {
        var r = rows[best.i];
        var html = "<b>" + r.province_name_th + "</b> — " + (r.party_name_th || "n/a") +
          " · ภาค" + (r.region_name_th || "n/a") + "<br>";
        state.selected.forEach(function (f) {
          var def = api.FEATURE_MAP[f];
          var v = r[f];
          html += def.label + ": " + (v === null || v === undefined ? "n/a" : def.fmt(v)) + "<br>";
        });
        if (state.labels && state.colorBy === "cluster") html += "cluster: C" + state.labels[best.i];
        tip.innerHTML = html;
        tip.style.display = "block";
        tip.style.left = Math.min(mx + 14, rect.width - 260) + "px";
        tip.style.top = Math.min(my + 14, rect.height - 120) + "px";
      } else tip.style.display = "none";
    });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      view.scale *= f;
      view.tx = mx - (mx - view.tx) * f;
      view.ty = my - (my - view.ty) * f;
      draw();
    }, { passive: false });
    global.addEventListener("resize", draw);
  }

  function renderStats() {
    var p = state.purity;
    if (!p) return;
    $("metric-purity").textContent = (p.overall * 100).toFixed(1) + "%";
    $("metric-clusters").textContent = p.clusters.length;
    $("metric-note").textContent = "Share of provinces matching their cluster's majority party. 100% = every cluster is won by a single party = the selected factors are good predictors of the 2026 provincial winner; mixed clusters mean try other factors.";

    var bars = $("cluster-bars");
    bars.innerHTML = "";
    p.clusters.forEach(function (c) {
      var row = el("div", "cbar-row");
      var lab = el("div", "cbar-lab", "C" + c.cluster + " · n=" + c.size + " · " + c.majority + " " + c.majorityCount + "/" + c.size);
      var track = el("div", "cbar-track");
      var fill = el("div", "cbar-fill");
      fill.style.width = (c.purity * 100) + "%";
      fill.style.background = api.partyColor(c.majority);
      track.appendChild(fill);
      row.appendChild(lab); row.appendChild(track);
      bars.appendChild(row);
    });

    var prof = $("profiles");
    prof.innerHTML = "";
    if (state.selected.length) {
      var head = el("tr");
      head.appendChild(el("th", null, "cluster (size)"));
      state.selected.forEach(function (f) { head.appendChild(el("th", null, api.FEATURE_MAP[f].label.split(",")[0])); });
      prof.appendChild(head);
      api.clusterProfiles(rows, state.labels, state.selected).forEach(function (g) {
        var tr = el("tr");
        tr.appendChild(el("td", null, "C" + g.cluster + " (n=" + g.size + ")"));
        state.selected.forEach(function (f) {
          var def = api.FEATURE_MAP[f];
          var v = g.means[f];
          if (def.onehot) {
            tr.appendChild(el("td", null, "—"));
          } else {
            tr.appendChild(el("td", null, v === null ? "n/a" : def.fmt(v)));
          }
        });
        prof.appendChild(tr);
      });
    }

    var partyList = api.parties(rows, 3);
    var dbox = $("cohensd");
    dbox.innerHTML = "";
    partyList.forEach(function (party) {
      dbox.appendChild(el("div", "d-party", "<b>" + party + "</b> (provinces won vs rest)"));
      api.cohensD(rows, api.FEATURES.map(function (f) { return f.key; }), [party])[0].factors.slice(0, 5).forEach(function (r) {
        var row = el("div", "d-row");
        var w = Math.min(Math.abs(r.d), 2) / 2 * 100;
        row.appendChild(el("div", "d-lab", r.label));
        var track = el("div", "d-track");
        var fill = el("div", "d-fill");
        fill.style.width = w + "%";
        fill.style.background = r.d > 0 ? api.partyColor(party) : "#999999";
        if (r.d < 0) fill.style.marginLeft = (100 - w) + "%";
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el("div", "d-val", (r.d > 0 ? "+" : "") + r.d.toFixed(2)));
        dbox.appendChild(row);
      });
    });
  }

  function renderTable() {
    var t = $("datatable");
    t.innerHTML = "";
    var cols = ["province_name_th", "region_name_th", "party_name_th"].concat(api.FEATURES.map(function (f) { return f.key; }).filter(function (k) { return k !== "region_name_th"; }));
    var head = el("tr");
    cols.forEach(function (c) { head.appendChild(el("th", null, c)); });
    t.appendChild(head);
    rows.forEach(function (r) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = r[c];
        tr.appendChild(el("td", null, v === null || v === undefined ? "" : String(v)));
      });
      t.appendChild(tr);
    });
  }

  function downloadCSV() {
    var cols = ["province_code", "province_name_th", "region_name_th", "party_name_th", "lat", "lon"]
      .concat(api.FEATURES.map(function (f) { return f.key; }).filter(function (k) { return k !== "region_name_th"; }));
    var lines = [cols.join(",")];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c];
        return typeof v === "string" && (v.indexOf(",") >= 0 || v.indexOf('"') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : (v === null || v === undefined ? "" : v);
      }).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = "provinces_2026_thai_election.csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function initUI() {
    buildControls();
    bindPlot();
    renderTable();
    runAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
  else initUI();

})(typeof window !== "undefined" ? window : globalThis);
