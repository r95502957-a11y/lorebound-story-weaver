// Chekhov's Vault: small details planted in the story whose hidden truth is paid off much later.
// Browser-safe and pure so the merge rules can be tested.

export type SeedStatus = "dormant" | "hinted" | "revealed";

export type LoreSeed = {
  id: string; // short stable id the continuity pass refers to, e.g. "S4"
  seen: string; // what the player character actually noticed
  truth: string; // the hidden truth — GM only until revealed
  status: SeedStatus;
  plantedChapter: number;
  plantedAt: number; // message count when planted
  hints: string[]; // later clues that pointed back to it
  revealedChapter?: number | undefined;
};

export type SeedResult = {
  new?: { seen?: unknown; truth?: unknown }[];
  updates?: { id?: unknown; status?: unknown; hint?: unknown }[];
};

const RANK: Record<SeedStatus, number> = { dormant: 0, hinted: 1, revealed: 2 };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Applies one continuity pass to the vault. Seeds never disappear and never go backwards. */
export function mergeSeeds(
  cur: LoreSeed[],
  r: SeedResult | undefined | null,
  at: { chapter: number; messages: number },
): LoreSeed[] {
  if (!r) return cur;
  let next = [...cur];
  for (const u of Array.isArray(r.updates) ? r.updates : []) {
    const id = str(u?.id).toUpperCase();
    const i = next.findIndex((s) => s.id.toUpperCase() === id);
    if (i < 0) continue;
    const s = next[i]!;
    const status = str(u.status).toLowerCase() as SeedStatus;
    const hint = str(u.hint);
    const upgraded = status in RANK && RANK[status] > RANK[s.status] ? status : s.status;
    next[i] = {
      ...s,
      status: upgraded,
      hints: hint && !s.hints.includes(hint) ? [...s.hints, hint].slice(-8) : s.hints,
      revealedChapter: upgraded === "revealed" && s.status !== "revealed" ? at.chapter : s.revealedChapter,
    };
  }
  let n = next.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, "")) || 0), 0);
  for (const s of (Array.isArray(r.new) ? r.new : []).slice(0, 3)) {
    const seen = str(s?.seen);
    const truth = str(s?.truth);
    if (!seen || !truth) continue;
    if (next.some((x) => norm(x.seen) === norm(seen))) continue;
    next = [
      ...next,
      { id: `S${++n}`, seen, truth, status: "dormant", plantedChapter: at.chapter, plantedAt: at.messages, hints: [] },
    ];
  }
  return next;
}

/** The vault as the Game Master sees it: unrevealed seeds first, oldest first, capped. */
export function vaultForGm(seeds: LoreSeed[] | undefined, nowMessages: number, limit = 40): string {
  const all = seeds ?? [];
  if (!all.length) return "(empty — plant the first seeds)";
  const open = all.filter((s) => s.status !== "revealed");
  const done = all.filter((s) => s.status === "revealed").slice(-8);
  const line = (s: LoreSeed) =>
    `- [${s.id} · ${s.status} · planted ch.${s.plantedChapter}, ${Math.max(0, nowMessages - s.plantedAt)} messages ago${s.hints.length ? ` · ${s.hints.length} hint(s)` : ""}] SEEN: ${s.seen} | SECRET: ${s.truth}`;
  return [...open.slice(0, limit).map(line), ...done.map((s) => `- [${s.id} · revealed in ch.${s.revealedChapter ?? "?"}] ${s.seen} → ${s.truth}`)].join("\n");
}

/** Parses model JSON that may be wrapped in code fences or contain comments/trailing commas. */
export function parseLooseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    // strip // and /* */ comments outside strings, then trailing commas
    let out = "";
    let inStr = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]!;
      if (inStr) {
        out += c;
        if (c === "\\") out += raw[++i] ?? "";
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === "/" && raw[i + 1] === "/") { while (i < raw.length && raw[i] !== "\n") i++; out += "\n"; continue; }
      if (c === "/" && raw[i + 1] === "*") { i = raw.indexOf("*/", i + 2); if (i < 0) break; i++; continue; }
      out += c;
    }
    try {
      return JSON.parse(out.replace(/,\s*([}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}
