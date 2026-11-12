<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Stories persist in browser localStorage (src/lib/rp.ts); GM replies stream via /api/gm and a separate continuity pass (src/lib/rp.functions.ts) updates facts/HUD/chapters — keeps narration fast while memory stays structured.
- All AI text calls go through src/lib/gemini.server.ts (user's own Gemini connector, model fallback list on rate limits), not the Lovable AI gateway — the user wants to run on their own key instead of workspace credits.
- Planted story details and their hidden truths live in Story.seeds, merged by pure helpers in src/lib/lore.ts and fed back to the GM every turn — seeds never vanish or regress, so payoffs can land hundreds of chapters later.
- Rewind/branch restore memory from per-reply snapshots (Msg.after, newest few only) via pure helpers in src/lib/timeline.ts; regenerate also rewinds — so undone replies never leave facts, lore or chapters behind.
