import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseLooseJson } from "./lore";

async function runText(instructions: string, input: string, json = false) {
  const { geminiText } = await import("./gemini.server");
  return geminiText(instructions, input, json);
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
Include: exact timeline position, key characters likely present (personality, speech style, abilities and limits, what they know at this point), relevant world rules/power systems, locations, factions, and things that have NOT happened yet at this point.
Start your answer with these 4 lines exactly, then the sheet:
TITLE: a short story title
STYLE: the art style of the source for illustrations (e.g. "Naruto anime style, cel shaded" or "dark realistic medieval fantasy painting")
COVER: one sentence describing a cover illustration showing the world, setting, atmosphere and the player character (no text in image)
PLAYER_LOOK: one sentence of the player character's appearance (face, hair, eyes, age, build, outfit, distinguishing marks); canon-accurate if a canon character
WIKI: the subdomain of this fandom's main fandom.com wiki (e.g. "naruto" for naruto.fandom.com, "bokunoheroacademia" for My Hero Academia), or "none" for an original world
PLAYER_CANON: "yes" if the player character is an existing canon character, otherwise "no"`,
      );
      const line = (k: string) => text.match(new RegExp(`^\\s*\\**${k}:?\\**:?\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
      const canon = text.replace(/^\s*\**(TITLE|STYLE|COVER|PLAYER_LOOK|WIKI|PLAYER_CANON):.*\n?/gm, "").trim();
      return {
        canon,
        title: line("TITLE") || data.fandom,
        style: line("STYLE"),
        cover: line("COVER"),
        playerLook: line("PLAYER_LOOK"),
        wiki: /^none$/i.test(line("WIKI")) ? "" : line("WIKI").replace(/["']/g, ""),
        playerCanon: /^\W*yes/i.test(line("PLAYER_CANON")),
        error: null,
      };
    } catch (e) {
      console.error(e);
      return { canon: "", title: data.fandom, style: "", cover: "", playerLook: "", wiki: "", playerCanon: false, error: "Couldn't prepare canon notes." };
    }
  });

const UpdateIn = z.object({
  context: z.string().max(60000),
  transcript: z.string().max(60000),
  facts: z.array(z.string()).max(400),
  cast: z.array(z.string().max(400)).max(200).default([]),
  needLooks: z.array(z.string().max(60)).max(30).default([]),
  opening: z.boolean().default(false),
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
  "chapterSummary": "",  // if complete: events, character development, NPCs, relationships, discoveries, consequences, world state, unresolved threads, next starting point
  "chapterImage": "",  // if complete: one sentence describing a picture of this chapter's central moment (only things that actually happened)
  "newCast": [{"name": "", "look": "", "canon": true}],  // canon = true if an existing character of the source material, false if original  // appearance for each of these speakers with no portrait yet: ${JSON.stringify(data.needLooks)} plus any other important new character who appeared. look = one sentence: face, hair, eyes, age, build, current outfit, distinguishing marks; canon-accurate for canon characters. Use the exact names given.
  "castChanges": [{"name": "", "look": ""}],  // ONLY if an existing cast member's appearance clearly changed in the latest exchange (new outfit, injury, haircut, transformation): full updated look
  "world": {"offscreen": [""], "upcoming": [""]},  // FULL updated lists (max 8 each). offscreen = "Who/faction: what they are doing right now and where it is heading" for important characters, rivals, villains and organisations NOT with the player — advance them for the time that passed, include anything shown in a MEANWHILE cutaway. upcoming = canon events/arcs, new characters, villains and conflicts approaching on the timeline (adjusted for what the player changed), soonest first; drop ones that already happened.
  "seeds": {"new": [{"seen": "", "truth": "", "origin": "", "ordinary": false, "horizon": "mid"}], "updates": [{"id": "S1", "status": "hinted", "hint": ""}]},  // CHEKHOV'S VAULT. new = distinctive details the GM just planted in the latest exchange that are NOT in the vault yet (max 2; skip plain scenery): seen = exactly what the player character noticed; truth = its hidden truth, decided now and kept forever (canon-accurate deep lore in canon worlds, consistent with the canon sheet and vault); origin = when, by whom and why it came to exist, BEFORE and independently of the player character (golden rule: never invent a past just to justify the present; the truth and origin must never be about the player character or exist for their sake); ordinary = true if it is a false lead that is genuinely mundane (truth = its mundane explanation); horizon = "soon" (pays off within a few chapters, rare), "mid" (around 15 chapters) or "long" (50-100 chapters, most big mysteries). updates = ONLY vault seeds the latest exchange touched: status "hinted" + a one-sentence hint if a new clue pointed back to it, "revealed" if its secret was actually uncovered. Use empty arrays when nothing happened. Never put an unrevealed secret into newFacts.
  "scene": {"show": false, "description": "", "place": "", "photo": ""}  // show=true ${data.opening ? "(this is the OPENING scene, so true)" : "ONLY if a new location was entered, the environment changed a lot, a major character entered or a major event/battle happened"}; description = one sentence of what the picture shows, matching time of day, weather and place; never show the player character doing anything they didn't do; place = the canon name of the location if it exists in the source (e.g. "Hokage Residence"), else ""; photo = 2-5 plain words to search a real photo of the scenery (e.g. "misty pine forest dawn")
}

=== CURRENT CAST (name: look) ===
${data.cast.join("\n") || "(none)"}`,
        true,
      );
      return { result: JSON.stringify(parseLooseJson(text)), error: null };
    } catch (e) {
      console.error(e);
      return { result: null, error: "update failed" };
    }
  });
