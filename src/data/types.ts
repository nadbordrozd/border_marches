/**
 * Shared shapes of the static game data. Pure data: no logic lives here.
 */
import type { ResourceId } from "../core/map/types.ts";

export type { ResourceId };

/** An amount of each of the four resources. */
export type Resources = Record<ResourceId, number>;

/** A cost or income that names only the resources it uses. */
export type ResourceAmounts = Partial<Resources>;

/** Faction ids. Neutral monsters and the Warlord's Hold use "neutral". */
export type FactionId = "lost-world" | "neutral";

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

export type NeutralCreatureId =
  | "goblin"
  | "skeleton"
  | "bomb-chucker"
  | "wolf-rider"
  | "orc-brute"
  | "troll"
  | "ogre"
  | "orc-warboss";

export type CreatureId = LostWorldCreatureId | NeutralCreatureId;

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
  /** At most one ability in the MVP. */
  ability: AbilityId | null;
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

export type BuildingId =
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
export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** Empty for buildings that only exist from the start. */
  cost: ResourceAmounts;
  /** Buildings that must already stand. */
  requires: BuildingId[];
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
  /** Flat Defense bonus for the town's defenders (Palisade). */
  defenseBonus?: number;
  /** Enables marketplace trades. */
  marketplace?: boolean;
  /** Short effect text for the town screen. */
  effect: string;
}
