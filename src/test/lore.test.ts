import { describe, expect, it } from "vitest";
import { mergeSeeds, parseLooseJson, vaultForGm, type LoreSeed } from "@/lib/lore";

const sword: LoreSeed = {
  id: "S1",
  seen: "A chipped black blade half-buried at the shrine",
  truth: "The broken sword of King Valerius",
  status: "dormant",
  plantedChapter: 1,
  plantedAt: 4,
  hints: [],
};

describe("Chekhov's vault", () => {
  it("plants a new seed with the next id, as dormant, in the current chapter", () => {
    const out = mergeSeeds([sword], { new: [{ seen: "A copper key with a raven crest", truth: "Opens the House of Raven vault" }] }, { chapter: 3, messages: 40 });
    expect(out[1]).toMatchObject({ id: "S2", status: "dormant", plantedChapter: 3, plantedAt: 40 });
  });

  it("ignores seeds without a secret truth and duplicates of an existing seed", () => {
    const out = mergeSeeds([sword], { new: [{ seen: "a strange rock", truth: "" }, { seen: "A chipped black blade, half-buried at the shrine!", truth: "x" }] }, { chapter: 2, messages: 10 });
    expect(out).toHaveLength(1);
  });

  it("records a hint and moves a seed forward, never backwards", () => {
    const hinted = mergeSeeds([sword], { updates: [{ id: "S1", status: "hinted", hint: "An old smith flinches at the lion runes" }] }, { chapter: 15, messages: 300 });
    expect(hinted[0]).toMatchObject({ status: "hinted", hints: ["An old smith flinches at the lion runes"] });
    const back = mergeSeeds(hinted, { updates: [{ id: "S1", status: "dormant" }] }, { chapter: 16, messages: 310 });
    expect(back[0]!.status).toBe("hinted");
  });

  it("marks the chapter a seed was revealed in", () => {
    const out = mergeSeeds([sword], { updates: [{ id: "s1", status: "revealed" }] }, { chapter: 40, messages: 900 });
    expect(out[0]).toMatchObject({ status: "revealed", revealedChapter: 40 });
  });

  it("gives the GM each open seed's secret and how long ago it was planted", () => {
    expect(vaultForGm([sword], 404)).toContain("[S1 · dormant · planted ch.1, 400 messages ago] SEEN: A chipped black blade half-buried at the shrine | SECRET: The broken sword of King Valerius");
  });
});

describe("continuity JSON", () => {
  it("survives code fences, comments and trailing commas", () => {
    const text = '```json\n{\n "checkpoint": "At the gate // not a comment", // note\n "newFacts": [ {"text": "a"}, ],\n}\n```';
    expect(parseLooseJson(text)).toEqual({ checkpoint: "At the gate // not a comment", newFacts: [{ text: "a" }] });
  });
});
