/**
 * Art lookups by game id (bead border_marches-bzc.14): the battle and map
 * sprite of a creature, the map sprite of a hero class, and their 48x48
 * portraits. Ids are the kebab-case of the names in docs/design (`squire`,
 * `man-at-arms`, `late-king`, `knight-errant`); {@link artId} also accepts
 * display names and snake_case. An id with no art resolves to a placeholder
 * instead of throwing, so new content can ship before its art.
 *
 * Which sprite each id uses, new or reused, is recorded in
 * docs/art/V02_UNIT_ART.md.
 */
import { assetByKey, HERO_ASSETS, UNIT_ASSETS } from "./manifest";
import type { PortraitAsset, UnitAsset } from "./manifest";

/** Creature id -> UNIT_ASSETS key. */
export const CREATURE_ART: Readonly<Record<string, string>> = {
  // The Lost World (MVP faction).
  caveman: "dinosaur-caveman",
  spitter: "dinosaur-spitter",
  raptor: "dinosaur-raptor",
  shaman: "dinosaur-shaman",
  triceratops: "dinosaur-triceratops",
  "t-rex": "dinosaur-t-rex",
  // The Realm (docs/design/FACTION_HUMANS.md section 10).
  squire: "human-squire",
  longbowman: "marksman",
  "man-at-arms": "swordsman",
  friar: "human-friar",
  knight: "knight",
  dragonslayer: "human-dragonslayer",
  // The Restless (FACTION_UNDEAD.md section 10).
  skeleton: "undead-skeleton",
  ghoul: "undead-ghoul",
  banshee: "undead-banshee",
  gravecaller: "undead-necromancer",
  vampire: "undead-vampire",
  "late-king": "undead-late-king",
  // The Goblin Horde (FACTION_GOBLINS.md section 10).
  goblin: "goblin-goblin",
  "bomb-chucker": "goblin-bomb-chucker",
  "wolf-rider": "goblin-wolf-rider",
  boomshaman: "goblin-boomshaman",
  ogre: "goblin-ogre",
  "orc-warboss": "goblin-orc-warboss",
  // Strays and caretakers (CONTENT_CREATURES.md section 1).
  bellhop: "stray-bellhop",
  "whipping-boy": "stray-whipping-boy",
  gremlin: "cult-imp",
  lamplighter: "stray-lamplighter",
  newsie: "stray-newsie",
  notary: "stray-notary",
  crooner: "stray-crooner",
  "bog-leech": "cult-tentacle",
  "loan-shark": "stray-loan-shark",
  winder: "dwarf-clockwork-gunner",
  groundskeeper: "stray-groundskeeper",
  rigger: "dwarf-engineer",
  gumshoe: "stray-gumshoe",
  "deep-sea-diver": "stray-deep-sea-diver",
  sexton: "stray-sexton",
  "lagoon-lurker": "cult-frog-unit",
  "fire-eater": "stray-fire-eater",
  "rime-walrus": "ice-folk-walrus",
  "tin-titan": "dwarf-brass-titan",
  "prize-pumpkin": "stray-prize-pumpkin",
  "beanstalk-giant": "stray-beanstalk-giant",
  // Summons (CONTENT_CREATURES.md section 4).
  seedling: "stray-seedling",
  shade: "stray-shade",
};

/** Hero class id -> HERO_ASSETS key (adventure-map sprite). */
export const HERO_CLASS_ART: Readonly<Record<string, string>> = {
  chieftain: "dinosaur-chieftain",
  "knight-errant": "hero-knight-errant",
  enchanter: "hero-enchanter",
  revenant: "hero-revenant",
  mortician: "hero-mortician",
  warlord: "hero-warlord",
  weatherwitch: "hero-weatherwitch",
};

/** Drawn for a creature id with no art: a featureless shadow spirit. */
export const PLACEHOLDER_UNIT = "stray-shade";
/** Drawn for a hero class with no art (the MVP's default hero). */
export const PLACEHOLDER_HERO = "dinosaur-chieftain";

/** "Man-at-Arms", "man_at_arms" and "man-at-arms" all give "man-at-arms". */
export function artId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[\s_]+/g, "-");
}

const UNITS = new Map(UNIT_ASSETS.map((asset) => [asset.key, asset]));
const HEROES = new Map(HERO_ASSETS.map((asset) => [asset.key, asset]));

function lookup(
  table: Readonly<Record<string, string>>,
  id: string,
): string | undefined {
  const key = artId(id);
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** True when the creature id has its own sprite (not the placeholder). */
export function hasUnitArt(creatureId: string): boolean {
  const key = lookup(CREATURE_ART, creatureId);
  return key !== undefined && UNITS.has(key);
}

/** True when the hero class id has its own map sprite. */
export function hasHeroArt(classId: string): boolean {
  const key = lookup(HERO_CLASS_ART, classId);
  return key !== undefined && HEROES.has(key);
}

/** The battle and map sprite of a creature; the placeholder when unknown. */
export function unitArt(creatureId: string): UnitAsset {
  const key = lookup(CREATURE_ART, creatureId);
  return (
    (key === undefined ? undefined : UNITS.get(key)) ??
    (UNITS.get(PLACEHOLDER_UNIT) as UnitAsset)
  );
}

/** The adventure-map sprite of a hero class; the placeholder when unknown. */
export function heroArt(classId: string): UnitAsset {
  const key = lookup(HERO_CLASS_ART, classId);
  return (
    (key === undefined ? undefined : HEROES.get(key)) ??
    (HEROES.get(PLACEHOLDER_HERO) as UnitAsset)
  );
}

/** The 48x48 portrait of a creature (the placeholder's when unknown). */
export function unitPortrait(creatureId: string): PortraitAsset {
  return assetByKey(unitArt(creatureId).portrait) as PortraitAsset;
}

/** The 48x48 portrait of a hero class (the placeholder's when unknown). */
export function heroPortrait(classId: string): PortraitAsset {
  return assetByKey(heroArt(classId).portrait) as PortraitAsset;
}
