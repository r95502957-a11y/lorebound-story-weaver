// Shared, browser-safe story types + localStorage store.
export type Msg = { id: string; role: "user" | "gm"; text: string };

export type Hud = {
  location: string;
  time: string;
  chapter: string;
  condition: string;
  nearby: string[];
  threads: string[];
};

export type Fact = { id: string; text: string; level: "confirmed" | "inferred" };
export type Chapter = { title: string; summary: string };

export type Story = {
  id: string;
  title: string;
  fandom: string;
  character: string;
  start: string;
  canon: string;
  facts: Fact[];
  chapters: Chapter[];
  checkpoint: string;
  hud: Hud;
  messages: Msg[];
  summarizedUpTo: number; // messages before this index are folded into chapters/checkpoint
  updatedAt: number;
};

const KEY = "absolute-rp-stories-v1";

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadStories(): Story[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as Story[];
  } catch {
    return [];
  }
}

export function saveStories(s: Story[]) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function getStory(id: string) {
  return loadStories().find((s) => s.id === id);
}

export function putStory(story: Story) {
  const all = loadStories().filter((s) => s.id !== story.id);
  saveStories([{ ...story, updatedAt: Date.now() }, ...all]);
}

export function deleteStory(id: string) {
  saveStories(loadStories().filter((s) => s.id !== id));
}

export const emptyHud: Hud = {
  location: "—",
  time: "—",
  chapter: "Chapter 1",
  condition: "—",
  nearby: [],
  threads: [],
};

export const RECENT_WINDOW = 30;
