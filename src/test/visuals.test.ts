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
