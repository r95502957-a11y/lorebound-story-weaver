import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteStory, loadStories, type Story } from "@/lib/rp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Absolute RP — Your stories" },
      { name: "description", content: "Canon-accurate AI roleplay with a Game Master that never forgets." },
      { property: "og:title", content: "Absolute RP — Your stories" },
      { property: "og:description", content: "Canon-accurate AI roleplay with a Game Master that never forgets." },
    ],
  }),
  component: Home,
});

function Home() {
  const [stories, setStories] = useState<Story[] | null>(null);
  useEffect(() => setStories(loadStories()), []);

  return (
    <main className="bg-hero min-h-screen px-4 pb-24 pt-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-5xl font-bold text-primary">Absolute RP</h1>
        <p className="mt-2 text-muted-foreground">You control your character. The world remembers everything.</p>

        <Link
          to="/new"
          className="mt-8 flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-lg font-semibold text-primary-foreground shadow-lg transition-transform active:scale-95"
        >
          <Plus className="h-5 w-5" /> New story
        </Link>

        <div className="mt-8 space-y-3">
          {stories?.length === 0 && (
            <p className="text-center text-muted-foreground">No stories yet. Start your first one!</p>
          )}
          {stories?.map((s) => {
            const last = s.messages[s.messages.length - 1];
            return (
              <div key={s.id} className="flex items-stretch gap-2 rounded-2xl border border-border bg-card">
                <Link to="/story/$storyId" params={{ storyId: s.id }} className="min-w-0 flex-1 p-4">
                  <div className="text-xs uppercase tracking-widest text-accent">{s.fandom}</div>
                  <div className="font-display text-2xl font-bold">{s.title}</div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{last?.text ?? "…"}</p>
                </Link>
                <button
                  aria-label="Delete story"
                  className="px-4 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (!confirm(`Delete "${s.title}"?`)) return;
                    deleteStory(s.id);
                    setStories(loadStories());
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
