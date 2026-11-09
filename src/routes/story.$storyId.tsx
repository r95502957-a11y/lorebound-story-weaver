import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { getStory, putStory, uid, type CastMember, type Fact, type Hud, type Msg, type Story } from "@/lib/rp";
import { buildContext, recentTranscript } from "@/lib/prompts";
import { updateLedger } from "@/lib/rp.functions";
import { findPictures } from "@/lib/pictures.functions";
import { applyPictures, needsAiOnly, pendingPictures } from "@/lib/real-pictures";
import {
  findCast,
  newCastMember,
  parseBlocks,
  portraitUrl,
  sceneUrl,
  seedFrom,
  speakersIn,
} from "@/lib/visuals";
import { Avatar, Pic, PictureControls, usePictureUrl, useTypewriter } from "@/components/visuals";

export const Route = createFileRoute("/story/$storyId")({
  head: () => ({
    meta: [
      { title: "Story — Absolute RP" },
      { name: "description", content: "Your ongoing roleplay with the Absolute RP Game Master." },
      { property: "og:title", content: "Story — Absolute RP" },
      { property: "og:description", content: "Your ongoing roleplay with the Absolute RP Game Master." },
    ],
  }),
  component: StoryPage,
});

function renderText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="text-primary">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>;
    return <span key={i}>{part}</span>;
  });
}

type Look = { name?: string; look?: string; canon?: boolean };
type LedgerResult = {
  newFacts?: { text?: string; level?: string }[];
  removeFacts?: string[];
  hud?: Partial<Hud>;
  checkpoint?: string;
  chapterComplete?: boolean;
  chapterTitle?: string;
  chapterSummary?: string;
  chapterImage?: string;
  newCast?: Look[];
  castChanges?: Look[];
  scene?: { show?: boolean; description?: string; place?: string; photo?: string };
};

function StoryPage() {
  const { storyId } = Route.useParams();
  const [story, setStory] = useState<Story | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(false);
  const [activeMsg, setActiveMsg] = useState<string | null>(null);
  const [typingId, setTypingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const ref = useRef<Story | null>(null);
  const scroller = useRef<HTMLElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLTextAreaElement>(null);
  const ledgerFn = useServerFn(updateLedger);
  const started = useRef(false);

  const commit = useCallback((s: Story) => {
    ref.current = s;
    setStory(s);
    putStory(s);
  }, []);

  const runLedger = useCallback(
    async (s: Story) => {
      const recent = s.messages.slice(-4).map((m) => `${m.role === "user" ? "PLAYER" : "GM"}: ${m.text}`).join("\n\n");
      const lastGm = [...s.messages].reverse().find((m) => m.role === "gm");
      const cast = s.cast ?? [];
      const needLooks = speakersIn(s.messages.slice(-4).filter((m) => m.role === "gm").map((m) => m.text).join("\n\n")).filter(
        (n) => !findCast(cast, n),
      );
      const res = await ledgerFn({
        data: {
          context: buildContext(s),
          transcript: recent,
          facts: s.facts.map((f) => f.text),
          cast: cast.map((c) => `${c.name}${c.isPlayer ? " (player character)" : ""}: ${c.look}`),
          needLooks,
          opening: s.messages.filter((m) => m.role === "gm").length === 1,
        },
      }).catch(() => null);
      const r = (res?.result ? JSON.parse(res.result) : null) as LedgerResult | null;
      const cur = ref.current;
      if (!r || !cur || cur.id !== s.id) return;
      const remove = new Set(r.removeFacts ?? []);
      const added: Fact[] = (r.newFacts ?? [])
        .filter((f) => f.text)
        .map((f) => ({ id: uid(), text: String(f.text), level: f.level === "inferred" ? "inferred" : "confirmed" }));
      const next: Story = {
        ...cur,
        facts: [...cur.facts.filter((f) => !remove.has(f.text)), ...added],
        hud: { ...cur.hud, ...(r.hud ?? {}), nearby: r.hud?.nearby ?? cur.hud.nearby, threads: r.hud?.threads ?? cur.hud.threads },
        checkpoint: r.checkpoint || cur.checkpoint,
      };

      // Visual identity ledger: register new characters, track appearance changes (keeping the old look).
      let nextCast: CastMember[] = [...(cur.cast ?? [])];
      for (const c of r.newCast ?? []) {
        if (!c.name?.trim() || findCast(nextCast, c.name)) continue;
        nextCast.push(newCastMember(next, c.name.trim(), c.look?.trim() ?? "", false, c.canon !== false));
      }
      for (const c of r.castChanges ?? []) {
        const m = c.name ? findCast(nextCast, c.name) : undefined;
        if (!m || !c.look?.trim() || c.look.trim() === m.look) continue;
        nextCast = nextCast.map((x) =>
          x.id === m.id
            ? {
                ...x,
                pastLooks: [...(x.pastLooks ?? []), x.look],
                look: c.look!.trim(),
                // official art stays; only AI portraits are redrawn for the new look
                portrait: x.custom || x.source !== "ai" ? x.portrait : portraitUrl(next, x.name, c.look!.trim()),
              }
            : x,
        );
      }
      next.cast = nextCast;

      if (r.scene?.show && r.scene.description && lastGm) {
        const { description: desc, place = "", photo = "" } = r.scene;
        next.messages = next.messages.map((m) =>
          m.id === lastGm.id && !m.scene ? { ...m, scene: { image: "", caption: desc, place, photo } } : m,
        );
      }

      if (r.chapterComplete && r.chapterSummary) {
        next.chapters = [
          ...cur.chapters,
          {
            title: r.chapterTitle || `Chapter ${cur.chapters.length + 1}`,
            summary: r.chapterSummary,
            image: sceneUrl(next, r.chapterImage || r.chapterTitle || r.chapterSummary.slice(0, 200)),
            endsAt: cur.messages.length,
          },
        ];
        next.summarizedUpTo = cur.messages.length;
        next.hud = { ...next.hud, chapter: `Chapter ${next.chapters.length + 1}` };
      }
      commit(next);
    },
    [ledgerFn, commit],
  );

  const generate = useCallback(
    async (base: Story) => {
      setBusy(true);
      setError("");
      const gmId = uid();
      setTypingId(gmId);
      stick.current = true;
      let s: Story = { ...base, messages: [...base.messages, { id: gmId, role: "gm", text: "" }] };
      commit(s);
      try {
        const res = await fetch("/api/gm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            instructions: buildContext(base),
            messages: recentTranscript(base).map((m) => ({ role: m.role, text: m.text })),
          }),
        });
        if (!res.ok || !res.body) throw new Error(await res.text());
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value, { stream: true });
          s = { ...s, messages: s.messages.map((m) => (m.id === gmId ? { ...m, text } : m)) };
          ref.current = s;
          setStory(s);
        }
        commit(s);
        setBusy(false);
        box.current?.focus();
        void runLedger(s);
      } catch (e) {
        commit(base);
        setError(e instanceof Error && e.message ? e.message : "The Game Master couldn't respond.");
        setBusy(false);
      }
    },
    [commit, runLedger],
  );

  useEffect(() => {
    const s = getStory(storyId) ?? null;
    ref.current = s;
    setStory(s);
    if (s && s.messages.length === 0 && !started.current) {
      started.current = true;
      void generate(s);
    }
  }, [storyId, generate]);

  // Real pictures: look up official art / real places for anything new; AI picture only as a fallback.
  const resolving = useRef(new Set<string>());
  useEffect(() => {
    if (!story) return;
    const todo = pendingPictures(story).filter((r) => !resolving.current.has(r.key));
    if (!todo.length) {
      if (needsAiOnly(story)) commit(applyPictures(story, []));
      return;
    }
    todo.forEach((r) => resolving.current.add(r.key));
    void findPictures({ data: { fandom: story.fandom, wiki: story.wiki || undefined, items: todo.slice(0, 20) } })
      .catch(() => ({ results: todo.map((r) => ({ key: r.key, url: null, source: null })) }))
      .then(({ results }) => {
        const cur = ref.current;
        if (cur && cur.id === story.id) commit(applyPictures(cur, results));
      });
  }, [story, commit]);

  // Keep the newest words in view while they appear, unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    const content = inner.current;
    if (!el || !content) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [story === undefined || story === null]);

  function send() {
    const cur = ref.current;
    const text = input.trim();
    if (!cur || !text || busy) return;
    setInput("");
    void generate({ ...cur, messages: [...cur.messages, { id: uid(), role: "user", text }] });
  }

  function regenerate() {
    const cur = ref.current;
    if (!cur || busy) return;
    const msgs = [...cur.messages];
    while (msgs.length && msgs[msgs.length - 1]?.role === "gm") msgs.pop();
    void generate({ ...cur, messages: msgs });
  }

  function editMsg(m: Msg) {
    const cur = ref.current;
    if (!cur) return;
    const t = prompt("Edit message", m.text);
    if (t == null) return;
    commit({ ...cur, messages: cur.messages.map((x) => (x.id === m.id ? { ...x, text: t } : x)) });
  }

  function deleteMsg(m: Msg) {
    const cur = ref.current;
    if (!cur) return;
    commit({ ...cur, messages: cur.messages.filter((x) => x.id !== m.id) });
  }

  if (story === undefined) return <div className="min-h-screen bg-background" />;
  if (story === null)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p>Story not found.</p>
        <Link to="/" className="text-primary underline">Back home</Link>
      </div>
    );

  const lastGmId = [...story.messages].reverse().find((m) => m.role === "gm")?.id;
  const player = story.cast?.find((c) => c.isPlayer);
  const cover = story.cover || undefined;
  const chapterAt = new Map(story.chapters.map((c, i) => [c.endsAt ?? -1, { c, i }]));

  return (
    <div className="bg-hero flex h-[100dvh] flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-background/80 px-3 py-3 backdrop-blur">
        <Link to="/" aria-label="Back" className="p-1 text-muted-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <Pic src={cover} alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-bold leading-tight">{story.title}</div>
          <div className="truncate text-xs text-muted-foreground">{story.hud.chapter} · {story.hud.location}</div>
        </div>
        <button onClick={() => setPanel(true)} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm">
          <BookOpen className="h-4 w-4" /> Story
        </button>
      </header>

      <main ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
        <div ref={inner} className="mx-auto max-w-2xl space-y-5">
          <button onClick={() => cover && setZoom(cover)} className="block w-full overflow-hidden rounded-2xl border border-border text-left">
            <Pic src={cover} alt={story.title} className="aspect-video w-full" />
            <div className="bg-card px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-accent">{story.fandom}</div>
              <div className="font-display text-2xl font-bold">{story.title}</div>
            </div>
          </button>

          {story.messages.map((m, idx) => (
            <div key={m.id} className="space-y-5">
              {m.role === "user" ? (
                <div className="flex items-end justify-end gap-2">
                  {activeMsg === m.id && <MsgActions onEdit={() => editMsg(m)} onDelete={() => deleteMsg(m)} />}
                  <button onClick={() => setActiveMsg(activeMsg === m.id ? null : m.id)} className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 text-left text-user-bubble-foreground">
                    {m.text}
                  </button>
                  {player && <Avatar src={player.portrait} name={player.name} size="sm" />}
                </div>
              ) : (
                <div onClick={() => setActiveMsg(activeMsg === m.id ? null : m.id)}>
                  {m.scene && (
                    <figure className="mb-4 overflow-hidden rounded-2xl border border-border" onClick={(e) => { e.stopPropagation(); setZoom(m.scene!.image); }}>
                      <Pic src={m.scene.image} alt={m.scene.caption} className="aspect-video w-full" />
                      <figcaption className="bg-card px-3 py-2 text-xs text-muted-foreground">
                        <span className="font-semibold uppercase tracking-widest text-accent">Scene · </span>{m.scene.caption}
                      </figcaption>
                    </figure>
                  )}
                  <GmText msg={m} story={story} typing={m.id === typingId} onZoom={setZoom} />
                  {activeMsg === m.id && !busy && (
                    <div className="mt-2 flex gap-2">
                      {m.id === lastGmId && (
                        <button onClick={regenerate} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs"><RotateCcw className="h-3 w-3" /> Regenerate</button>
                      )}
                      <MsgActions onEdit={() => editMsg(m)} onDelete={() => deleteMsg(m)} />
                    </div>
                  )}
                </div>
              )}
              {chapterAt.has(idx + 1) && <ChapterCard {...chapterAt.get(idx + 1)!} onZoom={setZoom} />}
            </div>
          ))}
          {error && (
            <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
              {error} <button className="underline" onClick={regenerate}>Retry</button>
            </div>
          )}
        </div>
      </main>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="border-t border-border bg-background/90 px-3 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={box}
            autoFocus
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) { e.preventDefault(); send(); } }}
            placeholder="What do you do?"
            className="max-h-40 min-h-[48px] flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-ring"
          />
          <button disabled={busy || !input.trim()} aria-label="Send" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>

      {panel && <StoryPanel story={story} onClose={() => setPanel(false)} onChange={commit} onZoom={setZoom} />}
      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4" onClick={() => setZoom(null)}>
          <ZoomImg src={zoom} />
        </div>
      )}
    </div>
  );
}

function ZoomImg({ src }: { src: string }) {
  const url = usePictureUrl(src);
  if (!url) return <p className="text-muted-foreground">This picture is still being painted…</p>;
  return <img src={url} alt="" className="max-h-full max-w-full rounded-2xl" />;
}

function GmText({ msg, story, typing, onZoom }: { msg: Msg; story: Story; typing: boolean; onZoom: (u: string) => void }) {
  const text = useTypewriter(msg.text, typing);
  if (!msg.text) return <span className="animate-pulse font-display text-[1.2rem] text-muted-foreground">The world stirs…</span>;
  return (
    <div className="space-y-4">
      {parseBlocks(text).map((b, i) =>
        b.kind === "narration" ? (
          <p key={i} className="whitespace-pre-wrap font-display text-[1.2rem] leading-relaxed">{renderText(b.text)}</p>
        ) : (
          <SpeechBlock key={i} speaker={b.speaker} text={b.text} member={findCast(story.cast, b.speaker)} onZoom={onZoom} />
        ),
      )}
    </div>
  );
}

function SpeechBlock({ speaker, text, member, onZoom }: { speaker: string; text: string; member?: CastMember | undefined; onZoom: (u: string) => void }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-card/60 p-3">
      <button type="button" onClick={(e) => { e.stopPropagation(); if (member?.portrait) onZoom(member.portrait); }} className="shrink-0 self-start">
        <Avatar src={member?.portrait} name={member?.name ?? speaker} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold uppercase tracking-widest text-primary">{member?.name ?? speaker}</div>
        <p className="whitespace-pre-wrap font-display text-[1.15rem] leading-relaxed">{renderText(text)}</p>
      </div>
    </div>
  );
}

function ChapterCard({ c, i, onZoom }: { c: Story["chapters"][number]; i: number; onZoom: (u: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-accent/50 bg-card">
      {c.image && (
        <button className="block w-full" onClick={() => onZoom(c.image!)}>
          <Pic src={c.image} alt={c.title} className="aspect-video w-full" />
        </button>
      )}
      <div className="p-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-accent">Chapter {i + 1} completed</div>
        <div className="font-display text-xl font-bold">{c.title}</div>
      </div>
    </div>
  );
}

function MsgActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1 self-center">
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Edit" className="rounded-full bg-secondary p-1.5"><Pencil className="h-3 w-3" /></button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete" className="rounded-full bg-secondary p-1.5"><Trash2 className="h-3 w-3" /></button>
    </div>
  );
}

function StoryPanel({ story, onClose, onChange, onZoom }: { story: Story; onClose: () => void; onChange: (s: Story) => void; onZoom: (u: string) => void }) {
  const [tab, setTab] = useState<"status" | "cast" | "memory" | "chapters" | "canon">("status");
  const h = story.hud;
  const cast = story.cast ?? [];
  const setMember = (id: string, patch: Partial<CastMember>) =>
    onChange({ ...story, cast: cast.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const cover = story.cover || undefined;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/60 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{story.title}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {(["status", "cast", "memory", "chapters", "canon"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{t}</button>
          ))}
        </div>
        {tab === "status" && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2 overflow-hidden rounded-xl bg-secondary">
              <button className="block w-full" onClick={() => cover && onZoom(cover)}><Pic src={cover} alt="Story cover" className="aspect-video w-full" /></button>
              <div className="flex items-center justify-between gap-2 p-3">
                <dt className="text-xs text-muted-foreground">Story cover</dt>
                <PictureControls
                  maxUpload={1024}
                  onReroll={() => onChange({ ...story, coverSource: "ai", cover: sceneUrl(story, `${story.title}, ${story.fandom}`, Math.floor(Math.random() * 1e6)) })}
                  onSet={(u) => onChange({ ...story, coverSource: "upload", cover: u })}
                />
              </div>
            </div>
            {[["Location", h.location], ["Time", h.time], ["Chapter", h.chapter], ["Condition", h.condition]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
            <div className="col-span-2 rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">Nearby</dt><dd>{h.nearby.join(", ") || "—"}</dd></div>
            <div className="col-span-2 rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">Active threads</dt><dd><ul className="list-disc pl-4">{h.threads.map((t) => <li key={t}>{t}</li>)}</ul>{!h.threads.length && "—"}</dd></div>
          </dl>
        )}
        {tab === "cast" && (
          <ul className="space-y-3 text-sm">
            {!cast.length && <p className="text-muted-foreground">Characters appear here when they first speak.</p>}
            {cast.map((c) => (
              <li key={c.id} className="flex gap-3 rounded-xl bg-secondary p-3">
                <button onClick={() => onZoom(c.portrait)} className="self-start"><Avatar src={c.portrait} name={c.name} size="lg" /></button>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="font-display text-lg font-bold leading-tight">{c.name}{c.isPlayer && <span className="ml-2 rounded bg-primary px-1.5 text-[10px] uppercase text-primary-foreground">You</span>}</div>
                  <p className="text-muted-foreground">{c.look || "—"}</p>
                  <PictureControls
                    onReroll={() => setMember(c.id, { custom: false, source: "ai", portrait: portraitUrl(story, c.name, c.look, seedFrom(c.name) + Math.floor(Math.random() * 1e5)) })}
                    onSet={(u) => setMember(c.id, { custom: true, source: "upload", portrait: u })}
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{c.source === "wiki" ? "Official art" : c.source === "upload" ? "Your picture" : c.source === "ai" ? "AI picture" : "Finding picture…"}</span>
                    {c.source !== "wiki" && (
                      <button className="text-primary underline" onClick={() => setMember(c.id, { custom: false, canon: true, source: undefined })}>Find real picture</button>
                    )}
                  </div>
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => {
                      const t = prompt(`How does ${c.name} look?`, c.look);
                      if (t == null || t.trim() === c.look) return;
                      setMember(c.id, {
                        look: t.trim(),
                        pastLooks: [...(c.pastLooks ?? []), c.look],
                        portrait: c.custom || c.source !== "ai" ? c.portrait : portraitUrl(story, c.name, t.trim()),
                      });
                    }}
                  >
                    Edit appearance
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === "memory" && (
          <ul className="space-y-2 text-sm">
            {!story.facts.length && <p className="text-muted-foreground">Facts appear here as the story unfolds.</p>}
            {story.facts.map((f) => (
              <li key={f.id} className="flex items-start gap-2 rounded-xl bg-secondary p-3">
                <span className={`mt-0.5 rounded px-1.5 text-[10px] uppercase ${f.level === "confirmed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{f.level}</span>
                <span className="flex-1">{f.text}</span>
                <button aria-label="Edit fact" onClick={() => { const t = prompt("Edit fact", f.text); if (t) onChange({ ...story, facts: story.facts.map((x) => (x.id === f.id ? { ...x, text: t } : x)) }); }}><Pencil className="h-3.5 w-3.5" /></button>
                <button aria-label="Delete fact" onClick={() => onChange({ ...story, facts: story.facts.filter((x) => x.id !== f.id) })}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        {tab === "chapters" && (
          <div className="space-y-3 text-sm">
            {story.chapters.map((c, i) => (
              <div key={i} className="overflow-hidden rounded-xl bg-secondary">
                {c.image && <button className="block w-full" onClick={() => onZoom(c.image!)}><Pic src={c.image} alt={c.title} className="aspect-video w-full" /></button>}
                <div className="p-3">
                  <div className="font-display text-lg font-bold">Chapter {i + 1}: {c.title}</div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{c.summary}</p>
                  <div className="mt-2">
                    <PictureControls
                      maxUpload={1024}
                      onReroll={() => onChange({ ...story, chapters: story.chapters.map((x, j) => (j === i ? { ...x, image: sceneUrl(story, x.title, Math.floor(Math.random() * 1e6)) } : x)) })}
                      onSet={(u) => onChange({ ...story, chapters: story.chapters.map((x, j) => (j === i ? { ...x, image: u } : x)) })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Current checkpoint (in progress)</div><p>{story.checkpoint || "—"}</p></div>
          </div>
        )}
        {tab === "canon" && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{story.canon}</p>}
      </div>
    </div>
  );
}
