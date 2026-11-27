import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_ICON_ASSETS,
  contentId,
  FALLBACK_ICON_ASSETS,
  ICON_FRAMES,
  ICON_KINDS,
  ICON_MISSING,
  iconFor,
  iconIds,
  MARKER_ICONS,
  SMALL_ICON_ASSETS,
} from "../../src/assets/icons";
import { ALL_ASSETS } from "../../src/assets/manifest";

const ROOT = join(import.meta.dirname, "..", "..");

/** Every `outputs[]` path of the icon sets, relative to public/. */
function iconOutputs(): Map<string, number> {
  const out = new Map<string, number>();
  for (const set of [
    "icons-spells",
    "icons-artifacts",
    "icons-conditions",
    "icons-heroes",
  ]) {
    const doc = JSON.parse(
      readFileSync(join(ROOT, "art/sets", set, "recipes.json"), "utf8"),
    ) as { outputs: { path: string; width: number }[] };
    for (const output of doc.outputs)
      out.set(output.path.slice("public/".length), output.width);
  }
  return out;
}

describe("content icons", () => {
  it("has the catalogue's counts", () => {
    const counts = Object.fromEntries(
      ICON_KINDS.map((kind) => [kind, iconIds(kind).length]),
    );
    expect(counts).toEqual({
      spell: 60,
      artifact: 87,
      condition: 30,
      ground: 8,
      skill: 24,
      feat: 28,
      vow: 12,
      stat: 14,
      school: 5,
    });
  });

  it("derives every icon file from a studio output at its size", () => {
    const outputs = iconOutputs();
    for (const asset of ALL_ICON_ASSETS) {
      expect({ path: asset.path, size: outputs.get(asset.path) }).toEqual({
        path: asset.path,
        size: asset.w,
      });
      expect(existsSync(join(ROOT, "public", asset.path))).toBe(true);
    }
    expect(outputs.size).toBe(ALL_ICON_ASSETS.length);
  });

  it("is part of the manifest", () => {
    const keys = new Set(ALL_ASSETS.map((asset) => asset.key));
    for (const asset of ALL_ICON_ASSETS) expect(keys.has(asset.key)).toBe(true);
  });

  it("resolves every content id to its own icon", () => {
    for (const kind of ICON_KINDS)
      for (const id of iconIds(kind)) {
        const ref = iconFor(kind, id);
        expect({ kind, id, fallback: ref.fallback }).toEqual({
          kind,
          id,
          fallback: ICON_MISSING[kind].includes(id),
        });
        expect(ref.asset.w).toBe(32);
      }
  });

  it("accepts catalogue names and gives frames by school and grade", () => {
    const whip = iconFor("artifact", "Ringmaster's Whip");
    expect(whip.id).toBe("ringmasters-whip");
    expect(whip.name).toBe("Ringmaster's Whip");
    expect(whip.frame).toBe(ICON_FRAMES.trinket);
    expect(iconFor("spell", "The Sky Falls").frame).toBe(ICON_FRAMES.storm);
    expect(iconFor("artifact", "The Upper Bulb").frame).toBe(
      ICON_FRAMES.cursed,
    );
    expect(iconFor("artifact", "Treaty Ink").frame).toBe(ICON_FRAMES.marvel);
    expect(iconFor("skill", "Quietus").frame).toBe(ICON_FRAMES.hush);
    expect(iconFor("skill", "Packrat").frame).toBe(ICON_FRAMES.skill);
    expect(iconFor("ground", "rock").frame).toBeNull();
    expect(iconFor("stat", "attack").frame).toBeNull();
    expect(contentId("Fire-Eater's Draught")).toBe("fire-eaters-draught");
  });

  it("falls back for unknown ids, never throws", () => {
    const ref = iconFor("spell", "no-such-spell");
    expect(ref.fallback).toBe(true);
    expect(ref.asset).toBe(FALLBACK_ICON_ASSETS.spell);
    expect(ref.frame).toBeNull();
  });

  it("gives creature pages a borrowed icon in their school's frame", () => {
    const clap = iconFor("spell", "Thunderclap");
    expect(clap.fallback).toBe(false);
    expect(clap.name).toBe("Thunderclap");
    expect(clap.asset).toBe(iconFor("spell", "broadside").asset);
    expect(clap.frame).toBe(ICON_FRAMES.storm);
    expect(iconFor("spell", "mend").asset).toBe(
      iconFor("spell", "regrow").asset,
    );
    const breath = iconFor("spell", "last-breath");
    expect(breath.asset).toBe(iconFor("school", "hush").asset);
    expect([breath.fallback, breath.frame]).toEqual([false, ICON_FRAMES.hush]);
  });

  it("draws the Realm's conditions, Sweets and the Keystone with their own icons", () => {
    // bead border_marches-9is: these drew the fallback swirl, mound or chest.
    for (const [kind, id] of [
      ["condition", "sworn"],
      ["condition", "challenged"],
      ["condition", "demo-guard"],
      ["ground", "sweets"],
      ["artifact", "keystone"],
    ] as const)
      expect({ kind, id, fallback: iconFor(kind, id).fallback }).toEqual({
        kind,
        id,
        fallback: false,
      });
    for (const id of ["sworn", "challenged", "demo-guard"]) {
      const small = iconFor("condition", id, 16);
      expect([id, small.asset.w, small.fallback]).toEqual([id, 16, false]);
    }
    expect(iconFor("condition", "sworn").frame).toBe(ICON_FRAMES.accord);
    expect(iconFor("artifact", "keystone").frame).toBe(ICON_FRAMES.marvel);
  });

  it("draws the Candy Kingdom's Stuck and Flypaper Ribbon with their own icons", () => {
    // bead border_marches-bzc.112 (FACTION_CANDY 3)
    const stuck = iconFor("condition", "Stuck");
    expect([stuck.id, stuck.fallback, stuck.frame]).toEqual([
      "stuck",
      false,
      ICON_FRAMES.clock,
    ]);
    const badge = iconFor("condition", "stuck", 16);
    expect([badge.asset.w, badge.fallback]).toEqual([16, false]);
    const ribbon = iconFor("artifact", "Flypaper Ribbon");
    expect([ribbon.id, ribbon.fallback, ribbon.frame]).toEqual([
      "flypaper-ribbon",
      false,
      ICON_FRAMES.wonder,
    ]);
  });

  it("draws the Deepforge's Steam and the Mortars' shell marker", () => {
    // bead border_marches-bzc.131 (FACTION_DWARVES 3 and 5)
    const steam = iconFor("condition", "Steam");
    expect([steam.id, steam.fallback, steam.frame]).toEqual([
      "steam",
      false,
      ICON_FRAMES.storm,
    ]);
    const badge = iconFor("condition", "steam", 16);
    expect([badge.asset.w, badge.fallback]).toEqual([16, false]);
    const shell = MARKER_ICONS.shell;
    expect([shell[32].path, shell[32].w]).toEqual([
      "assets/icons/markers/shell.png",
      32,
    ]);
    expect([shell[16].path, shell[16].w]).toEqual([
      "assets/icons/markers-16/shell.png",
      16,
    ]);
    expect(ALL_ICON_ASSETS).toContain(shell[16]);
  });

  it("has 16 px overlays for conditions and 32 px elsewhere", () => {
    expect(SMALL_ICON_ASSETS).toHaveLength(30);
    const small = iconFor("condition", "Burning", 16);
    expect([small.asset.w, small.fallback]).toEqual([16, false]);
    expect(iconFor("skill", "banner", 16).asset.w).toBe(32);
  });
});
