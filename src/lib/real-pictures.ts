// Browser-safe: decides which pictures still need a real-picture lookup and applies the results.
// Order of preference: official wiki art / canon place → real photo → AI picture (last resort).
import type { Story } from "./rp";
import { portraitUrl, sceneUrl } from "./visuals";

export type PicReq = { key: string; kind: "character" | "place" | "cover"; name: string; photo?: string };
export type PicRes = { key: string; url: string | null; source: "wiki" | "photo" | null };

export function pendingPictures(s: Story): PicReq[] {
  const out: PicReq[] = [];
  if (!s.coverSource) out.push({ key: "cover", kind: "cover", name: s.title });
  for (const c of s.cast ?? []) {
    if (c.custom || c.source || c.canon === false) continue;
    out.push({ key: `cast:${c.id}`, kind: "character", name: c.name });
  }
  for (const m of s.messages) {
    const sc = m.scene;
    if (!sc || sc.source) continue;
    out.push({ key: `scene:${m.id}`, kind: "place", name: sc.place ?? "", photo: sc.photo || sc.caption.split(/[,.;]/)[0]?.slice(0, 60) || "" });
  }
  return out;
}

/** Originals and anything with no real picture fall back to an AI picture. */
export function needsAiOnly(s: Story) {
  return (s.cast ?? []).some((c) => !c.custom && !c.source && c.canon === false);
}

export function applyPictures(s: Story, results: PicRes[]): Story {
  const byKey = new Map(results.map((r) => [r.key, r]));
  const next: Story = { ...s };
  const cov = byKey.get("cover");
  if (cov) {
    next.cover = cov.url ?? s.cover ?? sceneUrl(s, `${s.title}, ${s.fandom}`);
    next.coverSource = cov.url ? (cov.source ?? "wiki") : "ai";
  }
  next.cast = (s.cast ?? []).map((c) => {
    if (c.custom || c.source) return c;
    const r = byKey.get(`cast:${c.id}`);
    if (c.canon === false) return { ...c, portrait: portraitUrl(s, c.name, c.look), source: "ai" as const };
    if (!r) return c;
    return r.url
      ? { ...c, portrait: r.url, source: r.source ?? ("wiki" as const) }
      : { ...c, portrait: portraitUrl(s, c.name, c.look), source: "ai" as const };
  });
  next.messages = s.messages.map((m) => {
    const r = byKey.get(`scene:${m.id}`);
    if (!r || !m.scene) return m;
    return {
      ...m,
      scene: r.url
        ? { ...m.scene, image: r.url, source: r.source ?? ("photo" as const) }
        : { ...m.scene, image: sceneUrl(s, m.scene.caption), source: "ai" as const },
    };
  });
  return next;
}
