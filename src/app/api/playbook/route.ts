import { NextRequest } from "next/server";
import { runAgent, type AgentEvent, type BusinessInput } from "@/lib/agent";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Partial<BusinessInput>;
  try {
    body = (await req.json()) as Partial<BusinessInput>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
  const input: BusinessInput = {
    name: String(body.name || "").slice(0, 120),
    type: String(body.type || "other").slice(0, 40),
    address: String(body.address || "").slice(0, 200),
    city: String(body.city || "").slice(0, 120),
    age: body.age ? String(body.age) : undefined,
    gender: body.gender ? String(body.gender) : undefined,
  };
  if (!input.address || !input.city) {
    return new Response(JSON.stringify({ error: "address and city are required" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      const keepalive = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15000);
      try {
        await runAgent(input, send);
      } catch (err) {
        send({ type: "error", message: (err as Error).message || "Agent failed" });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
