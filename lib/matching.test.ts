import { describe, expect, it } from 'vitest';
import {
  dayDiff,
  languageBand,
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
  verified_channel_count: 2,
  review_count: 0,
  average_rating: null,
};

const criteria: SearchCriteria = {
  origin: 'CCU',
  destination: 'AMS',
  date: '2026-04-20',
  dateWindowDays: 3,
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

describe('scoreTrip — language is the dominant signal', () => {
  it('a primary-language match 3 days off beats English-only on the exact date', () => {
    // Spec §2: "A perfect language match three days off the requested date
    // beats an English-only match on the exact date."
    const bengaliNearby: RankableTrip = {
      ...base,
      id: 'a',
      languages: ['Bengali', 'English'],
      primary_language: 'Bengali',
      travel_date: '2026-04-23', // +3 days
    };
    const englishOnlyExact: RankableTrip = {
      ...base,
      id: 'b',
      languages: ['English'],
      primary_language: 'English',
      travel_date: '2026-04-20', // exact
    };
    const a = scoreTrip(bengaliNearby, criteria);
    const b = scoreTrip(englishOnlyExact, criteria);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.band).toBe('primary');
    expect(b.band).toBe('shared');
  });

  it('a shared-language match beats a no-overlap match on the same date', () => {
    const shared: RankableTrip = {
      ...base,
      id: 'a',
      languages: ['English'],
      primary_language: 'English',
    };
    const noOverlap: RankableTrip = {
      ...base,
      id: 'b',
      languages: ['Mandarin'],
      primary_language: 'Mandarin',
    };
    expect(scoreTrip(shared, criteria).score).toBeGreaterThan(scoreTrip(noOverlap, criteria).score);
  });

  it('date proximity matters among same-band trips', () => {
    const nearer: RankableTrip = { ...base, id: 'a', travel_date: '2026-04-20' };
    const farther: RankableTrip = { ...base, id: 'b', travel_date: '2026-04-23' };
    expect(scoreTrip(nearer, criteria).score).toBeGreaterThan(scoreTrip(farther, criteria).score);
  });

  it('verified channels provide a small tiebreaker', () => {
    const more: RankableTrip = { ...base, id: 'a', verified_channel_count: 4 };
    const less: RankableTrip = { ...base, id: 'b', verified_channel_count: 2 };
    expect(scoreTrip(more, criteria).score).toBeGreaterThan(scoreTrip(less, criteria).score);
  });
});

describe('rankTrips', () => {
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
