import { useEffect, useRef, useState } from "react";
import { ImagePlus, Link2, RefreshCw } from "lucide-react";
import { shrinkImage } from "@/lib/visuals";

/** Picture that retries a couple of times (the free picture service can be slow), then shows a fallback. */
export function Pic({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    setLoaded(false);
  }, [src]);
  if (!src || failed) return <>{fallback ?? <div className={`${className} bg-secondary`} />}</>;
  const url = attempt && !src.startsWith("data:") ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (attempt < 2) setTimeout(() => setAttempt((a) => a + 1), 2500 * (attempt + 1));
        else setFailed(true);
      }}
      className={`${className} bg-secondary object-cover ${loaded ? "" : "animate-pulse"}`}
    />
  );
}

export function Avatar({ src, name, size = "md" }: { src?: string | undefined; name: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "sm" ? "h-7 w-7 text-xs" : size === "lg" ? "h-16 w-16 text-xl" : "h-11 w-11 text-sm";
  const fb = (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-secondary font-display font-bold text-primary ring-1 ring-border`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
  return <Pic src={src} alt={name} className={`${cls} shrink-0 rounded-full ring-1 ring-border`} fallback={fb} />;
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
