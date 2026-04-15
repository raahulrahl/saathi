/**
 * Lat/lng coordinates for major airports.
 *
 * Used by the flight globe visualisation. Covers the routes most
 * relevant to the Saathi user base (India ↔ Gulf ↔ Europe ↔ Americas).
 *
 * Format: [latitude, longitude] in decimal degrees.
 */

export type Coords = [lat: number, lng: number];
export const AIRPORT_COORDS: Record<string, Coords> = {
  // ── India ──────────────────────────────────────────────────────────────
  AMD: [23.0771, 72.6347], // Ahmedabad
  ATQ: [31.7096, 74.7973], // Amritsar
  BBI: [20.2444, 85.8178], // Bhubaneswar
  BLR: [13.1986, 77.7066], // Bengaluru
  BOM: [19.0896, 72.8656], // Mumbai
  CCU: [22.6546, 88.4467], // Kolkata
  COK: [10.152, 76.4019], // Kochi
  DEL: [28.5562, 77.1], // Delhi
  GAU: [26.1061, 91.5859], // Guwahati
  GOI: [15.3808, 73.8314], // Goa (Dabolim)
  HYD: [17.2403, 78.4294], // Hyderabad
  IDR: [22.7217, 75.8011], // Indore
  IXB: [26.6812, 88.3286], // Bagdogra
  IXC: [30.6735, 76.7885], // Chandigarh
  IXE: [12.9613, 74.8901], // Mangalore
  IXJ: [32.6891, 74.8374], // Jammu
  IXL: [34.1589, 77.5465], // Leh
  IXM: [9.8345, 78.0934], // Madurai
  IXS: [24.9129, 92.9787], // Silchar
  IXZ: [11.6412, 92.7296], // Port Blair
  JAI: [26.8242, 75.8122], // Jaipur
  LKO: [26.7606, 80.8893], // Lucknow
  MAA: [12.99, 80.1693], // Chennai
  NAG: [21.0922, 79.0472], // Nagpur
  PAT: [25.5913, 85.088], // Patna
  PNQ: [18.5822, 73.9197], // Pune
  SXR: [33.9871, 74.7742], // Srinagar
  TRV: [8.4821, 76.9201], // Thiruvananthapuram
  VNS: [25.4524, 82.8593], // Varanasi

  // ── Gulf / Middle East ─────────────────────────────────────────────────
  AUH: [24.433, 54.6511], // Abu Dhabi
  BAH: [26.2708, 50.6336], // Bahrain
  DOH: [25.2731, 51.608], // Doha
  DXB: [25.2532, 55.3657], // Dubai
  KWI: [29.2267, 47.9689], // Kuwait City
  MCT: [23.5933, 58.2844], // Muscat
  RUH: [24.9576, 46.6988], // Riyadh
  SHJ: [25.3286, 55.5172], // Sharjah

  // ── Europe ─────────────────────────────────────────────────────────────
  AMS: [52.3086, 4.7639], // Amsterdam
  ARN: [59.6519, 17.9186], // Stockholm Arlanda
  ATH: [37.9364, 23.9445], // Athens
  BCN: [41.2971, 2.0785], // Barcelona
  BEG: [44.8184, 20.3091], // Belgrade
  BRU: [50.9014, 4.4844], // Brussels
  BUD: [47.4369, 19.2556], // Budapest
  CDG: [49.0097, 2.5479], // Paris CDG
  CPH: [55.618, 12.656], // Copenhagen
  DUB: [53.4213, -6.27], // Dublin
  FCO: [41.8003, 12.2389], // Rome Fiumicino
  FRA: [50.0379, 8.5622], // Frankfurt
  GVA: [46.238, 6.1089], // Geneva
  HAM: [53.6304, 9.9882], // Hamburg
  HEL: [60.3172, 24.9633], // Helsinki
  IST: [41.2753, 28.7519], // Istanbul
  LHR: [51.47, -0.4543], // London Heathrow
  LIS: [38.7813, -9.1359], // Lisbon
  MAD: [40.4936, -3.5668], // Madrid
  MAN: [53.365, -2.2728], // Manchester
  MUC: [48.3537, 11.775], // Munich
  MXP: [45.6306, 8.7281], // Milan Malpensa
  OSL: [60.1939, 11.1004], // Oslo Gardermoen
  OTP: [44.5711, 26.085], // Bucharest
  PRG: [50.1008, 14.26], // Prague
  SOF: [42.6967, 23.4114], // Sofia
  TXL: [52.5597, 13.2877], // Berlin (legacy, still used)
  BER: [52.3667, 13.5033], // Berlin Brandenburg
  VIE: [48.1103, 16.5697], // Vienna
  WAW: [52.1657, 20.9671], // Warsaw
  ZRH: [47.4647, 8.5492], // Zurich

  // ── North America ──────────────────────────────────────────────────────
  ATL: [33.6407, -84.4277], // Atlanta
  BOS: [42.3656, -71.0096], // Boston
  DFW: [32.8998, -97.0403], // Dallas-Fort Worth
  EWR: [40.6895, -74.1745], // Newark
  IAD: [38.9531, -77.4565], // Washington Dulles
  IAH: [29.9902, -95.3368], // Houston
  JFK: [40.6413, -73.7781], // New York JFK
  LAX: [33.9425, -118.408], // Los Angeles
  ORD: [41.9742, -87.9073], // Chicago O'Hare
  SFO: [37.6213, -122.379], // San Francisco
  YUL: [45.4706, -73.7408], // Montreal
  YVR: [49.1967, -123.184], // Vancouver
  YYZ: [43.6772, -79.6306], // Toronto

  // ── Southeast Asia ─────────────────────────────────────────────────────
  BKK: [13.69, 100.75], // Bangkok Suvarnabhumi
  CGK: [-6.1256, 106.655], // Jakarta
  HAN: [21.2212, 105.807], // Hanoi
  KUL: [2.7456, 101.71], // Kuala Lumpur
  MNL: [14.5086, 121.019], // Manila
  SGN: [10.8188, 106.652], // Ho Chi Minh City
  SIN: [1.3644, 103.991], // Singapore
  RGN: [16.9073, 96.1332], // Yangon

  // ── East Asia ──────────────────────────────────────────────────────────
  HKG: [22.308, 113.918], // Hong Kong
  HND: [35.5494, 139.779], // Tokyo Haneda
  ICN: [37.4602, 126.441], // Seoul Incheon
  NRT: [35.7647, 140.386], // Tokyo Narita
  PEK: [40.0799, 116.603], // Beijing Capital
  PKX: [39.5098, 116.41], // Beijing Daxing
  PVG: [31.1434, 121.805], // Shanghai Pudong

  // ── South Asia / Neighbours ────────────────────────────────────────────
  CMB: [7.1808, 79.8841], // Colombo
  DAC: [23.8433, 90.3978], // Dhaka
  KTM: [27.6966, 85.3591], // Kathmandu

  // ── Africa ─────────────────────────────────────────────────────────────
  ADD: [8.9779, 38.7993], // Addis Ababa
  CAI: [30.1219, 31.4056], // Cairo
  JNB: [-26.133, 28.242], // Johannesburg
  LOS: [6.5774, 3.3212], // Lagos
  NBO: [-1.3192, 36.9275], // Nairobi

  // ── Oceania ────────────────────────────────────────────────────────────
  MEL: [-37.673, 144.843], // Melbourne
  SYD: [-33.946, 151.177], // Sydney
};

/** Look up coordinates for an IATA code, returns undefined if not found. */
export function getCoords(iata: string): Coords | undefined {
  return AIRPORT_COORDS[iata.toUpperCase()];
}
