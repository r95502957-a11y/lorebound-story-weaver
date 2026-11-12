// Rewind + branches. Browser-safe and pure so the rules can be tested.
import type { Fact, Hud, Story } from "./rp";
import type { LoreSeed } from "./lore";

/** Everything the story "knows" right after one Game Master reply was absorbed into memory. */
export type Snap = {
  facts: Fact[];
  chapters: number; // chapters are append-only, so the count is enough
  checkpoint: string;
  hud: Hud;
  summarizedUpTo: number;
  world?: { offscreen: string[]; upcoming: string[] } | undefined;
  seeds?: LoreSeed[] | undefined;
};

/** Only the newest replies keep a full snapshot, so device storage doesn't fill up. */
export const KEEP_SNAPS = 40;

export function snapOf(s: Story): Snap {
  return {
    facts: s.facts,
    chapters: s.chapters.length,
    checkpoint: s.checkpoint,
    hud: s.hud,
    summarizedUpTo: s.summarizedUpTo,
    world: s.world,
    seeds: s.seeds,
  };
}

/** Stores the story's current memory on one reply; older snapshots beyond the cap are dropped. */
export function withSnap(s: Story, msgId: string): Story {
  const snap = snapOf(s);
  let kept = 0;
  const messages = [...s.messages]
    .reverse()
    .map((m) => {
      if (m.id === msgId) {
        kept++;
        return { ...m, after: snap };
      }
      if (!m.after) return m;
      kept++;
      if (kept <= KEEP_SNAPS) return m;
      const { after: _drop, ...rest } = m;
      return rest;
    })
    .reverse();
  return { ...s, messages };
}

/**
 * Keeps the first `keep` messages and puts memory, status, lore and chapters back
 * to how they were at that point.
 */
export function rewindTo(s: Story, keep: number): Story {
  const n = Math.max(0, Math.min(keep, s.messages.length));
  const messages = s.messages.slice(0, n);
  let snapAt = -1;
  for (let i = n - 1; i >= 0; i--) if (messages[i]?.after) { snapAt = i; break; }
  const snap = snapAt >= 0 ? messages[snapAt]!.after! : undefined;
  if (snap) {
    return {
      ...s,
      messages,
      facts: snap.facts,
      chapters: s.chapters.slice(0, snap.chapters),
      checkpoint: snap.checkpoint,
      hud: snap.hud,
      summarizedUpTo: Math.min(snap.summarizedUpTo, n),
      world: snap.world,
      seeds: snap.seeds,
    };
  }
  // No snapshot (very old reply): drop what clearly happened later, keep the rest.
  const chapters = s.chapters.filter((c) => (c.endsAt ?? 0) <= n);
  return {
    ...s,
    messages,
    chapters,
    summarizedUpTo: Math.min(s.summarizedUpTo, chapters[chapters.length - 1]?.endsAt ?? 0),
    seeds: (s.seeds ?? []).filter((x) => x.plantedAt <= n),
    hud: { ...s.hud, chapter: `Chapter ${chapters.length + 1}` },
    checkpoint: n === 0 ? "" : s.checkpoint,
    ...(n === 0 ? { facts: [] } : {}),
  };
}

/** A new, separate story that continues from message `keep` of `s`. The original is untouched. */
export function branchFrom(s: Story, keep: number, id: string, siblings: Story[]): Story {
  const rootId = s.branchOf?.rootId ?? s.id;
  const rootTitle = s.branchOf?.rootTitle ?? s.title;
  const n = siblings.filter((x) => (x.branchOf?.rootId ?? x.id) === rootId && x.branchOf).length + 1;
  return {
    ...rewindTo(s, keep),
    id,
    title: `${rootTitle} · Branch ${n}`,
    branchOf: { id: s.id, title: s.title, at: keep, rootId, rootTitle },
    updatedAt: Date.now(),
  };
}
