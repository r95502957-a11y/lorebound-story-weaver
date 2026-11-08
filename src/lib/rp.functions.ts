import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function runText(instructions: string, input: string, json = false) {
  const { geminiText } = await import("./gemini.server");
  return geminiText(instructions, input, json);
}

function parseJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export const buildCanonSheet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ fandom: z.string().max(300), character: z.string().max(2000), start: z.string().max(1000) }).parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const text = await runText(
        "You are a meticulous canon lore expert for fiction. Be accurate; never invent canon. If the world is original, build a short consistent world bible instead.",
        `Write a compact CANON SHEET (max ~400 words, bullet points) for a roleplay.
Fandom/world: ${data.fandom}
Player character: ${data.character}
Starting point: ${data.start || "a canon-appropriate opening"}
Include: exact timeline position, key characters likely present (personality, speech style, abilities and limits, what they know at this point), relevant world rules/power systems, locations, factions, and things that have NOT happened yet at this point. Also the first line must be a short story title like "TITLE: ...".`,
      );
      const titleMatch = text.match(/TITLE:\s*(.+)/);
      return { canon: text.replace(/TITLE:.*\n?/, "").trim(), title: titleMatch?.[1]?.trim() ?? data.fandom, error: null };
    } catch (e) {
      console.error(e);
      return { canon: "", title: data.fandom, error: "Couldn't prepare canon notes." };
    }
  });

const UpdateIn = z.object({
  context: z.string().max(60000),
  transcript: z.string().max(60000),
  facts: z.array(z.string()).max(400),
});

export const updateLedger = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateIn.parse(d))
  .handler(async ({ data }) => {
    try {
      const text = await runText(
        "You are the continuity engine of a roleplay. Output ONLY valid JSON.",
        `${data.context}

=== LATEST EXCHANGE ===
${data.transcript}

Update continuity. Return JSON:
{
 "newFacts": [{"text": "...", "level": "confirmed"|"inferred"}],  // only NEW important facts from the latest exchange (events, injuries, items, relationship changes, who-knows-what, promises, NPC states). Max 6. Don't repeat existing ledger facts.
 "removeFacts": ["exact text of ledger facts now outdated"],
 "hud": {"location":"","time":"","chapter":"Chapter N","condition":"","nearby":[""],"threads":[""]},  // only what the player character knows
 "checkpoint": "2-4 sentences: where the story stands right now, pending actions, active conflict",
 "chapterComplete": false,  // true ONLY if a meaningful narrative stopping point was just reached
 "chapterTitle": "",
  "chapterSummary": ""  // if complete: events, character development, NPCs, relationships, discoveries, consequences, world state, unresolved threads, next starting point
}`,
        true,
      );
      return { result: JSON.stringify(parseJson(text)), error: null };
    } catch (e) {
      console.error(e);
      return { result: null, error: "update failed" };
    }
  });
