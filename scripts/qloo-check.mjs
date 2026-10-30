#!/usr/bin/env node
/**
 * Live smoke test for the Qloo hackathon API. Reads QLOO_API_KEY from .env.local or the
 * environment, makes a handful of calls for an address, and prints the SHAPE of each response
 * (keys, counts, first names) so the code can be matched to the real data. Never prints the key.
 *
 *   npm run qloo:check -- "141 Eastern Blvd, Montgomery, AL" "Eleganza Family Haircuts"
 */
import { readFileSync, existsSync } from "node:fs";
import locationModule from "../src/lib/location.ts";
const { resolveLocation } = locationModule;

if (!process.env.QLOO_API_KEY && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.QLOO_API_KEY;
if (!KEY) { console.error("QLOO_API_KEY not set (put it in .env.local)"); process.exit(1); }
const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
const [address = "141 Eastern Blvd, Montgomery, AL", business = "Eleganza Family Haircuts"] = process.argv.slice(2);
const city = address.split(",").slice(-2).join(",").trim();
const streetAddress = address.split(",").slice(0, -2).join(",").trim();

async function get(path, params) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": KEY }, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, ms: Date.now() - t0, json, url: url.pathname + "?" + url.searchParams.toString() };
}
function shape(v, depth = 0) {
  if (Array.isArray(v)) return `[${v.length}]` + (v.length && depth < 2 ? shape(v[0], depth + 1) : "");
  if (v && typeof v === "object") return "{" + Object.keys(v).slice(0, 14).join(",") + (Object.keys(v).length > 14 ? ",…" : "") + "}";
  return typeof v;
}
function names(list, key = "name") { return (list || []).slice(0, 6).map((x) => `${x[key]}${x.query?.affinity !== undefined ? ` (${Number(x.query.affinity).toFixed(2)})` : ""}`).join(" · "); }
function report(label, r) {
  console.log(`\n== ${label}\n   GET ${r.url}\n   ${r.status} in ${r.ms} ms · top-level: ${shape(r.json)}`);
  const results = r.json?.results;
  if (Array.isArray(results)) console.log(`   results[${results.length}] ${shape(results[0])}\n   ${names(results)}`);
  else if (results) for (const [k, v] of Object.entries(results)) console.log(`   results.${k}: ${shape(v)}${Array.isArray(v) ? `\n   ${names(v)}` : ""}`);
  if (r.json?.error || r.json?.message) console.log("   message:", JSON.stringify(r.json.error || r.json.message).slice(0, 300));
  return r.json;
}

let location;
try {
  location = await resolveLocation({ business_name: business, address: streetAddress, city }, {
    search: async (query) => {
      const result = await get("/search", { query, types: "urn:entity:place", take: 10 });
      console.log(`Qloo business search: HTTP ${result.status}`);
      const results = result.json?.results;
      return Array.isArray(results) ? results : results?.entities || [];
    },
  });
} catch (error) {
  console.error(`Location verification failed: ${error.message}`);
  process.exit(1);
}
const point = `POINT(${location.lon.toFixed(6)} ${location.lat.toFixed(6)})`;
console.log(`Verified address: ${location.matched_address} (${location.source}; ${location.precision})`);
console.log(`Using ${point}; Qloo business: ${location.place?.name || "no verified match"}`);

report("taste analysis at the point", await get("/v2/insights", { "filter.type": "urn:tag", "signal.location": point, take: 15 }));
report("taste analysis for the city", await get("/v2/insights", { "filter.type": "urn:tag", "signal.location.query": city, take: 15 }));
report("artists near the point", await get("/v2/insights", { "filter.type": "urn:entity:artist", "signal.location": point, take: 10 }));
report("brands near the point", await get("/v2/insights", { "filter.type": "urn:entity:brand", "signal.location": point, take: 10 }));
report("places within 4 km", await get("/v2/insights", { "filter.type": "urn:entity:place", "filter.location": point, "filter.location.radius": 4000, "signal.location": point, take: 10 }));
report("podcasts near the point", await get("/v2/insights", { "filter.type": "urn:entity:podcast", "signal.location": point, take: 8 }));
report("tags search: barbecue", await get("/v2/tags", { "filter.query": "barbecue", take: 8 }));
report("artists, city + age 25-29", await get("/v2/insights", { "filter.type": "urn:entity:artist", "signal.location.query": city, "signal.demographics.age": "25_to_29", take: 8 }));
