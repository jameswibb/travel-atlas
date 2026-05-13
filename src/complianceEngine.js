/**
 * TT/Encore compliance engine.
 *
 * Rules (from membership terms):
 * - After staying > 4 nights at any single TT or Encore property, you must spend
 *   7 consecutive nights AWAY from ALL TT/Encore properties (full-system lockout).
 * - After staying 1–4 nights at an Encore property, you must spend 7 consecutive
 *   nights away from ALL Encore properties (Encore-only lockout), but standard TT
 *   parks remain accessible.
 * - Rules do NOT aggregate across parks: 3 nights at park A + 3 nights at park B
 *   is NOT a lockout. Each park's consecutive stay is counted independently.
 * - Standard TT parks outside NE/SE zones are always blocked (zone restriction,
 *   not a lockout).
 * - TT max stay: 14 nights per park (warning only, not hard block).
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string into a UTC midnight Date.
 * @param {string} d
 * @returns {Date}
 */
function parseDate(d) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/**
 * Format a UTC Date back to YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Add `n` days to a UTC Date and return a new Date.
 * @param {Date} d
 * @param {number} n
 * @returns {Date}
 */
function addDays(d, n) {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Return true if the stop belongs to the TT/Encore membership system.
 * @param {object} stop
 * @returns {boolean}
 */
function isMembershipSite(stop) {
  return stop.agency_type === 'TT' || stop.agency_type === 'Encore' || stop.is_encore === true;
}

/**
 * Return true if the stop is an Encore property.
 * @param {object} stop
 * @returns {boolean}
 */
function isEncore(stop) {
  return stop.agency_type === 'Encore' || stop.is_encore === true;
}

// ---------------------------------------------------------------------------
// Exported: getLockoutState
// ---------------------------------------------------------------------------

/**
 * Compute active lockout windows that affect the stop at `upToIndex`.
 *
 * Scans all stops before `upToIndex` in chronological order, looking at the
 * stay immediately preceding the target index that was at a TT/Encore property.
 *
 * Returns the end dates (inclusive) of any active lockouts:
 *   - fullSystemLockoutEnds: null | 'YYYY-MM-DD'
 *   - encoreLockoutEnds:     null | 'YYYY-MM-DD'
 *
 * @param {Array<{site_id:string, agency_type:string, is_encore:boolean, arrive_date:string, depart_date:string}>} stops
 * @param {number} upToIndex  – evaluate lockouts affecting stops[upToIndex]
 * @returns {{ fullSystemLockoutEnds: string|null, encoreLockoutEnds: string|null }}
 */
export function getLockoutState(stops, upToIndex) {
  let fullSystemLockoutEnds = null;
  let encoreLockoutEnds = null;

  for (let i = 0; i < upToIndex; i++) {
    const stop = stops[i];
    if (!isMembershipSite(stop)) continue;

    const arrive = parseDate(stop.arrive_date);
    const depart = parseDate(stop.depart_date);
    const nights = Math.round((depart - arrive) / 86_400_000);

    if (nights > 4) {
      // Full-system lockout: 7 nights out of ALL TT/Encore properties
      const lockoutEnds = formatDate(addDays(depart, 6)); // depart + 6 more days = 7 total away
      if (!fullSystemLockoutEnds || lockoutEnds > fullSystemLockoutEnds) {
        fullSystemLockoutEnds = lockoutEnds;
      }
      if (!encoreLockoutEnds || lockoutEnds > encoreLockoutEnds) {
        encoreLockoutEnds = lockoutEnds;
      }
    } else if (isEncore(stop)) {
      // Encore-only lockout: 7 nights out of Encore (TT still accessible)
      const lockoutEnds = formatDate(addDays(depart, 6));
      if (!encoreLockoutEnds || lockoutEnds > encoreLockoutEnds) {
        encoreLockoutEnds = lockoutEnds;
      }
    }
    // Standard TT ≤4 nights: no lockout generated
  }

  // Resolve lockouts that have already expired by the time the target stop arrives
  const targetArrive = parseDate(stops[upToIndex].arrive_date);
  const targetArriveStr = formatDate(targetArrive);

  if (fullSystemLockoutEnds !== null && fullSystemLockoutEnds < targetArriveStr) {
    fullSystemLockoutEnds = null;
  }
  if (encoreLockoutEnds !== null && encoreLockoutEnds < targetArriveStr) {
    encoreLockoutEnds = null;
  }

  return { fullSystemLockoutEnds, encoreLockoutEnds };
}

// ---------------------------------------------------------------------------
// Exported: checkCompliance
// ---------------------------------------------------------------------------

/**
 * Check an itinerary for TT/Encore membership compliance violations.
 *
 * @param {Array<{
 *   site_id: string,
 *   agency_type: string,
 *   is_encore: boolean,
 *   tt_zone: string|null,
 *   arrive_date: string,
 *   depart_date: string,
 * }>} stops
 * @returns {Array<{
 *   stop_index: number,
 *   violation_type: 'FULL_SYSTEM_LOCKOUT'|'ENCORE_LOCKOUT'|'TT_ZONE_BLOCKED',
 *   explanation: string,
 *   earliest_legal_date: string,
 * }>}
 */
export function checkCompliance(stops) {
  const violations = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];

    // Zone restriction: standard TT outside NE/SE is always blocked
    if (stop.agency_type === 'TT' && !stop.is_encore) {
      const zone = stop.tt_zone;
      if (zone !== 'NE' && zone !== 'SE') {
        violations.push({
          stop_index: i,
          violation_type: 'TT_ZONE_BLOCKED',
          explanation: `${stop.site_id} is in TT zone "${zone}" — membership only covers NE and SE zones.`,
          earliest_legal_date: stop.arrive_date, // no lockout; just can't go here
        });
        continue; // zone blocks trump lockout checks for this stop
      }
    }

    if (!isMembershipSite(stop)) continue;

    const { fullSystemLockoutEnds, encoreLockoutEnds } = getLockoutState(stops, i);

    if (fullSystemLockoutEnds !== null) {
      const earliest = formatDate(addDays(parseDate(fullSystemLockoutEnds), 1));
      violations.push({
        stop_index: i,
        violation_type: 'FULL_SYSTEM_LOCKOUT',
        explanation: `A prior stay > 4 nights at a TT/Encore property requires 7 nights away from all TT/Encore. Lockout ends ${fullSystemLockoutEnds}.`,
        earliest_legal_date: earliest,
      });
      continue;
    }

    if (isEncore(stop) && encoreLockoutEnds !== null) {
      const earliest = formatDate(addDays(parseDate(encoreLockoutEnds), 1));
      violations.push({
        stop_index: i,
        violation_type: 'ENCORE_LOCKOUT',
        explanation: `A prior Encore stay requires 7 nights away from all Encore properties. Lockout ends ${encoreLockoutEnds}.`,
        earliest_legal_date: earliest,
      });
    }
  }

  return violations;
}
