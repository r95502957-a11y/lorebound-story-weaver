import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  instructions: z.string().max(80000),
  messages: z
    .array(z.object({ role: z.enum(["user", "gm"]), text: z.string().max(20000) }))
    .max(80),
});

export const Route = createFileRoute("/api/gm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const { streamResponse } = await import("@lovable.dev/ai-gateway");
        const { instructions, messages } = parsed.data;
        const input = messages.map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));
        if (input.length === 0) input.push({ role: "user", content: "Begin the story with the opening scene." });
        try {
          const stream = await streamResponse({ model: "openai/gpt-6-astra", instructions, input });
          const enc = new TextEncoder();
          const body = new ReadableStream({
            async start(controller) {
              try {
                for await (const ev of stream) {
                  const e = ev as { type?: string; delta?: unknown };
                  if (e.type === "response.output_text.delta" && typeof e.delta === "string")
                    controller.enqueue(enc.encode(e.delta));
                }
              } catch (err) {
                console.error(err);
                controller.enqueue(enc.encode("\n\n*(The story was interrupted. Try regenerating.)*"));
              }
              controller.close();
            },
          });
          return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
        } catch (err) {
          console.error(err);
          const status = (err as { httpStatus?: number }).httpStatus ?? 500;
          return new Response(status === 402 ? "Out of AI credits." : status === 429 ? "Too many requests, wait a moment." : "The Game Master couldn't respond.", { status });
        }
      },
    },
  },
});
