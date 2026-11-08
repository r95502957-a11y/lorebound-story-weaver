// Server-only: talks to Google Gemini through the user's own connected key.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_google_gemini";

// Fastest first; if Google rate-limits or overloads one, the next is tried (each has its own free quota).
// Thinking is kept minimal where the model allows it: first words arrive in ~1s instead of ~5s.
export const GEMINI_MODELS: { model: string; thinking: "minimal" | "low" }[] = [
  { model: "gemini-3.5-flash", thinking: "minimal" },
  { model: "gemini-3.8-flash", thinking: "low" },
  { model: "gemini-3.1-flash-lite", thinking: "minimal" },
  { model: "gemini-flash-latest", thinking: "low" },
];

export type ChatTurn = { role: "user" | "model"; text: string };

export class GeminiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function headers() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["UDC_GOOGLE_GEMINI_API_KEY"];
  if (!lovable || !conn) throw new GeminiError(500, "Gemini is not connected.");
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": conn,
  };
}

async function open(
  { model, thinking }: (typeof GEMINI_MODELS)[number],
  instructions: string,
  turns: ChatTurn[],
  json: boolean,
) {
  const body = {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: {
      temperature: json ? 0.4 : 1,
      thinkingConfig: { thinkingLevel: thinking },
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  // Give up on a model that hasn't started answering in time and move to the next one.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FIRST_BYTE_TIMEOUT_MS);
  try {
    return await fetch(`${GATEWAY_URL}/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted) return new Response("timed out waiting for model", { status: 504 });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const FIRST_BYTE_TIMEOUT_MS = 20000;

/** Temporary failures (overload, timeout, rate limit, model retired) → try the next model. */
export function shouldTryNextModel(status: number) {
  return status === 404 || status === 408 || status === 429 || status >= 500;
}

/** Streams text deltas from Gemini, falling back to another model on temporary failures. */
export async function geminiStream(instructions: string, turns: ChatTurn[], json = false) {
  let res: Response | null = null;
  let lastErr = "";
  for (const m of GEMINI_MODELS) {
    try {
      res = await open(m, instructions, turns, json);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.error(`Gemini ${m.model} network error: ${lastErr}`);
      res = null;
      continue;
    }
    if (res.ok && res.body) break;
    lastErr = await res.text();
    console.error(`Gemini ${m.model} failed [${res.status}]: ${lastErr.slice(0, 300)}`);
    if (!shouldTryNextModel(res.status)) break;
  }
  if (!res || !res.ok || !res.body) throw new GeminiError(res?.status ?? 502, lastErr || "Gemini failed");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  return (async function* () {
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5)) as {
            candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
          };
          for (const p of ev.candidates?.[0]?.content?.parts ?? []) {
            if (p.text && !p.thought) yield p.text;
          }
        } catch {
          /* ignore partial lines */
        }
      }
    }
  })();
}

export async function geminiText(instructions: string, input: string, json = false) {
  let text = "";
  for await (const d of await geminiStream(instructions, [{ role: "user", text: input }], json)) text += d;
  return text;
}
