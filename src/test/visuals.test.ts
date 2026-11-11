import { describe, expect, it } from "vitest";
import { findCast, parseBlocks, speakersIn } from "@/lib/visuals";
import type { CastMember } from "@/lib/rp";

describe("speaker portraits", () => {
  it("gives each speaker their own dialogue block, separate from narration", () => {
    const text = `The classroom falls quiet.\n\n**Aizawa:** "Everyone, take your seats."\n\n**Midoriya:** "Good morning, sir!"\n**Bakugo:** "Stop shouting, nerd."`;
    const blocks = parseBlocks(text);
    expect(blocks.map((b) => (b.kind === "speech" ? b.speaker : "narration"))).toEqual([
      "narration",
      "Aizawa",
      "Midoriya",
      "Bakugo",
    ]);
    expect(speakersIn(text)).toEqual(["Aizawa", "Midoriya", "Bakugo"]);
  });

  it("separates a Meanwhile cutaway from the player's scene, keeping its speakers", () => {
    const text = `You step into the hall.\n\n[MEANWHILE: League of Villains hideout]\n\nThe bar is dim.\n\n**Shigaraki:** "Soon."`;
    const blocks = parseBlocks(text);
    expect(blocks[0]).toEqual({ kind: "narration", text: "You step into the hall." });
    const mw = blocks[1];
    expect(mw?.kind).toBe("meanwhile");
    if (mw?.kind === "meanwhile") {
      expect(mw.place).toBe("League of Villains hideout");
      expect(mw.blocks.map((b) => b.kind)).toEqual(["narration", "speech"]);
    }
    expect(speakersIn(text)).toEqual(["Shigaraki"]);
  });

  it("matches a short speaker name to the full cast name", () => {
    const cast: CastMember[] = [
      { id: "1", name: "Kakashi Hatake", look: "", portrait: "k" },
      { id: "2", name: "Sakura Haruno", look: "", portrait: "s" },
    ];
    expect(findCast(cast, "Kakashi")?.id).toBe("1");
    expect(findCast(cast, "Sakura Haruno")?.id).toBe("2");
    expect(findCast(cast, "Naruto")).toBeUndefined();
  });
});

import { faceZoom } from "@/components/visuals";
describe("faceZoom", () => {
  it("leaves square pictures alone", () => expect(faceZoom(500, 500)).toBe(1));
  it("zooms tall full-body art onto the face, capped at 2x", () => {
    expect(faceZoom(500, 1000)).toBeCloseTo(2.2 > 2 ? 2 : 2.2);
    expect(faceZoom(500, 750)).toBeCloseTo(1.6);
  });
});
