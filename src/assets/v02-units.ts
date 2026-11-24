/**
 * Unit and hero sprites of the v0.2 factions and neutrals (bead
 * border_marches-bzc.14, docs/art/V02_UNIT_ART.md), spread into UNIT_ASSETS
 * and HERO_ASSETS by manifest.ts; look them up by game id with
 * `unitArt` / `heroArt` in unit-art.ts.
 *
 * Two kinds of file, as in the rest of the manifest:
 *
 * - byte-identical Pulp Wars imports (provenance table in
 *   docs/art/IMPORTED_FROM_PULP_WARS.md), with the feet Pulp Wars measured
 *   and its class-default anchors (the Ghoul's is its own);
 * - studio outputs of the sets `faction-units`, `strays` and `class-heroes`,
 *   whose feet were measured by art/review/measure-units.mjs (the Pulp Wars
 *   rule) and whose anchor is the class default (w / 2, h - 40).
 *
 * Every unit has a 48x48 portrait at assets/portraits/<key>.png: the Pulp
 * Wars portrait for imports, a generated bust for heroes, and a 1:1
 * head-and-shoulders crop of the sprite's master for the new creatures.
 */
import type { Point, UnitAsset, UnitArtFaction, UnitFeet } from "./manifest";

type Row = readonly [
  key: string,
  faction: UnitArtFaction,
  w: number,
  h: number,
  feet: readonly [number, number, number, number, number],
  anchor?: Point,
];

function sizeClass(w: number): UnitAsset["sizeClass"] {
  return w >= 88 ? "giant" : w >= 72 ? "large" : "standard";
}

function toAsset([key, faction, w, h, f, anchor]: Row): UnitAsset {
  const feet: UnitFeet = {
    contactY: f[0],
    footLeft: f[1],
    footRight: f[2],
    baseLeft: f[3],
    baseRight: f[4],
  };
  return {
    key,
    path: `assets/units/${key}.png`,
    w,
    h,
    category: "unit",
    faction,
    sizeClass: sizeClass(w),
    anchor: anchor ?? { x: w / 2, y: h - 40 },
    feet,
    portrait: `portrait-${key}`,
  };
}

/** [key, faction, w, h, [contactY, footL, footR, baseL, baseR], anchor?] */
const UNIT_ROWS: readonly Row[] = [
  // The Realm: Pulp Wars Human (crimson heraldic) imports.
  ["marksman", "human", 56, 80, [76, 11, 39, 2, 43]],
  ["swordsman", "human", 56, 80, [76, 17, 41, 17, 47]],
  ["knight", "human", 72, 88, [83, 38, 46, 14, 53]],
  // The Realm: new (set faction-units).
  ["human-squire", "human", 56, 80, [76, 15, 41, 15, 48]],
  ["human-friar", "human", 56, 80, [76, 7, 41, 7, 41]],
  ["human-dragonslayer", "human", 88, 104, [99, 47, 59, 28, 60]],
  // The Restless: imports (skeleton and vampire were imported by xaj.4).
  ["undead-ghoul", "undead", 72, 88, [79, 8, 68, 6, 69], { x: 32, y: 48 }],
  ["undead-banshee", "undead", 56, 80, [76, 11, 29, 11, 55]],
  ["undead-necromancer", "undead", 56, 80, [71, 6, 44, 5, 51]],
  // The Restless: new.
  ["undead-late-king", "undead", 88, 104, [102, 26, 39, 8, 67]],
  // The Goblin Horde: new (the other five were imported by xaj.4).
  ["goblin-boomshaman", "goblin", 56, 80, [72, 14, 32, 7, 47]],
  // Strays and caretakers: imports from other Pulp Wars rosters.
  ["cult-imp", "neutral", 56, 80, [76, 22, 40, 10, 46]],
  ["cult-tentacle", "neutral", 56, 80, [76, 11, 44, 2, 53]],
  ["cult-frog-unit", "neutral", 56, 80, [76, 7, 51, 3, 52]],
  ["dwarf-clockwork-gunner", "neutral", 56, 80, [78, 14, 46, 11, 52]],
  ["dwarf-engineer", "neutral", 56, 80, [75, 16, 43, 6, 52]],
  ["dwarf-brass-titan", "neutral", 88, 104, [98, 26, 67, 5, 68]],
  ["ice-folk-walrus", "neutral", 56, 80, [70, 5, 55, 1, 55]],
  // Strays, caretakers and summons: new (set strays). Small takes are padded
  // bottom-centred into 56x80; the Shade hovers (its tail is its contact).
  ["stray-bellhop", "neutral", 56, 80, [78, 14, 30, 8, 39]],
  ["stray-whipping-boy", "neutral", 56, 80, [68, 18, 41, 14, 47]],
  ["stray-lamplighter", "neutral", 56, 80, [72, 12, 42, 8, 43]],
  ["stray-newsie", "neutral", 56, 80, [72, 18, 36, 10, 37]],
  ["stray-notary", "neutral", 56, 80, [76, 12, 46, 4, 47]],
  ["stray-crooner", "neutral", 56, 80, [76, 17, 44, 16, 44]],
  ["stray-loan-shark", "neutral", 56, 80, [66, 5, 40, 5, 48]],
  ["stray-groundskeeper", "neutral", 56, 80, [69, 9, 39, 3, 44]],
  ["stray-gumshoe", "neutral", 56, 80, [73, 14, 43, 13, 55]],
  ["stray-deep-sea-diver", "neutral", 56, 80, [77, 8, 41, 7, 41]],
  ["stray-sexton", "neutral", 56, 80, [74, 11, 42, 10, 44]],
  ["stray-fire-eater", "neutral", 56, 80, [70, 11, 35, 5, 35]],
  ["stray-prize-pumpkin", "neutral", 72, 88, [83, 16, 50, 16, 62]],
  ["stray-beanstalk-giant", "neutral", 88, 104, [96, 26, 65, 16, 66]],
  ["stray-seedling", "neutral", 56, 80, [73, 18, 38, 13, 45]],
  ["stray-shade", "neutral", 56, 80, [60, 12, 36, 9, 44]],
];

/** Hero class map sprites (set class-heroes), all mounted, 72x88. */
const HERO_ROWS: readonly Row[] = [
  ["hero-knight-errant", "human", 72, 88, [81, 35, 49, 12, 49]],
  ["hero-enchanter", "human", 72, 88, [83, 41, 48, 16, 56]],
  ["hero-revenant", "undead", 72, 88, [87, 38, 46, 14, 57]],
  ["hero-mortician", "undead", 72, 88, [86, 33, 44, 18, 62]],
  ["hero-warlord", "goblin", 72, 88, [86, 15, 55, 14, 65]],
  ["hero-weatherwitch", "goblin", 72, 88, [84, 39, 52, 20, 58]],
];

export const V02_UNIT_ASSETS: readonly UnitAsset[] = UNIT_ROWS.map(toAsset);
export const V02_HERO_ASSETS: readonly UnitAsset[] = HERO_ROWS.map(toAsset);
