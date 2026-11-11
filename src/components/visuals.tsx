import { useEffect, useRef, useState } from "react";
import { ImagePlus, Link2, RefreshCw } from "lucide-react";
import { shrinkImage } from "@/lib/visuals";
import { pictureState, watchPicture, type PicState } from "@/lib/picture-cache";

/** Picture that retries a couple of times (the free picture service can be slow), then shows a fallback. */
export function Pic({
  src,
  alt,
  className,
  fallback,
  face,
}: {
  src?: string | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** Character picture: tall (full-body) art is zoomed onto the face instead of showing the torso. */
  face?: boolean;
}) {
  const [state, setState] = useState<PicState>({ status: "waiting", ahead: 0 });
  const [broken, setBroken] = useState(false);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    setBroken(false);
    setZoom(1);
    if (!src) return;
    const update = () => setState(pictureState(src));
    update();
    return watchPicture(src, update);
  }, [src]);
  if (!src || broken || state.status === "failed") return <>{fallback ?? <div className={`${className} bg-secondary`} />}</>;
  if (state.status === "waiting")
    return (
      <>
        {fallback ?? (
          <div className={`${className} flex animate-pulse items-center justify-center bg-secondary text-xs text-muted-foreground`}>
            {state.ahead ? `Painting soon · ${state.ahead} ahead` : "Painting…"}
          </div>
        )}
      </>
    );
  return (
    <img
      src={state.url}
      alt={alt}
      onError={() => setBroken(true)}
      onLoad={face ? (e) => setZoom(faceZoom(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) : undefined}
      style={face ? { objectPosition: "50% 0%", transform: zoom > 1 ? `scale(${zoom})` : undefined, transformOrigin: "50% 3%" } : undefined}
      className={`${className} bg-secondary object-cover`}
    />
  );
}

/** How much to zoom a character picture so the face fills a round avatar (tall full-body art needs more). */
export function faceZoom(w: number, h: number) {
  if (!w || !h) return 1;
  const r = h / w;
  if (r <= 1.15) return 1;
  return Math.min(2, 1 + (r - 1) * 1.2);
}

/** Same as Pic but resolves to the saved picture so zoom shows it too. */
export function usePictureUrl(src: string | null) {
  const [, force] = useState(0);
  useEffect(() => (src ? watchPicture(src, () => force((n) => n + 1)) : undefined), [src]);
  if (!src) return null;
  const s = pictureState(src);
  return s.status === "ready" ? s.url : null;
}

export function Avatar({ src, name, size = "md" }: { src?: string | undefined; name: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "sm" ? "h-7 w-7 text-xs" : size === "lg" ? "h-16 w-16 text-xl" : "h-11 w-11 text-sm";
  const fb = (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-secondary font-display font-bold text-primary ring-1 ring-border`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
  return (
    <div className={`${cls} shrink-0 overflow-hidden rounded-full ring-1 ring-border`}>
      <Pic src={src} alt={name} className="h-full w-full" fallback={fb} face />
    </div>
  );
}

/** "New picture / Upload / Link" controls for any picture. */
export function PictureControls({
  onReroll,
  onSet,
  maxUpload = 384,
}: {
  onReroll?: () => void;
  onSet: (url: string) => void;
  maxUpload?: number;
}) {
  const file = useRef<HTMLInputElement>(null);
  const btn = "flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs";
  return (
    <div className="flex flex-wrap gap-1.5">
      {onReroll && (
        <button type="button" onClick={onReroll} className={btn}><RefreshCw className="h-3 w-3" /> New picture</button>
      )}
      <button type="button" onClick={() => file.current?.click()} className={btn}><ImagePlus className="h-3 w-3" /> Upload</button>
      <button
        type="button"
        onClick={() => {
          const u = prompt("Paste a picture link (https://…)");
          if (u && /^https?:\/\//.test(u.trim())) onSet(u.trim());
        }}
        className={btn}
      >
        <Link2 className="h-3 w-3" /> Link
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onSet(await shrinkImage(f, maxUpload));
        }}
      />
    </div>
  );
}

/** Reveals streamed text word by word at a steady pace, catching up quickly when far behind. */
export function useTypewriter(target: string, active: boolean) {
  const [shown, setShown] = useState(active ? 0 : target.length);
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    if (!active) {
      setShown(target.length);
      return;
    }
    const t = setInterval(() => {
      setShown((n) => {
        const full = targetRef.current;
        if (n >= full.length) return n;
        const behind = full.length - n;
        let next = n + Math.max(2, Math.min(40, Math.ceil(behind / 25)));
        const sp = full.indexOf(" ", next);
        next = sp === -1 ? Math.min(full.length, next) : Math.min(sp + 1, n + 60);
        return next;
      });
    }, 30);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return active ? target.slice(0, shown) : target;
}
