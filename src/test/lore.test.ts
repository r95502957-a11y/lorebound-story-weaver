import { describe, expect, it } from "vitest";
import { auditSeeds, mergeSeeds, parseLooseJson, payoffChapter, vaultForGm, type LoreSeed } from "@/lib/lore";

const sword: LoreSeed = {
  id: "S1",
  seen: "A chipped black blade half-buried at the shrine",
  truth: "The broken sword of King Valerius",
  origin: "Shattered in the Sunken War 300 years ago",
  horizon: "long",
  payoffAfter: 80,
  status: "dormant",
  plantedChapter: 1,
  plantedAt: 4,
  hints: [],
};
const key = { seen: "A copper key with a raven crest", truth: "Opens the House of Raven vault", origin: "Forged before the Raven purge 30 years ago" };

describe("Chekhov's vault", () => {
  it("plants a new seed with the next id, as dormant, in the current chapter", () => {
    const out = mergeSeeds([sword], { new: [{ ...key, horizon: "mid" }] }, { chapter: 3, messages: 40 });
    expect(out[1]).toMatchObject({ id: "S2", status: "dormant", plantedChapter: 3, plantedAt: 40 });
  });

  it("ignores seeds without a secret truth and duplicates of an existing seed", () => {
    const out = mergeSeeds([sword], { new: [{ seen: "a strange rock", truth: "", origin: "x" }, { seen: "A chipped black blade, half-buried at the shrine!", truth: "x", origin: "x" }] }, { chapter: 2, messages: 10 });
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

  it("tells the GM each open seed's secret, its own past and when it may pay off", () => {
    const text = vaultForGm([sword], 404, 2);
    expect(text).toContain("NOT before ch.80");
    expect(text).toContain("SECRET: The broken sword of King Valerius | ITS OWN PAST: Shattered in the Sunken War 300 years ago");
  });
});

describe("payoff scheduling", () => {
  it("soon pays off 3 chapters later, mid 15, long between 50 and 100", () => {
    expect(payoffChapter("soon", 4, 1)).toBe(7);
    expect(payoffChapter("mid", 4, 1)).toBe(19);
    for (let n = 1; n < 200; n++) {
      const c = payoffChapter("long", 4, n) - 4;
      expect(c).toBeGreaterThanOrEqual(50);
      expect(c).toBeLessThanOrEqual(100);
    }
  });

  it("allows only 2 quick mysteries open at once; extra ones are pushed further out", () => {
    let v: LoreSeed[] = [];
    for (const i of [1, 2, 3]) v = mergeSeeds(v, { new: [{ seen: `clue ${i}`, truth: `t${i}`, origin: `o${i}`, horizon: "soon" }] }, { chapter: 1, messages: i });
    expect(v.map((s) => s.horizon)).toEqual(["soon", "soon", "mid"]);
  });
});

describe("false leads", () => {
  it("keeps genuinely ordinary details out of the mystery schedule", () => {
    const v = mergeSeeds([], { new: [{ seen: "A scorched kettle", truth: "Burnt by a careless cook", ordinary: true }] }, { chapter: 1, messages: 1 });
    expect(v[0]).toMatchObject({ ordinary: true, payoffAfter: undefined });
    expect(auditSeeds(v, 99).overdue).toHaveLength(0);
  });
});

describe("golden rule: the past exists without the protagonist", () => {
  it("rejects a real secret with no independent past", () => {
    expect(mergeSeeds([], { new: [{ seen: key.seen, truth: key.truth }] }, { chapter: 1, messages: 1 })).toHaveLength(0);
  });

  it("rejects a secret invented around the protagonist", () => {
    const v = mergeSeeds([], { new: [{ ...key, truth: "Left here so Ren would find it" }] }, { chapter: 1, messages: 1, player: "Ren Ashura" });
    expect(v).toHaveLength(0);
  });
});

describe("chapter audit", () => {
  it("flags overdue, ripe, developing and long-untouched mysteries", () => {
    const quick = { ...sword, id: "S2", payoffAfter: 5 };
    const ripe = { ...sword, id: "S3", payoffAfter: 18 };
    const dev = { ...sword, id: "S4", status: "hinted" as const, lastChapter: 19 };
    const a = auditSeeds([quick, ripe, dev, sword], 20);
    expect(a.overdue.map((s) => s.id)).toEqual(["S2"]);
    expect(a.ripe.map((s) => s.id)).toEqual(["S3"]);
    expect(a.developing.map((s) => s.id)).toEqual(["S4"]);
    expect(a.forgotten.map((s) => s.id)).toEqual(["S1"]);
  });
});

describe("continuity JSON", () => {
  it("survives code fences, comments and trailing commas", () => {
    const text = '```json\n{\n "checkpoint": "At the gate // not a comment", // note\n "newFacts": [ {"text": "a"}, ],\n}\n```';
    expect(parseLooseJson(text)).toEqual({ checkpoint: "At the gate // not a comment", newFacts: [{ text: "a" }] });
  });
});
