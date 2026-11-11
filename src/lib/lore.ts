// Chekhov's Vault: small details planted in the story whose hidden truth is paid off much later.
// Browser-safe and pure so the merge rules can be tested.

export type SeedStatus = "dormant" | "hinted" | "revealed";
export type Horizon = "soon" | "mid" | "long";

export type LoreSeed = {
  id: string; // short stable id the continuity pass refers to, e.g. "S4"
  seen: string; // what the player character actually noticed
  truth: string; // the hidden truth — GM only until revealed
  origin?: string | undefined; // when/why it came to be, BEFORE and independently of the protagonist
  ordinary?: boolean | undefined; // false lead: genuinely mundane, not tied to any mystery
  horizon?: Horizon | undefined;
  payoffAfter?: number | undefined; // earliest chapter the secret may be revealed
  status: SeedStatus;
  plantedChapter: number;
  plantedAt: number; // message count when planted
  lastChapter?: number | undefined; // chapter it was last planted/hinted
  hints: string[]; // later clues that pointed back to it
  revealedChapter?: number | undefined;
};

export type SeedResult = {
  new?: { seen?: unknown; truth?: unknown; origin?: unknown; ordinary?: unknown; horizon?: unknown }[];
  updates?: { id?: unknown; status?: unknown; hint?: unknown }[];
};

const RANK: Record<SeedStatus, number> = { dormant: 0, hinted: 1, revealed: 2 };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Most open mysteries can be "soon" at once; the rest are pushed further out so payoffs spread over the story. */
export const MAX_OPEN_SOON = 2;

/** Earliest payoff chapter: soon = 3 chapters later, mid = 15, long = 50–100. */
export function payoffChapter(horizon: Horizon, planted: number, n: number) {
  if (horizon === "soon") return planted + 3;
  if (horizon === "mid") return planted + 15;
  return planted + 50 + ((n * 37) % 51);
}

/** Golden rule: a secret's past exists independently of the protagonist, so it can't be built around them. */
export function aboutProtagonist(text: string, player: string) {
  const first = player.trim().split(/\s+/)[0] ?? "";
  if (first.length < 2) return false;
  return new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

export const isOpen = (s: LoreSeed) => s.status !== "revealed" && !s.ordinary;
export const payoffOf = (s: LoreSeed) => s.payoffAfter ?? s.plantedChapter + 15;

/** Applies one continuity pass to the vault. Seeds never disappear and never go backwards. */
export function mergeSeeds(
  cur: LoreSeed[],
  r: SeedResult | undefined | null,
  at: { chapter: number; messages: number; player?: string },
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
      lastChapter: upgraded !== s.status || hint ? at.chapter : s.lastChapter,
      hints: hint && !s.hints.includes(hint) ? [...s.hints, hint].slice(-8) : s.hints,
      revealedChapter: upgraded === "revealed" && s.status !== "revealed" ? at.chapter : s.revealedChapter,
    };
  }
  let n = next.reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, "")) || 0), 0);
  for (const s of (Array.isArray(r.new) ? r.new : []).slice(0, 3)) {
    const seen = str(s?.seen);
    const truth = str(s?.truth);
    const origin = str(s?.origin);
    const ordinary = s?.ordinary === true;
    if (!seen || !truth) continue;
    if (!ordinary && !origin) continue; // a real secret needs its own independent past
    if (at.player && (aboutProtagonist(truth, at.player) || aboutProtagonist(origin, at.player))) continue;
    if (next.some((x) => norm(x.seen) === norm(seen))) continue;
    let horizon: Horizon = (["soon", "mid", "long"] as const).find((h) => h === str(s?.horizon).toLowerCase()) ?? "mid";
    if (!ordinary && horizon === "soon" && next.filter((x) => isOpen(x) && x.horizon === "soon").length >= MAX_OPEN_SOON)
      horizon = "mid";
    n++;
    next = [
      ...next,
      {
        id: `S${n}`,
        seen,
        truth,
        origin: origin || undefined,
        ordinary: ordinary || undefined,
        horizon,
        payoffAfter: ordinary ? undefined : payoffChapter(horizon, at.chapter, n),
        status: "dormant",
        plantedChapter: at.chapter,
        plantedAt: at.messages,
        lastChapter: at.chapter,
        hints: [],
      },
    ];
  }
  return next;
}

/** Continuity audit run before every chapter (and kept in view each turn). */
export function auditSeeds(seeds: LoreSeed[] | undefined, chapter: number) {
  const open = (seeds ?? []).filter(isOpen);
  const last = (s: LoreSeed) => s.lastChapter ?? s.plantedChapter;
  return {
    overdue: open.filter((s) => chapter >= payoffOf(s) + 10),
    ripe: open.filter((s) => chapter >= payoffOf(s) && chapter < payoffOf(s) + 10),
    developing: open.filter((s) => s.status === "hinted" && chapter < payoffOf(s)),
    forgotten: open.filter((s) => chapter - last(s) >= 5 && chapter < payoffOf(s)),
  };
}

export function auditForGm(seeds: LoreSeed[] | undefined, chapter: number) {
  const a = auditSeeds(seeds, chapter);
  const ids = (l: LoreSeed[]) => l.map((s) => s.id).join(", ") || "none";
  return [
    `Current chapter: ${chapter}`,
    `Overdue payoffs (build toward their reveal at the next fitting climax): ${ids(a.overdue)}`,
    `Ripe for payoff (may be revealed now if the moment is earned): ${ids(a.ripe)}`,
    `Developing mysteries (keep adding clues slowly, don't reveal): ${ids(a.developing)}`,
    `Long untouched (consider a faint callback): ${ids(a.forgotten)}`,
  ].join("\n");
}

/** The vault as the Game Master sees it: unrevealed seeds first, oldest first, capped. */
export function vaultForGm(seeds: LoreSeed[] | undefined, nowMessages: number, chapter: number, limit = 40): string {
  const all = seeds ?? [];
  if (!all.length) return "(empty — plant the first seeds)";
  const open = all.filter(isOpen);
  const ordinary = all.filter((s) => s.ordinary).slice(-10);
  const done = all.filter((s) => s.status === "revealed" && !s.ordinary).slice(-8);
  const line = (s: LoreSeed) => {
    const pay = payoffOf(s);
    const when = chapter < pay ? `NOT before ch.${pay}` : "payoff allowed now";
    return `- [${s.id} · ${s.status} · ${when} · planted ch.${s.plantedChapter}, ${Math.max(0, nowMessages - s.plantedAt)} messages ago${s.hints.length ? ` · ${s.hints.length} clue(s)` : ""}] SEEN: ${s.seen} | SECRET: ${s.truth}${s.origin ? ` | ITS OWN PAST: ${s.origin}` : ""}`;
  };
  return [
    ...open.slice(0, limit).map(line),
    ...ordinary.map((s) => `- [${s.id} · ordinary, a false lead — never turn it into a mystery] ${s.seen} → ${s.truth}`),
    ...done.map((s) => `- [${s.id} · revealed in ch.${s.revealedChapter ?? "?"}] ${s.seen} → ${s.truth}`),
  ].join("\n");
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
