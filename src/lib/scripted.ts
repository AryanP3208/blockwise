/**
 * Scripted fallback: the same Qloo calls the agent makes, in a fixed order, composed into a
 * playbook with template copy. Used when no language-model key is configured, and as the safety
 * net if the model fails mid-run, so the demo never shows an empty page.
 */
import { runTool } from "@/lib/tools";
import { isMock } from "@/lib/qloo";
import { planRecommendations, retryForEmpty } from "@/lib/planner";
import type { AgentEvent, BusinessInput, Playbook } from "@/lib/agent";

type Ent = { id?: string; name: string; affinity: number; tags?: string[]; address?: string; rating?: number };
type Tag = { id: string; name: string; type: string; affinity: number };

export async function runScripted(input: BusinessInput, emit: (e: AgentEvent) => void): Promise<void> {
  let n = 0;
  const call = async (tool: string, args: Record<string, unknown>) => {
    const id = `s${++n}`;
    emit({ type: "step", id, tool, input: args, state: "running" });
    const t0 = Date.now();
    let r;
    try { r = await runTool(tool, args); } catch { r = { ok: false, endpoint: "", params: {}, data: null, note: "Data service unavailable. Please try again." }; }
    const summary = r.note || (r.ok ? `${tool} ok` : "no results");
    emit({ type: "step", id, tool, input: args, state: "done", ok: r.ok, endpoint: r.endpoint, params: r.params as Record<string, unknown>, summary, ms: Date.now() - t0 });
    return r;
  };

  emit({ type: "note", text: isMock() ? "Demo mode: invented fixture data and template copy; not live Qloo results." : "Qloo-only decision agent: choosing tools from the business type and observed results; copy is templated." });
  const loc = await call("resolve_location", { business_name: input.name, address: input.address, city: input.city });
  if (!loc.ok) { emit({ type: "error", message: loc.note || "Could not resolve the address." }); return; }
  const L = loc.data as { point: string; locality: string; place: Ent | null; source: string; matched_address: string; precision: string };
  const demo = { age: input.age || undefined, gender: input.gender || undefined };

  emit({ type: "note", text: "Decision: resolve the address first, then examine neighborhood taste and compare it with the city." });
  const [prof, cmp] = await Promise.all([
    call("taste_profile", { point: L.point, take: 20, ...demo }),
    call("compare", { point: L.point, locality: L.locality, ...demo }),
  ]);
  const tags = ((prof.data as { tags: Tag[] })?.tags || []);
  const over = (cmp.data as { over_index: Playbook["who"]["over_index"]; under_index: Playbook["who"]["under_index"] })?.over_index || [];
  const under = (cmp.data as { under_index: Playbook["who"]["under_index"] })?.under_index || [];

  const plan = planRecommendations(input.type, tags);
  emit({ type: "note", text: `Decision for ${input.type}: ${plan.map((a) => a.reason).join("; ")}.` });
  const recs = await Promise.all(plan.map((action) => call("recommend", { type: action.type, point: L.point, take: action.type === "artist" ? 20 : 12, ...(action.tags ? { tags: action.tags } : {}), ...(action.type === "place" ? { radius_m: 4000, exclude_entity: L.place?.id } : {}), ...demo })));
  const types = plan.map((a) => a.type);
  const by: Record<string, Ent[]> = {};
  types.forEach((t, i) => { by[t] = ((recs[i].data as { entities: Ent[] })?.entities || []).filter((e) => !L.place || e.name !== L.place!.name); });
  // Retry only empty, tag-steered results; do not silently relax demographics or mask service errors.
  await Promise.all(plan.map(async (action, i) => {
    if (!retryForEmpty(by[action.type].length, !!action.tags?.length, !recs[i].endpoint)) return;
    emit({ type: "note", text: `Decision: ${action.type} returned no matches with the observed tag; retry without that tag while retaining location and demographics.` });
    const retry = await call("recommend", { type: action.type, point: L.point, take: action.type === "artist" ? 20 : 12, ...demo });
    by[action.type] = ((retry.data as { entities: Ent[] })?.entities || []);
  }));

  // Sparse markets may need a wider radius; never present distant results as immediately local.
  let placeRadius = 4000;
  if (!by.place?.length && types.includes("place") && recs[types.indexOf("place")].endpoint) {
    for (const radius of [10000, 25000]) {
      emit({ type: "note", text: `Decision: no nearby places found; expand the place radius to ${radius / 1000} km, keeping the same location and demographics.` });
      const expanded = await call("recommend", { type: "place", point: L.point, take: 12, radius_m: radius, exclude_entity: L.place?.id, ...demo });
      if (!expanded.endpoint) {
        emit({ type: "note", text: "Decision: stop widening because the place service failed; preserve the coverage warning." });
        break;
      }
      placeRadius = radius;
      by.place = ((expanded.data as { entities: Ent[] })?.entities || []).filter((e) => !L.place || e.name !== L.place.name);
      if (by.place.length) break;
    }
  }

  if (!prof.ok && Object.values(by).every((entities) => entities.length === 0)) {
    emit({ type: "error", message: "No taste or recommendation data is available for this address. Please try again later or try another location." });
    return;
  }

  emit({ type: "note", text: "Decision: stop searching and assemble the playbook from returned evidence; missing sections remain empty and coverage is disclosed." });
  const top = (k: string, n: number) => (by[k] || []).slice(0, n);
  const t3 = tags.slice(0, 3).map((t) => t.name).join(", ");
  const days = ["Tuesday", "Thursday", "Saturday"];
  const calendar: Playbook["say"]["calendar"] = [];
  for (let w = 1; w <= 4; w++) {
    const a = top("artist", 20)[(w * 3) % Math.max(1, top("artist", 20).length)];
    const pl = top("place", 6)[w % Math.max(1, top("place", 6).length)];
    const tg = tags[w % Math.max(1, tags.length)];
    calendar.push(
      { week: w, day: days[0], hook: `This week's playlist: ${a?.name || "local favorites"}`, en: `A little inspiration from ${a?.name || "our neighborhood"} this week. What are you listening to in ${input.city.split(",")[0]}?`, es: `Inspiración de ${a?.name || "nuestro barrio"} esta semana. ¿Qué estás escuchando en ${input.city.split(",")[0]}?` },
      { week: w, day: days[1], hook: `${tg?.name || "What this block loves"}`, en: `${tg?.name ? `${tg.name} people, this one's for you.` : "Made for this neighborhood."} Come see us at ${input.address}.`, es: `${tg?.name ? `Para la gente de ${tg.name}.` : "Hecho para este barrio."} Visítanos en ${input.address}.` },
      { week: w, day: days[2], hook: `Neighbors: ${pl?.name || "nearby spots"}`, en: `Getting to know our neighbors${pl?.name ? `, including ${pl.name}` : ""}. What local places do you love?`, es: `Conociendo a nuestros vecinos${pl?.name ? `, como ${pl.name}` : ""}. ¿Qué lugares locales te gustan?` },
    );
  }

  const playbook: Playbook = {
    business: { name: input.name, type: input.type, address: input.address, locality: input.city, point: L.point, qloo_place: L.place ? { name: L.place.name, rating: L.place.rating } : null },
    headline: tags.length ? `Qloo suggests these interests near ${input.address}: ${t3}.` : `Qloo returned limited taste data for ${input.address}.`,
    who: {
      summary: tags.length ? `The strongest tastes around the address are ${t3}. The table shows where the block differs from ${input.city}.` : "No neighborhood taste tags were returned; try another address or demographic filter.",
      tags: tags.map((t) => ({ name: t.name, affinity: t.affinity, type: t.type })),
      over_index: over, under_index: under,
    },
    sound: {
      summary: `A playlist built from the artists with the highest affinity around the address, strongest first.`,
      vibe: tags[0] ? `${tags[0].name} energy, kept at conversation volume` : "Warm and unhurried",
      artists: top("artist", 20).map((a) => ({ name: a.name, affinity: a.affinity })),
    },
    sell: {
      summary: "Ideas to investigate based on modeled affinities; validate demand with customers.",
      ideas: [
        ...top("brand", 3).map((b) => ({ title: `Explore an idea inspired by ${b.name}`, why: `Qloo reports affinity with this entity. Check relevance, availability, and permissions before acting.`, evidence: `brand affinity ${b.affinity.toFixed(2)} near the block` })),
        ...tags.slice(0, 2).map((t) => ({ title: `A ${t.name} angle`, why: `${t.name} is one of the block's top tastes; name a service, a special or a playlist after it.`, evidence: `taste tag affinity ${t.affinity.toFixed(2)}` })),
      ],
    },
    partner: {
      summary: `Places within ${placeRadius / 1000} km and brands associated with the selected location signal; confirm distance and fit before reaching out.`,
      places: top("place", 6).map((p) => ({ name: p.name, address: p.address, affinity: p.affinity, idea: `Cross-promote: a discount for their receipt, a flyer at their counter.` })),
      brands: top("brand", 5).map((b) => ({ name: b.name, affinity: b.affinity, idea: `Ask about local sponsorship or a product tie-in.` })),
    },
    say: {
      summary: "Media affinities to investigate and suggested posts to review before publishing.",
      channels: [
        ...top("podcast", 4).map((c) => ({ name: c.name, kind: "podcast", affinity: c.affinity, idea: "Local ad read or a listener discount code." })),
        ...top("tv_show", 3).map((c) => ({ name: c.name, kind: "tv show", affinity: c.affinity, idea: "Reference it in posts on air nights." })),
      ],
      calendar,
    },
    confidence: {
      data_coverage: tags.length >= 10 && (by.artist || []).length >= 10 && (by.place || []).length > 0 ? "high" : tags.length ? "medium" : "low",
      caveats: [`Location: ${L.matched_address} (${L.source}; ${L.precision}).`, `${isMock() ? "Demo data: all entities and affinity scores are invented fixtures." : "Live Qloo affinities are modeled signals, not verified purchases, customers, or probabilities."} Copy uses templates and should be reviewed before use.`, ...(!by.place?.length ? [`No places were returned within ${placeRadius / 1000} km. Qloo coverage may be limited for this area.`] : []), ...(L.place ? [] : ["No Qloo business matched the verified address; recommendations use the address coordinates."])],
    },
  };
  emit({ type: "playbook", data: playbook });
  emit({ type: "done" });
}
