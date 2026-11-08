import { describe, expect, it } from "vitest";
import { shouldTryNextModel } from "@/lib/gemini.server";

describe("Gemini model fallback", () => {
  it("moves to the next model when Google is overloaded (503)", () => {
    expect(shouldTryNextModel(503)).toBe(true);
  });
  it("moves to the next model when the request times out (502/504)", () => {
    expect(shouldTryNextModel(502)).toBe(true);
    expect(shouldTryNextModel(504)).toBe(true);
  });
  it("moves to the next model when rate-limited (429)", () => {
    expect(shouldTryNextModel(429)).toBe(true);
  });
  it("stops on a bad request (400) instead of retrying", () => {
    expect(shouldTryNextModel(400)).toBe(false);
  });
});
