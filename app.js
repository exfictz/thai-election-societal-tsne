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
    "ประชาชาติ": "#BA810D",
    "ประชาชน": "#FD6413",
    "เพื่อไทย": "#E30F13",
    "ประชาธิปัตย์": "#30A1E9",
    "ภูมิใจไทย": "#312783",
    "กล้าธรรม": "#4EC86F"
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

  var POINT_R = 5;

  function mapLayout(rows, w, h, margin) {
    var lons = rows.map(function (r) { return r.lon; });
    var lats = rows.map(function (r) { return r.lat; });
    var lon0 = Math.min.apply(null, lons), lon1 = Math.max.apply(null, lons);
    var lat0 = Math.min.apply(null, lats), lat1 = Math.max.apply(null, lats);
    var latC = (lat0 + lat1) / 2 * Math.PI / 180;
    var spanX = (lon1 - lon0) * Math.cos(latC), spanY = lat1 - lat0;
    var availW = w - 2 * margin, availH = h - 2 * margin;
    var s = Math.min(availW / Math.max(spanX, 1e-9), availH / Math.max(spanY, 1e-9));
    var ox = margin + (availW - spanX * s) / 2, oy = margin + (availH - spanY * s) / 2;
    return rows.map(function (r) {
      return {
        x: ox + (r.lon - lon0) * Math.cos(latC) * s,
        y: h - (oy + (r.lat - lat0) * s),
        r: POINT_R
      };
    });
  }

  function tsneLayout(Y, w, h, margin, radius) {
    var xs = Y.map(function (q) { return q[0]; });
    var ys = Y.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var availW = w - 2 * margin, availH = h - 2 * margin;
    var sx = availW / Math.max(x1 - x0, 1e-9), sy = availH / Math.max(y1 - y0, 1e-9);
    var s = Math.min(sx, sy);
    var ox = margin + (availW - (x1 - x0) * s) / 2, oy = margin + (availH - (y1 - y0) * s) / 2;
    return Y.map(function (p) {
      return { x: ox + (p[0] - x0) * s, y: h - (oy + (p[1] - y0) * s), r: radius };
    });
  }

  var api = {
    FEATURES: FEATURES, FEATURE_MAP: FEATURE_MAP, PARTY_COLORS: PARTY_COLORS,
    CLUSTER_PALETTE: CLUSTER_PALETTE, partyColor: partyColor,
    mulberry32: mulberry32, standardize: standardize, expandFeatures: expandFeatures,
    onehotRegions: onehotRegions, runTSNE: runTSNE, kmeans: kmeans,
    purityStats: purityStats, parties: parties, cohensD: cohensD,
    clusterProfiles: clusterProfiles, mapLayout: mapLayout, tsneLayout: tsneLayout
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.APP = api;

  if (typeof document === "undefined") return;

  var rows = global.PROVINCES;
  var state = {
    selected: ["region_name_th", "median_equivalised_monthly_household_income", "higher_edu_25plus_pct", "urban_population_pct"],
    perplexity: 25, nIter: 1000, learningRate: 100, seed: 42, k: 6,
    colorBy: "result",
    Y: null, labels: null, purity: null, running: false, pendingRun: false,
    rightPositions: null, animating: false,
    brush: { active: false, x0: 0, y0: 0, x1: 0, y1: 0, selected: {} }
  };
  var MARGIN = 30;
  var ANIM_MS = 1200;

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
    slider("k", "k", 2, 6, 1);

    Array.prototype.forEach.call(document.querySelectorAll('input[name="colorby"]'), function (r) {
      r.checked = r.value === state.colorBy;
      r.addEventListener("change", function () { state.colorBy = r.value; drawAll(); });
    });
    $("sidebar").addEventListener("change", runAll);
    $("dl").addEventListener("click", downloadCSV);
  }

  function runAll() {
    if (state.running) { state.pendingRun = true; return; }
    if (!state.selected.length) {
      $("status").textContent = "Select at least one factor.";
      return;
    }
    state.running = true;
    state.pendingRun = false;
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
        $("progress-wrap").style.display = "none";
        $("status").textContent = "t-SNE done: " + res.iter + " iterations on " + nDims + " column(s). k-means k=" + state.k +
          " → overall cluster purity " + (state.purity.overall * 100).toFixed(0) + "% (share of provinces in their cluster's majority party).";
        animateToTsne();
        renderStats();
        if (state.pendingRun) runAll();
      });
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function animateToTsne() {
    var canvas = $("plot-tsne");
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    var from = (state.rightPositions || api.mapLayout(rows, cw, ch, MARGIN)).map(function (p) { return { x: p.x, y: p.y, r: p.r }; });
    var to = api.tsneLayout(state.Y, cw, ch, MARGIN, POINT_R);
    var t0 = null;
    state.animating = true;
    function frame(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / ANIM_MS);
      var e = easeInOut(t);
      state.rightPositions = from.map(function (p, i) {
        return {
          x: p.x + (to[i].x - p.x) * e,
          y: p.y + (to[i].y - p.y) * e,
          r: p.r
        };
      });
      drawAll();
      if (t < 1) requestAnimationFrame(frame);
      else state.animating = false;
    }
    requestAnimationFrame(frame);
  }

  function baseAlpha(i) { return rows[i].party_name_th ? 0.9 : 0.35; }

  function drawWindow(canvasId, positions, colorFn, alphaFn) {
    var canvas = $(canvasId);
    var dpr = global.devicePixelRatio || 1;
    var cw = canvas.clientWidth || 440, ch = canvas.clientHeight || 560;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "#ccc"; ctx.strokeRect(MARGIN, MARGIN, cw - 2 * MARGIN, ch - 2 * MARGIN);
    positions.forEach(function (p, i) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI);
      ctx.globalAlpha = alphaFn(i);
      ctx.fillStyle = colorFn(i);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.8; ctx.strokeStyle = "#fff"; ctx.stroke();
    });
    return { w: cw, h: ch };
  }

  function drawLegend(canvasId, legend) {
    var canvas = $(canvasId);
    var ctx = canvas.getContext("2d");
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    var lx = cw - 150, ly = MARGIN + 6;
    ctx.font = "11px sans-serif";
    var maxW = 0;
    legend.forEach(function (L) { maxW = Math.max(maxW, ctx.measureText(L[0]).width); });
    lx = cw - maxW - 34;
    legend.forEach(function (L, i) {
      ctx.fillStyle = L[1]; ctx.beginPath(); ctx.arc(lx + 6, ly + i * 18 + 5, 5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = "#333"; ctx.fillText(L[0], lx + 16, ly + i * 18 + 9);
    });
  }

  function geoPositions() {
    var canvas = $("plot-geo");
    var cw = canvas.clientWidth || 440, ch = canvas.clientHeight || 560;
    return api.mapLayout(rows, cw, ch, MARGIN);
  }

  function geoAlpha(i) {
    if (state.brush.active && !state.brush.selected[i]) return baseAlpha(i) * 0.2;
    return baseAlpha(i);
  }

  function drawAll() {
    var geo = geoPositions();
    drawWindow("plot-geo", geo, function (i) { return api.partyColor(rows[i].party_name_th); }, geoAlpha);
    drawLegend("plot-geo", api.parties(rows).map(function (p) { return [p, api.partyColor(p)]; }));

    var right = state.rightPositions || geo;
    var rightColor = state.colorBy === "cluster" && state.labels
      ? function (i) { return api.CLUSTER_PALETTE[state.labels[i] % api.CLUSTER_PALETTE.length]; }
      : function (i) { return api.partyColor(rows[i].party_name_th); };
    drawWindow("plot-tsne", right, rightColor, baseAlpha);
    if (state.brush.active) {
      var canvas = $("plot-tsne");
      var ctx = canvas.getContext("2d");
      var b = state.brush;
      var x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
      var y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      ctx.strokeStyle = "#557";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
    var legend = state.colorBy === "cluster" && state.labels
      ? Array.from(new Set(state.labels)).sort().map(function (c) { return ["cluster C" + c, api.CLUSTER_PALETTE[c % api.CLUSTER_PALETTE.length]]; })
      : api.parties(rows).map(function (p) { return [p, api.partyColor(p)]; });
    drawLegend("plot-tsne", legend);
  }

  function brushSelection(positions) {
    var b = state.brush;
    var x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    var y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    var sel = {};
    positions.forEach(function (p, i) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) sel[i] = true;
    });
    return sel;
  }

  function bindBrush(canvasId, positionsFn) {
    var canvas = $(canvasId);
    function pt(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    canvas.addEventListener("mousedown", function (e) {
      var p = pt(e);
      state.brush.active = true;
      state.brush.x0 = state.brush.x1 = p.x;
      state.brush.y0 = state.brush.y1 = p.y;
      state.brush.selected = {};
      drawAll();
      e.preventDefault();
    });
    canvas.addEventListener("mousemove", function (e) {
      if (!state.brush.active) return;
      var p = pt(e);
      state.brush.x1 = p.x;
      state.brush.y1 = p.y;
      state.brush.selected = brushSelection(positionsFn());
      drawAll();
    });
    function end() {
      if (!state.brush.active) return;
      state.brush.active = false;
      state.brush.selected = {};
      drawAll();
    }
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    global.addEventListener("mouseup", end);
  }

  function bindTooltip(canvasId, positionsFn) {
    var canvas = $(canvasId);
    canvas.addEventListener("mousemove", function (e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var pts = positionsFn();
      var best = null, bd = Infinity;
      pts.forEach(function (p, i) {
        var dd = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my);
        var rr = p.r * p.r;
        if (dd <= rr && dd < bd) { bd = dd; best = { p: p, i: i }; }
      });
      var tip = $("tooltip-" + canvasId);
      if (best && !(state.brush.active && canvasId === "plot-tsne")) {
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
    canvas.addEventListener("mouseleave", function () { $("tooltip-" + canvasId).style.display = "none"; });
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
    bindTooltip("plot-geo", geoPositions);
    bindTooltip("plot-tsne", function () { return state.rightPositions || geoPositions(); });
    bindBrush("plot-tsne", function () { return state.rightPositions || geoPositions(); });
    renderTable();
    drawAll();
    global.addEventListener("resize", function () { if (!state.animating) drawAll(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
  else initUI();

})(typeof window !== "undefined" ? window : globalThis);
