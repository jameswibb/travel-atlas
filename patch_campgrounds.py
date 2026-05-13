"""
Travel Atlas — Campground Patch
1. Remove junk records (state-level header rows)
2. Second-pass geocoding for TT/TC parks that failed first pass
"""

import json
import re
import time
import requests
import xml.etree.ElementTree as ET

KML_URL = "https://www.google.com/maps/d/kml?mid=1R5yrO2xyIny9P0mGTs3b_9Lv11LmACc&forcekml=1"
OUTPUT = "public/campgrounds.json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TravelAtlas/1.0 (jameswibb@gmail.com)"
NS = {"kml": "http://www.opengis.net/kml/2.2"}

ZONE_MAP = {
    "northeast": "NE", "north east": "NE",
    "southeast": "SE", "south east": "SE",
    "midwest": "MW", "mid west": "MW", "mid-west": "MW",
    "western": "W", "west": "W",
    "texas": "TX", "florida": "FL",
}

def normalise_zone(raw):
    if not raw: return None
    return ZONE_MAP.get(raw.strip().lower(), raw.strip())


def geocode_multi(name, address, city, state, zipcode):
    """Try several strategies before giving up."""
    headers = {"User-Agent": USER_AGENT}
    strategies = [
        # 1. Full address with zip
        ", ".join(filter(None, [address, city, state, zipcode, "USA"])),
        # 2. Name + city + state
        ", ".join(filter(None, [name, city, state, "USA"])),
        # 3. City + state + zip
        ", ".join(filter(None, [city, state, zipcode, "USA"])),
        # 4. City + state only
        ", ".join(filter(None, [city, state, "USA"])),
        # 5. Name without "RV Resort/Campground" suffix + city + state
        ", ".join(filter(None, [re.sub(r'\s+(RV Resort|Campground|RV Park|Camp-?Resort|Camping Resort).*', '', name, flags=re.I), city, state, "USA"])),
    ]
    for q in strategies:
        if not q.strip().replace(",", "").replace("USA", "").strip():
            continue
        try:
            r = requests.get(NOMINATIM_URL, params={"q": q, "format": "json", "limit": 1, "countrycodes": "us"},
                             headers=headers, timeout=10)
            data = r.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"]), q
        except Exception:
            pass
        time.sleep(0.5)
    return None, None, None


def get_ext(pm):
    ext = {}
    for data in pm.findall(".//kml:ExtendedData/kml:Data", NS):
        name = data.get("name", "")
        val_el = data.find("kml:value", NS)
        ext[name] = (val_el.text or "").strip() if val_el is not None else ""
    return ext


def main():
    # Load existing file
    with open(OUTPUT, encoding="utf-8") as f:
        sites = json.load(f)

    print(f"Loaded {len(sites)} sites")

    # 1. Remove junk records (state-level headers with wrong coordinates)
    junk_lat = 39.7837304
    junk_lng = -100.445882
    junk_names = {"Pennsylvania (PA)", "Wisconsin (WI)"}
    before = len(sites)
    sites = [s for s in sites
             if s["name"] not in junk_names
             and not (abs(s.get("lat", 0) - junk_lat) < 0.001 and abs(s.get("lng", 0) - junk_lng) < 0.001)]
    print(f"Removed {before - len(sites)} junk records. Now {len(sites)} sites.")

    # 2. Find which TT/TC parks are missing
    existing_names = {s["name"] for s in sites}

    print("Fetching KML to find missing parks...")
    r = requests.get(KML_URL, headers={"User-Agent": USER_AGENT}, timeout=60)
    root = ET.fromstring(r.content)
    doc = root.find("kml:Document", NS)

    folders = {
        (f.find("kml:name", NS).text or "").strip(): f
        for f in doc.findall("kml:Folder", NS)
        if f.find("kml:name", NS) is not None
    }

    missing_parks = []

    # Collect all TT parks not in file
    tt_folder = folders.get("Thousand Trails")
    if tt_folder:
        for i, pm in enumerate(tt_folder.findall("kml:Placemark", NS)):
            name_el = pm.find("kml:name", NS)
            name = (name_el.text or "").strip() if name_el is not None else ""
            if name and name not in existing_names:
                ext = get_ext(pm)
                missing_parks.append({
                    "idx": i + 1,
                    "name": name,
                    "agency_type": "TT",
                    "is_encore": False,
                    "tt_zone": normalise_zone(ext.get("Zone", "")),
                    "address": ext.get("Address", ""),
                    "city": ext.get("City", ""),
                    "state": ext.get("State", ""),
                    "zipcode": ext.get("Zip", ""),
                })

    # Collect all TC parks not in file
    tc_folder = folders.get("Trails Collection")
    if tc_folder:
        for i, pm in enumerate(tc_folder.findall("kml:Placemark", NS)):
            name_el = pm.find("kml:name", NS)
            name = (name_el.text or "").strip() if name_el is not None else ""
            if name and name not in existing_names:
                ext = get_ext(pm)
                missing_parks.append({
                    "idx": i + 1,
                    "name": name,
                    "agency_type": "Encore",
                    "is_encore": True,
                    "tt_zone": None,
                    "address": ext.get("Address", ""),
                    "city": ext.get("City", ""),
                    "state": ext.get("State", ""),
                    "zipcode": ext.get("Zip", ""),
                })

    print(f"Found {len(missing_parks)} parks to retry geocoding")

    rescued = 0
    still_failed = []

    for p in missing_parks:
        name = p["name"]
        # Skip obvious junk (state-level headers)
        if re.match(r'^[A-Z]{2,}\s*\(', name) or (not p["city"] and not p["address"]):
            print(f"  SKIP junk: {name}")
            continue

        print(f"  Retrying: {name} ({p['city']}, {p['state']})...", end=" ", flush=True)
        lat, lng, strategy = geocode_multi(name, p["address"], p["city"], p["state"], p["zipcode"])
        time.sleep(0.6)

        if lat is not None:
            print(f"-> {lat:.4f}, {lng:.4f} (via: {strategy[:50]})", flush=True)
            rescued += 1

            prefix = p["agency_type"].lower()
            site_id = f"{prefix}_{p['idx']:04d}_{re.sub(r'[^a-z0-9]', '', name.lower())[:20]}"

            sites.append({
                "site_id": site_id,
                "name": name,
                "lat": lat,
                "lng": lng,
                "agency_type": p["agency_type"],
                "is_encore": p["is_encore"],
                "tt_zone": p["tt_zone"],
                "is_dog_friendly": True,
                "max_rig_length_ft": None,
                "height_clearance_ft": None,
                "hookup_types": ["full"] if p["is_encore"] else ["electric"],
                "amp_available": "50A" if p["is_encore"] else "30A",
                "is_reservable": True,
                "booking_url": "https://trailscollection.com" if p["is_encore"] else "https://thousandtrails.com",
                "stay_limit_nights": 14,
                "access_pass_discount": False,
                "restroom_proximity": None,
                "nearby_national_parks": [],
            })
        else:
            print("-> STILL FAILED", flush=True)
            still_failed.append(name)

    print(f"\nRescued: {rescued}, Still failed: {len(still_failed)}")
    if still_failed:
        print("Still need manual coordinates:", still_failed)

    print(f"Writing {len(sites)} sites to {OUTPUT}...")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(sites, f, indent=2, ensure_ascii=False)

    from collections import Counter
    breakdown = Counter(s["agency_type"] for s in sites)
    print("Final breakdown:", dict(breakdown))
    print("Done.")


if __name__ == "__main__":
    main()
