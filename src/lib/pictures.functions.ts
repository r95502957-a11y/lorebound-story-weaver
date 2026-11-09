import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const In = z.object({
  fandom: z.string().max(300),
  wiki: z.string().max(100).optional(),
  items: z
    .array(
      z.object({
        key: z.string().max(100),
        kind: z.enum(["character", "place", "cover"]),
        name: z.string().max(200),
        photo: z.string().max(200).optional(),
      }),
    )
    .max(20),
});

/** Looks up real pictures for several characters/places at once. Missing ones come back as null. */
export const findPictures = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => In.parse(d))
  .handler(async ({ data }) => {
    const { findRealPicture } = await import("./pictures.server");
    const results = await Promise.all(
      data.items.map(async (it) => {
        const { photo, ...rest } = it;
        const hit = await findRealPicture(data.fandom, data.wiki, photo ? { ...rest, photo } : rest).catch(() => null);
        return { key: it.key, url: hit?.url ?? null, source: hit?.source ?? null };
      }),
    );
    return { results };
  });
