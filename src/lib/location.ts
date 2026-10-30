import type { QlooEntity } from "./qloo";

export const GEOCODER_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
export type LocationInput = { business_name?: string; address: string; city: string };
type Coordinates = { lat: number; lon: number };
type Candidate = {
  address: string;
  score: number;
  location: { x: number; y: number };
  attributes: { Addr_type: string; StAddr: string; City: string; Region: string; RegionAbbr: string };
};

const ABBREVIATIONS: Record<string, string> = {
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
  street: "st", avenue: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", court: "ct", circle: "cir",
  highway: "hwy", parkway: "pkwy", place: "pl", terrace: "ter",
};
function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function street(value: string): string {
  // Unit numbers don't change the neighborhood; street numbers and directions do.
  return normalize(value.split(",")[0].replace(/\s+(?:suite|ste|unit|apt|apartment|#)\s*.*$/i, ""))
    .split(" ").map((token) => ABBREVIATIONS[token] || token).join(" ");
}
function validPoint(point: Coordinates): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}
function distanceMeters(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function geocoderParams(input: LocationInput): Record<string, string> {
  return {
    SingleLine: `${input.address}, ${input.city}`, f: "json", outSR: "4326",
    outFields: "Match_addr,Addr_type,StAddr,City,Region,RegionAbbr", maxLocations: "5", forStorage: "false",
  };
}

/** Require an address-level match, never a street/city centroid or a fuzzy house number. */
export async function geocodeAddress(input: LocationInput, fetcher: typeof fetch = fetch) {
  const [city, region = ""] = input.city.split(",").map((part) => part.trim());
  if (!/^\d+[a-z]?\s/i.test(input.address.trim()) || !city) {
    throw new Error("Enter a street number, street name, and city (including state or region).");
  }
  const url = new URL(GEOCODER_URL);
  Object.entries(geocoderParams(input)).forEach(([key, value]) => url.searchParams.set(key, value));
  let candidates: Candidate[];
  try {
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const json = await response.json();
    if (!Array.isArray(json.candidates)) throw new Error("Invalid geocoder response");
    candidates = json.candidates;
  } catch {
    throw new Error("The address lookup service is unavailable. Please try again; no neighborhood was selected.");
  }
  const matches = candidates.filter((candidate) => {
    const a = candidate.attributes;
    return a && candidate.location && candidate.score >= 95
      && ["PointAddress", "Subaddress", "StreetAddress", "PointAddressInt"].includes(a.Addr_type)
      && typeof a.StAddr === "string" && street(a.StAddr) === street(input.address)
      && typeof a.City === "string" && normalize(a.City) === normalize(city)
      && (!region || [a.Region, a.RegionAbbr].some((r) => typeof r === "string" && normalize(r) === normalize(region)))
      && validPoint({ lat: candidate.location.y, lon: candidate.location.x });
  });
  if (!matches.length) throw new Error(`Could not verify ${input.address}, ${input.city}. Check the street number, street name, and city/state.`);
  const match = matches[0];
  const point = { lat: match.location.y, lon: match.location.x };
  if (matches.some((m) => distanceMeters(point, { lat: m.location.y, lon: m.location.x }) > 150)) {
    throw new Error("This address matches multiple locations. Add or correct the city and state before trying again.");
  }
  return {
    ...point, matched_address: match.address, source: "Esri World Geocoding",
    precision: ["StreetAddress", "PointAddressInt"].includes(match.attributes.Addr_type) ? "interpolated address" : "address point",
  };
}

/** Optional business identity. It must never replace the verified address coordinates. */
function matchingPlace(input: LocationInput, point: Coordinates, entities: QlooEntity[]) {
  if (!input.business_name) return null;
  const city = normalize(input.city.split(",")[0]);
  const matches = entities.filter((entity) => {
    if (normalize(entity.name || "") !== normalize(input.business_name!) || !entity.location
      || !validPoint(entity.location) || distanceMeters(point, entity.location) > 200) return false;
    const address = entity.properties?.address;
    if (typeof address !== "string") return false;
    // Qloo's address can omit the comma between street and city.
    const normalized = normalize(address);
    const cityIndex = normalized.lastIndexOf(` ${city} `);
    if (cityIndex < 0) return false;
    return street(normalized.slice(0, cityIndex)) === street(input.address);
  });
  return matches.length === 1 ? matches[0] : null;
}

const MOCK_ADDRESSES = [
  { address: "141 Eastern Blvd", city: "Montgomery, AL", lat: 32.3797, lon: -86.2066 },
  { address: "617 S Palmer Ave", city: "Georgiana, AL", lat: 31.6358, lon: -86.7406 },
  { address: "887 W Marietta St NW", city: "Atlanta, GA", lat: 33.7816, lon: -84.4154 },
];

export async function resolveLocation(input: LocationInput, options: {
  search: (query: string) => Promise<QlooEntity[]>;
  mock?: boolean;
  fetcher?: typeof fetch;
}) {
  if (options.mock) {
    const mock = MOCK_ADDRESSES.find((m) => street(m.address) === street(input.address) && normalize(m.city) === normalize(input.city));
    if (!mock) throw new Error("Offline mode supports only the three example addresses. Add a Qloo key to look up other addresses.");
    return { lat: mock.lat, lon: mock.lon, matched_address: `${mock.address}, ${mock.city}`, source: "Offline demo fixture", precision: "demo", place: null };
  }
  const location = await geocodeAddress(input, options.fetcher);
  let place: QlooEntity | null = null;
  if (input.business_name) {
    try { place = matchingPlace(input, location, await options.search(input.business_name)); }
    catch { /* A missing Qloo identity does not invalidate the verified street address. */ }
  }
  return { ...location, place };
}
