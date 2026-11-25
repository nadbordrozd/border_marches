import { describe, expect, it } from "vitest";
import {
  FX_EVENTS,
  FX_SOUNDS,
  SHOT_KINDS,
  SPELL_SHAPES,
  soundForFx,
} from "../../../src/audio/fx.ts";
import { SPELL_SCHOOL_SOUNDS } from "../../../src/audio/sound.ts";
import { BATTLE_SPELLS } from "../../../src/core/magic/index.ts";
import type { School } from "../../../src/core/battle/index.ts";
import { FxField, MAX_FX, fxRandom } from "../../../src/render/fx/field.ts";
import {
  SCHOOL_PALETTES,
  SHAPES,
  shapeSize,
} from "../../../src/render/fx/pixels.ts";
import { shotKind, shotLook } from "../../../src/render/fx/shots.ts";
import {
  NEUTRAL_FX,
  SCHOOL_FALLBACK,
  SPELL_FX,
  spellFx,
} from "../../../src/render/fx/spell-fx.ts";
import {
  resolveReduced,
  nextMotionPref,
  parseMotionPref,
} from "../../../src/ui/motion.ts";

const SCHOOLS: School[] = ["bloom", "accord", "clock", "hush", "storm"];

describe("effect registry", () => {
  it("gives every battle spell its own effect", () => {
    for (const s of BATTLE_SPELLS) {
      expect(SPELL_FX[s.id], s.id).toBeDefined();
      const look = spellFx(s.id, s.school);
      expect(look.school).toBe(s.school);
      expect(look.fallback).toBe(false);
      expect(SPELL_SHAPES).toContain(look.shape);
    }
  });

  it("has no entry for a spell that does not exist", () => {
    const ids = new Set(BATTLE_SPELLS.map((s) => s.id));
    for (const id of Object.keys(SPELL_FX)) expect(ids.has(id), id).toBe(true);
  });

  it("falls back to the school's look, or a neutral one with no school", () => {
    for (const school of SCHOOLS) {
      const look = spellFx("a-spell-from-a-later-bead", school);
      expect(look).toMatchObject({
        ...SCHOOL_FALLBACK[school],
        school,
        fallback: true,
      });
      expect(SCHOOL_PALETTES[school].length).toBeGreaterThanOrEqual(4);
    }
    expect(spellFx("some-ability", undefined)).toBe(NEUTRAL_FX);
  });

  it("gives each school a palette of its own", () => {
    const mids = SCHOOLS.map((s) => SCHOOL_PALETTES[s][1]);
    expect(new Set(mids).size).toBe(5);
  });

  it("wires the five school cast sounds and names every effect once", () => {
    for (const school of SCHOOLS)
      expect(soundForFx(`spell.cast.${school}`)).toBe(
        SPELL_SCHOOL_SOUNDS[school],
      );
    expect(new Set(FX_EVENTS).size).toBe(FX_EVENTS.length);
    for (const name of Object.keys(FX_SOUNDS))
      expect(FX_EVENTS as readonly string[]).toContain(name);
    // Moments already sounded elsewhere are not registered twice.
    expect(soundForFx("battle.impact")).toBeNull();
    expect(soundForFx("map.day")).toBeNull();
  });

  it("gives every shooter a projectile", () => {
    expect(shotKind("longbowman")).toBe("arrow");
    expect(shotKind("bomb-chucker")).toBe("bomb");
    expect(shotKind("banshee")).toBe("wail");
    expect(shotKind("not-a-shooter")).toBe("arrow");
    for (const k of SHOT_KINDS) expect(shotLook(k)).toBeDefined();
  });

  it("keeps every sprite mask rectangular", () => {
    for (const [id, rows] of Object.entries(SHAPES)) {
      const w = rows[0]?.length ?? 0;
      for (const r of rows) expect(r.length, id).toBe(w);
      expect(shapeSize(id as keyof typeof SHAPES).w).toBeGreaterThanOrEqual(w);
    }
  });
});

describe("effect field", () => {
  it("caps the number of effects, dropping the oldest", () => {
    const f = new FxField();
    const pal = SCHOOL_PALETTES.bloom;
    for (let i = 0; i < MAX_FX + 50; i++)
      f.add({ now: i }, { kind: "p", shape: "leaf", pal, x: i, y: 0 }, 1000);
    expect(f.size).toBe(MAX_FX);
    expect(f.dropped).toBe(50);
    expect(f.items[0]?.t0).toBe(50);
  });

  it("prunes finished effects, at the battle speed", () => {
    const f = new FxField();
    const pal = SCHOOL_PALETTES.storm;
    f.add({ now: 0, rate: 2 }, { kind: "star", x: 0, y: 0, r: 5, pal }, 200);
    f.add({ now: 0 }, { kind: "star", x: 0, y: 0, r: 5, pal }, 200);
    f.prune(150);
    expect(f.size).toBe(1);
    expect(f.alive(150)).toBe(true);
    f.prune(250);
    expect(f.size).toBe(0);
  });

  it("repeats its random shapes exactly", () => {
    const a = fxRandom(42);
    const b = fxRandom(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});

describe("motion setting", () => {
  it("reduces motion when asked, or on auto when the system asks", () => {
    expect(resolveReduced("reduced", false)).toBe(true);
    expect(resolveReduced("full", true)).toBe(false);
    expect(resolveReduced("auto", true)).toBe(true);
    expect(resolveReduced("auto", false)).toBe(false);
    expect(parseMotionPref("junk")).toBe("auto");
    expect(parseMotionPref("full")).toBe("full");
    expect(nextMotionPref("auto")).toBe("reduced");
    expect(nextMotionPref("full")).toBe("auto");
  });
});
