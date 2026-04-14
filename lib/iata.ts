/**
 * Minimal embedded airport list. For the real thing, install the `airport-codes`
 * npm package or drop in the OpenFlights CSV (both CC-BY), per Product Spec §6.1.
 *
 * Until the dataset is wired up, this file acts as a typeahead source for the
 * landing page and validates user-typed IATA codes. The list below covers the
 * launch corridors (India ↔ NL, DE + common layovers).
 */

export interface Airport {
  iata: string;
  city: string;
  name: string;
  country: string;
}

export const AIRPORTS: readonly Airport[] = [
  // India
  {
    iata: 'CCU',
    city: 'Kolkata',
    name: 'Netaji Subhas Chandra Bose International',
    country: 'India',
  },
  { iata: 'DEL', city: 'Delhi', name: 'Indira Gandhi International', country: 'India' },
  {
    iata: 'BOM',
    city: 'Mumbai',
    name: 'Chhatrapati Shivaji Maharaj International',
    country: 'India',
  },
  { iata: 'BLR', city: 'Bengaluru', name: 'Kempegowda International', country: 'India' },
  { iata: 'MAA', city: 'Chennai', name: 'Chennai International', country: 'India' },
  { iata: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi International', country: 'India' },

  // Common layovers
  { iata: 'DOH', city: 'Doha', name: 'Hamad International', country: 'Qatar' },
  { iata: 'DXB', city: 'Dubai', name: 'Dubai International', country: 'United Arab Emirates' },
  { iata: 'AUH', city: 'Abu Dhabi', name: 'Zayed International', country: 'United Arab Emirates' },
  { iata: 'IST', city: 'Istanbul', name: 'Istanbul Airport', country: 'Türkiye' },
  { iata: 'LHR', city: 'London', name: 'Heathrow', country: 'United Kingdom' },
  { iata: 'CDG', city: 'Paris', name: 'Charles de Gaulle', country: 'France' },
  { iata: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport', country: 'Germany' },
  { iata: 'MUC', city: 'Munich', name: 'Munich Airport', country: 'Germany' },
  { iata: 'ZRH', city: 'Zurich', name: 'Zurich Airport', country: 'Switzerland' },

  // Europe destinations
  { iata: 'AMS', city: 'Amsterdam', name: 'Schiphol', country: 'Netherlands' },
  { iata: 'BER', city: 'Berlin', name: 'Berlin Brandenburg', country: 'Germany' },
  { iata: 'HAM', city: 'Hamburg', name: 'Hamburg Airport', country: 'Germany' },
  { iata: 'CPH', city: 'Copenhagen', name: 'Copenhagen Airport', country: 'Denmark' },
  { iata: 'DUB', city: 'Dublin', name: 'Dublin Airport', country: 'Ireland' },

  // US
  {
    iata: 'JFK',
    city: 'New York',
    name: 'John F. Kennedy International',
    country: 'United States',
  },
  { iata: 'EWR', city: 'Newark', name: 'Newark Liberty International', country: 'United States' },
  {
    iata: 'SFO',
    city: 'San Francisco',
    name: 'San Francisco International',
    country: 'United States',
  },
  { iata: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', country: 'United States' },
  { iata: 'ORD', city: 'Chicago', name: "O'Hare International", country: 'United States' },
  { iata: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma International', country: 'United States' },

  // Greater China + SEA
  { iata: 'PVG', city: 'Shanghai', name: 'Pudong International', country: 'China' },
  { iata: 'PEK', city: 'Beijing', name: 'Beijing Capital International', country: 'China' },
  { iata: 'HKG', city: 'Hong Kong', name: 'Hong Kong International', country: 'Hong Kong SAR' },
  { iata: 'SIN', city: 'Singapore', name: 'Changi Airport', country: 'Singapore' },
  { iata: 'MNL', city: 'Manila', name: 'Ninoy Aquino International', country: 'Philippines' },
  { iata: 'KUL', city: 'Kuala Lumpur', name: 'Kuala Lumpur International', country: 'Malaysia' },
];

const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a] as const));

export function lookupAirport(iata: string): Airport | undefined {
  return BY_IATA.get(iata.toUpperCase());
}

export function isValidIata(code: string): boolean {
  return /^[A-Z]{3}$/.test(code.toUpperCase()) && BY_IATA.has(code.toUpperCase());
}

export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return AIRPORTS.filter(
    (a) =>
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q),
  ).slice(0, limit);
}

export function formatAirport(iata: string): string {
  const a = BY_IATA.get(iata.toUpperCase());
  return a ? `${a.city} (${a.iata})` : iata.toUpperCase();
}
