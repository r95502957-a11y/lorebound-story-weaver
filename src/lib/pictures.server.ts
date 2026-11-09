// Server-only: finds REAL pictures — official character art and canon places from the fandom's wiki,
// real scenery photos from free photo libraries. Returns null when nothing trustworthy exists.
const UA = { "User-Agent": "AbsoluteRP/1.0 (personal roleplay app)" };

async function getJson(url: string, ms = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const tokens = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);

export function wikiCandidates(fandom: string, wiki?: string) {
  const out: string[] = [];
  const clean = (s: string) => s.toLowerCase().replace(/\.fandom\.com.*$/, "").replace(/^https?:\/\//, "").replace(/[^a-z0-9-]/g, "");
  if (wiki) out.push(clean(wiki));
  const slug = clean(fandom.replace(/\s+/g, ""));
  if (slug) out.push(slug);
  return [...new Set(out.filter(Boolean))];
}

type WikiPage = { title: string; index: number; thumbnail?: { source: string; width: number; height: number } };

async function wikiSearch(host: string, q: string, size: number): Promise<WikiPage[]> {
  const url = `https://${host}.fandom.com/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=${size}&format=json&origin=*`;
  const j = (await getJson(url)) as { query?: { pages?: Record<string, WikiPage> } } | null;
  return Object.values(j?.query?.pages ?? {}).sort((a, b) => a.index - b.index);
}

/** A page counts as this character only if every word of the asked name is in the page title. */
export function isCharacterMatch(name: string, title: string) {
  if (title.includes("/")) return false;
  const want = tokens(name);
  const have = new Set(tokens(title));
  return want.length > 0 && want.every((w) => have.has(w));
}

/** A place page must share at least one meaningful word with the asked place. */
export function isPlaceMatch(place: string, title: string) {
  if (title.includes("/")) return false;
  const have = new Set(tokens(title));
  return tokens(place).some((w) => w.length > 3 && have.has(w));
}

async function wikiPicture(hosts: string[], q: string, match: (title: string) => boolean, size: number) {
  for (const h of hosts) {
    const pages = await wikiSearch(h, q, size);
    const hit = pages.find((p) => p.thumbnail?.source && match(p.title));
    if (hit?.thumbnail) return hit.thumbnail.source;
  }
  return null;
}

async function photo(q: string) {
  const ov = (await getJson(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=5&mature=false&aspect_ratio=wide`,
  )) as { results?: { url?: string }[] } | null;
  const u = ov?.results?.find((r) => r.url?.startsWith("https://"))?.url;
  if (u) return u;
  const cm = (await getJson(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q + " filetype:bitmap")}&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json&origin=*`,
  )) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string }[] }> } } | null;
  return Object.values(cm?.query?.pages ?? {}).find((p) => p.imageinfo?.[0]?.thumburl)?.imageinfo?.[0]?.thumburl ?? null;
}

export type PicRequest = {
  key: string;
  kind: "character" | "place" | "cover";
  name: string; // character name, canon place name, or story title
  photo?: string; // real-world scenery search words, for places
};

export async function findRealPicture(fandom: string, wiki: string | undefined, r: PicRequest) {
  const hosts = wikiCandidates(fandom, wiki);
  if (r.kind === "character") {
    const u = r.name ? await wikiPicture(hosts, r.name, (t) => isCharacterMatch(r.name, t), 500) : null;
    return u ? { url: u, source: "wiki" as const } : null;
  }
  if (r.kind === "cover") {
    const u = await wikiPicture(hosts, fandom, (t) => isPlaceMatch(fandom, t) || isCharacterMatch(fandom, t), 1000);
    return u ? { url: u, source: "wiki" as const } : null;
  }
  if (r.name) {
    const u = await wikiPicture(hosts, r.name, (t) => isPlaceMatch(r.name, t), 1000);
    if (u) return { url: u, source: "wiki" as const };
  }
  if (r.photo) {
    const u = await photo(r.photo);
    if (u) return { url: u, source: "photo" as const };
  }
  return null;
}
