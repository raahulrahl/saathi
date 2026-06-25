import { describe, it, expect } from 'vitest';
import { canonicalFlight, FLIGHT_NUMBER_RE } from '@/lib/flight';

describe('canonicalFlight', () => {
  it('uppercases, trims, and strips spaces and hyphens', () => {
    expect(canonicalFlight('  qr 540 ')).toBe('QR540');
    expect(canonicalFlight('QR-540')).toBe('QR540');
    expect(canonicalFlight('6e 123')).toBe('6E123');
  });
  it('is idempotent', () => {
    expect(canonicalFlight(canonicalFlight('q r-5 4 0'))).toBe('QR540');
  });
});

describe('FLIGHT_NUMBER_RE', () => {
  it('accepts canonical flight numbers', () => {
    expect(FLIGHT_NUMBER_RE.test('QR540')).toBe(true);
    expect(FLIGHT_NUMBER_RE.test('6E123')).toBe(true);
  });
  it('rejects malformed ones', () => {
    expect(FLIGHT_NUMBER_RE.test('QR')).toBe(false);
    expect(FLIGHT_NUMBER_RE.test('QR-540')).toBe(false);
    expect(FLIGHT_NUMBER_RE.test('hello12')).toBe(false);
  });
});
