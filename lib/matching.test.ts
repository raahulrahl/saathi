import { describe, expect, it } from 'vitest';
import {
  dayDiff,
  languageBand,
  matchingFlightNumbers,
  rankTrips,
  routeMatch,
  scoreTrip,
  type RankableTrip,
  type SearchCriteria,
} from './matching';

const base: Omit<RankableTrip, 'id'> = {
  user_id: 'u',
  route: ['CCU', 'DOH', 'AMS'],
  travel_date: '2026-04-20',
  languages: ['English'],
  primary_language: 'English',
  flight_numbers: ['QR540', 'QR23'],
  verified_channel_count: 2,
  review_count: 0,
  average_rating: null,
};

const criteria: SearchCriteria = {
  origin: 'CCU',
  destination: 'AMS',
  date: '2026-04-20',
  dateWindowDays: 1,
  viewerLanguages: ['Bengali', 'English'],
  viewerPrimaryLanguage: 'Bengali',
};

describe('dayDiff', () => {
  it('is symmetric', () => {
    expect(dayDiff('2026-04-20', '2026-04-23')).toBe(3);
    expect(dayDiff('2026-04-23', '2026-04-20')).toBe(3);
  });
  it('is 0 for same day', () => {
    expect(dayDiff('2026-04-20', '2026-04-20')).toBe(0);
  });
});

describe('routeMatch', () => {
  it('recognises exact 2-leg matches', () => {
    expect(routeMatch(['CCU', 'AMS'], 'CCU', 'AMS')).toBe('exact');
  });
  it('treats a different layover as endpoints match', () => {
    expect(routeMatch(['CCU', 'DOH', 'AMS'], 'CCU', 'AMS')).toBe('endpoints');
  });
  it('recognises one-leg overlap on origin', () => {
    expect(routeMatch(['CCU', 'DEL'], 'CCU', 'AMS')).toBe('one-leg');
  });
  it('returns none when there is no overlap', () => {
    expect(routeMatch(['PVG', 'FRA'], 'CCU', 'AMS')).toBe('none');
  });
});

describe('languageBand', () => {
  it('primary when both primaries match (case-insensitive)', () => {
    expect(
      languageBand(['bengali', 'hindi'], 'Bengali', ['Bengali', 'English'], 'BENGALI').band,
    ).toBe('primary');
  });
  it('shared when any language overlaps', () => {
    expect(
      languageBand(['Hindi', 'English'], 'Hindi', ['Bengali', 'English'], 'Bengali').band,
    ).toBe('shared');
  });
  it('none when there is no overlap', () => {
    expect(languageBand(['Mandarin'], 'Mandarin', ['Bengali', 'English'], 'Bengali').band).toBe(
      'none',
    );
  });
});

describe('matchingFlightNumbers', () => {
  it('intersects case-insensitively and whitespace-insensitively', () => {
    expect(matchingFlightNumbers(['qr 540', 'LH 743'], ['QR540'])).toEqual(['qr 540']);
  });
  it('returns empty when nothing intersects', () => {
    expect(matchingFlightNumbers(['QR540'], ['LH743'])).toEqual([]);
  });
  it('returns empty when either side is missing', () => {
    expect(matchingFlightNumbers(null, ['QR540'])).toEqual([]);
    expect(matchingFlightNumbers(['QR540'], undefined)).toEqual([]);
  });
});

describe('scoreTrip — language is the dominant signal without flight match', () => {
  it('a primary-language match 1 day off beats English-only on the exact date', () => {
    const bengaliNearby: RankableTrip = {
      ...base,
      id: 'a',
      languages: ['Bengali', 'English'],
      primary_language: 'Bengali',
      travel_date: '2026-04-21',
    };
    const englishOnlyExact: RankableTrip = {
      ...base,
      id: 'b',
      languages: ['English'],
      primary_language: 'English',
      travel_date: '2026-04-20',
    };
    const a = scoreTrip(bengaliNearby, criteria);
    const b = scoreTrip(englishOnlyExact, criteria);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.band).toBe('primary');
  });

  it('date proximity matters among same-band trips', () => {
    const nearer: RankableTrip = { ...base, id: 'a', travel_date: '2026-04-20' };
    const farther: RankableTrip = { ...base, id: 'b', travel_date: '2026-04-21' };
    expect(scoreTrip(nearer, criteria).score).toBeGreaterThan(scoreTrip(farther, criteria).score);
  });
});

describe('scoreTrip — flight number match dominates everything', () => {
  it('a flight-number match trumps a primary-language match on the same date', () => {
    const flightMatchNoLang: RankableTrip = {
      ...base,
      id: 'a',
      flight_numbers: ['QR540'],
      languages: ['Mandarin'],
      primary_language: 'Mandarin',
    };
    const langMatchNoFlight: RankableTrip = {
      ...base,
      id: 'b',
      flight_numbers: ['LH743'],
      languages: ['Bengali'],
      primary_language: 'Bengali',
    };
    const withFlight = { ...criteria, flightNumbers: ['QR540'] };
    const a = scoreTrip(flightMatchNoLang, withFlight);
    const b = scoreTrip(langMatchNoFlight, withFlight);
    expect(a.flightMatch).toBe(true);
    expect(b.flightMatch).toBe(false);
    expect(a.score).toBeGreaterThan(b.score);
  });
});

describe('rankTrips — flight-number filter is strict', () => {
  it('only trips with a matching flight number pass when flightNumbers is set', () => {
    const trips: RankableTrip[] = [
      { ...base, id: 'match', flight_numbers: ['QR540'] },
      { ...base, id: 'no-match', flight_numbers: ['LH743'] },
      { ...base, id: 'no-flight-number-listed', flight_numbers: null },
    ];
    const result = rankTrips(trips, { ...criteria, flightNumbers: ['QR540'] });
    expect(result.map((r) => r.trip.id)).toEqual(['match']);
  });

  it('date window is ignored when flight filter is in use', () => {
    const flightMatchFarAway: RankableTrip = {
      ...base,
      id: 'flight-match-far',
      flight_numbers: ['QR540'],
      travel_date: '2026-05-10', // 20 days away, would fail date filter
    };
    const result = rankTrips([flightMatchFarAway], {
      ...criteria,
      flightNumbers: ['QR540'],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.trip.id).toBe('flight-match-far');
  });
});

describe('rankTrips — date-window filter when no flight numbers provided', () => {
  it('filters out trips outside the date window and sorts the rest', () => {
    const trips: RankableTrip[] = [
      { ...base, id: 'out-of-window', travel_date: '2026-05-01' },
      {
        ...base,
        id: 'primary-match-same-day',
        languages: ['Bengali'],
        primary_language: 'Bengali',
      },
      { ...base, id: 'english-only-same-day' },
    ];
    const result = rankTrips(trips, criteria);
    expect(result).toHaveLength(2);
    expect(result[0]!.trip.id).toBe('primary-match-same-day');
    expect(result[1]!.trip.id).toBe('english-only-same-day');
  });
});
