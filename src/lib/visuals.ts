// Browser-safe picture helpers: free picture service URLs, speaker detection, upload shrinking.
import type { CastMember, Story } from "./rp";
import { uid } from "./rp";

const PICTURE_BASE = "https://image.pollinations.ai/prompt/";

export function seedFrom(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % 1000000;
}

export function styleOf(s: Pick<Story, "style" | "fandom">) {
  return s.style?.trim() || `${s.fandom} official art style, detailed illustration`;
}

export function pictureUrl(prompt: string, kind: "portrait" | "wide", seed: number) {
  const [w, h] = kind === "portrait" ? [512, 512] : [1024, 576];
  const p = prompt.replace(/\s+/g, " ").trim().slice(0, 420);
  return `${PICTURE_BASE}${encodeURIComponent(p)}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`;
}

export function portraitUrl(s: Pick<Story, "style" | "fandom">, name: string, look: string, seed = seedFrom(name)) {
  return pictureUrl(
    `${styleOf(s)}. Head and shoulders character portrait of ${name}: ${look || "as in canon"}. Neutral expression, plain soft background, centered face.`,
    "portrait",
    seed,
  );
}

export function sceneUrl(s: Pick<Story, "style" | "fandom">, prompt: string, seed?: number) {
  return pictureUrl(`${styleOf(s)}. Cinematic wide scene, no text: ${prompt}`, "wide", seed ?? seedFrom(prompt));
}

export function normName(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Finds the cast member for a speaker label ("Kakashi" matches "Kakashi Hatake"). */
export function findCast(cast: CastMember[] | undefined, name: string) {
  const n = normName(name);
  if (!n || !cast) return undefined;
  return (
    cast.find((c) => normName(c.name) === n) ??
    cast.find((c) => {
      const cn = normName(c.name);
      return cn.split(" ").includes(n) || n.split(" ").includes(cn.split(" ")[0] ?? "");
    })
  );
}

export type Block = { kind: "narration"; text: string } | { kind: "speech"; speaker: string; text: string };

const SPEECH = /^\s*\*\*([^*\n]{1,40}?):?\*\*:?\s*(.*)$/s;

/** Splits a GM reply into narration paragraphs and per-speaker dialogue blocks. */
export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const para of text.split(/\n\s*\n|\n(?=\s*\*\*[^*\n]{1,40}:\*\*)/)) {
    if (!para.trim()) continue;
    const m = para.match(SPEECH);
    if (m && m[1] && m[2]?.trim()) out.push({ kind: "speech", speaker: m[1].trim(), text: m[2].trim() });
    else out.push({ kind: "narration", text: para.trim() });
  }
  return out;
}

export function speakersIn(text: string) {
  return [...new Set(parseBlocks(text).flatMap((b) => (b.kind === "speech" ? [b.speaker] : [])))];
}

/** Portrait starts empty: a real picture is looked up first, AI only if none exists. */
export function newCastMember(_s: Story, name: string, look: string, isPlayer = false, canon = true): CastMember {
  return { id: uid(), name, look, portrait: "", isPlayer, canon };
}

/** Shrinks an uploaded picture so stories stay small enough to save on the device. */
export async function shrinkImage(file: File, max = 384): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
