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
  hasUnitArt,
  heroArt,
  heroPortrait,
  PLACEHOLDER_HERO,
  PLACEHOLDER_UNIT,
  unitArt,
  unitPortrait,
} from "../../src/assets/unit-art";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");

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
];
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
];

describe("unit art lookups", () => {
  it("gives every v0.2 creature its own sprite and portrait", () => {
    for (const id of [...FACTION_CREATURES, ...NEUTRALS]) {
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

  it("uses a different sprite for every creature", () => {
    const keys = [...FACTION_CREATURES, ...NEUTRALS].map(
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
