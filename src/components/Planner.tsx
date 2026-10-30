"use client";

import { useRef, useState } from "react";
import type { AgentEvent, Playbook } from "@/lib/agent";
import PlaybookView from "@/components/Playbook";
import Trace, { type Step } from "@/components/Trace";

const TYPES = [
  ["barbershop", "Barbershop"], ["salon", "Salon"], ["restaurant", "Restaurant"], ["cafe", "Cafe"], ["bar", "Bar"],
  ["grocery", "Grocery / market"], ["convenience", "Convenience store"], ["retail", "Retail / boutique"], ["gym", "Gym / fitness"],
  ["venue", "Venue / event space"], ["other", "Other"],
];
const AGES = [["", "Any age"], ["24_and_younger", "24 and younger"], ["25_to_29", "25 to 29"], ["30_to_34", "30 to 34"], ["35_to_44", "35 to 44"], ["45_to_54", "45 to 54"], ["55_and_older", "55 and older"]];

const EXAMPLES = [
  { name: "Eleganza Family Haircuts", type: "barbershop", address: "141 Eastern Blvd", city: "Montgomery, AL", age: "", gender: "" },
  { name: "busyANT Super Market", type: "grocery", address: "617 S Palmer Ave", city: "Georgiana, AL", age: "", gender: "" },
  { name: "Terminal West", type: "venue", address: "887 W Marietta St NW", city: "Atlanta, GA", age: "24_and_younger", gender: "" },
];

type Form = (typeof EXAMPLES)[number];

export default function Planner() {
  const [form, setForm] = useState<Form>(EXAMPLES[0]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [notes, setNotes] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [error, setError] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (running) return;
    setRunning(true); setError(""); setPlaybook(null); setSteps([]); setNotes([]); setStatus("Starting the agent");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/playbook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const t = await res.text();
        throw new Error(t.slice(0, 300) || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as AgentEvent;
          handle(ev);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function handle(ev: AgentEvent) {
    if (ev.type === "status") setStatus(ev.message);
    else if (ev.type === "note") setNotes((n) => [...n, ev.text]);
    else if (ev.type === "step") {
      setSteps((s) => {
        const i = s.findIndex((x) => x.id === ev.id);
        const next: Step = ev.state === "running"
          ? { id: ev.id, tool: ev.tool, input: ev.input, state: "running" }
          : { id: ev.id, tool: ev.tool, input: ev.input, state: "done", ok: ev.ok, endpoint: ev.endpoint, params: ev.params, summary: ev.summary, ms: ev.ms };
        if (i === -1) return [...s, next];
        const copy = [...s]; copy[i] = next; return copy;
      });
    } else if (ev.type === "playbook") {
      setPlaybook(ev.data);
      setStatus("Playbook ready");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else if (ev.type === "error") setError(ev.message);
    else if (ev.type === "done") setStatus("Done");
  }

  function stop() { abortRef.current?.abort(); setRunning(false); setStatus("Stopped"); }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-md bg-green text-paper font-extrabold">B</span>
          <div>
            <div className="text-lg font-extrabold tracking-tight">Blockwise</div>
            <div className="text-xs text-ink-2">An agent with taste, powered by Qloo</div>
          </div>
        </div>
        <a className="text-sm font-semibold text-green underline-offset-4 hover:underline" href="https://github.com/AryanP3208/blockwise" target="_blank" rel="noreferrer">Source</a>
      </header>

      <section className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <div>
          <h1 className="display text-5xl sm:text-6xl">What does your block actually love?</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Give the agent an address. It reads the neighborhood&apos;s taste through Qloo&apos;s graph of 250M+ entities, compares it to the rest of the city,
            and writes a playbook: the playlist, what to sell, who to partner with, where to advertise, and a month of posts in English and Spanish.
            Recommendations are hypotheses to validate with customers.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex.name} type="button" onClick={() => setForm(ex)} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-green">
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={run} className="rounded-xl border border-line bg-card p-5 shadow-sm">
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Business name
              <input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 font-normal" placeholder="Eleganza Family Haircuts" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Address
                <input id="address" required value={form.address} onChange={(e) => set("address", e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 font-normal" placeholder="141 Eastern Blvd" />
              </label>
              <label className="grid gap-1 text-sm font-semibold">City, state
                <input id="city" required value={form.city} onChange={(e) => set("city", e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 font-normal" placeholder="Montgomery, AL" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-semibold">Type
                <select id="type" value={form.type} onChange={(e) => set("type", e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 font-normal">
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">Customers&apos; age
                <select id="age" value={form.age} onChange={(e) => set("age", e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 font-normal">
                  {AGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">Gender
                <select id="gender" value={form.gender} onChange={(e) => set("gender", e.target.value)} className="rounded-md border border-line bg-paper px-3 py-2 font-normal">
                  <option value="">Any</option><option value="female">Women</option><option value="male">Men</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={running} className="rounded-md bg-green px-5 py-2.5 font-bold text-paper hover:bg-green-2 disabled:opacity-60">
                {running ? "Reading the block…" : "Read the block"}
              </button>
              {running && <button type="button" onClick={stop} className="text-sm font-semibold text-ink-2 hover:text-ink">Stop</button>}
              <span className="ml-auto text-xs text-ink-2">{status}</span>
            </div>
          </div>
        </form>
      </section>

      {(steps.length > 0 || notes.length > 0 || error) && (
        <section className="mt-10 no-print">
          <Trace steps={steps} notes={notes} running={running} />
          {error && <p className="mt-3 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm">{error}</p>}
        </section>
      )}

      <div ref={resultRef}>{playbook && <PlaybookView playbook={playbook} steps={steps} />}</div>

      <footer className="mt-20 border-t border-line pt-6 text-xs text-ink-2">
        Built for the Qloo Agentic Hackathon. Live taste data from Qloo when a key is configured; otherwise the app uses demo fixtures.
      </footer>
    </main>
  );
}
