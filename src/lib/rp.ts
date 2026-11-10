// Shared, browser-safe story types + localStorage store.
export type Msg = {
  id: string;
  role: "user" | "gm";
  text: string;
  ooc?: boolean; // out-of-character talk between player and GM; the story doesn't move
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
  // living world: what others are doing off-screen + canon events approaching on the timeline
  world?: { offscreen: string[]; upcoming: string[] };
  setup?: StorySetup; // everything the player chose before the story began
};

/** Full story setup chosen on the "Begin a story" screen. Empty strings = GM's choice. */
export type StorySetup = {
  canonMode: string; // "Strict canon" | "Canon, changed by my choices" | "Alternate universe"
  worldChanges: string;
  name: string;
  isCanonCharacter: boolean;
  age: string;
  look: string;
  personality: string;
  abilities: string;
  backstory: string;
  goal: string;
  relationships: string;
  premise: string;
  genres: string[];
  tone: string;
  pace: string;
  romance: string;
  violence: string;
  avoid: string;
  length: string;
  pov: string;
  oocQuestions: string;
};

/** The setup as plain lines for the Game Master; unset choices are skipped. */
export function setupLines(s: StorySetup | undefined): string[] {
  if (!s) return [];
  const rows: [string, string][] = [
    ["Canon mode", s.canonMode],
    ["What's different in this world", s.worldChanges],
    ["Player character name", s.name + (s.isCanonCharacter ? " (an existing canon character)" : " (original character)")],
    ["Age", s.age],
    ["Appearance", s.look],
    ["Personality", s.personality],
    ["Abilities and their limits", s.abilities],
    ["Backstory", s.backstory],
    ["Goal / motivation", s.goal],
    ["Starting relationships", s.relationships],
    ["Story premise / what it's about", s.premise],
    ["Genres", s.genres.join(", ")],
    ["Tone", s.tone],
    ["Pacing", s.pace],
    ["Romance", s.romance],
    ["Violence / gore", s.violence],
    ["Never include", s.avoid],
    ["Reply length", s.length],
    ["Narration point of view", s.pov],
    ["GM asking OOC questions", s.oocQuestions],
  ];
  return rows.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`);
}

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
