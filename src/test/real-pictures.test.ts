import { describe, expect, it } from "vitest";
import { isCharacterMatch, isPlaceMatch, wikiCandidates } from "@/lib/pictures.server";

describe("real picture matching", () => {
  it("uses the character's own wiki page, not a related page", () => {
    expect(isCharacterMatch("Kakashi", "Kakashi Hatake")).toBe(true);
    expect(isCharacterMatch("Bakugo", "Katsuki Bakugo/Relationships")).toBe(false);
  });
  it("never gives an original character a canon character's picture", () => {
    expect(isCharacterMatch("Ren Aburame", "Aburame Clan")).toBe(false);
    expect(isCharacterMatch("Ren Aburame", "Shino Aburame")).toBe(false);
  });
  it("matches canon places by name", () => {
    expect(isPlaceMatch("Training Ground 3", "Third Training Ground")).toBe(true);
    expect(isPlaceMatch("Hokage Office", "Ichiraku Ramen")).toBe(false);
  });
  it("tries the wiki the canon notes named, then a guess from the fandom", () => {
    expect(wikiCandidates("My Hero Academia", "bokunoheroacademia")).toEqual(["bokunoheroacademia", "myheroacademia"]);
  });
});
