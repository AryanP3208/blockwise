/**
 * The agent's tools. Each one is a thin, typed wrapper over a Qloo call and returns a compact
 * result (names, affinities, a few tags) so the model's context stays small and every number
 * in the playbook can be traced back to a Qloo response.
 */
import { GEOCODER_URL, geocoderParams, resolveLocation } from "@/lib/location";
import { qloo, entitiesOf, tagsOf, affinity, tagId, wktPoint, isMock, type Params, type QlooEntity, type QlooTag } from "@/lib/qloo";

export type ToolResult = { ok: boolean; endpoint: string; params: Params; data: unknown; note?: string };

export const ENTITY_TYPES = ["artist", "brand", "place", "podcast", "tv_show", "movie", "book", "video_game", "destination"] as const;
export const AGES = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;

export const toolDefinitions = [
  {
    name: "resolve_location",
    description: "Verify the full street address and return its coordinates as a WKT point. Attach a Qloo business only when its name, address, and nearby coordinates match. Never substitute an unrelated search result. Call this first.",
    input_schema: {
      type: "object",
      properties: {
        business_name: { type: "string", description: "Name of the business, if known" },
        address: { type: "string", description: "Street address" },
        city: { type: "string", description: "City and state, e.g. 'Montgomery, AL'" },
      },
      required: ["address", "city"],
    },
  },
  {
    name: "taste_profile",
    description: "Taste Analysis: which taste tags (music genres, cuisines, lifestyle interests, media genres) over-index for people around a point or in a locality, optionally narrowed by age range and gender. Returns tags with affinity 0-1.",
    input_schema: {
      type: "object",
      properties: {
        point: { type: "string", description: "WKT point from resolve_location, e.g. POINT(-86.2066 32.3797). Use this for the block." },
        locality: { type: "string", description: "Named locality instead of a point, e.g. 'Montgomery, AL'. Use this for the city-wide view." },
        age: { type: "string", enum: AGES as unknown as string[], description: "Optional age range signal" },
        gender: { type: "string", enum: ["male", "female"], description: "Optional gender signal" },
        tag_types: { type: "array", items: { type: "string" }, description: "Optional tag type filter, e.g. ['urn:tag:genre:music'] or ['urn:tag:genre:restaurant']" },
        take: { type: "integer", description: "How many tags, default 20" },
      },
    },
  },
  {
    name: "recommend",
    description: "Insights: the entities of one type (artist, brand, place, podcast, tv_show, movie, book, video_game, destination) with the highest affinity for people around a point or in a locality, optionally steered by taste tags and demographics. Places can be filtered by radius in meters and price level.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ENTITY_TYPES as unknown as string[] },
        point: { type: "string", description: "WKT point for the block" },
        locality: { type: "string", description: "Named locality, used when no point is given or for city-wide results" },
        tags: { type: "array", items: { type: "string" }, description: "Optional Qloo tag IDs to steer the results (signal.interests.tags)" },
        age: { type: "string", enum: AGES as unknown as string[] },
        gender: { type: "string", enum: ["male", "female"] },
        radius_m: { type: "integer", description: "Places only: restrict to this radius around the point, e.g. 3000" },
        price_level_max: { type: "integer", description: "Places only: 1-4" },
        exclude_entity: { type: "string", description: "Entity ID to exclude (e.g. the business itself)" },
        take: { type: "integer", description: "How many results, default 12" },
      },
      required: ["type"],
    },
  },
  {
    name: "compare",
    description: "Compare the taste profile of the block (a point) against the whole city (a locality): returns the tags that over-index or under-index on the block relative to the city.",
    input_schema: {
      type: "object",
      properties: {
        point: { type: "string", description: "WKT point for the block" },
        locality: { type: "string", description: "Locality for the baseline, e.g. 'Montgomery, AL'" },
        age: { type: "string", enum: AGES as unknown as string[] },
        gender: { type: "string", enum: ["male", "female"] },
      },
      required: ["point", "locality"],
    },
  },
  {
    name: "search_tags",
    description: "Look up Qloo tag IDs by keyword (e.g. 'barbecue', 'hip hop', 'streetwear') to use as signals in recommend.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, tag_types: { type: "array", items: { type: "string" } } },
      required: ["query"],
    },
  },
];

type Loc = { point?: string; locality?: string; age?: string; gender?: string };

function signalParams(loc: Loc): Params {
  const p: Params = {};
  if (loc.point) p["signal.location"] = loc.point;
  else if (loc.locality) p["signal.location.query"] = loc.locality;
  if (loc.age) p["signal.demographics.age"] = loc.age;
  if (loc.gender) p["signal.demographics.gender"] = loc.gender;
  return p;
}

function compactEntity(e: QlooEntity) {
  const props = (e.properties || {}) as Record<string, unknown>;
  return {
    id: e.entity_id,
    name: e.name,
    affinity: Number(affinity(e).toFixed(3)),
    popularity: typeof e.popularity === "number" ? Number(e.popularity.toFixed(3)) : undefined,
    tags: (e.tags || []).slice(0, 4).map((t) => t.name),
    address: (props.address as string) || undefined,
    rating: (props.business_rating as number) || undefined,
    price_level: (props.price_level as number) || undefined,
    description: typeof props.description === "string" ? (props.description as string).slice(0, 140) : undefined,
  };
}

function compactTag(t: QlooTag) {
  return { id: tagId(t), name: t.name, type: (t.type || t.subtype || "") as string, affinity: Number(affinity(t).toFixed(3)) };
}

export async function runTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "resolve_location": {
      const request = {
        business_name: String(input.business_name || ""),
        address: String(input.address || ""),
        city: String(input.city || ""),
      };
      const mock = isMock();
      const params: Params = mock ? { address: request.address, city: request.city } : geocoderParams(request);
      const endpoint = mock ? "offline address fixture" : GEOCODER_URL;
      try {
        const location = await resolveLocation(request, {
          mock,
          search: async (query) => entitiesOf(await qloo.search(query, ["urn:entity:place"], { take: 10 })),
        });
        const { place, ...verified } = location;
        const note = `${location.source}: ${location.matched_address} (${location.precision}). ${place ? `Qloo business verified: ${place.name}.` : "No verified Qloo business match; using the address coordinates."}`;
        return {
          ok: true, endpoint, params,
          data: { ...verified, point: wktPoint(location.lat, location.lon), locality: request.city, place: place ? compactEntity(place) : null },
          note,
        };
      } catch (error) {
        return { ok: false, endpoint, params, data: null, note: (error as Error).message };
      }
    }
    case "taste_profile": {
      const params: Params = { "filter.type": "urn:tag", take: (input.take as number) || 20, ...signalParams(input as Loc) };
      if (Array.isArray(input.tag_types) && input.tag_types.length) params["filter.tag.types"] = input.tag_types as string[];
      const res = await qloo.insights(params);
      const tags = tagsOf(res).map(compactTag).filter((t) => t.name);
      return { ok: tags.length > 0, endpoint: "/v2/insights", params, data: { tags }, note: tags.length ? undefined : "No tags returned; try the locality instead of the point" };
    }
    case "recommend": {
      const type = input.type as string;
      const params: Params = { "filter.type": `urn:entity:${type}`, take: (input.take as number) || 12, ...signalParams(input as Loc) };
      if (Array.isArray(input.tags) && input.tags.length) params["signal.interests.tags"] = input.tags as string[];
      if (type === "place" && input.point) {
        params["filter.location"] = input.point as string;
        params["filter.location.radius"] = (input.radius_m as number) || 5000;
      }
      if (type === "place" && input.price_level_max) params["filter.price_level.max"] = input.price_level_max as number;
      if (input.exclude_entity) params["filter.exclude.entities"] = input.exclude_entity as string;
      const res = await qloo.insights(params);
      const entities = entitiesOf(res).map(compactEntity);
      return { ok: entities.length > 0, endpoint: "/v2/insights", params, data: { type, entities }, note: entities.length ? undefined : "No entities; widen the radius or drop the tag signals" };
    }
    case "compare": {
      // Two Taste Analysis calls, diffed in code: robust across API versions and easy to explain.
      const base: Params = { "filter.type": "urn:tag", take: 40 };
      const demo: Params = {};
      if (input.age) demo["signal.demographics.age"] = input.age as string;
      if (input.gender) demo["signal.demographics.gender"] = input.gender as string;
      const [a, b] = await Promise.all([
        qloo.insights({ ...base, ...demo, "signal.location": input.point as string }),
        qloo.insights({ ...base, ...demo, "signal.location.query": input.locality as string }),
      ]);
      const A = tagsOf(a).map(compactTag), B = tagsOf(b).map(compactTag);
      const bMap = new Map(B.map((t) => [t.id || t.name, t.affinity]));
      const rows = A.map((t) => {
        const city = bMap.get(t.id || t.name);
        return { name: t.name, type: t.type, block: t.affinity, city: city ?? null, delta: city === undefined ? null : Number((t.affinity - city).toFixed(3)) };
      });
      const over = rows.filter((r) => r.delta !== null && r.delta > 0).sort((x, y) => (y.delta as number) - (x.delta as number)).slice(0, 10);
      const under = rows.filter((r) => r.delta !== null && r.delta < 0).sort((x, y) => (x.delta as number) - (y.delta as number)).slice(0, 6);
      const onlyBlock = rows.filter((r) => r.delta === null).slice(0, 8);
      return { ok: rows.length > 0, endpoint: "/v2/insights (x2, filter.type=urn:tag)", params: { point: input.point as string, locality: input.locality as string, ...demo }, data: { over_index: over, under_index: under, block_only: onlyBlock } };
    }
    case "search_tags": {
      const res = await qloo.tags(input.query as string, (input.tag_types as string[]) || undefined, 12);
      const tags = tagsOf(res).map((t) => ({ id: tagId(t), name: t.name, type: (t.type || t.subtype || "") as string }));
      return { ok: tags.length > 0, endpoint: "/v2/tags", params: { "filter.query": input.query as string }, data: { tags } };
    }
    default:
      return { ok: false, endpoint: "", params: {}, data: null, note: `Unknown tool ${name}` };
  }
}
