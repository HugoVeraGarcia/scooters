/* ScooterScope — range map (isochrones by distance on real streets).
   Needs: Leaflet (window.L), window.__DB__ (db.js) and window.__RANGE__ (config inlined by build.py). */
(function () {
  "use strict";
  var MI_KM = 1.609344;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  function init() {
    var root = document.querySelector("[data-range]");
    var DB = window.__DB__, CFG = window.__RANGE__;
    if (!root || !DB || !CFG) return;
    var statusEl = root.querySelector("[data-rm-status]");
    function status(msg, kind) {
      statusEl.textContent = msg || "";
      statusEl.className = "rm-status" + (kind ? " is-" + kind : "") + (msg ? " is-on" : "");
    }
    if (!window.L) {
      status("The map couldn't load. Please refresh the page.", "err");
      root.querySelector("[data-rm-form]").addEventListener("submit", function (e) { e.preventDefault(); });
      return;
    }

    var COLORS = DB.meta.colors;
    var byId = {};
    DB.products.forEach(function (p) { byId[p.id] = p; });
    var usable = DB.products.filter(function (p) { return p.specs && p.specs.range_mi; });

    // ---------- state (from URL, else defaults) ----------
    var qs = new URLSearchParams(location.search);
    var state = {
      ids: (qs.get("ids") || "").split(",").filter(function (id) { return byId[id] && byId[id].specs.range_mi; }).slice(0, CFG.maxPick),
      trip: qs.get("trip") === "one" ? "one" : "round",
      basis: qs.get("basis") === "claimed" ? "claimed" : "real",
      origin: null
    };
    if (!state.ids.length) state.ids = CFG.defaults.filter(function (id) { return byId[id]; }).slice(0, CFG.maxPick);
    var at = (qs.get("at") || "").split(",").map(Number);
    if (at.length === 2 && isFinite(at[0]) && isFinite(at[1]) && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180) {
      state.origin = { lat: at[0], lon: at[1], label: qs.get("place") || "Pinned point" };
    } else {
      state.origin = { lat: CFG.defaultPlace.lat, lon: CFG.defaultPlace.lon, label: CFG.defaultPlace.label };
    }

    // ---------- map ----------
    var mapEl = root.querySelector("[data-rm-map]");
    var map = L.map(mapEl, { scrollWheelZoom: false, worldCopyJump: true }).setView([state.origin.lat, state.origin.lon], 10);
    L.tileLayer(CFG.tiles || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "rm-tiles",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Routing <a href="https://github.com/valhalla/valhalla" target="_blank" rel="noopener">Valhalla</a>'
    }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    map.on("focus click", function () { map.scrollWheelZoom.enable(); });
    mapEl.addEventListener("mouseleave", function () { map.scrollWheelZoom.disable(); });
    var areas = L.layerGroup().addTo(map);
    var pin = L.circleMarker([state.origin.lat, state.origin.lon], { radius: 7, color: "#0B0D12", weight: 3, fillColor: "#D2FF3C", fillOpacity: 1 }).addTo(map);
    map.on("click", function (e) {
      state.origin = { lat: r1(e.latlng.lat * 1000) / 1000, lon: r1(e.latlng.lng * 1000) / 1000, label: "Pinned point" };
      root.querySelector("[data-rm-q]").value = "";
      run();
    });

    // ---------- controls ----------
    var addSel = root.querySelector("[data-rm-add]");
    function fillSelect() {
      var groups = { adults: [], kids: [] };
      DB.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (p) {
        var kids = /kids/i.test((p.tags || []).join(" ")) || (p.specs.max_load_lb && p.specs.max_load_lb < 180 && p.specs.top_speed_mph <= 12.5);
        (kids ? groups.kids : groups.adults).push(p);
      });
      function opt(p) {
        var picked = state.ids.indexOf(p.id) > -1;
        var dis = picked || !p.specs.range_mi || state.ids.length >= CFG.maxPick;
        return '<option value="' + esc(p.id) + '"' + (dis ? " disabled" : "") + ">" + esc(p.name) +
          (p.specs.range_mi ? " — " + p.specs.range_mi + " mi claimed" : " — range not published") + (picked ? " ✓" : "") + "</option>";
      }
      addSel.innerHTML = '<option value="">' + (state.ids.length >= CFG.maxPick ? "Remove one to add another (max " + CFG.maxPick + ")" : "+ Add a scooter") + "</option>" +
        '<optgroup label="Adults">' + groups.adults.map(opt).join("") + "</optgroup>" +
        (groups.kids.length ? '<optgroup label="Kids">' + groups.kids.map(opt).join("") + "</optgroup>" : "");
    }
    addSel.addEventListener("change", function () {
      var id = addSel.value;
      if (id && state.ids.length < CFG.maxPick && state.ids.indexOf(id) < 0) { state.ids.push(id); run(); }
      addSel.value = "";
    });

    var pickedEl = root.querySelector("[data-rm-picked]");
    pickedEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm-rm]");
      if (!b) return;
      state.ids = state.ids.filter(function (id) { return id !== b.getAttribute("data-rm-rm"); });
      run();
    });

    function segment(attr, key) {
      root.querySelectorAll("[" + attr + "]").forEach(function (b) {
        b.addEventListener("click", function () {
          state[key] = b.getAttribute(attr);
          root.querySelectorAll("[" + attr + "]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          run();
        });
        b.setAttribute("aria-pressed", String(b.getAttribute(attr) === state[key]));
      });
    }
    segment("data-rm-trip", "trip");
    segment("data-rm-basis", "basis");

    var form = root.querySelector("[data-rm-form]");
    var qInput = root.querySelector("[data-rm-q]");
    if (state.origin.label && state.origin.label !== "Pinned point") qInput.value = state.origin.label;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = qInput.value.trim();
      if (!q) { run(); return; }
      status("Finding “" + q + "”…", "load");
      var url = CFG.geocoder + (CFG.geocoder.indexOf("?") > -1 ? "&" : "?") + "format=jsonv2&limit=1&q=" + encodeURIComponent(q);
      fetch(url, { headers: { "Accept-Language": "en" } }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res || !res.length) { status("We couldn't find “" + q + "”. Try a city name, a full address or a ZIP code.", "err"); return; }
        var label = res[0].display_name.split(",").slice(0, 3).join(",").trim();
        state.origin = { lat: +(+res[0].lat).toFixed(4), lon: +(+res[0].lon).toFixed(4), label: label };
        qInput.value = label;
        run();
      }).catch(function () { status("The place search isn't responding right now. Click the map to set a starting point instead.", "err"); });
    });

    var locBtn = root.querySelector("[data-rm-locate]");
    if (!("geolocation" in navigator)) locBtn.hidden = true;
    locBtn.addEventListener("click", function () {
      status("Asking your browser for your location…", "load");
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.origin = { lat: +pos.coords.latitude.toFixed(3), lon: +pos.coords.longitude.toFixed(3), label: "Your location" };
        qInput.value = "";
        run();
      }, function () { status("Location permission was denied or unavailable. Search for a place or click the map instead.", "err"); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    });

    // ---------- range math ----------
    function plan(p) {
      var mi = p.specs.range_mi * (state.basis === "real" ? CFG.realFactor : 1) / (state.trip === "round" ? 2 : 1);
      var km = mi * MI_KM, capped = false;
      if (km > CFG.maxKm) { km = CFG.maxKm; capped = true; }
      return { mi: capped ? CFG.maxKm / MI_KM : mi, km: Math.max(0.5, r1(km)), capped: capped };
    }

    // ---------- isochrone request (one call for all scooters, cached) ----------
    var cache = {}, seq = 0;
    function fetchAreas(origin, kms) {
      var body = {
        locations: [{ lat: origin.lat, lon: origin.lon }],
        costing: CFG.costing,
        contours: kms.map(function (k) { return { distance: k }; }),
        polygons: true, denoise: 0.4, generalize: 120
      };
      if (CFG.costing === "bicycle") body.costing_options = { bicycle: { bicycle_type: "Hybrid", use_roads: 0.5 } };
      var key = JSON.stringify(body);
      if (cache[key]) return Promise.resolve(cache[key]);
      var url = CFG.endpoint + (CFG.endpoint.indexOf("?") > -1 ? "&" : "?") + "json=" + encodeURIComponent(key);
      return fetch(url).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || j.error) throw new Error(j.error || ("HTTP " + r.status));
          cache[key] = j;
          return j;
        });
      });
    }

    // ---------- render ----------
    function syncUrl() {
      var p = new URLSearchParams();
      if (state.ids.length) p.set("ids", state.ids.join(","));
      if (state.trip !== "round") p.set("trip", state.trip);
      if (state.basis !== "real") p.set("basis", state.basis);
      p.set("at", state.origin.lat + "," + state.origin.lon);
      if (state.origin.label && state.origin.label !== "Pinned point" && state.origin.label !== "Your location") p.set("place", state.origin.label);
      try { history.replaceState(null, "", location.pathname + "?" + p.toString()); } catch (e) { /* ignore */ }
    }

    function renderPicked() {
      pickedEl.innerHTML = state.ids.map(function (id, i) {
        var p = byId[id];
        return '<li style="--c:' + COLORS[i] + '"><i aria-hidden="true"></i>' + esc(p.name) +
          '<button type="button" data-rm-rm="' + esc(id) + '" aria-label="Remove ' + esc(p.name) + '"><svg class="ico"><use href="#i-x"/></svg></button></li>';
      }).join("") || '<li class="rm-picked__empty">Add up to ' + CFG.maxPick + " scooters to compare their range.</li>";
      fillSelect();
    }

    function renderResults(plans, ok) {
      var out = root.querySelector("[data-rm-results]");
      if (!plans.length) { out.innerHTML = ""; return; }
      var tripTxt = state.trip === "round" ? "each way (round trip)" : "one way";
      out.innerHTML = plans.map(function (x, i) {
        var p = x.p;
        return '<article class="rm-card" style="--c:' + COLORS[i] + '"><div class="rm-card__img"><img src="' + esc(p.img) + '" alt="" loading="lazy"></div><div class="rm-card__body">' +
          '<h3><i aria-hidden="true"></i><a href="' + esc(p.url) + '">' + esc(p.name) + "</a></h3>" +
          '<p class="rm-card__big"><b>' + r1(x.mi) + " mi</b> " + tripTxt + "</p>" +
          '<p class="rm-card__meta">' + p.specs.range_mi + " mi claimed" + (state.basis === "real" ? " · real-world " + Math.round(CFG.realFactor * 100) + "%" : "") +
          (x.capped ? ' · <span class="rm-cap">capped at the map limit</span>' : "") + (ok ? "" : ' · <span class="rm-cap">map area unavailable</span>') + "</p>" +
          '<div class="rm-card__actions">' + (p.price != null ? '<span class="rm-card__price">$' + p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "</span>" : "") +
          '<a class="btn btn--amazon btn--xs" href="' + esc(p.aff) + '" target="_blank" rel="sponsored nofollow noopener">View on Amazon<svg class="ico"><use href="#i-ext"/></svg></a>' +
          '<a class="btn btn--ghost btn--xs" href="' + esc(p.url) + '">Review</a></div></div></article>';
      }).join("") + '<p class="note note--muted rm-foot">Prices from Amazon.com as of ' + esc((plans[0].p.priceDate) || "") + ". Areas follow bike-legal streets and paths from the starting point; actual range depends on rider weight, hills, weather and riding mode.</p>";
    }

    function run() {
      var my = ++seq;
      renderPicked();
      syncUrl();
      pin.setLatLng([state.origin.lat, state.origin.lon]);
      areas.clearLayers();
      var plans = state.ids.map(function (id) { var x = plan(byId[id]); x.p = byId[id]; return x; });
      if (!plans.length) { renderResults([], true); status("Add a scooter to see how far it can go.", ""); map.setView([state.origin.lat, state.origin.lon], 11); return; }
      renderResults(plans, true);
      var kms = plans.map(function (x) { return x.km; }).filter(function (k, i, a) { return a.indexOf(k) === i; }).sort(function (a, b) { return a - b; });
      status("Calculating reachable streets from " + (state.origin.label || "this point") + "…", "load");
      root.classList.add("is-loading");
      fetchAreas(state.origin, kms).then(function (geo) {
        if (my !== seq) return;
        root.classList.remove("is-loading");
        var feats = (geo.features || []).filter(function (f) { return f.geometry && /Polygon/.test(f.geometry.type); });
        function featFor(km) {
          var best = null, d = Infinity;
          feats.forEach(function (f) { var dd = Math.abs((f.properties && f.properties.contour) - km); if (dd < d) { d = dd; best = f; } });
          return best;
        }
        var order = plans.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return b.x.km - a.x.km; });
        var bounds = null;
        order.forEach(function (o) {
          var f = featFor(o.x.km);
          if (!f) return;
          var layer = L.geoJSON(f, { style: { color: COLORS[o.i], weight: 2.5, opacity: 1, fillColor: COLORS[o.i], fillOpacity: 0.14 }, interactive: false }).addTo(areas);
          if (!bounds) bounds = layer.getBounds();
        });
        pin.bringToFront();
        if (bounds && bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
        status(feats.length ? "" : "No reachable streets found around this point — try a spot on a road.", feats.length ? "" : "err");
      }).catch(function (err) {
        if (my !== seq) return;
        root.classList.remove("is-loading");
        renderResults(plans, false);
        var msg = String(err && err.message || "");
        status(/location|edge|correlate|path/i.test(msg)
          ? "That point isn't near a rideable street. Click closer to a road."
          : "The routing service is busy or unreachable right now. Please try again in a minute.", "err");
      });
    }

    run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
