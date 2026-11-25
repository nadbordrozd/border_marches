/**
 * The adventure map's action cursors (UI2-07, bead bzc.58), drawn in code
 * from the pixel palette: no new art. Each cursor is a small mask of
 * palette digits, outlined in the effects' near-black, painted at 2x into a
 * 32x32 image and used as a CSS cursor with its hotspot in the middle (the
 * cell under the pointer). Without a canvas (unit tests) the plain CSS
 * keyword stands in.
 *
 * Mask digits: 1 light, 2 mid, 3 dark, 4 near-black, 5 accent; "." is
 * transparent. The outline round every shape is added when painting.
 */
import { OUTLINE } from "../render/fx/pixels.ts";

/** What a click on the hovered map cell does (map-clicks.ts mapAction). */
export type CursorKind =
  | "walk"
  | "walk-later"
  | "attack"
  | "visit"
  | "pickup"
  | "town"
  | "meet"
  | "blocked"
  | "cast"
  | "none";

/** Every kind with a drawn cursor ("none" is the plain arrow). */
export const CURSOR_KINDS = [
  "walk",
  "walk-later",
  "attack",
  "visit",
  "pickup",
  "town",
  "meet",
  "blocked",
  "cast",
] as const satisfies readonly CursorKind[];

export type DrawnCursor = (typeof CURSOR_KINDS)[number];

/** The largest mask: 14x14, 16x16 with its outline, 32x32 painted. */
export const MASK_SIZE = 14;
export const CURSOR_SCALE = 2;
export const CURSOR_PX = (MASK_SIZE + 2) * CURSOR_SCALE;

/** The boot of walk and walk-later (walk-later adds a crescent moon). */
const BOOT = [
  "..............",
  "...111111.....",
  "...122223.....",
  "...122223.....",
  "...122223.....",
  "...122223.....",
  "...122223.....",
  "...1222222....",
  "...12222222...",
  "...122222222..",
  "...1222222222.",
  "...3333333333.",
  "...33.....33..",
  "..............",
];

const MOON = [
  "...........55.",
  "..........5...",
  "..........5...",
  "...........55.",
];

/** The no-entry sign: a ring and a slash, computed. */
function noEntry(): string[] {
  const rows: string[] = [];
  const c = (MASK_SIZE - 1) / 2;
  for (let y = 0; y < MASK_SIZE; y++) {
    let row = "";
    for (let x = 0; x < MASK_SIZE; x++) {
      const d = Math.hypot(x - c, y - c);
      const ring = d >= 4.7 && d <= 6.6;
      const slash = Math.abs(x - y) <= 0.5 && d < 5;
      row += ring ? (y < c ? "1" : "2") : slash ? "2" : ".";
    }
    rows.push(row);
  }
  return rows;
}

export const CURSOR_MASKS: Readonly<Record<DrawnCursor, readonly string[]>> = {
  walk: BOOT,
  "walk-later": BOOT.map((row, y) => {
    const moon = MOON[y];
    if (moon === undefined) return row;
    return [...row].map((ch, x) => (moon[x] === "5" ? "5" : ch)).join("");
  }),
  attack: [
    "..............",
    ".1..........1.",
    "..1........1..",
    "...1......1...",
    "....1....1....",
    ".....1..1.....",
    "......11......",
    "......11......",
    "...5.1..1.5...",
    "....5....5....",
    "...3.5..5.3...",
    "..3........3..",
    ".5..........5.",
    "..............",
  ],
  visit: [
    "..5...........",
    "..3...........",
    "..31111111111.",
    "..31222222221.",
    "..3122222221..",
    "..312222221...",
    "..3122222221..",
    "..31222222221.",
    "..31111111111.",
    "..3...........",
    "..3...........",
    "..3...........",
    "..3...........",
    "..............",
  ],
  pickup: [
    "....11.11.....",
    "....12.12.11..",
    ".11.12.12.12..",
    ".12.12.12.12..",
    ".12.12.12.12..",
    ".12.12.12.12..",
    ".12222222222..",
    ".1222222222211",
    ".122222222222.",
    ".12222222222..",
    "..2222222222..",
    "..3222222223..",
    "...33333333...",
    "..............",
  ],
  town: [
    "......355.....",
    "....1.3.1.....",
    "....11111.....",
    "....11111.....",
    "....11411.....",
    "2.2.11111.2.2.",
    "2222111112222.",
    "2222111112222.",
    "2222111112222.",
    "2222114112222.",
    "2222144412222.",
    "2222144412222.",
    "3333344433333.",
    "..............",
  ],
  meet: [
    "..............",
    "..111....111..",
    ".11111..11111.",
    ".11111..11111.",
    "..111....111..",
    "..............",
    "..222....333..",
    ".22222..33333.",
    ".22222..33333.",
    ".22222..33333.",
    ".22222..33333.",
    ".22222..33333.",
    "..............",
    "..............",
  ],
  blocked: noEntry(),
  cast: [
    "......1.......",
    "......1...5...",
    ".....121......",
    ".....121......",
    "....12221.....",
    "...1225221....",
    "1122255522211.",
    "...1225221....",
    "....12221.....",
    ".....121......",
    "..5..121......",
    "......1.......",
    "......1.......",
    "..............",
  ],
};

/** Colours for digits 1, 2, 3, 4 and 5, from the effects' palettes. */
type CursorPalette = readonly [string, string, string, string, string];

export const CURSOR_PALETTES: Readonly<Record<DrawnCursor, CursorPalette>> = {
  // Gold boot (PALETTES.gold); tomorrow in dusk blue (PALETTES.rain).
  walk: ["#fffbe0", "#ffd65c", "#c8901e", OUTLINE, "#ffffff"],
  "walk-later": ["#e8f4ff", "#9cc8f0", "#4a78b0", OUTLINE, "#fff59a"],
  // Steel blades (PALETTES.white), dark grips, gold guards.
  attack: ["#ffffff", "#f0e6c8", "#7a4a24", OUTLINE, "#ffd65c"],
  // A red banner with a gold edge on a wooden pole.
  visit: ["#ffd65c", "#c0392b", "#7a4a24", OUTLINE, "#fffbe0"],
  // A hand (the old "grab" cursor of bzc.49, drawn).
  pickup: ["#ffe8c8", "#f0b98a", "#b07a4a", OUTLINE, "#ffffff"],
  // Pale stone keep, grey walls, dark gate, a red pennant.
  town: ["#f2ead8", "#bfae8a", "#8a7a5a", OUTLINE, "#c0392b"],
  // Two heroes: gold and blue tunics.
  meet: ["#ffe0bd", "#ffd65c", "#7fb8ff", OUTLINE, "#ffffff"],
  blocked: ["#ff9a80", "#d8402a", "#8a2410", OUTLINE, "#ffffff"],
  // Spell aiming: a violet star (PALETTES hush).
  cast: ["#f0e4ff", "#b48cff", "#6b45b0", OUTLINE, "#ffffff"],
};

/** The CSS keyword used when the drawn cursor is unavailable. */
export const CURSOR_FALLBACK: Readonly<Record<CursorKind, string>> = {
  walk: "pointer",
  "walk-later": "pointer",
  attack: "crosshair",
  visit: "pointer",
  pickup: "grab",
  town: "pointer",
  meet: "pointer",
  blocked: "not-allowed",
  cast: "crosshair",
  none: "default",
};

/**
 * The cursor as a 16x16 grid of colours (null: transparent): the mask
 * centred, plus a one-pixel outline round it (4-neighbours). Pure.
 */
export function cursorPixels(kind: DrawnCursor): Array<Array<string | null>> {
  const mask = CURSOR_MASKS[kind];
  const pal = CURSOR_PALETTES[kind];
  const n = MASK_SIZE + 2;
  const at = (x: number, y: number): string =>
    x < 0 || y < 0 || x >= MASK_SIZE || y >= MASK_SIZE
      ? "."
      : ((mask[y] ?? "")[x] ?? ".");
  const out: Array<Array<string | null>> = [];
  for (let gy = 0; gy < n; gy++) {
    const row: Array<string | null> = [];
    for (let gx = 0; gx < n; gx++) {
      const x = gx - 1;
      const y = gy - 1;
      const ch = at(x, y);
      if (ch !== ".") row.push(pal[Number(ch) - 1] ?? pal[1]);
      else if (
        at(x - 1, y) !== "." ||
        at(x + 1, y) !== "." ||
        at(x, y - 1) !== "." ||
        at(x, y + 1) !== "."
      )
        row.push(OUTLINE);
      else row.push(null);
    }
    out.push(row);
  }
  return out;
}

const urls = new Map<DrawnCursor, string | null>();

/** The cursor painted as a PNG data URL, or null without a canvas. */
export function cursorImage(kind: DrawnCursor): string | null {
  if (urls.has(kind)) return urls.get(kind) ?? null;
  let url: string | null = null;
  try {
    const canvas =
      typeof document === "undefined"
        ? null
        : (document.createElement("canvas") as HTMLCanvasElement);
    const ctx =
      canvas !== null && typeof canvas.getContext === "function"
        ? canvas.getContext("2d")
        : null;
    if (canvas !== null && ctx !== null) {
      canvas.width = CURSOR_PX;
      canvas.height = CURSOR_PX;
      cursorPixels(kind).forEach((row, y) =>
        row.forEach((colour, x) => {
          if (colour === null) return;
          ctx.fillStyle = colour;
          ctx.fillRect(
            x * CURSOR_SCALE,
            y * CURSOR_SCALE,
            CURSOR_SCALE,
            CURSOR_SCALE,
          );
        }),
      );
      url = canvas.toDataURL("image/png");
    }
  } catch {
    url = null;
  }
  urls.set(kind, url);
  return url;
}

/** The CSS `cursor` value for a kind: the drawn image, else a keyword. */
export function cursorStyle(kind: CursorKind): string {
  const fallback = CURSOR_FALLBACK[kind];
  if (kind === "none") return fallback;
  const url = cursorImage(kind);
  const hot = CURSOR_PX / 2;
  return url === null ? fallback : `url("${url}") ${hot} ${hot}, ${fallback}`;
}
