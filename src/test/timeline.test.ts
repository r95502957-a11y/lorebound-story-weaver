import { describe, expect, it } from "vitest";
import { emptyHud, type Msg, type Story } from "@/lib/rp";
import { branchFrom, KEEP_SNAPS, rewindTo, withSnap } from "@/lib/timeline";

const msg = (i: number): Msg => ({ id: `m${i}`, role: i % 2 ? "gm" : "user", text: `t${i}` });
function story(): Story {
  return {
    id: "a", title: "Ninja Way", fandom: "Naruto", character: "Ren", start: "", canon: "",
    facts: [], chapters: [], checkpoint: "", hud: emptyHud, messages: [], summarizedUpTo: 0, updatedAt: 0,
  };
}

describe("rewind", () => {
  it("puts memory back to how it was right after the kept reply", () => {
    let s = story();
    s = { ...s, messages: [msg(0), msg(1)], facts: [{ id: "f1", text: "Ren met Kakashi", level: "confirmed" }], checkpoint: "at the gate" };
    s = withSnap(s, "m1");
    s = {
      ...s,
      messages: [...s.messages, msg(2), msg(3)],
      facts: [...s.facts, { id: "f2", text: "Ren lost an arm", level: "confirmed" }],
      chapters: [{ title: "Gate", summary: "…", endsAt: 4 }],
      checkpoint: "in the hospital",
      seeds: [{ id: "S1", seen: "a sword", truth: "x", status: "dormant", plantedChapter: 1, plantedAt: 4, hints: [] }],
    };
    s = withSnap(s, "m3");
    const back = rewindTo(s, 2);
    expect(back.messages.map((m) => m.id)).toEqual(["m0", "m1"]);
    expect(back.facts.map((f) => f.text)).toEqual(["Ren met Kakashi"]);
    expect(back.chapters).toHaveLength(0);
    expect(back.checkpoint).toBe("at the gate");
    expect(back.seeds ?? []).toHaveLength(0);
  });

  it("without a snapshot, drops chapters and planted details from after the rewind point", () => {
    const s: Story = {
      ...story(),
      messages: [0, 1, 2, 3, 4, 5].map(msg),
      chapters: [{ title: "One", summary: "", endsAt: 2 }, { title: "Two", summary: "", endsAt: 6 }],
      summarizedUpTo: 6,
      seeds: [{ id: "S1", seen: "a key", truth: "x", status: "dormant", plantedChapter: 2, plantedAt: 5, hints: [] }],
    };
    const back = rewindTo(s, 3);
    expect(back.chapters.map((c) => c.title)).toEqual(["One"]);
    expect(back.summarizedUpTo).toBe(2);
    expect(back.seeds).toHaveLength(0);
  });

  it(`keeps full snapshots only on the newest ${KEEP_SNAPS} replies`, () => {
    let s: Story = { ...story(), messages: Array.from({ length: 100 }, (_, i) => msg(i)) };
    for (const m of s.messages) if (m.role === "gm") s = withSnap(s, m.id);
    expect(s.messages.filter((m) => m.after)).toHaveLength(KEEP_SNAPS);
    expect(s.messages[99]!.after).toBeTruthy();
  });
});

describe("branches", () => {
  it("creates a separate numbered copy from the chosen message and leaves the original alone", () => {
    const s: Story = { ...story(), messages: [0, 1, 2, 3].map(msg) };
    const b1 = branchFrom(s, 2, "b1", [s]);
    expect(b1).toMatchObject({ id: "b1", title: "Ninja Way · Branch 1", branchOf: { id: "a", at: 2 } });
    expect(b1.messages).toHaveLength(2);
    expect(s.messages).toHaveLength(4);
    const b2 = branchFrom(b1, 1, "b2", [s, b1]);
    expect(b2.title).toBe("Ninja Way · Branch 2");
  });
});
