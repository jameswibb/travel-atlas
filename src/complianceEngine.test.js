import { describe, it, expect } from 'vitest';
import { checkCompliance, getLockoutState } from './complianceEngine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tt(site_id, tt_zone, arrive_date, depart_date) {
  return { site_id, agency_type: 'TT', is_encore: false, tt_zone, arrive_date, depart_date };
}

function encore(site_id, arrive_date, depart_date) {
  return { site_id, agency_type: 'Encore', is_encore: true, tt_zone: null, arrive_date, depart_date };
}

function federal(site_id, arrive_date, depart_date) {
  return { site_id, agency_type: 'USFS', is_encore: false, tt_zone: null, arrive_date, depart_date };
}

// ---------------------------------------------------------------------------
// Rule 1: Standard TT ≤ 4 nights → no lockout
// ---------------------------------------------------------------------------

describe('Rule 1: Standard TT ≤4 nights generates no lockout', () => {
  it('allows TT then TT immediately after 4-night stay', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-05'), // 4 nights (Jan 1–4)
      tt('tt_park_b', 'SE', '2024-01-05', '2024-01-08'), // next TT
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(0);
  });

  it('allows Encore immediately after 4-night TT stay', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-05'), // exactly 4 nights
      encore('enc_park_a', '2024-01-05', '2024-01-08'),
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Standard TT > 4 nights → 7-night full-system lockout
// ---------------------------------------------------------------------------

describe('Rule 2: Standard TT >4 nights triggers full-system lockout', () => {
  it('blocks TT park during lockout window', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-08'), // 7 nights
      tt('tt_park_b', 'SE', '2024-01-08', '2024-01-12'), // arrives day of depart
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].stop_index).toBe(1);
    expect(violations[0].violation_type).toBe('FULL_SYSTEM_LOCKOUT');
  });

  it('blocks Encore park during full-system lockout', () => {
    const stops = [
      tt('tt_park_a', 'SE', '2024-01-01', '2024-01-08'), // 7 nights
      encore('enc_park_a', '2024-01-10', '2024-01-15'), // within lockout
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation_type).toBe('FULL_SYSTEM_LOCKOUT');
  });

  it('clears after 7 nights away', () => {
    // Depart Jan 6, lockout runs Jan 6–12 (6 more days = 7 nights total)
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-06'), // 5 nights → lockout
      federal('usfs_a', '2024-01-06', '2024-01-13'),      // 7 nights outside
      tt('tt_park_b', 'SE', '2024-01-13', '2024-01-16'), // arrives day after lockout ends
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(0);
  });

  it('earliest_legal_date is the day after lockout ends', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-08'), // 7 nights → lockout ends Jan 13
      tt('tt_park_b', 'SE', '2024-01-08', '2024-01-10'),
    ];
    const violations = checkCompliance(stops);
    expect(violations[0].earliest_legal_date).toBe('2024-01-15');
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Encore ≤ 4 nights → Encore-only lockout (TT still accessible)
// ---------------------------------------------------------------------------

describe('Rule 3: Encore ≤4 nights triggers Encore-only lockout', () => {
  it('blocks Encore after ≤4-night Encore stay', () => {
    const stops = [
      encore('enc_park_a', '2024-01-01', '2024-01-04'), // 3 nights
      encore('enc_park_b', '2024-01-04', '2024-01-08'), // immediately after
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation_type).toBe('ENCORE_LOCKOUT');
    expect(violations[0].stop_index).toBe(1);
  });

  it('still allows standard TT during Encore-only lockout', () => {
    const stops = [
      encore('enc_park_a', '2024-01-01', '2024-01-04'), // 3 nights → Encore lockout
      tt('tt_park_a', 'NE', '2024-01-04', '2024-01-07'), // TT should be fine
    ];
    const violations = checkCompliance(stops);
    // No violations — TT is allowed during Encore-only lockout
    const lockoutViolations = violations.filter(v => v.violation_type !== 'TT_ZONE_BLOCKED');
    expect(lockoutViolations).toHaveLength(0);
  });

  it('Encore lockout clears after 7 nights away from Encore', () => {
    const stops = [
      encore('enc_park_a', '2024-01-01', '2024-01-04'), // 3 nights, departs Jan 4
      federal('usfs_a', '2024-01-04', '2024-01-11'),    // 7 nights out
      encore('enc_park_b', '2024-01-11', '2024-01-14'),  // arrives day after lockout ends Jan 10
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 4: Encore > 4 nights → full-system lockout
// ---------------------------------------------------------------------------

describe('Rule 4: Encore >4 nights triggers full-system lockout', () => {
  it('blocks TT after >4-night Encore stay', () => {
    const stops = [
      encore('enc_park_a', '2024-01-01', '2024-01-07'), // 6 nights
      tt('tt_park_a', 'NE', '2024-01-07', '2024-01-10'),
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation_type).toBe('FULL_SYSTEM_LOCKOUT');
  });

  it('blocks Encore after >4-night Encore stay', () => {
    const stops = [
      encore('enc_park_a', '2024-01-01', '2024-01-07'), // 6 nights
      encore('enc_park_b', '2024-01-07', '2024-01-10'),
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation_type).toBe('FULL_SYSTEM_LOCKOUT');
  });
});

// ---------------------------------------------------------------------------
// Rule 5: Non-aggregation — nights at different parks don't stack
// ---------------------------------------------------------------------------

describe('Rule 5: Non-aggregation across parks', () => {
  it('3 nights at park A + 3 nights at park B does not trigger lockout', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-04'), // 3 nights
      tt('tt_park_b', 'SE', '2024-01-04', '2024-01-07'), // 3 more nights, different park
      tt('tt_park_c', 'NE', '2024-01-07', '2024-01-10'), // should be fine
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(0);
  });

  it('4 nights park A + 4 nights park B does not trigger lockout', () => {
    const stops = [
      encore('enc_a', '2024-01-01', '2024-01-05'), // 4 nights, no lockout for Encore
      encore('enc_b', '2024-01-12', '2024-01-16'), // new park after Encore lockout clears
    ];
    // enc_a departs Jan 5 → Encore lockout ends Jan 11; enc_b arrives Jan 12 → clear
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Exact 4-night boundary
// ---------------------------------------------------------------------------

describe('Exact 4-night boundary', () => {
  it('exactly 4 nights generates NO lockout (boundary)', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-03-01', '2024-03-05'), // exactly 4 nights
      tt('tt_park_b', 'SE', '2024-03-05', '2024-03-08'),
    ];
    expect(checkCompliance(stops)).toHaveLength(0);
  });

  it('exactly 5 nights generates a lockout (boundary)', () => {
    const stops = [
      tt('tt_park_a', 'NE', '2024-03-01', '2024-03-06'), // exactly 5 nights
      tt('tt_park_b', 'SE', '2024-03-06', '2024-03-09'),
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation_type).toBe('FULL_SYSTEM_LOCKOUT');
  });
});

// ---------------------------------------------------------------------------
// Zone restriction
// ---------------------------------------------------------------------------

describe('TT zone restriction', () => {
  it('blocks TT parks outside NE/SE zones', () => {
    const stops = [
      tt('tt_park_mw', 'MW', '2024-06-01', '2024-06-03'),
    ];
    const violations = checkCompliance(stops);
    expect(violations).toHaveLength(1);
    expect(violations[0].violation_type).toBe('TT_ZONE_BLOCKED');
  });

  it('allows TT parks in NE zone', () => {
    const stops = [tt('tt_park_ne', 'NE', '2024-06-01', '2024-06-03')];
    expect(checkCompliance(stops)).toHaveLength(0);
  });

  it('allows TT parks in SE zone', () => {
    const stops = [tt('tt_park_se', 'SE', '2024-06-01', '2024-06-03')];
    expect(checkCompliance(stops)).toHaveLength(0);
  });

  it('blocks TT TX zone', () => {
    const stops = [tt('tt_park_tx', 'TX', '2024-06-01', '2024-06-03')];
    const violations = checkCompliance(stops);
    expect(violations[0].violation_type).toBe('TT_ZONE_BLOCKED');
  });
});

// ---------------------------------------------------------------------------
// getLockoutState
// ---------------------------------------------------------------------------

describe('getLockoutState', () => {
  it('returns null when no prior membership stays', () => {
    const stops = [
      federal('usfs_a', '2024-01-01', '2024-01-05'),
      tt('tt_park_a', 'NE', '2024-01-05', '2024-01-08'),
    ];
    const state = getLockoutState(stops, 1);
    expect(state.fullSystemLockoutEnds).toBeNull();
    expect(state.encoreLockoutEnds).toBeNull();
  });

  it('returns full lockout end date after >4-night TT stay', () => {
    // Depart Jan 6 → lockout days: Jan 6, 7, 8, 9, 10, 11, 12 → ends Jan 12
    const stops = [
      tt('tt_park_a', 'NE', '2024-01-01', '2024-01-06'), // 5 nights
      tt('tt_park_b', 'SE', '2024-01-06', '2024-01-09'),
    ];
    const state = getLockoutState(stops, 1);
    expect(state.fullSystemLockoutEnds).toBe('2024-01-12');
  });

  it('returns Encore-only lockout after ≤4-night Encore stay', () => {
    // Depart Jan 4 → Encore lockout: Jan 4–10
    const stops = [
      encore('enc_park_a', '2024-01-01', '2024-01-04'), // 3 nights
      encore('enc_park_b', '2024-01-04', '2024-01-07'),
    ];
    const state = getLockoutState(stops, 1);
    expect(state.fullSystemLockoutEnds).toBeNull();
    expect(state.encoreLockoutEnds).toBe('2024-01-10');
  });
});
