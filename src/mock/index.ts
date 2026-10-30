/**
 * Offline fixtures shaped like Qloo responses, used when QLOO_MOCK=1 or no API key is set.
 * Entity names are public names; the affinity numbers are invented and only exist so the UI
 * and the agent loop can be exercised without the API. The live app never uses this file.
 */
import type { Params } from "@/lib/qloo";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function pick<T>(arr: T[], n: number, r: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
}
function affinities(n: number, r: () => number): number[] {
  const out: number[] = [];
  let a = 0.97 - r() * 0.03;
  for (let i = 0; i < n; i++) {
    out.push(Number(a.toFixed(3)));
    a -= 0.01 + r() * 0.035;
  }
  return out;
}

const ARTISTS = ["Morgan Wallen", "Kendrick Lamar", "SZA", "Luke Combs", "Lil Baby", "Chris Stapleton", "Kirk Franklin", "Zach Bryan", "Drake", "Beyoncé", "Future", "Lainey Wilson", "Usher", "Bad Bunny", "Jelly Roll", "Megan Thee Stallion", "Tyler Childers", "Post Malone", "Peso Pluma", "Tasha Cobbs Leonard", "Rod Wave", "Brent Faiyaz", "Grupo Frontera", "Jon Pardi"];
const BRANDS = ["Nike", "Jordan", "Carhartt", "New Balance", "Crocs", "Yeti", "Zaxby's", "Waffle House", "Chick-fil-A", "Dollar General", "Publix", "Academy Sports + Outdoors", "Buc-ee's", "Milo's Tea", "Conecuh Sausage", "Stanley", "Shein", "Fashion Nova", "Dickies", "Bojangles"];
const PLACES = ["Chris' Hot Dogs", "Dreamland BBQ", "Central", "Vintage Year", "Cahawba House", "Prevail Union", "D'Road Cafe", "Wintzell's Oyster House", "El Rey Burrito Lounge", "Filet & Vine", "Pine Bar", "The Alley Station", "Derk's Filet & Vine", "Saza", "Taste of Mexico", "Martha's Place", "Common Bond Brewers", "Capitol Oyster Bar", "La Jalisciense", "Farmers Market Cafe"];
const PODCASTS = ["The Joe Budden Podcast", "Bussin' With The Boys", "Crime Junkie", "The Breakfast Club", "The Bobby Bones Show", "Club Shay Shay", "The Pivot Podcast", "Elvis Duran", "85 South Show", "Million Dollaz Worth of Game", "Call Her Daddy", "The Rich Eiser Show", "La Cotorrisa", "Chisme Corporativo", "Bible in a Year"];
const SHOWS = ["Power Book II: Ghost", "Yellowstone", "Abbott Elementary", "BMF", "Love Is Blind", "The Chi", "Swamp People", "Snowfall", "Bel-Air", "Duck Dynasty", "La Casa de los Famosos", "Friday Night Lights", "Martin", "Fire Country", "Outer Banks"];
const MOVIES = ["Creed III", "Top Gun: Maverick", "Bad Boys: Ride or Die", "The Blind Side", "Coming to America", "Friday", "Barbershop", "Remember the Titans", "Straight Outta Compton", "Selma", "Encanto", "Fast X", "The Color Purple", "Girls Trip"];
const DESTINATIONS = ["Gulf Shores", "Atlanta", "Nashville", "New Orleans", "Birmingham", "Panama City Beach", "Orange Beach", "Memphis", "Pensacola", "Destin"];

const TASTE_TAGS = [
  ["Hip-Hop", "urn:tag:genre:music:hip_hop"], ["Southern Soul", "urn:tag:genre:music:southern_soul"], ["Country", "urn:tag:genre:music:country"],
  ["Gospel", "urn:tag:genre:music:gospel"], ["R&B", "urn:tag:genre:music:rnb"], ["Trap", "urn:tag:genre:music:trap"],
  ["Soul Food", "urn:tag:genre:restaurant:soul_food"], ["Barbecue", "urn:tag:genre:restaurant:barbecue"], ["Mexican", "urn:tag:genre:restaurant:mexican"],
  ["Fried Chicken", "urn:tag:genre:restaurant:fried_chicken"], ["Seafood", "urn:tag:genre:restaurant:seafood"], ["Wings", "urn:tag:genre:restaurant:wings"],
  ["Streetwear", "urn:tag:keyword:brand:streetwear"], ["Sneakers", "urn:tag:keyword:brand:sneakers"], ["Workwear", "urn:tag:keyword:brand:workwear"],
  ["College Football", "urn:tag:keyword:interest:college_football"], ["Church Community", "urn:tag:keyword:interest:church"], ["Fishing", "urn:tag:keyword:interest:fishing"],
  ["Car Culture", "urn:tag:keyword:interest:cars"], ["Family Entertainment", "urn:tag:keyword:interest:family"], ["Regional Mexican", "urn:tag:genre:music:regional_mexican"],
  ["Reality TV", "urn:tag:genre:media:reality"], ["True Crime", "urn:tag:genre:media:true_crime"], ["Faith & Spirituality", "urn:tag:keyword:media:faith"],
];

export function mockResponse(path: string, params: Params): unknown {
  const seed = hash(path + JSON.stringify(params));
  const r = rng(seed);

  if (path === "/search") {
    const q = String(params.query || "Business");
    return {
      results: [
        {
          entity_id: `mock-place-${hash(q)}`,
          name: q.replace(/,.*$/, ""),
          subtype: "urn:entity:place",
          location: { lat: 32.3797 + (r() - 0.5) * 0.01, lon: -86.2066 + (r() - 0.5) * 0.01 },
          properties: { address: "141 Eastern Blvd, Montgomery, AL 36117", business_rating: 4.7, geocode: { name: "Montgomery", admin1_region: "AL", country_code: "US" } },
          tags: [{ name: "Barber Shop", tag_id: "urn:tag:category:place:barber_shop" }],
          popularity: 0.71,
        },
      ],
    };
  }

  if (path === "/v2/tags") {
    const q = String(params["filter.query"] || "").toLowerCase();
    const hits = TASTE_TAGS.filter(([n]) => n.toLowerCase().includes(q)).slice(0, 8);
    return { results: { tags: (hits.length ? hits : TASTE_TAGS.slice(0, 5)).map(([name, id]) => ({ name, tag_id: id, type: id.split(":").slice(0, 3).join(":") })) } };
  }

  if (path === "/v2/insights/compare") {
    const chosen = pick(TASTE_TAGS, 12, r);
    return {
      results: {
        tags: chosen.map(([name, id]) => {
          const a = 0.55 + r() * 0.45, b = 0.4 + r() * 0.5;
          return { name, tag_id: id, query: { a: { affinity: Number(a.toFixed(3)) }, b: { affinity: Number(b.toFixed(3)) }, delta: Number((a - b).toFixed(3)) } };
        }),
      },
    };
  }

  if (path === "/v2/insights") {
    const type = String(params["filter.type"] || "");
    const take = Number(params.take || 10);
    if (type === "urn:tag") {
      const chosen = pick(TASTE_TAGS, Math.min(take, TASTE_TAGS.length), r);
      const aff = affinities(chosen.length, r);
      return { results: { tags: chosen.map(([name, id], i) => ({ name, tag_id: id, type: id.split(":").slice(0, 3).join(":"), query: { affinity: aff[i] } })) } };
    }
    const pool: Record<string, string[]> = {
      "urn:entity:artist": ARTISTS, "urn:entity:brand": BRANDS, "urn:entity:place": PLACES, "urn:entity:podcast": PODCASTS,
      "urn:entity:tv_show": SHOWS, "urn:entity:movie": MOVIES, "urn:entity:destination": DESTINATIONS,
    };
    const names = pick(pool[type] || BRANDS, Math.min(take, (pool[type] || BRANDS).length), r);
    const aff = affinities(names.length, r);
    return {
      results: {
        entities: names.map((name, i) => ({
          entity_id: `mock-${type.split(":").pop()}-${hash(name)}`,
          name,
          subtype: type,
          popularity: Number((0.6 + r() * 0.4).toFixed(3)),
          tags: pick(TASTE_TAGS, 3, r).map(([n, id]) => ({ name: n, tag_id: id })),
          properties: type === "urn:entity:place" ? { address: `${100 + Math.floor(r() * 900)} ${["Eastern Blvd", "Atlanta Hwy", "Vaughn Rd", "Zelda Rd", "Dexter Ave"][Math.floor(r() * 5)]}, Montgomery, AL`, business_rating: Number((3.9 + r()).toFixed(1)), price_level: 1 + Math.floor(r() * 3) } : {},
          location: type === "urn:entity:place" ? { lat: 32.36 + r() * 0.05, lon: -86.25 + r() * 0.08 } : undefined,
          query: { affinity: aff[i] },
        })),
      },
    };
  }

  if (path === "/v2/audiences") {
    return { results: { audiences: [{ id: "urn:audience:communities:hip_hop_heads", name: "Hip-Hop Heads" }, { id: "urn:audience:life_stage:parents", name: "Parents" }] } };
  }
  return { results: {} };
}
