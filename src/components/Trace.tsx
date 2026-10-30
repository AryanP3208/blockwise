"use client";

export type Step =
  | { id: string; tool: string; input: Record<string, unknown>; state: "running" }
  | { id: string; tool: string; input: Record<string, unknown>; state: "done"; ok: boolean; endpoint: string; params: Record<string, unknown>; summary: string; ms: number };

const LABEL: Record<string, string> = {
  resolve_location: "Locate the business",
  taste_profile: "Taste profile",
  recommend: "Recommend",
  compare: "Block vs. city",
  search_tags: "Find tags",
};

function paramString(p: Record<string, unknown>): string {
  return Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
    .join("&");
}

export default function Trace({ steps, notes, running }: { steps: Step[]; notes: string[]; running: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-ink p-4 text-paper">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-paper/70">Data trace · sources and steps</div>
        <div className="text-xs text-paper/60">{steps.filter((s) => s.state === "done").length}/{steps.length} calls{running ? " · working" : ""}</div>
      </div>
      <ol className="grid gap-2">
        {steps.map((s) => (
          <li key={s.id} className="rounded-md bg-paper/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className={`inline-block h-2 w-2 rounded-full ${s.state === "running" ? "animate-pulse bg-amber" : s.ok ? "bg-green-2" : "bg-red-400"}`} />
              <span className="font-bold">{LABEL[s.tool] || s.tool}</span>
              {s.tool === "recommend" && <span className="text-paper/70">· {String(s.input.type)}</span>}
              {s.state === "done" && <span className="ml-auto text-xs text-paper/50">{s.ms} ms</span>}
            </div>
            {s.state === "done" && (
              <>
                <div className="mono mt-1 break-all text-[11px] leading-snug text-paper/60">GET {s.endpoint}?{paramString(s.params)}</div>
                <div className="mt-1 text-xs text-paper/85">{s.summary}</div>
              </>
            )}
            {s.state === "running" && <div className="mono mt-1 text-[11px] text-paper/50">{paramString(s.input)}</div>}
          </li>
        ))}
        {notes.map((n, i) => (
          <li key={`n${i}`} className="px-3 py-1 text-xs italic text-paper/60">{n}</li>
        ))}
      </ol>
    </div>
  );
}
