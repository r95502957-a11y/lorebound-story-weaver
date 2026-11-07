# Absolute RP — a c.ai-style story chat with perfect memory

A simple, friendly chat app where you pick (or make) a story, chat as your character, and an AI Game Master runs the world using the rules from your "Core architecture" notes. Memory, canon and chapters work quietly in the background so you only focus on the RP.

## What you'll see

**Home (story list)**
- A grid of your stories (cover color, title, fandom, last message preview).
- A big "New story" button.

**New story (one short form)**
- Fandom / world (e.g. "Naruto", "Harry Potter", or "Original").
- Your character: name + short description (or "canon character: Kakashi").
- Starting point (optional): "Right after the Chunin Exams".
- Start → drops you straight into chat with the GM's opening scene.

**Story chat (the main screen, c.ai-like)**
- Clean chat bubbles, GM messages styled like a book narrator, NPC names highlighted.
- Typing box at the bottom; replies stream in live.
- Tap a message to: regenerate, edit, or delete it.
- Small "Story" button in the top bar opens a slide-up panel with:
  - Status HUD (location, time, chapter, condition, nearby characters, active threads).
  - Memory: the facts the AI has recorded (you can fix or delete wrong ones).
  - Chapters: summaries of finished chapters.
- Everything else stays out of the way.

## How "perfect memory" and canon accuracy work

Every turn runs the four-stage loop from your notes, invisibly:

```text
Your message
   -> Retrieve: load story ledger (facts, NPCs, relationships, inventory,
      injuries, threads, who-knows-what) + recent messages + chapter summaries
   -> Simulate & Resolve: GM writes the reply following your rule set
      (never controls your character, attempt-based outcomes, proactive NPCs,
      canon-accurate)
   -> Update: a second quick AI pass extracts new facts and updates the
      ledger + HUD; closes a chapter with a summary when it naturally ends
```

- Canon: the AI uses its own built-in knowledge of the fandom, with a "canon notes" sheet it builds at story start (key characters, powers, timeline position, rules of the world). That sheet is fed into every reply so it doesn't drift.
- Long stories: older messages get folded into chapter summaries, so the AI never "forgets" even after hundreds of messages.
- Confirmed vs. inferred vs. unknown facts are tracked separately so it never invents answers to mysteries.

## Saving

No sign-in. Stories, messages and memory are saved in this browser/device. (Can upgrade to accounts later.)

## Technical details

- Routes: `/` story list, `/new` create form, `/story/$storyId` chat (each story has its own URL).
- Storage: localStorage records `{ id, title, fandom, character, canonSheet, ledger, chapters, hud, messages }`; idempotent load, no first-thread creation in effects.
- AI: Lovable AI Gateway SDK via `createServerFn` (server-only). Default chat model, streaming Responses surface for the GM reply; a non-streaming structured-JSON call for the ledger/HUD/chapter update and for building the canon sheet at story start.
- System prompt = condensed version of the uploaded Core Architecture rules (player agency, GM duties, NPC autonomy, continuity rules, anti-failure table).
- Context budget: canon sheet + ledger + chapter summaries + last ~30 messages.
- UI: AI Elements chat primitives, mobile-first (you're on a phone), dark storybook theme with a serif narrator font, semantic tokens only.
- Head metadata for each route.

## Not in v1 (easy later)
Accounts/cloud sync, live web search for obscure lore, character images, voice.
