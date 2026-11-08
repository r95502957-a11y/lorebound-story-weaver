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
        const { geminiStream } = await import("@/lib/gemini.server");
        const { instructions, messages } = parsed.data;
        const turns = messages
          .filter((m) => m.text.trim())
          .map((m) => ({ role: m.role === "user" ? ("user" as const) : ("model" as const), text: m.text }));
        if (turns.length === 0 || turns[0]?.role !== "user")
          turns.unshift({ role: "user", text: "Begin the story with the opening scene." });
        try {
          const stream = await geminiStream(instructions, turns);
          const enc = new TextEncoder();
          const body = new ReadableStream({
            async start(controller) {
              try {
                for await (const d of stream) controller.enqueue(enc.encode(d));
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
          const status = (err as { status?: number }).status ?? 500;
          return new Response(
            status === 429
              ? "Gemini's free limit is reached for now. Wait a minute and retry."
              : "The Game Master couldn't respond.",
            { status },
          );
        }
      },
    },
  },
});
