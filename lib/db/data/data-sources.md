# Constituency Master Data — Sources

> See top of file for the polling-station hierarchy sources. The
> section below covers the Leaflet map's ward-boundary overlay.

## Ward boundary GeoJSON

- **File:** `ward-boundaries.geojson`
- **Format:** GeoJSON `FeatureCollection`. Each feature must carry
  `properties.wardId` matching a row in the `wards` table.
- **Suggested open sources** (pick the freshest match per ward, do **not**
  invent boundaries):
  - **OpenStreetMap** boundary relations for Madurai Corporation wards —
    https://www.openstreetmap.org/search?query=madurai%20ward (export
    via Overpass API, license: ODbL-1.0)
  - **data.opencity.in — Madurai wards** —
    https://data.opencity.in/dataset/madurai-ward-boundaries (license:
    CC-BY-4.0)
  - **Madurai District NIC GIS** — https://madurai.nic.in/maps/
- **How to update:** download the source GeoJSON, filter to the wards
  inside AC 195 Thiruparankundram, set `properties.wardId` on each
  feature, and commit the merged file. Wards without a matching
  feature fall back to a labelled centroid pin on the public map (the
  popup shows "boundary not yet mapped"), so partial coverage is fine.
- **Single source of truth:** boundaries are read **only** from the
  file above. There is intentionally no DB column for per-row
  boundaries, so the map endpoint never depends on a schema migration
  to render polygons. Hand-corrections happen by editing the file.

---

This file documents the **real, public** sources used to seed the
Tirupparankundram (Assembly Constituency 195, Madurai District) master
hierarchy. Every record in `zones`, `wards`, `pincodes`, and
`polling_stations` traces back to one of the URLs below. No data here
is invented or machine-translated.

If a Tamil translation is missing on a row, it is intentionally left
NULL — staff fill it in via the admin UI rather than guess.

## Polling stations (booths)

- **File:** `ac195-thiruparankundram-polling-stations.pdf`
- **Direct URL:** https://cdn.s3waas.gov.in/s3f5f8590cd58a54e94377e6ae2eded4d9/uploads/2021/01/2021012361.pdf
- **Index page:** https://madurai.nic.in/list-of-polling-station-3/
- **Publisher:** Madurai District (Government of Tamil Nadu) — official
  district NIC site under elections.tn.gov.in
- **Coverage:** 295 polling stations, AC 195 Thiruparankundram, listed
  inside PC 34 Viruthunagar parliamentary constituency
- **Fields imported:** booth number, polling station name + address,
  pincode (parsed from the address), polling areas, voter type
- **Fields NOT in source:** GPS coordinates (ECI does not publish
  per-booth lat/lng) — left NULL, captured later by staff
- **Fetched:** 2025-11-05
- **Parser:** `lib/db/scripts/parse-ac195-pdf.mjs` produces the
  normalized JSON `ac195-thiruparankundram-polling-stations.json`
  consumed by the seed step.

## Madurai Municipal Corporation zones

- **Wikipedia:** https://en.wikipedia.org/wiki/Madurai_Municipal_Corporation
  (5 zones — East / North / Central / South / West — 100 wards total)
- **Official Corporation site:** https://maduraicorporation.co.in/aboutus/general-infozones-and-wards/
- **Open data ward map:** https://data.opencity.in/dataset/madurai-wards-map
- **Coverage of AC 195:** the constituency includes the southern slice
  of the corporation, primarily wards in the South and Central zones
  plus the suburban panchayats listed below.

## Wards / panchayats inside AC 195

- The 10 originally-seeded wards (Pasumalai, Avaniyapuram, Thirumohur,
  Vandiyur, Sakkudi, Manalur, Vellaripatti, Tirupparankundram Town,
  Madurai Corporation – Zone 4, Madurai Corporation – Zone 5) were
  manually curated from district Wikipedia + the constituency overview
  on https://www.maduraidirectory.com/madurai/areas.php
- Additional revenue villages and panchayats added by the seed import
  step come directly from the AC 195 polling-station PDF — every
  panchayat name in the `wards` table with `wardType = "panchayat"` is
  cited at least once in the official PDF's "Polling Areas" column.

## Pincodes

- **India Post PIN code lookup:** https://www.indiapost.gov.in/vas/Pages/findpincode.aspx
- **Coverage:** the seed includes every pincode that appears at least
  once in the AC 195 polling-station PDF address column:
  `625004, 625005, 625006, 625008, 625009, 625012, 625019, 625021,
  625022, 625201`.

## Tamil translations

- Madurai Corporation zone names (கிழக்கு / வடக்கு / மத்திய / தெற்கு /
  மேற்கு மண்டலம்) — standard Tamil rendering used by the official
  corporation Tamil-language site.
- Ward Tamil names: Wikipedia Tamil pages for each ward / panchayat
  where one exists. Where no verified Tamil-language source was
  available, the `name_ta` column is left NULL.
