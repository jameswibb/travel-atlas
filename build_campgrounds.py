"""
Travel Atlas — KML Pipeline
Fetches EDDIE RV Route Planner KML, geocodes TT/TC addresses, outputs campgrounds.json
"""

import json
import re
import time
import sys
import xml.etree.ElementTree as ET
from urllib.parse import urlencode
import requests

KML_URL = "https://www.google.com/maps/d/kml?mid=1R5yrO2xyIny9P0mGTs3b_9Lv11LmACc&forcekml=1"
OUTPUT = "public/campgrounds.json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TravelAtlas/1.0 (jameswibb@gmail.com)"

NS = {"kml": "http://www.opengis.net/kml/2.2"}

# Zone normalisation for TT standard parks
ZONE_MAP = {
    "northeast": "NE", "north east": "NE",
    "southeast": "SE", "south east": "SE",
    "midwest": "MW", "mid west": "MW", "mid-west": "MW",
    "western": "W", "west": "W",
    "texas": "TX",
    "florida": "FL",
}

def normalise_zone(raw: str) -> str:
    if not raw:
        return None
    key = raw.strip().lower()
    return ZONE_MAP.get(key, raw.strip())


def parse_float(val: str):
    if not val:
        return None
    m = re.search(r"[\d.]+", str(val))
    return float(m.group()) if m else None


def parse_hookups(ext: dict) -> list[str]:
    hookups = []
    if ext.get("Full_Hookup", "").strip() not in ("", "N", "No", "0", "0.0"):
        hookups.append("full")
    elif ext.get("Electricity_Hookup", "").strip() not in ("", "N", "No", "0", "0.0"):
        hookups.append("electric")
    if ext.get("Water_Hookup", "").strip() not in ("", "N", "No", "0", "0.0") and "full" not in hookups:
        hookups.append("water")
    if ext.get("Sewer_Hookup", "").strip() not in ("", "N", "No", "0", "0.0") and "full" not in hookups:
        hookups.append("sewer")
    return hookups if hookups else ["none"]


def parse_amp(ext: dict) -> str | None:
    site_types = ext.get("RV_Site_Types", "") + " " + ext.get("Hookups", "")
    has_50 = "50" in site_types
    has_30 = "30" in site_types
    if has_50 and has_30:
        return "both"
    if has_50:
        return "50A"
    if has_30:
        return "30A"
    return None


def pets_allowed(ext: dict) -> bool:
    val = ext.get("Pets_Allowed", "").strip().upper()
    if val in ("Y", "YES", "TRUE", "1"):
        return True
    if val in ("N", "NO", "FALSE", "0"):
        return False
    return True  # default to true if unknown


def geocode(name: str, address: str, city: str, state: str, zipcode: str) -> tuple[float, float] | None:
    """Geocode a TT/TC location via Nominatim. Returns (lat, lng) or None."""
    # Try full address first
    q = ", ".join(filter(None, [address, city, state, zipcode, "USA"]))
    params = {"q": q, "format": "json", "limit": 1, "countrycodes": "us"}
    headers = {"User-Agent": USER_AGENT}
    try:
        r = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass

    # Fallback: city + state
    q2 = ", ".join(filter(None, [name, city, state, "USA"]))
    params["q"] = q2
    try:
        r = requests.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass

    print(f"  WARNING: could not geocode '{name}' ({city}, {state})", flush=True)
    return None


def get_ext(placemark) -> dict:
    """Extract all ExtendedData name/value pairs."""
    ext = {}
    for data in placemark.findall(".//kml:ExtendedData/kml:Data", NS):
        name = data.get("name", "")
        val_el = data.find("kml:value", NS)
        ext[name] = (val_el.text or "").strip() if val_el is not None else ""
    return ext


def get_coords(placemark):
    """Return (lat, lng) from <coordinates> or None."""
    el = placemark.find(".//kml:coordinates", NS)
    if el is None or not el.text:
        return None
    parts = el.text.strip().split(",")
    if len(parts) >= 2:
        try:
            return float(parts[1]), float(parts[0])  # KML is lng,lat
        except ValueError:
            pass
    return None


def process_federal(folder_el, agency_type: str) -> list[dict]:
    sites = []
    for i, pm in enumerate(folder_el.findall("kml:Placemark", NS)):
        name_el = pm.find("kml:name", NS)
        name = (name_el.text or "").strip() if name_el is not None else ""
        if not name:
            continue

        coords = get_coords(pm)
        if not coords:
            continue
        lat, lng = coords

        ext = get_ext(pm)

        # Height clearance: prefer Site_Height_Clearance, fall back to null
        raw_height = ext.get("Site_Height_Clearance", "")
        height_ft = parse_float(raw_height)

        # Vehicle length
        raw_len = ext.get("Max_Vehicle_Length", "")
        max_len = parse_float(raw_len)

        # Stay limit
        raw_stay = ext.get("StayLimit", "")
        stay_limit = parse_float(raw_stay)

        sites.append({
            "site_id": f"{agency_type.lower()}_{i+1:04d}_{re.sub(r'[^a-z0-9]', '', name.lower())[:20]}",
            "name": name,
            "lat": lat,
            "lng": lng,
            "agency_type": agency_type,
            "is_encore": False,
            "tt_zone": None,
            "is_dog_friendly": pets_allowed(ext),
            "max_rig_length_ft": max_len,
            "height_clearance_ft": height_ft,
            "hookup_types": parse_hookups(ext),
            "amp_available": parse_amp(ext),
            "is_reservable": ext.get("Reservable", "").strip().lower() in ("yes", "y", "true"),
            "booking_url": ext.get("ReservationURL", "").strip() or None,
            "stay_limit_nights": int(stay_limit) if stay_limit else None,
            "access_pass_discount": True,
            "restroom_proximity": None,
            "nearby_national_parks": [],
        })
    return sites


def process_tt(folder_el) -> list[dict]:
    sites = []
    placemarks = folder_el.findall("kml:Placemark", NS)
    total = len(placemarks)
    print(f"  Geocoding {total} Thousand Trails parks...", flush=True)

    for i, pm in enumerate(placemarks):
        name_el = pm.find("kml:name", NS)
        name = (name_el.text or "").strip() if name_el is not None else ""
        if not name:
            continue

        ext = get_ext(pm)
        address = ext.get("Address", "")
        city = ext.get("City", "")
        state = ext.get("State", "")
        zipcode = ext.get("Zip", "")
        zone = normalise_zone(ext.get("Zone", ""))

        print(f"  [{i+1}/{total}] {name} ({city}, {state})...", end=" ", flush=True)
        coords = geocode(name, address, city, state, zipcode)
        if coords:
            lat, lng = coords
            print(f"-> {lat:.4f}, {lng:.4f}", flush=True)
        else:
            lat, lng = None, None
            print("-> FAILED", flush=True)

        time.sleep(1.1)  # Nominatim rate limit: 1 req/sec

        sites.append({
            "site_id": f"tt_{i+1:04d}_{re.sub(r'[^a-z0-9]', '', name.lower())[:20]}",
            "name": name,
            "lat": lat,
            "lng": lng,
            "agency_type": "TT",
            "is_encore": False,
            "tt_zone": zone,
            "is_dog_friendly": True,
            "max_rig_length_ft": None,
            "height_clearance_ft": None,
            "hookup_types": ["electric"],  # TT standard default
            "amp_available": "30A",
            "is_reservable": True,
            "booking_url": "https://thousandtrails.com",
            "stay_limit_nights": 14,
            "access_pass_discount": False,
            "restroom_proximity": None,
            "nearby_national_parks": [],
        })
    return sites


def process_tc(folder_el) -> list[dict]:
    sites = []
    placemarks = folder_el.findall("kml:Placemark", NS)
    total = len(placemarks)
    print(f"  Geocoding {total} Trails Collection parks...", flush=True)

    for i, pm in enumerate(placemarks):
        name_el = pm.find("kml:name", NS)
        name = (name_el.text or "").strip() if name_el is not None else ""
        if not name:
            continue

        ext = get_ext(pm)
        address = ext.get("Address", "")
        city = ext.get("City", "")
        state = ext.get("State", "")
        zipcode = ext.get("Zip", "")

        print(f"  [{i+1}/{total}] {name} ({city}, {state})...", end=" ", flush=True)
        coords = geocode(name, address, city, state, zipcode)
        if coords:
            lat, lng = coords
            print(f"-> {lat:.4f}, {lng:.4f}", flush=True)
        else:
            lat, lng = None, None
            print("-> FAILED", flush=True)

        time.sleep(1.1)

        sites.append({
            "site_id": f"enc_{i+1:04d}_{re.sub(r'[^a-z0-9]', '', name.lower())[:20]}",
            "name": name,
            "lat": lat,
            "lng": lng,
            "agency_type": "Encore",
            "is_encore": True,
            "tt_zone": None,
            "is_dog_friendly": True,
            "max_rig_length_ft": None,
            "height_clearance_ft": None,
            "hookup_types": ["full"],  # Encore resorts typically full hookup
            "amp_available": "50A",
            "is_reservable": True,
            "booking_url": "https://trailscollection.com",
            "stay_limit_nights": 14,
            "access_pass_discount": False,
            "restroom_proximity": None,
            "nearby_national_parks": [],
        })
    return sites


def main():
    import os
    os.makedirs("public", exist_ok=True)

    print("Fetching KML from Google My Maps...", flush=True)
    r = requests.get(KML_URL, headers={"User-Agent": USER_AGENT}, timeout=60)
    r.raise_for_status()
    print(f"  Downloaded {len(r.content):,} bytes", flush=True)

    print("Parsing KML...", flush=True)
    root = ET.fromstring(r.content)
    doc = root.find("kml:Document", NS)
    if doc is None:
        print("ERROR: No <Document> found in KML")
        sys.exit(1)

    folders = {
        (f.find("kml:name", NS).text or "").strip(): f
        for f in doc.findall("kml:Folder", NS)
        if f.find("kml:name", NS) is not None
    }
    print(f"  Found layers: {list(folders.keys())}", flush=True)

    all_sites = []

    # Federal layers (instant — coordinates already present)
    federal_map = {
        "US Forest Service East": "USFS",
        "US Forest Service West": "USFS",
        "Army Corps of Engineers Campgrounds": "USACE",
        "BLM Campgrounds": "BLM",
        "National Park Service Campgrounds": "NPS",
    }
    for folder_name, agency_type in federal_map.items():
        # Match by prefix since names may be truncated in dict keys
        matched = next((v for k, v in folders.items() if k.startswith(folder_name[:20])), None)
        matched_folder = next((f for k, f in folders.items() if k.startswith(folder_name[:20])), None)
        if matched_folder is None:
            print(f"  Layer not found: {folder_name}", flush=True)
            continue
        print(f"Processing {folder_name}...", flush=True)
        sites = process_federal(matched_folder, agency_type)
        print(f"  -> {len(sites)} sites", flush=True)
        all_sites.extend(sites)

    # Fish and Wildlife (nested folder)
    for k, f in folders.items():
        if "Fish" in k or "Wildlife" in k:
            print(f"Processing {k}...", flush=True)
            # May have sub-folders
            for sub in f.findall("kml:Folder", NS):
                sub_name = (sub.find("kml:name", NS).text or "").strip()
                sites = process_federal(sub, "FWS")
                print(f"  -> {len(sites)} sites from sub-layer '{sub_name}'", flush=True)
                all_sites.extend(sites)
            # Also direct placemarks
            direct = process_federal(f, "FWS")
            if direct:
                print(f"  -> {len(direct)} direct sites", flush=True)
                all_sites.extend(direct)

    # Thousand Trails (needs geocoding)
    tt_folder = next((f for k, f in folders.items() if k == "Thousand Trails"), None)
    if tt_folder is not None:
        print("Processing Thousand Trails...", flush=True)
        tt_sites = process_tt(tt_folder)
        all_sites.extend(tt_sites)
    else:
        print("WARNING: Thousand Trails layer not found", flush=True)

    # Trails Collection / Encore (needs geocoding)
    tc_folder = next((f for k, f in folders.items() if "Trails Collection" in k or "Encore" in k), None)
    if tc_folder is not None:
        print("Processing Trails Collection...", flush=True)
        tc_sites = process_tc(tc_folder)
        all_sites.extend(tc_sites)
    else:
        print("WARNING: Trails Collection layer not found", flush=True)

    # Drop any sites that failed geocoding (lat/lng is None) — flag them
    failed = [s for s in all_sites if s["lat"] is None]
    valid = [s for s in all_sites if s["lat"] is not None]
    print(f"\nTotal: {len(all_sites)} sites, {len(valid)} with coordinates, {len(failed)} failed geocoding", flush=True)
    if failed:
        print("Failed geocoding:", [s["name"] for s in failed], flush=True)

    print(f"Writing {OUTPUT}...", flush=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(valid, f, indent=2, ensure_ascii=False)
    print(f"Done. {len(valid)} campgrounds written to {OUTPUT}", flush=True)

    # Quick schema validation
    required = ["site_id", "name", "lat", "lng", "agency_type", "is_encore",
                "tt_zone", "is_dog_friendly", "is_reservable", "access_pass_discount"]
    sample = valid[0] if valid else {}
    missing_keys = [k for k in required if k not in sample]
    if missing_keys:
        print(f"WARNING: missing required keys in output: {missing_keys}", flush=True)
    else:
        print("Schema check passed.", flush=True)

    # Print breakdown by agency
    from collections import Counter
    breakdown = Counter(s["agency_type"] for s in valid)
    print("\nBreakdown:", dict(breakdown), flush=True)


if __name__ == "__main__":
    main()
