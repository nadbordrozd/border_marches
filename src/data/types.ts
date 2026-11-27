/**
 * Shared shapes of the static game data. Pure data: no logic lives here.
 */
import type { ResourceId } from "../core/map/types.ts";

export type { ResourceId };

/** An amount of each of the four resources. */
export type Resources = Record<ResourceId, number>;

/** A cost or income that names only the resources it uses. */
export type ResourceAmounts = Partial<Resources>;

/**
 * Faction ids. Neutral monsters and the Warlord's Hold use "neutral". The
 * v0.2 factions are Humans (the Realm), Undead (the Restless), Goblins
 * (the Horde), Candy (the Candy Kingdom, FACTION_CANDY.md) and Dwarves (the
 * Deepforge, FACTION_DWARVES.md); the Lost World stays in the code but is
 * not playable.
 */
export type FactionId =
  | "lost-world"
  | "humans"
  | "undead"
  | "goblins"
  | "candy"
  | "dwarves"
  | "neutral";

export type AbilityId =
  | "mob"
  | "venom"
  | "pack-hunter"
  | "war-drums"
  | "charge"
  | "terror"
  | "bony"
  | "regenerate"
  | "warcry";

export type LostWorldCreatureId =
  "caveman" | "spitter" | "raptor" | "shaman" | "triceratops" | "t-rex";

/**
 * Neutral guards (GAME_DESIGN 8.1). Goblin, Skeleton, Bomb Chucker, Wolf
 * Rider, Ogre and Orc Warboss are faction creatures since v0.2 (the Horde
 * and the Restless) that also serve as guards; Orc Brutes and Trolls stay
 * neutral.
 */
export type NeutralCreatureId =
  | "goblin"
  | "skeleton"
  | "bomb-chucker"
  | "wolf-rider"
  | "orc-brute"
  | "troll"
  | "ogre"
  | "orc-warboss";

/** Strays and caretakers (src/data/strays.ts, CONTENT_CREATURES). */
export type StrayCreatureId =
  | "bellhop"
  | "whipping-boy"
  | "gremlin"
  | "lamplighter"
  | "newsie"
  | "notary"
  | "crooner"
  | "bog-leech"
  | "loan-shark"
  | "winder"
  | "groundskeeper"
  | "rigger"
  | "gumshoe"
  | "deep-sea-diver"
  | "sexton"
  | "lagoon-lurker"
  | "fire-eater"
  | "rime-walrus"
  | "tin-titan"
  | "prize-pumpkin"
  | "beanstalk-giant";

/** Stray abilities, registered with the battle grammar (bead bzc.13). */
export type StrayAbilityId =
  | "carry"
  | "takes-the-blame"
  | "sabotage"
  | "light-up"
  | "extra"
  | "stamp"
  | "croon"
  | "latch"
  | "advance"
  | "wind-up"
  | "tend"
  | "tow"
  | "dead-to-rights"
  | "pressure-suit"
  | "night-shift"
  | "drag-under"
  | "breath"
  | "cold-front"
  | "stand-behind-me"
  | "late-bloomer"
  | "giant-stomp"
  | "gone-to-seed"
  | "fade";

/** What a dead stack leaves (RULES_V2 1.2). */
export type StrayDeathTag = "corpse" | "bones" | "wreck" | "sweets" | "nothing";

export type HumanCreatureId =
  "squire" | "longbowman" | "man-at-arms" | "friar" | "knight" | "dragonslayer";

export type UndeadCreatureId =
  "skeleton" | "ghoul" | "banshee" | "gravecaller" | "vampire" | "late-king";

export type GoblinCreatureId =
  | "goblin"
  | "bomb-chucker"
  | "wolf-rider"
  | "boomshaman"
  | "ogre"
  | "orc-warboss";

export type CandyCreatureId =
  | "gingerbread-man"
  | "peppermint-archer"
  | "taffy-wrangler"
  | "sugarplum"
  | "gummy-bear"
  | "rock-candy-dragon";

export type DwarvesCreatureId =
  | "tinker"
  | "rivet-gunner"
  | "gyrocopter"
  | "mortar"
  | "steam-tank"
  | "ironclad";

export type CreatureId =
  | LostWorldCreatureId
  | NeutralCreatureId
  | HumanCreatureId
  | UndeadCreatureId
  | GoblinCreatureId
  | CandyCreatureId
  | DwarvesCreatureId
  | StrayCreatureId;

/**
 * One creature type. Every stat is per creature; damage is a single fixed
 * number (deterministic combat, GAME_DESIGN.md section 9).
 */
export interface CreatureDef {
  id: CreatureId;
  name: string;
  /** Plural display name. */
  plural: string;
  faction: FactionId;
  tier: number;
  hp: number;
  attack: number;
  defense: number;
  damage: number;
  speed: number;
  /** Shots per battle; 0 for melee creatures. A creature is ranged iff > 0. */
  shots: number;
  /** The MVP's single ability (null when it has none of the MVP's). */
  ability: AbilityId | null;
  /**
   * Every ability id in the battle registry (v0.2 creatures may have
   * several; MVP abilities included). Defaults to `[ability]`.
   */
  abilities?: readonly string[];
  /** What its death leaves and the condition kinds it cannot bear. */
  tags?: {
    remains: "corpse" | "bones" | "wreck" | "sweets" | "nothing";
    cannotBear: readonly string[];
  };
  /**
   * A creature caster (RULES_V2 2.6): its pages (spell ids of the magic
   * catalogue) and Power = castPower + floor(count / castDivisor), at most
   * castCap. Cast with the battle action `creatureCast`.
   */
  caster?: {
    pages: readonly string[];
    castPower: number;
    castDivisor: number;
    castCap: number;
  };
  /** Weekly growth of its dwelling (faction creatures; 0 for neutrals). */
  growth: number;
  /** Recruitment cost per creature (faction creatures; empty for neutrals). */
  cost: ResourceAmounts;
  /**
   * Fight value per creature (GAME_DESIGN.md section 8.2), precomputed and
   * checked against {@link fightValue} in the tests. Map generation only.
   */
  fightValue: number;
  /**
   * Sprite key: the Pulp Wars unit name `<pulp-faction>-<unit>`, matching
   * `chibi-direction-<key>.png` (ART_DIRECTION.md section 6).
   */
  sprite: string;
}

/**
 * A building id within its faction's town tree (src/data/factions.ts).
 * Plain strings, so each faction's tree names its own buildings.
 */
export type BuildingId = string;

/** The Lost World tree's building ids (the first town data set). */
export type LostWorldBuildingId =
  | "village-hall"
  | "town-hall"
  | "city-hall"
  | "palisade"
  | "stockade"
  | "marketplace"
  | "resource-silo"
  | "cave"
  | "spitter-nest"
  | "raptor-pen"
  | "spirit-lodge"
  | "horn-grounds"
  | "tyrants-lair";

/** A town building (FACTION_LOST_WORLD.md section 6). */
export interface BuildingDef<Id extends BuildingId = BuildingId> {
  id: Id;
  name: string;
  /** Empty for buildings that only exist from the start. */
  cost: ResourceAmounts;
  /** Buildings that must already stand. */
  requires: Id[];
  /** Built when the game starts; cannot be built during play. */
  startBuilt: boolean;
  /** The creature this dwelling recruits. */
  dwelling?: CreatureId;
  /**
   * Total daily gold of a hall. Halls replace each other: the town pays the
   * highest hall income it has, not the sum.
   */
  hallIncome?: number;
  /** Extra daily resources (Resource Silo). Adds to everything else. */
  income?: ResourceAmounts;
  /** +50% creature growth (Stockade). */
  growthBonus?: boolean;
  /**
   * Extra weekly growth of one dwelling of this town (the Candy Bakery: +8
   * Gingerbread Men), added before any +50% bonus.
   */
  growthExtra?: { creature: CreatureId; amount: number };
  /**
   * Fort level this building gives the town (RULES_V2 5.5): 1 is +2
   * Defense for every defending stack, 2 is +4, 3 is +6 and a tower. The
   * town's fort level is the highest among its buildings.
   */
  fortLevel?: 1 | 2 | 3;
  /** Enables marketplace trades. */
  marketplace?: boolean;
  /** Magic Guild level this building is (1 to 5). */
  guildLevel?: number;
  /** The Tavern (hire heroes). */
  tavern?: boolean;
  /**
   * A Drill (ECONOMY 6.3): building it sets a permanent flag for the
   * player; every stack of `creature` in its armies gains `ability`.
   */
  drill?: { creature: CreatureId; ability: string };
  /**
   * A town special or Keystone power: a flag its owner holds while it owns
   * the town (read by the battle setup and the adventure rules).
   */
  special?: string;
  /** Income paid only on even days (Essence Still). */
  evenDayIncome?: ResourceAmounts;
  /** Built with the map's Keystone, carried into the town by a hero. */
  needsKeystone?: boolean;
  /** Short effect text for the town screen. */
  effect: string;
}
