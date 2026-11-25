/**
 * Effect recipes (bead bzc.26): what a cast, a strike, a death, a pickup...
 * puts in an {@link FxField}. Each school has its own palette and motifs:
 *
 * - Bloom: leaves, vines and sprouting.
 * - Accord: seals, chains and paper stamps.
 * - Clock: gears, clock hands and ticking rings.
 * - Hush: wisps, motes and fading ink.
 * - Storm: lightning, embers and frost shards (and rain and wind).
 *
 * Recipes are decoration only: callers skip them under reduced motion and
 * in instant mode. Coordinates are those of the field (battle stage pixels
 * or map world pixels).
 */
import type { School } from "../../core/battle/types.ts";
import { fxRandom } from "./field.ts";
import type { FxClock, FxField } from "./field.ts";
import { PALETTES, SCHOOL_PALETTES } from "./pixels.ts";
import type { Palette, ShapeId } from "./pixels.ts";

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Storm (and other) spells pick an element for their look. */
export type Element = "lightning" | "fire" | "frost" | "rain" | "wind";

let seedCounter = 1;
function rng(): () => number {
  seedCounter = (seedCounter * 1103515245 + 12345) >>> 0;
  return fxRandom(seedCounter);
}

/** Restarts the effect seeds (frame strips and tests repeat exactly). */
export function resetFxSeed(seed = 1): void {
  seedCounter = seed;
}

function between(r: () => number, a: number, b: number): number {
  return a + (b - a) * r();
}

export function schoolPalette(school: School, element?: Element): Palette {
  if (element) {
    if (element === "lightning") return PALETTES.lightning;
    if (element === "fire") return PALETTES.fire;
    if (element === "frost") return PALETTES.frost;
    if (element === "rain") return PALETTES.rain;
    return PALETTES.wind;
  }
  return SCHOOL_PALETTES[school];
}

/** The school's travelling motif (bolts, flourishes). */
export function schoolMote(school: School, element?: Element): ShapeId {
  if (element === "fire") return "ember";
  if (element === "frost") return "shard";
  if (element === "rain") return "drop";
  if (element === "wind") return "px2";
  switch (school) {
    case "bloom":
      return "leaf";
    case "accord":
      return "seal";
    case "clock":
      return "gear";
    case "hush":
      return "wisp";
    case "storm":
      return "spark";
  }
}

// ------------------------------------------------------------- casting

/** At the caster: a sigil ring and the school's motes rising. */
export function castFlourish(
  f: FxField,
  c: FxClock,
  school: School,
  at: Pt,
  element?: Element,
): void {
  const r = rng();
  const pal = schoolPalette(school, element);
  f.add(
    c,
    { kind: "ring", x: at.x, y: at.y, r0: 4, r1: 20, pal, flat: 0.5 },
    360,
  );
  if (school === "clock")
    f.add(
      c,
      { kind: "ring", x: at.x, y: at.y - 20, r0: 12, r1: 13, pal, ticks: true },
      380,
    );
  const small: ShapeId =
    school === "bloom"
      ? "leaf"
      : school === "accord"
        ? "px2"
        : school === "clock"
          ? "gear"
          : school === "hush"
            ? "wisp"
            : element === "frost"
              ? "shard"
              : "ember";
  for (let i = 0; i < 7; i++) {
    f.add(
      c,
      {
        kind: "p",
        shape: small,
        pal,
        x: at.x + between(r, -14, 14),
        y: at.y - between(r, 0, 10),
        vy: -between(r, 40, 90),
        vx: between(r, -12, 12),
        wob: school === "bloom" || school === "hush" ? 3 : 0,
        frames: small === "gear" ? ["gear", "gear2"] : undefined,
        flip: r() < 0.5,
        fade: "in-out",
      },
      between(r, 320, 460),
      i * 25,
    );
  }
}

/** A projectile from the caster to the target; returns its flight in ms. */
export function spellBolt(
  f: FxField,
  c: FxClock,
  school: School,
  from: Pt,
  to: Pt,
  element?: Element,
): number {
  const pal = schoolPalette(school, element);
  if (element === "lightning") {
    // From the sky, not from the caster.
    f.add(
      c,
      {
        kind: "bolt",
        x0: to.x + 10,
        y0: to.y - 150,
        x1: to.x,
        y1: to.y,
        pal,
        seed: Math.round(to.x * 31 + to.y),
      },
      360,
    );
    return 60;
  }
  const shape = schoolMote(school, element);
  const travel = Math.min(
    360,
    160 + Math.hypot(to.x - from.x, to.y - from.y) * 0.35,
  );
  f.add(
    c,
    {
      kind: "missile",
      x0: from.x,
      y0: from.y,
      x1: to.x,
      y1: to.y,
      arc: school === "accord" ? 40 : 24,
      shape,
      pal,
      trail: 6,
      frames: shape === "gear" ? ["gear", "gear2"] : undefined,
    },
    travel,
  );
  return travel;
}

/** A link drawn between two stacks: chains for Accord, a line otherwise. */
export function spellBeam(
  f: FxField,
  c: FxClock,
  school: School,
  a: Pt,
  b: Pt,
): number {
  const pal = schoolPalette(school);
  f.add(
    c,
    {
      kind: "beam",
      x0: a.x,
      y0: a.y,
      x1: b.x,
      y1: b.y,
      pal,
      chain: school === "accord",
    },
    520,
  );
  return 180;
}

/** The school's mark on a stack (body centre `at`, feet `feet`). */
export function schoolImpact(
  f: FxField,
  c: FxClock,
  school: School,
  at: Pt,
  feet: Pt,
  element?: Element,
  boon = false,
): void {
  const r = rng();
  const pal = schoolPalette(school, element);
  if (element === "lightning") {
    f.add(c, { kind: "star", x: at.x, y: at.y, r: 18, pal, rays: 8 }, 220);
    embers(f, c, r, at, PALETTES.fire, 8);
    return;
  }
  if (element === "fire") {
    f.add(c, { kind: "star", x: at.x, y: at.y, r: 14, pal, rays: 6 }, 200);
    for (let i = 0; i < 4; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "flame",
          pal,
          x: feet.x + between(r, -12, 12),
          y: feet.y - 6,
          vy: -between(r, 10, 30),
          fade: "out",
        },
        between(r, 380, 520),
        i * 40,
      );
    embers(f, c, r, at, pal, 10);
    return;
  }
  if (element === "frost") {
    f.add(
      c,
      { kind: "ring", x: feet.x, y: feet.y, r0: 6, r1: 24, pal, flat: 0.45 },
      360,
    );
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      f.add(
        c,
        {
          kind: "p",
          shape: "shard",
          pal,
          x: at.x,
          y: at.y,
          vx: Math.cos(a) * between(r, 50, 90),
          vy: Math.sin(a) * between(r, 40, 70) - 20,
          ay: 120,
          fade: "out",
        },
        between(r, 320, 440),
      );
    }
    return;
  }
  if (element === "rain") {
    for (let i = 0; i < 14; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "drop",
          pal,
          x: at.x + between(r, -22, 22),
          y: at.y - between(r, 40, 70),
          vy: 220,
          fade: "out",
        },
        between(r, 220, 320),
        i * 18,
      );
    f.add(
      c,
      { kind: "ring", x: feet.x, y: feet.y, r0: 4, r1: 20, pal, flat: 0.4 },
      320,
      160,
    );
    return;
  }
  if (element === "wind") {
    for (let i = 0; i < 10; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "px2",
          pal,
          x: at.x - 30 + between(r, -6, 6),
          y: at.y + between(r, -24, 10),
          vx: between(r, 160, 240),
          fade: "out",
        },
        between(r, 200, 300),
        i * 20,
      );
    return;
  }
  switch (school) {
    case "bloom": {
      for (let i = 0; i < (boon ? 6 : 9); i++) {
        const a = between(r, -Math.PI, 0);
        f.add(
          c,
          {
            kind: "p",
            shape: r() < 0.25 ? "flower" : "leaf",
            pal,
            x: at.x,
            y: at.y - 6,
            vx: Math.cos(a) * between(r, 60, 130),
            vy: Math.sin(a) * between(r, 60, 120),
            ay: 160,
            wob: 3,
            wobF: 2,
            flip: r() < 0.5,
            fade: "out",
          },
          between(r, 480, 640),
        );
      }
      for (let i = 0; i < 2; i++)
        f.add(
          c,
          {
            kind: "vine",
            x: feet.x + (i === 0 ? -12 : 12),
            y: feet.y,
            h: 22 + i * 6,
            pal,
            seed: Math.round(feet.x + i * 97),
          },
          560,
          i * 60,
        );
      for (let i = 0; i < 3; i++)
        f.add(
          c,
          {
            kind: "p",
            shape: "sprout",
            pal,
            x: feet.x + between(r, -16, 16),
            y: feet.y - 3,
            vy: -14,
            fade: "in-out",
          },
          460,
          80 + i * 50,
        );
      return;
    }
    case "accord": {
      f.add(
        c,
        {
          kind: "p",
          shape: "seal",
          pal,
          x: at.x,
          y: at.y - 42,
          vy: 190,
          scale: 2,
          fade: "none",
        },
        150,
      );
      f.add(
        c,
        {
          kind: "p",
          shape: "seal",
          pal,
          x: at.x,
          y: at.y - 14,
          scale: 2,
          fade: "blink",
        },
        360,
        150,
      );
      f.add(
        c,
        { kind: "ring", x: feet.x, y: feet.y, r0: 8, r1: 26, pal, flat: 0.45 },
        360,
        150,
      );
      for (let i = 0; i < 5; i++)
        f.add(
          c,
          {
            kind: "p",
            shape: "paper",
            pal,
            x: at.x + between(r, -10, 10),
            y: at.y - 10,
            vx: between(r, -60, 60),
            vy: -between(r, 30, 70),
            ay: 110,
            wob: 4,
            wobF: 2.5,
            fade: "out",
          },
          between(r, 460, 600),
          150,
        );
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        f.add(
          c,
          {
            kind: "p",
            shape: "px2",
            pal,
            x: at.x + Math.cos(a) * 10,
            y: at.y - 14 + Math.sin(a) * 6,
            vx: Math.cos(a) * 60,
            vy: Math.sin(a) * 40,
            fade: "out",
          },
          260,
          160,
        );
      }
      return;
    }
    case "clock": {
      f.add(
        c,
        {
          kind: "ring",
          x: at.x,
          y: at.y - 6,
          r0: 22,
          r1: 28,
          pal,
          ticks: true,
        },
        560,
      );
      f.add(
        c,
        { kind: "hand", x: at.x, y: at.y - 6, r: 20, pal, turns: 1 },
        560,
      );
      for (let i = 0; i < 4; i++) {
        const a = between(r, -Math.PI, 0);
        f.add(
          c,
          {
            kind: "p",
            shape: "gear",
            pal,
            x: at.x,
            y: at.y,
            vx: Math.cos(a) * between(r, 60, 110),
            vy: Math.sin(a) * between(r, 60, 100),
            ay: 140,
            frames: ["gear", "gear2"],
            frameMs: 80,
            fade: "out",
          },
          between(r, 440, 560),
          100 + i * 30,
        );
      }
      f.add(
        c,
        { kind: "ring", x: feet.x, y: feet.y, r0: 6, r1: 22, pal, flat: 0.45 },
        360,
        200,
      );
      return;
    }
    case "hush": {
      for (let i = 0; i < 6; i++)
        f.add(
          c,
          {
            kind: "p",
            shape: "wisp",
            pal,
            x: at.x + between(r, -16, 16),
            y: at.y + between(r, -6, 14),
            vy: -between(r, 24, 46),
            wob: 3,
            wobF: 1.4,
            fade: "in-out",
          },
          between(r, 520, 720),
          i * 40,
        );
      for (let i = 0; i < 10; i++)
        f.add(
          c,
          {
            kind: "p",
            shape: r() < 0.5 ? "mote" : "px",
            pal,
            x: at.x + between(r, -24, 24),
            y: at.y + between(r, -24, 16),
            vx: between(r, -14, 14),
            vy: -between(r, 6, 20),
            fade: "blink",
          },
          between(r, 520, 760),
          i * 20,
        );
      for (let i = 0; i < 4; i++)
        f.add(
          c,
          {
            kind: "p",
            shape: "ink",
            pal,
            x: at.x + between(r, -12, 12),
            y: at.y - 26,
            vy: 30,
            ay: 180,
            fade: "out",
          },
          between(r, 360, 480),
          60 + i * 70,
        );
      return;
    }
    case "storm": {
      f.add(c, { kind: "star", x: at.x, y: at.y, r: 14, pal, rays: 8 }, 220);
      embers(f, c, r, at, pal, 8);
      return;
    }
  }
}

function embers(
  f: FxField,
  c: FxClock,
  r: () => number,
  at: Pt,
  pal: Palette,
  n: number,
): void {
  for (let i = 0; i < n; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: r() < 0.5 ? "ember" : "px",
        pal,
        x: at.x + between(r, -10, 10),
        y: at.y + between(r, -8, 8),
        vx: between(r, -50, 50),
        vy: -between(r, 40, 110),
        ay: 60,
        fade: "blink",
      },
      between(r, 360, 560),
      i * 15,
    );
}

/** Boons: the school's motes fall gently onto the stack first. */
export function spellTouch(
  f: FxField,
  c: FxClock,
  school: School,
  at: Pt,
  element?: Element,
): number {
  const r = rng();
  const pal = schoolPalette(school, element);
  const shape: ShapeId =
    school === "hush"
      ? "mote"
      : school === "bloom"
        ? "leaf"
        : school === "clock"
          ? "px2"
          : "dot";
  for (let i = 0; i < 8; i++)
    f.add(
      c,
      {
        kind: "p",
        shape,
        pal,
        x: at.x + between(r, -18, 18),
        y: at.y - between(r, 40, 64),
        vy: between(r, 90, 130),
        wob: 2,
        fade: "in-out",
        flip: r() < 0.5,
      },
      300,
      i * 15,
    );
  return 200;
}

/** An area: a ring over its centre and the motif across its hexes. */
export function spellBurst(
  f: FxField,
  c: FxClock,
  school: School,
  centre: Pt,
  hexes: readonly Pt[],
  element?: Element,
): void {
  const r = rng();
  const pal = schoolPalette(school, element);
  let radius = 20;
  for (const h of hexes)
    radius = Math.max(
      radius,
      Math.hypot(h.x - centre.x, (h.y - centre.y) * 2) + 24,
    );
  f.add(
    c,
    {
      kind: "ring",
      x: centre.x,
      y: centre.y,
      r0: 8,
      r1: radius,
      pal,
      flat: 0.5,
      size: 2,
    },
    420,
  );
  if (school === "clock")
    f.add(
      c,
      {
        kind: "ring",
        x: centre.x,
        y: centre.y - 4,
        r0: radius * 0.6,
        r1: radius * 0.6 + 2,
        pal,
        flat: 0.5,
        ticks: true,
      },
      520,
    );
  const cap = Math.max(1, Math.floor(60 / Math.max(1, hexes.length)));
  for (const h of hexes) {
    const d = Math.hypot(h.x - centre.x, h.y - centre.y);
    const delay = d * 1.2;
    const n = Math.min(cap, 4);
    for (let i = 0; i < n; i++) {
      if (element === "lightning" && i === 0 && r() < 0.5) {
        f.add(
          c,
          {
            kind: "bolt",
            x0: h.x + between(r, -8, 8),
            y0: h.y - 120,
            x1: h.x,
            y1: h.y - 10,
            pal,
            seed: Math.round(h.x * 7 + h.y),
          },
          300,
          delay,
        );
        continue;
      }
      const shape = schoolMote(school, element);
      f.add(
        c,
        {
          kind: "p",
          shape: shape === "seal" ? "paper" : shape,
          pal,
          x: h.x + between(r, -14, 14),
          y: h.y - between(r, 4, 20),
          vx: between(r, -20, 20),
          vy: element === "rain" ? 160 : -between(r, 20, 60),
          ay: element === "rain" ? 0 : 60,
          wob: school === "bloom" || school === "hush" ? 3 : 0,
          frames: shape === "gear" ? ["gear", "gear2"] : undefined,
          fade: "out",
          flip: r() < 0.5,
        },
        between(r, 360, 520),
        delay + i * 30,
      );
    }
  }
}

/** Something risen on a hex (Seedlings, Shades): a column of motes. */
export function summonRise(
  f: FxField,
  c: FxClock,
  school: School,
  feet: Pt,
): void {
  const r = rng();
  const pal = school === "hush" ? PALETTES.shade : schoolPalette(school);
  f.add(
    c,
    { kind: "ring", x: feet.x, y: feet.y, r0: 4, r1: 24, pal, flat: 0.45 },
    420,
  );
  for (let i = 0; i < 12; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: school === "bloom" ? "sprout" : "mote",
        pal,
        x: feet.x + between(r, -14, 14),
        y: feet.y - between(r, 0, 6),
        vy: -between(r, 40, 90),
        wob: 2,
        fade: "in-out",
      },
      between(r, 380, 560),
      i * 25,
    );
}

/** A ground feature appears on a hex (centre `at`). */
export function groundSpawn(
  f: FxField,
  c: FxClock,
  kind: string,
  at: Pt,
  school: School | null,
): void {
  const r = rng();
  if (kind === "fire") {
    for (let i = 0; i < 4; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "flame",
          pal: PALETTES.fire,
          x: at.x + between(r, -14, 14),
          y: at.y + between(r, -4, 8),
          vy: -between(r, 8, 20),
          fade: "in-out",
        },
        between(r, 420, 560),
        i * 50,
      );
    embers(f, c, r, at, PALETTES.fire, 4);
    return;
  }
  if (kind === "brambles") {
    // Thorny stems grow up out of the ground, then tangles push in.
    const pal = PALETTES.bramble;
    for (let i = 0; i < 3; i++)
      f.add(
        c,
        {
          kind: "vine",
          x: at.x + (i - 1) * 10,
          y: at.y + 8,
          h: 14 + i * 3,
          pal,
          seed: Math.round(at.x * 3 + i),
        },
        520,
        i * 40,
      );
    // The hex's bramble icon grows up out of the ground meanwhile
    // (renderer: Scene.groundGrow); a few leaves are shaken loose.
    for (let i = 0; i < 3; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "leaf",
          pal,
          x: at.x + between(r, -12, 12),
          y: at.y + 4,
          vx: between(r, -30, 30),
          vy: -between(r, 30, 60),
          ay: 140,
          wob: 2,
          flip: r() < 0.5,
          fade: "out",
        },
        420,
        160 + i * 40,
      );
    return;
  }
  if (kind === "mist") {
    const pal = PALETTES.shade;
    for (let i = 0; i < 4; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "mist",
          pal,
          x: at.x + between(r, -16, 16),
          y: at.y + between(r, -6, 6),
          vx: between(r, -10, 10),
          fade: "in-out",
          scale: 2,
        },
        between(r, 520, 700),
        i * 60,
      );
    return;
  }
  const pal = school ? SCHOOL_PALETTES[school] : PALETTES.dust;
  f.add(
    c,
    { kind: "ring", x: at.x, y: at.y + 6, r0: 4, r1: 18, pal, flat: 0.5 },
    320,
  );
}

// ------------------------------------------------------------- strikes

/** Where a melee blow lands: a star of white and gold, and some dust. */
export function impact(f: FxField, c: FxClock, at: Pt, heavy: boolean): void {
  const r = rng();
  f.add(
    c,
    {
      kind: "star",
      x: at.x,
      y: at.y,
      r: heavy ? 18 : 12,
      pal: PALETTES.impact,
      rays: heavy ? 10 : 8,
    },
    heavy ? 240 : 180,
  );
  for (let i = 0; i < (heavy ? 8 : 5); i++)
    f.add(
      c,
      {
        kind: "p",
        shape: "px2",
        pal: PALETTES.impact,
        x: at.x,
        y: at.y,
        vx: between(r, -90, 90),
        vy: -between(r, 20, 90),
        ay: 260,
        fade: "out",
      },
      between(r, 220, 320),
    );
}

/** Dust kicked up at the feet (walks, pushes, landings). */
export function dust(f: FxField, c: FxClock, feet: Pt, n = 4): void {
  const r = rng();
  for (let i = 0; i < n; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: r() < 0.5 ? "px2" : "px",
        pal: PALETTES.dust,
        x: feet.x + between(r, -10, 10),
        y: feet.y - 2,
        vx: between(r, -30, 30),
        vy: -between(r, 10, 40),
        ay: 90,
        fade: "out",
      },
      between(r, 240, 360),
    );
}

/** A stack falls: dust, then a few bones where the remains lie. */
export function deathPuff(
  f: FxField,
  c: FxClock,
  feet: Pt,
  remains: boolean,
): void {
  const r = rng();
  for (let i = 0; i < 8; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: "px2",
        pal: PALETTES.dust,
        x: feet.x + between(r, -14, 14),
        y: feet.y - between(r, 4, 26),
        vx: between(r, -24, 24),
        vy: -between(r, 10, 40),
        fade: "out",
      },
      between(r, 360, 480),
      i * 20,
    );
  if (remains)
    for (let i = 0; i < 3; i++)
      f.add(
        c,
        {
          kind: "p",
          shape: "bone",
          pal: PALETTES.bone,
          x: feet.x + between(r, -10, 10),
          y: feet.y - 4,
          vy: -between(r, 30, 50),
          ay: 300,
          fade: "in-out",
        },
        320,
        220 + i * 50,
      );
}

/** Rising from remains: shade motes swirl up the body. */
export function getUpSwirl(f: FxField, c: FxClock, feet: Pt): void {
  const r = rng();
  f.add(
    c,
    {
      kind: "ring",
      x: feet.x,
      y: feet.y,
      r0: 22,
      r1: 4,
      pal: PALETTES.shade,
      flat: 0.45,
    },
    360,
  );
  for (let i = 0; i < 10; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: i % 3 === 0 ? "bone" : "mote",
        pal: i % 3 === 0 ? PALETTES.bone : PALETTES.shade,
        x: feet.x + between(r, -16, 16),
        y: feet.y - 2,
        vy: -between(r, 50, 90),
        wob: 3,
        fade: "in-out",
      },
      between(r, 360, 520),
      i * 25,
    );
}

/** A stack vanishes or appears (teleport): a column of gold sparks. */
export function blink(
  f: FxField,
  c: FxClock,
  feet: Pt,
  school: School = "clock",
): void {
  const r = rng();
  const pal = SCHOOL_PALETTES[school];
  for (let i = 0; i < 10; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: i % 2 ? "spark" : "px",
        pal,
        x: feet.x + between(r, -12, 12),
        y: feet.y - between(r, 0, 44),
        vy: -between(r, 20, 60),
        fade: "blink",
      },
      between(r, 260, 380),
      i * 12,
    );
  f.add(
    c,
    { kind: "ring", x: feet.x, y: feet.y, r0: 6, r1: 20, pal, flat: 0.45 },
    280,
  );
}

/** Sparkles of good fortune (Heartened, Lucky, level-ups). */
export function sparkle(
  f: FxField,
  c: FxClock,
  at: Pt,
  shape: ShapeId = "spark",
  pal: Palette = PALETTES.gold,
  n = 6,
  spread = 18,
): void {
  const r = rng();
  for (let i = 0; i < n; i++)
    f.add(
      c,
      {
        kind: "p",
        shape: i === 0 ? shape : r() < 0.5 ? "spark" : "px2",
        pal,
        x: at.x + between(r, -spread, spread),
        y: at.y + between(r, -spread, spread * 0.6),
        vy: -between(r, 10, 30),
        fade: "blink",
      },
      between(r, 380, 560),
      i * 40,
    );
}

/** A big burst for a level-up or a capture. */
export function burst(
  f: FxField,
  c: FxClock,
  at: Pt,
  pal: Palette = PALETTES.gold,
  n = 18,
): void {
  const r = rng();
  f.add(
    c,
    { kind: "ring", x: at.x, y: at.y, r0: 6, r1: 40, pal, flat: 0.5 },
    520,
  );
  f.add(c, { kind: "star", x: at.x, y: at.y - 20, r: 22, pal, rays: 10 }, 320);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    f.add(
      c,
      {
        kind: "p",
        shape: i % 3 === 0 ? "spark" : "px2",
        pal,
        x: at.x,
        y: at.y - 20,
        vx: Math.cos(a) * between(r, 60, 120),
        vy: Math.sin(a) * between(r, 50, 100) - 40,
        ay: 120,
        fade: "blink",
      },
      between(r, 560, 760),
    );
  }
}
