import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { buildCanonSheet } from "@/lib/rp.functions";
import { findPictures } from "@/lib/pictures.functions";
import { emptyHud, putStory, uid, type Story } from "@/lib/rp";
import { newCastMember, sceneUrl } from "@/lib/visuals";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "New story — Absolute RP" },
      { name: "description", content: "Pick a fandom and your character to start a canon-accurate roleplay." },
      { property: "og:title", content: "New story — Absolute RP" },
      { property: "og:description", content: "Pick a fandom and your character to start a canon-accurate roleplay." },
    ],
  }),
  component: NewStory,
});

const field =
  "mt-1 w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-ring";

function NewStory() {
  const nav = useNavigate();
  const canonFn = useServerFn(buildCanonSheet);
  const [fandom, setFandom] = useState("");
  const [character, setCharacter] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fandom.trim() || !character.trim()) return;
    setBusy(true);
    setErr("");
    const res = await canonFn({ data: { fandom, character, start } }).catch(() => null);
    if (!res || res.error) {
      setErr("Couldn't reach the Game Master. Please try again.");
      setBusy(false);
      return;
    }
    const id = uid();
    const story: Story = {
      id,
      title: res.title,
      fandom,
      character,
      start,
      canon: res.canon,
      facts: [],
      chapters: [],
      checkpoint: "",
      hud: emptyHud,
      messages: [],
      summarizedUpTo: 0,
      updatedAt: Date.now(),
      style: res.style,
      wiki: res.wiki,
      cast: [],
    };
    const playerName = character.split(/[,.\n]/)[0]?.trim().slice(0, 40) || "You";
    story.cast = [newCastMember(story, playerName, res.playerLook || character.slice(0, 300), true, res.playerCanon)];
    // Cover: real art from the fandom's wiki if there is one, otherwise an AI picture of the described cover.
    const found = await findPictures({ data: { fandom, wiki: res.wiki || undefined, items: [{ key: "cover", kind: "cover", name: res.title }] } }).catch(() => null);
    const cov = found?.results[0];
    story.cover = cov?.url ?? sceneUrl(story, res.cover || `${res.title}, ${fandom}`);
    story.coverSource = cov?.url ? (cov.source ?? "wiki") : "ai";
    putStory(story);
    nav({ to: "/story/$storyId", params: { storyId: id } });
  }

  return (
    <main className="bg-hero min-h-screen px-4 pb-16 pt-6">
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-5">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="font-display text-4xl font-bold text-primary">Begin a story</h1>
        <label className="block">
          <span className="text-sm font-semibold">Fandom or world</span>
          <input className={field} value={fandom} onChange={(e) => setFandom(e.target.value)} placeholder="Naruto, Harry Potter, Original fantasy…" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Your character</span>
          <textarea className={field} rows={4} value={character} onChange={(e) => setCharacter(e.target.value)} placeholder="Name, age, looks, abilities, personality… or a canon character like 'Kakashi Hatake'" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Where it starts <span className="text-muted-foreground">(optional)</span></span>
          <input className={field} value={start} onChange={(e) => setStart(e.target.value)} placeholder="Right after the Chunin Exams" />
        </label>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button
          disabled={busy || !fandom.trim() || !character.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-lg font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? (<><Loader2 className="h-5 w-5 animate-spin" /> Studying the lore…</>) : "Start"}
        </button>
      </form>
    </main>
  );
}
