// Shared, browser-safe story types + localStorage store.
export type Msg = {
  id: string;
  role: "user" | "gm";
  text: string;
  // wide scene picture shown above this GM reply; place/photo drive the real-picture lookup
  scene?: { image: string; caption: string; source?: PicSource; place?: string; photo?: string };
};

export type PicSource = "wiki" | "photo" | "ai" | "upload";

export type CastMember = {
  id: string;
  name: string;
  look: string; // stable appearance description used for the portrait
  portrait: string; // image URL or uploaded data URL
  custom?: boolean; // true when the player supplied their own picture
  canon?: boolean; // canon character → look for their official art
  source?: PicSource | undefined; // where the current portrait came from; unset = look it up
  isPlayer?: boolean;
  pastLooks?: string[]; // visual timeline: earlier appearances are kept, never overwritten
};

export type Hud = {
  location: string;
  time: string;
  chapter: string;
  condition: string;
  nearby: string[];
  threads: string[];
};

export type Fact = { id: string; text: string; level: "confirmed" | "inferred" };
export type Chapter = { title: string; summary: string; image?: string; endsAt?: number }; // endsAt = message count when it closed

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
  style?: string; // art style for every picture in this story, e.g. "Naruto anime art style"
  cover?: string;
  coverSource?: PicSource;
  wiki?: string; // fandom wiki subdomain used for real pictures, e.g. "naruto"
  cast?: CastMember[];
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
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.error("Couldn't save stories (device storage full?)", e);
    if (typeof window !== "undefined")
      alert("Your device storage for this app is full. Remove a few uploaded pictures or old stories.");
  }
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
