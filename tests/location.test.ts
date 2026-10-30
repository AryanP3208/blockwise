import assert from "node:assert/strict";
import test from "node:test";
import { geocodeAddress, resolveLocation } from "../src/lib/location";
import type { QlooEntity } from "../src/lib/qloo";

// Synthetic fixtures only; no saved Qloo or geocoder responses.
const input = { business_name: "Example Haircuts", address: "10 W Example Blvd", city: "Example City, AL" };
const candidate = {
  address: "10 W Example Blvd, Example City, Alabama",
  score: 100, location: { x: -86.2, y: 32.4 },
  attributes: { Addr_type: "PointAddress", StAddr: "10 West Example Boulevard", City: "Example City", Region: "Alabama", RegionAbbr: "AL" },
};
function respond(candidates: unknown[]): typeof fetch {
  return async () => new Response(JSON.stringify({ candidates }), { headers: { "Content-Type": "application/json" } });
}
function place(overrides: Partial<QlooEntity> = {}): QlooEntity {
  return { name: "Example Haircuts", entity_id: "synthetic", location: { lat: 32.4001, lon: -86.2 },
    properties: { address: "10 West Example Blvd Ste C Example City, AL 00000" }, ...overrides };
}

test("rejects an unrelated first Qloo result and preserves verified address coordinates", async () => {
  const result = await resolveLocation(input, {
    fetcher: respond([candidate]), search: async () => [place({ name: "Family Restaurant", location: { lat: 31.9, lon: -86.3 } })],
  });
  assert.equal(result.place, null);
  assert.equal(result.lat, 32.4);
  assert.equal(result.lon, -86.2);
});

test("attaches a later exact business match without replacing address coordinates", async () => {
  const result = await resolveLocation(input, {
    fetcher: respond([candidate]), search: async () => [place({ name: "Family Restaurant" }), place()],
  });
  assert.equal(result.place?.entity_id, "synthetic");
  assert.equal(result.lat, 32.4);
});

test("rejects same-name Qloo businesses with the wrong address or far-away coordinates", async () => {
  for (const wrong of [
    place({ properties: { address: "11 W Example Blvd Example City, AL 00000" } }),
    place({ properties: { address: "10 W Example Blvd Other City, AL 00000" } }),
    place({ location: { lat: 31.4, lon: -86.2 } }),
    place({ location: { lat: NaN, lon: -86.2 } }),
    place({ name: "Example Haircuts Annex" }),
  ]) {
    const result = await resolveLocation(input, { fetcher: respond([candidate]), search: async () => [wrong] });
    assert.equal(result.place, null);
  }
});

test("rejects street/city centroids, altered house numbers, directions, cities, states and invalid coordinates", async () => {
  for (const wrong of [
    { ...candidate, attributes: { ...candidate.attributes, Addr_type: "StreetName" } },
    { ...candidate, attributes: { ...candidate.attributes, Addr_type: "Locality" } },
    { ...candidate, attributes: { ...candidate.attributes, StAddr: "11 W Example Blvd" } },
    { ...candidate, attributes: { ...candidate.attributes, StAddr: "10 Example Blvd" } },
    { ...candidate, attributes: { ...candidate.attributes, City: "Other City" } },
    { ...candidate, attributes: { ...candidate.attributes, Region: "Georgia", RegionAbbr: "GA" } },
    { ...candidate, location: { x: null, y: null } },
    { ...candidate, location: { x: -86.2, y: 100 } },
    { ...candidate, score: 80 },
  ]) await assert.rejects(geocodeAddress(input, respond([wrong])), /Could not verify/);
});

test("requires a house number and fails when no exact match exists", async () => {
  await assert.rejects(geocodeAddress({ ...input, address: "W Example Blvd" }, respond([candidate])), /street number/);
  let searched = false;
  await assert.rejects(resolveLocation(input, { fetcher: respond([]), search: async () => { searched = true; return [place()]; } }), /Could not verify/);
  assert.equal(searched, false, "Qloo must not override a failed address verification");
});

test("rejects ambiguous address matches in different neighborhoods", async () => {
  await assert.rejects(geocodeAddress(input, respond([candidate, { ...candidate, location: { x: -86.3, y: 32.4 } }])), /multiple locations/);
});

test("geocoder failures stop resolution; Qloo search failures preserve the address", async () => {
  const unavailable: typeof fetch = async () => { throw new Error("timeout"); };
  await assert.rejects(geocodeAddress(input, unavailable), /service is unavailable/);
  const result = await resolveLocation(input, { fetcher: respond([candidate]), search: async () => { throw new Error("Qloo down"); } });
  assert.equal(result.lat, 32.4);
  assert.equal(result.place, null);
});

test("interpolated address matches carry their precision", async () => {
  const result = await geocodeAddress(input, respond([{ ...candidate, attributes: { ...candidate.attributes, Addr_type: "StreetAddress" } }]));
  assert.equal(result.precision, "interpolated address");
});

test("offline examples remain in their own cities and unknown addresses fail", async () => {
  const search = async (): Promise<QlooEntity[]> => { throw new Error("Offline mode must not call Qloo"); };
  const atlanta = await resolveLocation({ address: "887 W Marietta St NW", city: "Atlanta, GA" }, { mock: true, search });
  assert.equal(atlanta.lat, 33.7816);
  assert.equal(atlanta.lon, -84.4154);
  const georgiana = await resolveLocation({ address: "617 S Palmer Ave", city: "Georgiana, AL" }, { mock: true, search });
  assert.equal(georgiana.lat, 31.6358);
  await assert.rejects(resolveLocation(input, { mock: true, search }), /Offline mode supports/);
});
