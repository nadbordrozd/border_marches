/**
 * What each shooter throws (bead bzc.26): arrows for archers, green spit,
 * drum-magic orbs, a banshee's wail, lit bombs on a high arc, and rocks for
 * anything else that shoots.
 */
import type { ShotKind } from "../../audio/fx.ts";
import type { FxClock, FxField } from "./field.ts";
import { PALETTES, SCHOOL_PALETTES } from "./pixels.ts";
import type { Palette, ShapeId } from "./pixels.ts";
import type { Pt } from "./emit.ts";

const BY_CREATURE: Readonly<Record<string, ShotKind>> = {
  longbowman: "arrow",
  archer: "arrow",
  crossbowman: "arrow",
  squire: "arrow",
  goblin: "rock",
  spitter: "spit",
  shaman: "orb",
  banshee: "wail",
  "bomb-chucker": "bomb",
};

export function shotKind(creatureId: string): ShotKind {
  return BY_CREATURE[creatureId] ?? "arrow";
}

interface ShotLook {
  readonly shape: ShapeId | "arrow";
  readonly pal: Palette;
  readonly arc: number;
  readonly trail: number;
  readonly frames?: readonly ShapeId[];
}

const LOOKS: Readonly<Record<ShotKind, ShotLook>> = {
  arrow: {
    shape: "arrow",
    pal: ["#f0f0f0", "#e8dcc0", "#6a4a2a", "#2a1a0a"],
    arc: 22,
    trail: 0,
  },
  spit: { shape: "drop", pal: PALETTES.spit, arc: 30, trail: 5 },
  orb: {
    shape: "dot",
    pal: ["#ffffff", "#c88cff", "#6b45b0", "#24163f"],
    arc: 14,
    trail: 6,
    frames: ["dot", "spark"],
  },
  wail: { shape: "wisp", pal: SCHOOL_PALETTES.hush, arc: 6, trail: 6 },
  bomb: { shape: "dot", pal: PALETTES.bomb, arc: 70, trail: 3 },
  rock: { shape: "px2", pal: PALETTES.dust, arc: 34, trail: 2 },
};

export function shotLook(kind: ShotKind): ShotLook {
  return LOOKS[kind];
}

/** Puts a shot in flight; `life` is its flight time in ms. */
export function launchShot(
  f: FxField,
  c: FxClock,
  kind: ShotKind,
  from: Pt,
  to: Pt,
  life: number,
): void {
  const look = LOOKS[kind];
  f.add(
    c,
    {
      kind: "missile",
      x0: from.x,
      y0: from.y,
      x1: to.x,
      y1: to.y,
      arc: look.arc,
      shape: look.shape,
      pal: look.pal,
      trail: look.trail,
      frames: look.frames,
    },
    life,
  );
}

/** Where a shot lands: a small splash in its own colours. */
export function shotSplash(
  f: FxField,
  c: FxClock,
  kind: ShotKind,
  at: Pt,
): void {
  const look = LOOKS[kind];
  const pal = kind === "bomb" ? PALETTES.fire : look.pal;
  f.add(
    c,
    {
      kind: "star",
      x: at.x,
      y: at.y,
      r: kind === "bomb" ? 20 : 10,
      pal,
      rays: kind === "bomb" ? 10 : 6,
    },
    kind === "bomb" ? 260 : 160,
  );
}
