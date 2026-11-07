import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { getStory, putStory, uid, type Fact, type Hud, type Msg, type Story } from "@/lib/rp";
import { buildContext, recentTranscript } from "@/lib/prompts";
import { updateLedger } from "@/lib/rp.functions";

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

type LedgerResult = {
  newFacts?: { text?: string; level?: string }[];
  removeFacts?: string[];
  hud?: Partial<Hud>;
  checkpoint?: string;
  chapterComplete?: boolean;
  chapterTitle?: string;
  chapterSummary?: string;
};

function StoryPage() {
  const { storyId } = Route.useParams();
  const [story, setStory] = useState<Story | null | undefined>(undefined);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(false);
  const [activeMsg, setActiveMsg] = useState<string | null>(null);
  const ref = useRef<Story | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
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
      const res = await ledgerFn({
        data: { context: buildContext(s), transcript: recent, facts: s.facts.map((f) => f.text) },
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
      if (r.chapterComplete && r.chapterSummary) {
        next.chapters = [...cur.chapters, { title: r.chapterTitle || `Chapter ${cur.chapters.length + 1}`, summary: r.chapterSummary }];
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [story?.messages.length, story?.messages[story.messages.length - 1]?.text.length]);

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

  return (
    <div className="bg-hero flex h-[100dvh] flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-background/80 px-3 py-3 backdrop-blur">
        <Link to="/" aria-label="Back" className="p-1 text-muted-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-bold leading-tight">{story.title}</div>
          <div className="truncate text-xs text-muted-foreground">{story.hud.chapter} · {story.hud.location}</div>
        </div>
        <button onClick={() => setPanel(true)} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm">
          <BookOpen className="h-4 w-4" /> Story
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-2xl space-y-5">
          {story.messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <button onClick={() => setActiveMsg(activeMsg === m.id ? null : m.id)} className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 text-left text-user-bubble-foreground">
                  {m.text}
                </button>
                {activeMsg === m.id && <MsgActions onEdit={() => editMsg(m)} onDelete={() => deleteMsg(m)} />}
              </div>
            ) : (
              <div key={m.id} onClick={() => setActiveMsg(activeMsg === m.id ? null : m.id)}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent">Game Master</div>
                <div className="whitespace-pre-wrap font-display text-[1.2rem] leading-relaxed">
                  {m.text ? renderText(m.text) : <span className="animate-pulse text-muted-foreground">The world stirs…</span>}
                </div>
                {activeMsg === m.id && !busy && (
                  <div className="mt-2 flex gap-2">
                    {m.id === lastGmId && (
                      <button onClick={regenerate} className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs"><RotateCcw className="h-3 w-3" /> Regenerate</button>
                    )}
                    <MsgActions onEdit={() => editMsg(m)} onDelete={() => deleteMsg(m)} />
                  </div>
                )}
              </div>
            ),
          )}
          {error && (
            <div className="rounded-xl border border-destructive p-3 text-sm text-destructive">
              {error} <button className="underline" onClick={regenerate}>Retry</button>
            </div>
          )}
          <div ref={bottom} />
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

      {panel && <StoryPanel story={story} onClose={() => setPanel(false)} onChange={commit} />}
    </div>
  );
}

function MsgActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="ml-2 flex items-center gap-1 self-center">
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Edit" className="rounded-full bg-secondary p-1.5"><Pencil className="h-3 w-3" /></button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete" className="rounded-full bg-secondary p-1.5"><Trash2 className="h-3 w-3" /></button>
    </div>
  );
}

function StoryPanel({ story, onClose, onChange }: { story: Story; onClose: () => void; onChange: (s: Story) => void }) {
  const [tab, setTab] = useState<"status" | "memory" | "chapters" | "canon">("status");
  const h = story.hud;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/60 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">{story.title}</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {(["status", "memory", "chapters", "canon"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{t}</button>
          ))}
        </div>
        {tab === "status" && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[["Location", h.location], ["Time", h.time], ["Chapter", h.chapter], ["Condition", h.condition]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
            <div className="col-span-2 rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">Nearby</dt><dd>{h.nearby.join(", ") || "—"}</dd></div>
            <div className="col-span-2 rounded-xl bg-secondary p-3"><dt className="text-xs text-muted-foreground">Active threads</dt><dd><ul className="list-disc pl-4">{h.threads.map((t) => <li key={t}>{t}</li>)}</ul>{!h.threads.length && "—"}</dd></div>
          </dl>
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
              <div key={i} className="rounded-xl bg-secondary p-3"><div className="font-display text-lg font-bold">Chapter {i + 1}: {c.title}</div><p className="whitespace-pre-wrap text-muted-foreground">{c.summary}</p></div>
            ))}
            <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Current checkpoint (in progress)</div><p>{story.checkpoint || "—"}</p></div>
          </div>
        )}
        {tab === "canon" && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{story.canon}</p>}
      </div>
    </div>
  );
}
