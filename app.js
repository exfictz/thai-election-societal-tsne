(function (global) {
  "use strict";

  var FEATURES = [
    { key: "pop_density", label: "Population density (people/sq mi, urbanisation)", fmt: function (v) { return v.toLocaleString(undefined, { maximumFractionDigits: 0 }); } },
    { key: "pct_worked_from_home", label: "% worked from home", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "median_hh_income", label: "Median household income", fmt: function (v) { return "$" + v.toLocaleString(); } },
    { key: "per_capita_income", label: "Per-capita income", fmt: function (v) { return "$" + v.toLocaleString(); } },
    { key: "gini_index", label: "Gini index (income inequality)", fmt: function (v) { return v.toFixed(3); } },
    { key: "pct_ba_plus", label: "% bachelor's degree or higher", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "pct_white", label: "% White", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "pct_black", label: "% Black", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "pct_asian", label: "% Asian", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "pct_hispanic", label: "% Hispanic / Latino", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "poverty_rate", label: "Poverty rate", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "pct_owner_occupied", label: "% owner-occupied housing", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "median_home_value", label: "Median home value", fmt: function (v) { return "$" + v.toLocaleString(); } },
    { key: "median_gross_rent", label: "Median gross rent", fmt: function (v) { return "$" + v.toLocaleString(); } },
    { key: "unemployment_rate", label: "Unemployment rate", fmt: function (v) { return v.toFixed(1) + "%"; } },
    { key: "median_age", label: "Median age", fmt: function (v) { return v.toFixed(1); } },
    { key: "population", label: "Total population", fmt: function (v) { return v.toLocaleString(); } }
  ];
  var FEATURE_MAP = {};
  FEATURES.forEach(function (f) { FEATURE_MAP[f.key] = f; });

  var PARTY_COLORS = { Democratic: "#2166ac", Republican: "#b2182b", Uncalled: "#999999" };
  var CLUSTER_PALETTE = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666", "#8da0cb", "#fc8d62", "#66c2a5", "#ffd92f", "#b3b3b3", "#e41a1c", "#377eb8"];

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

  function standardize(rows, feats) {
    var n = rows.length, d = feats.length;
    var mean = [], sd = [];
    for (var j = 0; j < d; j++) {
      var s = 0, s2 = 0, cnt = 0;
      for (var i = 0; i < n; i++) { var v = rows[i][feats[j]]; if (v !== null && v !== undefined && !isNaN(v)) { s += v; s2 += v * v; cnt++; } }
      mean[j] = cnt ? s / cnt : 0;
      var varr = cnt > 1 ? (s2 / cnt - mean[j] * mean[j]) : 0;
      sd[j] = Math.sqrt(Math.max(varr, 1e-12));
    }
    var X = new Array(n);
    for (var i2 = 0; i2 < n; i2++) {
      X[i2] = new Array(d);
      for (var j2 = 0; j2 < d; j2++) {
        var v2 = rows[i2][feats[j2]];
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
      if (!r.called) return;
      var c = labels[i];
      if (!byCluster[c]) byCluster[c] = { size: 0, D: 0, R: 0 };
      byCluster[c].size++;
      if (r.winner_party === "Democratic") byCluster[c].D++;
      else if (r.winner_party === "Republican") byCluster[c].R++;
    });
    var clusters = Object.keys(byCluster).map(function (c) {
      var g = byCluster[c];
      var maj = g.D >= g.R ? "Democratic" : "Republican";
      return { cluster: +c, size: g.size, D: g.D, R: g.R, majority: maj, purity: Math.max(g.D, g.R) / g.size };
    }).sort(function (a, b) { return b.size - a.size; });
    var overall = clusters.reduce(function (a, c) { return a + Math.max(c.D, c.R); }, 0) /
      (clusters.reduce(function (a, c) { return a + c.size; }, 0) || 1);
    return { clusters: clusters, overall: overall };
  }

  function cohensD(rows, feats) {
    var dRows = rows.filter(function (r) { return r.called && r.winner_party === "Democratic"; });
    var rRows = rows.filter(function (r) { return r.called && r.winner_party === "Republican"; });
    return feats.map(function (f) {
      var a = dRows.map(function (r) { return r[f]; }).filter(function (v) { return v !== null && !isNaN(v); });
      var b = rRows.map(function (r) { return r[f]; }).filter(function (v) { return v !== null && !isNaN(v); });
      var ma = a.reduce(function (s, v) { return s + v; }, 0) / a.length;
      var mb = b.reduce(function (s, v) { return s + v; }, 0) / b.length;
      var va = a.reduce(function (s, v) { return s + (v - ma) * (v - ma); }, 0) / (a.length - 1);
      var vb = b.reduce(function (s, v) { return s + (v - mb) * (v - mb); }, 0) / (b.length - 1);
      var pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
      return { key: f, label: FEATURE_MAP[f].label, d: pooled ? (ma - mb) / pooled : 0 };
    }).sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
  }

  function clusterProfiles(rows, labels, feats) {
    var groups = {};
    rows.forEach(function (r, i) { (groups[labels[i]] = groups[labels[i]] || []).push(r); });
    return Object.keys(groups).map(function (c) {
      var g = groups[c];
      var means = {};
      feats.forEach(function (f) {
        var vals = g.map(function (r) { return r[f]; }).filter(function (v) { return v !== null && !isNaN(v); });
        means[f] = vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : null;
      });
      return { cluster: +c, size: g.length, means: means };
    }).sort(function (a, b) { return b.size - a.size; });
  }

  var api = {
    FEATURES: FEATURES, FEATURE_MAP: FEATURE_MAP, PARTY_COLORS: PARTY_COLORS, CLUSTER_PALETTE: CLUSTER_PALETTE,
    mulberry32: mulberry32, standardize: standardize, runTSNE: runTSNE, kmeans: kmeans,
    purityStats: purityStats, cohensD: cohensD, clusterProfiles: clusterProfiles
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.APP = api;

  if (typeof document === "undefined") return;

  var rows = global.DISTRICTS;
  var state = {
    selected: ["pop_density", "pct_ba_plus", "median_hh_income", "pct_white"],
    perplexity: 30, nIter: 1000, learningRate: 200, seed: 42, k: 6,
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
    slider("perplexity", "perplexity", 5, 50, 1);
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
    $("status").textContent = "Standardizing " + state.selected.length + " factor(s) and running t-SNE (result masked)…";
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
        $("status").textContent = "t-SNE done: " + res.iter + " iterations on " + state.selected.length + " factor(s). k-means k=" + state.k +
          " → overall cluster purity " + (state.purity.overall * 100).toFixed(0) + "% (called races).";
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
    ctx.fillText(state.view === "map" ? "longitude (equirectangular, centroids)" : "t-SNE dimension 1", view.margin, ch - 12);
    ctx.save(); ctx.translate(12, ch - view.margin); ctx.rotate(-Math.PI / 2);
    ctx.fillText(state.view === "map" ? "latitude" : "t-SNE dimension 2", 0, 0); ctx.restore();

    view.pts.forEach(function (pt) {
      var r = rows[pt.i];
      var color;
      if (state.view === "map" || state.colorBy === "result") color = api.PARTY_COLORS[r.winner_party] || "#999";
      else color = api.CLUSTER_PALETTE[(state.labels ? state.labels[pt.i] : 0) % api.CLUSTER_PALETTE.length];
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, state.view === "map" ? 4 : 4.5, 0, 2 * Math.PI);
      ctx.globalAlpha = r.called ? 0.9 : 0.35;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.6; ctx.strokeStyle = "#fff"; ctx.stroke();
    });

    var legend = state.view === "map" || state.colorBy === "result"
      ? [["Democratic win", api.PARTY_COLORS.Democratic], ["Republican win", api.PARTY_COLORS.Republican], ["Not called yet", api.PARTY_COLORS.Uncalled]]
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
        var html = "<b>" + r.district + "</b> — " + r.winner_party + (r.caller ? " (" + r.caller + ")" : "") + (r.called ? "" : " · not called") + "<br>";
        state.selected.forEach(function (f) { html += api.FEATURE_MAP[f].label + ": " + (r[f] === null ? "n/a" : api.FEATURE_MAP[f].fmt(r[f])) + "<br>"; });
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
    $("metric-note").textContent = "Share of called districts matching their cluster's majority party. 100% = every cluster purely red or purely blue = selected factors separate the result.";

    var bars = $("cluster-bars");
    bars.innerHTML = "";
    p.clusters.forEach(function (c) {
      var row = el("div", "cbar-row");
      var lab = el("div", "cbar-lab", "C" + c.cluster + " · n=" + c.size + " · " + c.D + "D/" + c.R + "R");
      var track = el("div", "cbar-track");
      var fill = el("div", "cbar-fill");
      fill.style.width = (c.purity * 100) + "%";
      fill.style.background = api.PARTY_COLORS[c.majority];
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
          var v = g.means[f];
          tr.appendChild(el("td", null, v === null ? "n/a" : api.FEATURE_MAP[f].fmt(v)));
        });
        prof.appendChild(tr);
      });
    }

    var dd = api.cohensD(rows, api.FEATURES.map(function (f) { return f.key; }));
    var dbox = $("cohensd");
    dbox.innerHTML = "";
    dd.forEach(function (r) {
      var row = el("div", "d-row");
      var w = Math.min(Math.abs(r.d), 2) / 2 * 100;
      row.appendChild(el("div", "d-lab", r.label));
      var track = el("div", "d-track");
      var fill = el("div", "d-fill");
      fill.style.width = w + "%";
      fill.style.background = r.d > 0 ? api.PARTY_COLORS.Democratic : api.PARTY_COLORS.Republican;
      if (r.d < 0) fill.style.marginLeft = (100 - w) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("div", "d-val", (r.d > 0 ? "+" : "") + r.d.toFixed(2)));
      dbox.appendChild(row);
    });
  }

  function renderTable() {
    var t = $("datatable");
    t.innerHTML = "";
    var cols = ["district", "winner_party", "called", "caller"].concat(api.FEATURES.map(function (f) { return f.key; }));
    var head = el("tr");
    cols.forEach(function (c) { head.appendChild(el("th", null, c)); });
    t.appendChild(head);
    rows.forEach(function (r) {
      var tr = el("tr");
      cols.forEach(function (c) {
        var v = r[c];
        if (c === "called") v = v ? "yes" : "no";
        tr.appendChild(el("td", null, v === null || v === undefined ? "" : String(v)));
      });
      t.appendChild(tr);
    });
  }

  function downloadCSV() {
    var cols = ["district", "state", "cd", "cd_name", "winner_party", "called", "caller", "lat", "lon"]
      .concat(api.FEATURES.map(function (f) { return f.key; }));
    var lines = [cols.join(",")];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) {
        var v = r[c] === null || v === undefined ? "" : r[c];
        return typeof v === "string" && v.indexOf(",") >= 0 ? '"' + v + '"' : v;
      }).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = "districts_2026_house.csv";
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
