/**
 * The Blockwise agent: a tool-use loop. The model decides which Qloo calls to make for the
 * business type, runs independent calls in parallel, and finishes by calling write_playbook
 * with a structured plan whose every number comes from a tool result.
 */
import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions, runTool } from "@/lib/tools";
import { isMock } from "@/lib/qloo";
import { runScripted } from "@/lib/scripted";

export type BusinessInput = {
  name: string;
  type: string;
  address: string;
  city: string;
  age?: string;
  gender?: string;
};

export type AgentEvent =
  | { type: "status"; message: string }
  | { type: "note"; text: string }
  | { type: "step"; id: string; tool: string; input: Record<string, unknown>; state: "running" }
  | { type: "step"; id: string; tool: string; input: Record<string, unknown>; state: "done"; ok: boolean; endpoint: string; params: Record<string, unknown>; summary: string; ms: number }
  | { type: "playbook"; data: Playbook }
  | { type: "error"; message: string }
  | { type: "done" };

export type Playbook = {
  business: { name: string; type: string; address: string; locality: string; point: string; qloo_place?: { name: string; rating?: number } | null };
  headline: string;
  who: {
    summary: string;
    tags: { name: string; affinity: number; type?: string }[];
    over_index: { name: string; block: number; city: number | null; delta: number | null }[];
    under_index: { name: string; block: number; city: number | null; delta: number | null }[];
  };
  sound: { summary: string; vibe: string; artists: { name: string; affinity: number; note?: string }[] };
  sell: { summary: string; ideas: { title: string; why: string; evidence: string }[] };
  partner: { summary: string; places: { name: string; address?: string; affinity: number; idea: string }[]; brands: { name: string; affinity: number; idea: string }[] };
  say: { summary: string; channels: { name: string; kind: string; affinity: number; idea: string }[]; calendar: { week: number; day: string; hook: string; en: string; es: string }[] };
  confidence: { data_coverage: "high" | "medium" | "low"; caveats: string[] };
};

const writePlaybookTool = {
  name: "write_playbook",
  description: "Finish: write the playbook for the owner. Every affinity number must come from a tool result in this conversation; never invent entities or scores. Spanish copy is natural Latin American Spanish, not a word-for-word translation.",
  input_schema: {
    type: "object",
    properties: {
      business: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, address: { type: "string" }, locality: { type: "string" }, point: { type: "string" }, qloo_place: { type: ["object", "null"], properties: { name: { type: "string" }, rating: { type: "number" } } } }, required: ["name", "type", "address", "locality", "point"] },
      headline: { type: "string", description: "One sentence: what this block loves, in plain words" },
      who: { type: "object", properties: {
        summary: { type: "string" },
        tags: { type: "array", items: { type: "object", properties: { name: { type: "string" }, affinity: { type: "number" }, type: { type: "string" } }, required: ["name", "affinity"] } },
        over_index: { type: "array", items: { type: "object", properties: { name: { type: "string" }, block: { type: "number" }, city: { type: ["number", "null"] }, delta: { type: ["number", "null"] } }, required: ["name", "block"] } },
        under_index: { type: "array", items: { type: "object", properties: { name: { type: "string" }, block: { type: "number" }, city: { type: ["number", "null"] }, delta: { type: ["number", "null"] } }, required: ["name", "block"] } },
      }, required: ["summary", "tags", "over_index", "under_index"] },
      sound: { type: "object", properties: { summary: { type: "string" }, vibe: { type: "string", description: "How the room should feel, one phrase" }, artists: { type: "array", items: { type: "object", properties: { name: { type: "string" }, affinity: { type: "number" }, note: { type: "string" } }, required: ["name", "affinity"] } } }, required: ["summary", "vibe", "artists"] },
      sell: { type: "object", properties: { summary: { type: "string" }, ideas: { type: "array", items: { type: "object", properties: { title: { type: "string" }, why: { type: "string" }, evidence: { type: "string", description: "The tool result that supports it, with the number" } }, required: ["title", "why", "evidence"] } } }, required: ["summary", "ideas"] },
      partner: { type: "object", properties: { summary: { type: "string" }, places: { type: "array", items: { type: "object", properties: { name: { type: "string" }, address: { type: "string" }, affinity: { type: "number" }, idea: { type: "string" } }, required: ["name", "affinity", "idea"] } }, brands: { type: "array", items: { type: "object", properties: { name: { type: "string" }, affinity: { type: "number" }, idea: { type: "string" } }, required: ["name", "affinity", "idea"] } } }, required: ["summary", "places", "brands"] },
      say: { type: "object", properties: { summary: { type: "string" }, channels: { type: "array", items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string" }, affinity: { type: "number" }, idea: { type: "string" } }, required: ["name", "kind", "affinity", "idea"] } }, calendar: { type: "array", description: "12 posts: 3 per week for 4 weeks", items: { type: "object", properties: { week: { type: "integer" }, day: { type: "string" }, hook: { type: "string" }, en: { type: "string" }, es: { type: "string" } }, required: ["week", "day", "hook", "en", "es"] } } }, required: ["summary", "channels", "calendar"] },
      confidence: { type: "object", properties: { data_coverage: { type: "string", enum: ["high", "medium", "low"] }, caveats: { type: "array", items: { type: "string" } } }, required: ["data_coverage", "caveats"] },
    },
    required: ["business", "headline", "who", "sound", "sell", "partner", "say", "confidence"],
  },
};

const SYSTEM = `You are Blockwise, an agent that turns Qloo's taste graph into a playbook a local business owner can act on this week.

You have tools over the Qloo API. Use them; do not rely on general knowledge for what people in a place like. Every entity and number in the playbook must come from a tool result. If Qloo returns nothing for a call, retry once with the locality instead of the point (or without tag signals), then move on and say so in the caveats.

Plan of calls (keep the total under 10, and put independent calls in the SAME turn so they run in parallel):
1. resolve_location.
2. In one turn: taste_profile(point) and compare(point, locality).
3. In one turn, the type-specific set:
   - barbershop or salon: recommend artist (take 20), recommend brand (take 12), recommend place (radius 3000, exclude the business), recommend podcast, recommend tv_show.
   - restaurant, cafe or bar: taste_profile(point, tag_types ["urn:tag:genre:restaurant"]) if the first profile lacked cuisines, recommend place (radius 4000, exclude self), recommend artist, recommend brand, recommend podcast.
   - grocery, convenience or market: recommend brand (take 16), recommend place, recommend artist, recommend podcast, recommend tv_show.
   - retail or boutique: recommend brand (take 16), recommend artist, recommend tv_show, recommend place.
   - gym or fitness: recommend brand, recommend artist, recommend podcast, recommend place.
   - venue or event space: recommend artist (take 24), recommend podcast, recommend place, recommend brand (sponsors).
   - anything else: artist, brand, place, podcast.
   Pass age and gender signals when the owner gave them.
4. write_playbook.

Writing rules:
- Plain words an owner reads in two minutes. No marketing fluff, no emojis.
- "who": top tags with their affinities; over_index and under_index straight from compare.
- "sound": a 12 to 20 artist playlist from the artist results, highest affinity first; vibe in one phrase.
- "sell": 4 to 6 concrete ideas (products, services, menu items, bundles) each tied to a tag, brand or artist result with its affinity in the evidence field.
- "partner": 4 to 6 nearby places (never the business itself) and 3 to 5 brands, each with a specific cross-promotion idea.
- "say": channels = podcasts and shows with affinity and how to use them (sponsor, guest, reference); calendar = 12 posts, 3 per week for 4 weeks, each with a hook, an English caption and a Spanish caption written natively.
- "confidence": data_coverage high when the block-level calls returned rich results, medium when you fell back to the locality, low when most calls were empty; list caveats honestly.
- Never claim the business offers something you were not told. Never invent addresses.`;

function summarize(tool: string, data: unknown, ok: boolean, note?: string): string {
  if (!ok) return note || "no results";
  const d = data as Record<string, unknown>;
  if (tool === "resolve_location" && note) return note;
  if (tool === "resolve_location") return `${(d.place as { name?: string } | null)?.name ? `matched "${(d.place as { name: string }).name}"` : "geocoded"} → ${d.point}`;
  if (tool === "taste_profile") { const t = d.tags as { name: string; affinity: number }[]; return `${t.length} tags · top: ${t.slice(0, 4).map((x) => `${x.name} ${x.affinity}`).join(", ")}`; }
  if (tool === "recommend") { const e = d.entities as { name: string; affinity: number }[]; return `${e.length} ${d.type as string}s · top: ${e.slice(0, 3).map((x) => `${x.name} ${x.affinity}`).join(", ")}`; }
  if (tool === "compare") { const o = d.over_index as { name: string; delta: number }[]; return `over-indexes: ${o.slice(0, 4).map((x) => `${x.name} +${x.delta}`).join(", ")}`; }
  if (tool === "search_tags") { const t = d.tags as { name: string }[]; return `${t.length} tags: ${t.slice(0, 5).map((x) => x.name).join(", ")}`; }
  return "ok";
}

export async function runAgent(input: BusinessInput, emit: (e: AgentEvent) => void): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return runScripted(input, emit);
  const client = new Anthropic();
  const model = process.env.LLM_MODEL || "claude-sonnet-5-5";
  emit({ type: "status", message: isMock() ? "Running on offline fixtures (no QLOO_API_KEY set)" : "Reading the block through Qloo" });

  const user = `Business: ${input.name || "(unnamed)"}\nType: ${input.type}\nAddress: ${input.address}\nCity: ${input.city}\n${input.age ? `Target age: ${input.age}\n` : ""}${input.gender ? `Target gender: ${input.gender}\n` : ""}Build the playbook.`;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
  const tools = [...toolDefinitions, writePlaybookTool] as Anthropic.Tool[];

  for (let turn = 0; turn < 10; turn++) {
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({ model, max_tokens: 8000, system: SYSTEM, tools, messages });
    } catch (err) {
      emit({ type: "note", text: `Language model error (${(err as Error).message.slice(0, 120)}); finishing with the scripted sequence.` });
      return runScripted(input, emit);
    }
    messages.push({ role: "assistant", content: res.content });
    for (const block of res.content) if (block.type === "text" && block.text.trim()) emit({ type: "note", text: block.text.trim() });
    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length) {
      messages.push({ role: "user", content: "Call write_playbook now with what you have." });
      continue;
    }
    const final = uses.find((u) => u.name === "write_playbook");
    if (final) {
      emit({ type: "playbook", data: final.input as Playbook });
      emit({ type: "done" });
      return;
    }
    const results = await Promise.all(
      uses.map(async (u) => {
        const inputObj = u.input as Record<string, unknown>;
        emit({ type: "step", id: u.id, tool: u.name, input: inputObj, state: "running" });
        const t0 = Date.now();
        let r;
        try {
          r = await runTool(u.name, inputObj);
        } catch (err) {
          r = { ok: false, endpoint: "", params: {}, data: null, note: (err as Error).message };
        }
        emit({ type: "step", id: u.id, tool: u.name, input: inputObj, state: "done", ok: r.ok, endpoint: r.endpoint, params: r.params as Record<string, unknown>, summary: summarize(u.name, r.data, r.ok, r.note), ms: Date.now() - t0 });
        return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(r.ok ? r.data : { error: r.note, data: r.data }) };
      }),
    );
    messages.push({ role: "user", content: results });
  }
  emit({ type: "error", message: "The agent ran out of turns before writing the playbook." });
}
