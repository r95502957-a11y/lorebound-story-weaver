// Browser-only. The free picture service allows ~1 picture per 45s per device, so pictures are
// requested one at a time through a queue and each finished picture is kept in IndexedDB forever.
const DB = "absolute-rp-pictures";
const STORE = "pics";
const GAP_MS = 46000;

export type PicState = { status: "ready"; url: string } | { status: "waiting"; ahead: number } | { status: "failed" };

function isQueued(src: string) {
  return src.startsWith("https://image.pollinations.ai/");
}

let dbP: Promise<IDBDatabase> | null = null;
function db() {
  dbP ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function readBlob(key: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((res) => {
    const q = d.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result as Blob | undefined);
    q.onerror = () => res(undefined);
  });
}
async function writeBlob(key: string, b: Blob) {
  const d = await db();
  await new Promise<void>((res) => {
    const t = d.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(b, key);
    t.oncomplete = () => res();
    t.onerror = () => res();
  });
}

const objectUrls = new Map<string, string>();
const failed = new Set<string>();
const queue: string[] = [];
const listeners = new Map<string, Set<() => void>>();
let nextAt = 0;
let running = false;

function notifyAll() {
  for (const set of listeners.values()) for (const fn of set) fn();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function work() {
  if (running) return;
  running = true;
  while (queue.length) {
    const src = queue[0]!;
    await sleep(Math.max(0, nextAt - Date.now()));
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const r = await fetch(src);
        if (r.ok && r.headers.get("content-type")?.startsWith("image/")) {
          const blob = await r.blob();
          await writeBlob(src, blob);
          objectUrls.set(src, URL.createObjectURL(blob));
          ok = true;
        } else {
          const body = await r.text().catch(() => "");
          const wait = Number(body.match(/Retry after (\d+)s/)?.[1] ?? r.headers.get("retry-after") ?? 45);
          await sleep((wait + 1) * 1000);
        }
      } catch {
        await sleep(5000);
      }
    }
    if (!ok) failed.add(src);
    nextAt = Date.now() + GAP_MS;
    queue.shift();
    notifyAll();
  }
  running = false;
}

export function pictureState(src: string): PicState {
  if (!isQueued(src)) return { status: "ready", url: src };
  const u = objectUrls.get(src);
  if (u) return { status: "ready", url: u };
  if (failed.has(src)) return { status: "failed" };
  const i = queue.indexOf(src);
  return { status: "waiting", ahead: Math.max(0, i) };
}

/** Subscribes to a picture; starts loading it from the device or puts it in line. */
export function watchPicture(src: string, onChange: () => void) {
  if (!isQueued(src)) return () => {};
  let set = listeners.get(src);
  if (!set) listeners.set(src, (set = new Set()));
  set.add(onChange);
  if (!objectUrls.has(src) && !failed.has(src)) {
    void readBlob(src).then((b) => {
      if (b) {
        objectUrls.set(src, URL.createObjectURL(b));
        onChange();
      } else if (!queue.includes(src)) {
        queue.push(src);
        notifyAll();
        void work();
      }
    });
  }
  return () => {
    set!.delete(onChange);
  };
}

export function retryPicture(src: string) {
  failed.delete(src);
  if (!queue.includes(src)) queue.push(src);
  notifyAll();
  void work();
}
