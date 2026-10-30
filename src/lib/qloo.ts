/**
 * Thin client for the Qloo API (hackathon environment).
 * - Every call is a GET with X-Api-Key; parameters go in the query string.
 * - Responses are cached in memory for the life of the server instance (Qloo allows private caching).
 * - With QLOO_MOCK=1 or no key, fixtures with the same JSON shape are returned so the app runs offline.
 */
import { mockResponse } from "@/mock";

const BASE = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

export type QlooTag = {
  tag_id?: string;
  id?: string;
  name: string;
  type?: string;
  subtype?: string;
  query?: { affinity?: number; [k: string]: unknown };
  [k: string]: unknown;
};

export type QlooEntity = {
  entity_id: string;
  name: string;
  type?: string;
  subtype?: string;
  popularity?: number;
  disambiguation?: string;
  tags?: QlooTag[];
  properties?: Record<string, unknown>;
  location?: { lat: number; lon: number };
  query?: { affinity?: number; [k: string]: unknown };
  [k: string]: unknown;
};

export type Params = Record<string, string | number | boolean | string[] | undefined | null>;

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 1000 * 60 * 60 * 12;

export function isMock(): boolean {
  return process.env.QLOO_MOCK === "1" || !process.env.QLOO_API_KEY;
}

function buildUrl(path: string, params: Params): string {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return url.toString();
}

export async function qlooGet<T = unknown>(path: string, params: Params = {}): Promise<T> {
  const url = buildUrl(path, params);
  if (isMock()) return mockResponse(path, params) as T;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const res = await fetch(url, {
    headers: { "X-Api-Key": process.env.QLOO_API_KEY as string, Accept: "application/json" },
    // Next.js fetch cache is bypassed; we keep our own.
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Qloo ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  cache.set(url, { at: Date.now(), data });
  return data as T;
}

/** Pull the entity list out of an Insights or Search response, whatever the wrapper. */
export function entitiesOf(res: unknown): QlooEntity[] {
  const r = res as { results?: { entities?: QlooEntity[] } | QlooEntity[]; entities?: QlooEntity[] };
  if (Array.isArray(r?.results)) return r.results;
  if (r?.results && Array.isArray((r.results as { entities?: QlooEntity[] }).entities)) {
    return (r.results as { entities: QlooEntity[] }).entities;
  }
  if (Array.isArray(r?.entities)) return r.entities;
  return [];
}

/** Pull the tag list out of a Taste Analysis or Tags Search response. */
export function tagsOf(res: unknown): QlooTag[] {
  const r = res as { results?: { tags?: QlooTag[]; entities?: QlooTag[] } | QlooTag[]; tags?: QlooTag[] };
  if (Array.isArray(r?.results)) return r.results;
  const inner = r?.results as { tags?: QlooTag[]; entities?: QlooTag[] } | undefined;
  if (inner?.tags) return inner.tags;
  if (inner?.entities) return inner.entities as QlooTag[];
  if (Array.isArray(r?.tags)) return r.tags;
  return [];
}

export function affinity(x: { query?: { affinity?: number }; affinity?: number }): number {
  const a = x.query?.affinity ?? x.affinity;
  return typeof a === "number" ? a : 0;
}

export function tagId(t: QlooTag): string {
  return (t.tag_id || t.id || "") as string;
}

/** WKT point, longitude first, as Qloo expects. */
export function wktPoint(lat: number, lon: number): string {
  return `POINT(${lon.toFixed(6)} ${lat.toFixed(6)})`;
}

export const qloo = {
  search: (query: string, types?: string[], extra: Params = {}) =>
    qlooGet("/search", { query, types, take: 10, ...extra }),
  tags: (query: string, tagTypes?: string[], take = 15) =>
    qlooGet("/v2/tags", { "filter.query": query, "filter.tag.types": tagTypes, take }),
  insights: (params: Params) => qlooGet("/v2/insights", params),
  compare: (params: Params) => qlooGet("/v2/insights/compare", params),
  audiences: (params: Params = {}) => qlooGet("/v2/audiences", params),
};
