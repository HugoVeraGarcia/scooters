# ScooterScope — Amazon affiliate comparison site (electric scooters, Amazon.com)

Static, data-driven site. Every page is generated from the data files.

```
data/products.json   ← the scooter database (one record per product)
data/site.json       ← brand, categories, buying guides (editorial text + ranking rules)
data/raw/*.md        ← raw notes captured from each Amazon listing
tools/build.py       ← generator: python3 tools/build.py  →  dist/
src/assets/          ← CSS, JS (comparator, gallery, compare tray), favicon, _headers
dist/                ← generated site, this is what gets published (Netlify publish dir)
netlify.toml         ← Netlify build settings
```

## Add a scooter
1. Add a record to `data/products.json` (same shape as the others; keep the exact affiliate link).
2. `python3 tools/build.py`
3. Publish `dist/` (drag it into Netlify, or push the repo; Netlify runs the build itself).

## Rules the data follows
- `affiliate_url` is the Amazon affiliate link exactly as given (tag `microtools0f-20`).
- Missing specs are `null` and display as "—". Nothing is estimated.
- Prices are a snapshot with `price_date`. Set `"show_prices": false` in `site.json` to hide them site-wide.
- Scores: speed, range, power and portability use fixed formulas (see /how-we-rate/); comfort, safety and value are editorial.
- Images are served from Amazon's image CDN (`m.media-amazon.com`) by image ID.

## Range map (/range-map/)
Draws the area each scooter can reach on real streets (isochrone by distance), not a circle.
- Routing: Valhalla public server (FOSSGIS, fair use, max 100 km per area). Geocoding: Nominatim. Tiles: OpenStreetMap standard tiles, darkened with a CSS filter (`tiles_url` to change). Leaflet is self-hosted in `src/assets/vendor/leaflet/`.
- Settings in `data/site.json` → `range_map`: `isochrone_url`, `geocoder_url`, `max_km`, `real_world_factor` (0.7), `costing` (bicycle), `default_place`, `default_ids`.
- If traffic grows, switch `isochrone_url` to a commercial Valhalla host (e.g. Stadia Maps `https://api.stadiamaps.com/isochrone/v1?api_key=...`) — same request format.
- Links: `/range-map/?ids=a,b&trip=one&basis=claimed&at=lat,lon`

## Head-to-head pages (/vs/)
`data/matchups.json` lists the pairs (`a`, `b` = product ids) with the editorial text (intro, choose_a, choose_b, bottom_line, faq). Specs, prices, differences, table and radar are generated from `products.json`. If prices change a lot, re-check any price wording in the intro/bottom line.
