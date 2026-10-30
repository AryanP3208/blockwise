"use client";

import { useState } from "react";
import type { Playbook } from "@/lib/agent";
import type { Step } from "@/components/Trace";

function Bar({ v }: { v: number }) {
  return <div className="bar w-20 flex-none sm:w-28"><i style={{ width: `${Math.max(4, Math.min(100, v * 100))}%` }} /></div>;
}

function Section({ id, kicker, title, summary, children }: { id: string; kicker: string; title: string; summary: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <div className="text-xs font-bold uppercase tracking-[0.22em] text-green">{kicker}</div>
      <h2 className="display mt-1 text-4xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-ink-2">{summary}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function toText(p: Playbook): string {
  const L: string[] = [];
  L.push(`${p.business.name} — ${p.business.type} — ${p.business.address}, ${p.business.locality}`, "", p.headline, "", "WHO'S HERE", p.who.summary);
  p.who.tags.forEach((t) => L.push(`  ${t.name}: ${t.affinity}`));
  L.push("", "SOUND", p.sound.summary, `Vibe: ${p.sound.vibe}`);
  p.sound.artists.forEach((a) => L.push(`  ${a.name} (${a.affinity})${a.note ? ` — ${a.note}` : ""}`));
  L.push("", "SELL", p.sell.summary);
  p.sell.ideas.forEach((i) => L.push(`  • ${i.title}: ${i.why} [${i.evidence}]`));
  L.push("", "PARTNER", p.partner.summary);
  p.partner.places.forEach((x) => L.push(`  ${x.name}${x.address ? `, ${x.address}` : ""} (${x.affinity}): ${x.idea}`));
  p.partner.brands.forEach((x) => L.push(`  ${x.name} (${x.affinity}): ${x.idea}`));
  L.push("", "SAY", p.say.summary);
  p.say.channels.forEach((c) => L.push(`  ${c.name} [${c.kind}] (${c.affinity}): ${c.idea}`));
  p.say.calendar.forEach((c) => L.push(`  Week ${c.week} ${c.day} — ${c.hook}\n    EN: ${c.en}\n    ES: ${c.es}`));
  L.push("", `Data coverage: ${p.confidence.data_coverage}`, ...p.confidence.caveats.map((c) => `  - ${c}`));
  return L.join("\n");
}

export default function PlaybookView({ playbook: p, steps }: { playbook: Playbook; steps: Step[] }) {
  const [copied, setCopied] = useState(false);
  const calls = steps.filter((s) => s.state === "done" && s.ok && s.tool !== "resolve_location").length;

  async function copy() {
    try { await navigator.clipboard.writeText(toText(p)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard refused */ }
  }

  return (
    <article className="mt-12 rounded-2xl border border-line bg-card p-6 sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-green">Playbook</div>
          <h2 className="display mt-1 text-4xl sm:text-5xl">{p.business.name || "Your business"}</h2>
          <div className="mt-2 text-sm text-ink-2">{p.business.type} · {p.business.address}, {p.business.locality}{p.business.qloo_place?.rating ? ` · ${p.business.qloo_place.rating}★ on Qloo` : ""}</div>
        </div>
        <div className="no-print flex gap-2">
          <button onClick={copy} className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-green">{copied ? "Copied" : "Copy as text"}</button>
          <button onClick={() => window.print()} className="rounded-md bg-green px-3 py-2 text-sm font-semibold text-paper hover:bg-green-2">Save as PDF</button>
        </div>
      </div>

      {p.confidence.caveats.some((c) => c.startsWith("Demo data:")) && <div className="mt-6 rounded-md border border-amber/40 bg-amber/10 p-3 text-sm font-bold">Demo mode: invented data, not live Qloo results.</div>}
      <p className="display mt-8 max-w-3xl text-3xl leading-tight">{p.headline}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${p.confidence.data_coverage === "high" ? "bg-green-soft text-green" : "bg-amber/15 text-amber"}`}>Data coverage: {p.confidence.data_coverage}</span>
        <span className="rounded-full bg-paper-2 px-2.5 py-1 font-semibold text-ink-2">{calls} successful data steps</span>
      </div>

      <nav className="no-print mt-6 flex flex-wrap gap-3 text-sm font-semibold">
        {[["who", "Who's here"], ["sound", "Sound"], ["sell", "Sell"], ["partner", "Partner"], ["say", "Say"]].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="text-green underline-offset-4 hover:underline">{l}</a>
        ))}
      </nav>

      <Section id="who" kicker="Who's here" title="The block's taste" summary={p.who.summary}>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Top tastes around the address</div>
            <ul className="grid gap-2">
              {p.who.tags.slice(0, 12).map((t) => (
                <li key={t.name} className="flex items-center gap-3 text-sm"><span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span><Bar v={t.affinity} /><span className="mono text-xs text-ink-2">{t.affinity.toFixed(2)}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Different from the rest of the city</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-2"><th className="py-1 font-semibold">Taste</th><th className="py-1 font-semibold">Block</th><th className="py-1 font-semibold">City</th><th className="py-1 font-semibold">Δ</th></tr></thead>
              <tbody>
                {p.who.over_index.slice(0, 7).map((r) => (
                  <tr key={r.name} className="border-t border-line"><td className="py-1.5 font-semibold">{r.name}</td><td className="mono py-1.5 text-xs">{r.block.toFixed(2)}</td><td className="mono py-1.5 text-xs">{r.city?.toFixed(2) ?? "–"}</td><td className="mono py-1.5 text-xs text-green">{r.delta !== null ? `+${r.delta.toFixed(2)}` : "–"}</td></tr>
                ))}
                {p.who.under_index.slice(0, 3).map((r) => (
                  <tr key={r.name} className="border-t border-line text-ink-2"><td className="py-1.5">{r.name}</td><td className="mono py-1.5 text-xs">{r.block.toFixed(2)}</td><td className="mono py-1.5 text-xs">{r.city?.toFixed(2) ?? "–"}</td><td className="mono py-1.5 text-xs">{r.delta !== null ? r.delta.toFixed(2) : "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="sound" kicker="Sound" title="The playlist" summary={p.sound.summary}>
        <div className="mb-3 text-sm"><span className="font-semibold">Vibe:</span> {p.sound.vibe}</div>
        <ol className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {p.sound.artists.map((a, i) => (
            <li key={a.name} className="flex items-center gap-3 text-sm"><span className="mono w-5 text-xs text-ink-2">{i + 1}</span><span className="min-w-0 flex-1 truncate font-semibold">{a.name}</span><Bar v={a.affinity} /><span className="mono text-xs text-ink-2">{a.affinity.toFixed(2)}</span></li>
          ))}
        </ol>
      </Section>

      <Section id="sell" kicker="Sell" title="Ideas to investigate" summary={p.sell.summary}>
        <div className="grid gap-3 md:grid-cols-2">
          {p.sell.ideas.map((i) => (
            <div key={i.title} className="rounded-lg border border-line bg-paper p-4">
              <div className="font-bold">{i.title}</div>
              <p className="mt-1 text-sm text-ink-2">{i.why}</p>
              <div className="mono mt-2 text-[11px] text-green">{i.evidence}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="partner" kicker="Partner" title="Who to team up with" summary={p.partner.summary}>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Places nearby</div>
            {p.partner.places.length === 0 && <p className="text-sm text-ink-2">No places were returned in the searched area. Check the coverage note below or try another location.</p>}
            <ul className="grid gap-3">
              {p.partner.places.map((x) => (
                <li key={x.name} className="text-sm"><div className="flex items-center gap-2"><span className="font-bold">{x.name}</span><span className="mono text-xs text-ink-2">{x.affinity.toFixed(2)}</span></div>{x.address && <div className="text-xs text-ink-2">{x.address}</div>}<div className="mt-0.5">{x.idea}</div></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Brands this block likes</div>
            <ul className="grid gap-3">
              {p.partner.brands.map((x) => (
                <li key={x.name} className="text-sm"><div className="flex items-center gap-2"><span className="font-bold">{x.name}</span><span className="mono text-xs text-ink-2">{x.affinity.toFixed(2)}</span></div><div className="mt-0.5">{x.idea}</div></li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="say" kicker="Say" title="Where to be heard, and what to post" summary={p.say.summary}>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Media affinities to investigate</div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {p.say.channels.map((c) => (
            <li key={c.name} className="rounded-lg border border-line bg-paper px-3 py-2 text-sm"><div className="flex items-center gap-2"><span className="font-bold">{c.name}</span><span className="rounded bg-paper-2 px-1.5 text-[10px] font-bold uppercase text-ink-2">{c.kind}</span><span className="mono ml-auto text-xs text-ink-2">{c.affinity.toFixed(2)}</span></div><div className="mt-0.5 text-ink-2">{c.idea}</div></li>
          ))}
        </ul>
        <div className="mb-2 mt-8 text-xs font-bold uppercase tracking-wider text-ink-2">30-day content calendar · English and Spanish</div>
        <div className="grid gap-3">
          {p.say.calendar.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line bg-paper p-4 md:grid-cols-[120px_1fr_1fr]">
              <div><div className="text-xs font-bold uppercase tracking-wider text-green">Week {c.week} · {c.day}</div><div className="mt-1 text-sm font-semibold">{c.hook}</div></div>
              <div className="text-sm"><div className="mb-1 text-[10px] font-bold uppercase text-ink-2">EN</div>{c.en}</div>
              <div className="text-sm"><div className="mb-1 text-[10px] font-bold uppercase text-ink-2">ES</div>{c.es}</div>
            </div>
          ))}
        </div>
      </Section>

      <section className="mt-12 rounded-lg bg-paper-2 p-4 text-sm">
        <div className="font-bold">How much to trust this</div>
        <ul className="mt-1 list-disc pl-5 text-ink-2">{p.confidence.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </section>
    </article>
  );
}
