/**
 * Corridor filter — keeps campgrounds within `radiusMiles` of a route polyline.
 *
 * The route is a sequence of [lat, lng] waypoints. For each campground, we find
 * the minimum perpendicular (or endpoint) distance to any segment of the polyline
 * using the Haversine formula for great-circle distance, then compare against the
 * radius threshold.
 */

const EARTH_RADIUS_MILES = 3958.8;

/**
 * Haversine distance between two [lat, lng] points in miles.
 * @param {[number,number]} a
 * @param {[number,number]} b
 * @returns {number}
 */
function haversine(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/**
 * Point-to-segment minimum distance in miles.
 *
 * Approximation: project the point onto the segment in equirectangular space
 * (valid for segments < ~500 miles), then Haversine the nearest point.
 *
 * @param {[number,number]} p   – [lat, lng] of the point
 * @param {[number,number]} a   – segment start
 * @param {[number,number]} b   – segment end
 * @returns {number} distance in miles
 */
function pointToSegmentDist(p, a, b) {
  const [pLat, pLng] = p;
  const [aLat, aLng] = a;
  const [bLat, bLng] = b;

  const dLat = bLat - aLat;
  const dLng = bLng - aLng;
  const lenSq = dLat * dLat + dLng * dLng;

  if (lenSq === 0) return haversine(p, a); // degenerate segment

  // Parameter t ∈ [0,1] of the closest point on the infinite line
  const t = Math.max(
    0,
    Math.min(1, ((pLat - aLat) * dLat + (pLng - aLng) * dLng) / lenSq),
  );

  const nearest = [aLat + t * dLat, aLng + t * dLng];
  return haversine(p, nearest);
}

/**
 * Minimum distance from point p to any segment in the polyline, in miles.
 * @param {[number,number]} p
 * @param {Array<[number,number]>} polyline – ordered [lat,lng] waypoints
 * @returns {number}
 */
function distanceToPolyline(p, polyline) {
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentDist(p, polyline[i], polyline[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Filter campgrounds to those within radiusMiles of the route polyline.
 *
 * @param {Array<{lat:number, lng:number, [key:string]:any}>} campgrounds
 * @param {Array<[number,number]>} polyline – ordered [lat,lng] waypoints
 * @param {number} radiusMiles
 * @returns {Array<{lat:number, lng:number, distanceMiles:number, [key:string]:any}>}
 *   Matching campgrounds with a `distanceMiles` field added, sorted by distance.
 */
export function filterCorridor(campgrounds, polyline, radiusMiles) {
  if (!polyline || polyline.length < 2) return [];

  const results = [];
  for (const site of campgrounds) {
    const d = distanceToPolyline([site.lat, site.lng], polyline);
    if (d <= radiusMiles) {
      results.push({ ...site, distanceMiles: Math.round(d * 10) / 10 });
    }
  }

  results.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return results;
}

// Re-export primitives for testing
export { haversine, pointToSegmentDist, distanceToPolyline };
