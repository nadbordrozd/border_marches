import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetByKey,
  HERO_ASSETS,
  UNIT_ASSETS,
} from "../../src/assets/manifest";
import {
  artId,
  CREATURE_ART,
  HERO_CLASS_ART,
  hasHeroArt,
  hasNamedHeroPortrait,
  hasUnitArt,
  heroArt,
  heroPortrait,
  namedHeroPortrait,
  PLACEHOLDER_HERO,
  PLACEHOLDER_UNIT,
  unitArt,
  unitPortrait,
} from "../../src/assets/unit-art";
import { NAMED_HEROES } from "../../src/data/classes";
import { CREATURES } from "../../src/data/creatures";
import { SUMMONED_CREATURES } from "../../src/core/magic";
import { CHIEFTAIN_ROSTER } from "../../src/data/players";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");

/**
 * The Deepforge's creatures and heroes draw the placeholders until its art
 * beads (bzc.131 creatures, bzc.132 heroes) register their sprites; those
 * beads drop this skip.
 */
const ART_PENDING = "dwarves";

/** The v0.2 rosters as the design docs name them (kebab-case ids). */
const FACTION_CREATURES = [
  // docs/design/FACTION_HUMANS.md section 4
  "squire",
  "longbowman",
  "man-at-arms",
  "friar",
  "knight",
  "dragonslayer",
  // FACTION_UNDEAD.md section 4
  "skeleton",
  "ghoul",
  "banshee",
  "gravecaller",
  "vampire",
  "late-king",
  // FACTION_GOBLINS.md section 4
  "goblin",
  "bomb-chucker",
  "wolf-rider",
  "boomshaman",
  "ogre",
  "orc-warboss",
  // FACTION_CANDY.md section 4 (art: bead bzc.112)
  "gingerbread-man",
  "peppermint-archer",
  "taffy-wrangler",
  "sugarplum",
  "gummy-bear",
  "rock-candy-dragon",
];
/** The MVP neutrals that are not faction units (src/data/neutrals.ts). */
const MVP_NEUTRALS = ["orc-brute", "troll"];
/** docs/design/CONTENT_CREATURES.md sections 1 and 4. */
const NEUTRALS = [
  "bellhop",
  "whipping-boy",
  "gremlin",
  "lamplighter",
  "newsie",
  "notary",
  "crooner",
  "bog-leech",
  "loan-shark",
  "winder",
  "groundskeeper",
  "rigger",
  "gumshoe",
  "deep-sea-diver",
  "sexton",
  "lagoon-lurker",
  "fire-eater",
  "rime-walrus",
  "tin-titan",
  "prize-pumpkin",
  "beanstalk-giant",
  "seedling",
  "shade",
];
const HERO_CLASSES = [
  "knight-errant",
  "enchanter",
  "revenant",
  "mortician",
  "warlord",
  "weatherwitch",
  "nutcracker",
  "confectioner",
  "thane",
  "artificer",
];
/** FACTION_CANDY.md section 8 (bead bzc.113): their portraits come first. */
const CANDY_NAMED_HEROES: readonly (readonly [string, string])[] = [
  ["kernel", "nutcracker"],
  ["brittle", "nutcracker"],
  ["walnut", "nutcracker"],
  ["humbug", "nutcracker"],
  ["praline", "confectioner"],
  ["treacle", "confectioner"],
  ["fondant", "confectioner"],
  ["gingersnap", "confectioner"],
];
/** FACTION_DWARVES.md section 8 (bead bzc.132): their portraits come first. */
const DWARVES_NAMED_HEROES: readonly (readonly [string, string])[] = [
  ["brakka", "thane"],
  ["gristle", "thane"],
  ["hilde", "thane"],
  ["dunstan", "thane"],
  ["mags", "artificer"],
  ["silas", "artificer"],
  ["valvina", "artificer"],
  ["nell", "artificer"],
];

describe("unit art lookups", () => {
  it("gives every v0.2 creature its own sprite and portrait", () => {
    for (const id of [...FACTION_CREATURES, ...MVP_NEUTRALS, ...NEUTRALS]) {
      expect({ id, art: hasUnitArt(id) }).toEqual({ id, art: true });
      const unit = unitArt(id);
      expect(unit.category).toBe("unit");
      expect(existsSync(join(PUBLIC, unit.path)), unit.path).toBe(true);
      const portrait = unitPortrait(id);
      expect([portrait.w, portrait.h, portrait.unit]).toEqual([
        48,
        48,
        unit.key,
      ]);
    }
  });

  it("is the one lookup: it agrees with every creature's data sprite", () => {
    // bead border_marches-9is: Orc Brute and Troll drew the placeholder on
    // screens that used unitArt alone.
    for (const def of Object.values(CREATURES)) {
      if (def.faction === ART_PENDING) continue;
      expect({ id: def.id, own: hasUnitArt(def.id) }).toEqual({
        id: def.id,
        own: true,
      });
      expect({ id: def.id, key: unitArt(def.id).key }).toEqual({
        id: def.id,
        key: def.sprite,
      });
    }
    for (const id of Object.keys(SUMMONED_CREATURES))
      expect({ id, own: hasUnitArt(id) }).toEqual({ id, own: true });
  });

  it("uses a different sprite for every creature", () => {
    const keys = [...FACTION_CREATURES, ...MVP_NEUTRALS, ...NEUTRALS].map(
      (id) => unitArt(id).key,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every hero class a mounted map sprite and a portrait", () => {
    for (const id of HERO_CLASSES) {
      expect({ id, art: hasHeroArt(id) }).toEqual({ id, art: true });
      const hero = heroArt(id);
      expect(HERO_ASSETS).toContain(hero);
      expect([hero.w, hero.h, hero.sizeClass]).toEqual([72, 88, "large"]);
      expect(heroPortrait(id).key).toBe(`portrait-${hero.key}`);
    }
    expect(heroArt("chieftain").key).toBe("dinosaur-chieftain");
  });

  it("gives each of the 32 named heroes a portrait of their own", () => {
    const drawn = NAMED_HEROES.filter((h) => h.faction !== ART_PENDING);
    expect(drawn).toHaveLength(32);
    const keys = new Set<string>();
    for (const def of drawn) {
      expect({ id: def.id, own: hasNamedHeroPortrait(def.id) }).toEqual({
        id: def.id,
        own: true,
      });
      const portrait = namedHeroPortrait(def.id);
      expect(portrait).toBe(assetByKey(portrait.key));
      expect([portrait.w, portrait.h, portrait.unit]).toEqual([
        48,
        48,
        heroArt(def.heroClass).key,
      ]);
      expect(portrait.key).not.toBe(heroPortrait(def.heroClass).key);
      expect(existsSync(join(PUBLIC, portrait.path)), portrait.path).toBe(true);
      keys.add(portrait.key);
    }
    expect(keys.size).toBe(32);
  });

  it.each([
    ["Candy Kingdom", CANDY_NAMED_HEROES],
    ["Deepforge", DWARVES_NAMED_HEROES],
  ] as const)(
    "gives the eight %s heroes portraits of their own",
    (_, heroes) => {
      const keys = new Set<string>();
      for (const [id, heroClass] of heroes) {
        expect({ id, own: hasNamedHeroPortrait(id) }).toEqual({
          id,
          own: true,
        });
        const portrait = namedHeroPortrait(id, heroClass);
        expect(portrait).toBe(assetByKey(portrait.key));
        expect([portrait.w, portrait.h, portrait.unit]).toEqual([
          48,
          48,
          heroArt(heroClass).key,
        ]);
        expect(portrait.key).not.toBe(heroPortrait(heroClass).key);
        expect(existsSync(join(PUBLIC, portrait.path)), portrait.path).toBe(
          true,
        );
        keys.add(portrait.key);
      }
      expect(keys.size).toBe(8);
    },
  );

  it("falls back to the class portrait for heroes without their own", () => {
    const chieftain = CHIEFTAIN_ROSTER[0];
    expect(chieftain).toBeDefined();
    if (chieftain === undefined) return;
    expect(hasNamedHeroPortrait(chieftain.id)).toBe(false);
    expect(namedHeroPortrait(chieftain.id).key).toBe(
      heroPortrait("chieftain").key,
    );
    expect(namedHeroPortrait("no-such-hero", "revenant").key).toBe(
      heroPortrait("revenant").key,
    );
    expect(namedHeroPortrait("no-such-hero").key).toBe(
      heroPortrait(PLACEHOLDER_HERO).key,
    );
    expect(namedHeroPortrait("toString").key).toBe(
      heroPortrait(PLACEHOLDER_HERO).key,
    );
  });

  it("points every table entry at a real asset", () => {
    for (const key of Object.values(CREATURE_ART))
      expect(
        UNIT_ASSETS.some((u) => u.key === key),
        key,
      ).toBe(true);
    for (const key of Object.values(HERO_CLASS_ART))
      expect(
        HERO_ASSETS.some((u) => u.key === key),
        key,
      ).toBe(true);
    expect(assetByKey(PLACEHOLDER_UNIT).category).toBe("unit");
    expect(assetByKey(PLACEHOLDER_HERO).category).toBe("unit");
  });

  it("normalises names and falls back to a placeholder", () => {
    expect(artId("Man-at-Arms")).toBe("man-at-arms");
    expect(artId("late_king")).toBe("late-king");
    expect(artId(" Knight Errant ")).toBe("knight-errant");
    expect(unitArt("Man-at-Arms").key).toBe("swordsman");
    expect(heroArt("Knight Errant").key).toBe("hero-knight-errant");
    expect(hasUnitArt("no-such-creature")).toBe(false);
    expect(unitArt("no-such-creature").key).toBe(PLACEHOLDER_UNIT);
    expect(unitArt("toString").key).toBe(PLACEHOLDER_UNIT);
    expect(hasHeroArt("no-such-class")).toBe(false);
    expect(heroArt("no-such-class").key).toBe(PLACEHOLDER_HERO);
  });

  it("seats every new sprite on its canvas", () => {
    for (const unit of [...UNIT_ASSETS, ...HERO_ASSETS]) {
      const { feet, w, h } = unit;
      expect(feet.contactY, unit.key).toBeGreaterThan(h / 2);
      expect(feet.contactY, unit.key).toBeLessThanOrEqual(h);
      expect(feet.footLeft, unit.key).toBeLessThan(feet.footRight);
      expect(feet.baseRight, unit.key).toBeLessThanOrEqual(w);
    }
  });
});
