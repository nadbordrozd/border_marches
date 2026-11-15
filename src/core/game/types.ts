/**
 * The adventure-layer game state and the command result shapes.
 *
 * The state is plain JSON-compatible data (save games can serialise it as
 * is). Commands never mutate their input: they return a new state. The map
 * is shared by reference between states and must never be mutated.
 */
import type { GameMap, ResourceId } from "../map/types.ts";
import type {
  BuildingId,
  CreatureId,
  FactionId,
  Resources,
} from "../../data/types.ts";

/** Player index; null owns neutral things (monsters, the Warlord's Hold). */
export type Owner = number | null;

export interface Stack {
  creature: CreatureId;
  /** Always >= 1; an empty slot is null. */
  count: number;
}

/** Exactly ARMY_SLOTS (7) entries; null is an empty slot. Order matters. */
export type ArmySlots = Array<Stack | null>;

export interface PlayerState {
  id: number;
  resources: Resources;
  /** Row-major, one flag per map cell: revealed at least once. */
  explored: boolean[];
}

export interface HeroState {
  id: string;
  owner: number;
  /** Hero class id (src/data/hero.ts); "chieftain" in the MVP. */
  heroClass: string;
  x: number;
  y: number;
  /** Movement points left today. */
  mp: number;
  /** Movement points at the start of each day. */
  maxMp: number;
  attack: number;
  defense: number;
  xp: number;
  /** Level reached by XP (choices for it may still be pending). */
  level: number;
  /** Level-up choices not yet made; see chooseLevelUp. */
  pendingLevelUps: number;
  army: ArmySlots;
  alive: boolean;
}

export interface DwellingState {
  /** Creatures ready to recruit. */
  available: number;
  /** Stockade half-creature remainder (0 or 1). */
  remainder: number;
}

export interface TownState {
  /** The town's map object id. */
  id: string;
  owner: Owner;
  faction: FactionId;
  /** True for the Warlord's Hold (a town that starts neutral). */
  isHold: boolean;
  name: string;
  /** Built buildings, in BUILDING_IDS order. */
  buildings: BuildingId[];
  /** One building per town per day. */
  builtToday: boolean;
  /** Stock of each built dwelling, keyed by creature. */
  dwellings: Partial<Record<CreatureId, DwellingState>>;
  garrison: ArmySlots;
}

export interface MineState {
  id: string;
  resource: ResourceId;
  owner: Owner;
}

/** A live neutral stack on the map (removed when defeated). */
export interface MonsterState {
  id: string;
  creature: CreatureId;
  count: number;
  x: number;
  y: number;
}

/** A battle that must be resolved before anything else happens. */
export interface PendingBattle {
  kind: "monster" | "town";
  /** Monster or town map object id. */
  objectId: string;
  heroId: string;
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  /** Shared, read-only. */
  map: GameMap;
  seed: number;
  /** Absolute day, 1-based. See calendar(). */
  day: number;
  status: GameStatus;
  players: PlayerState[];
  heroes: HeroState[];
  /** Keyed by town map object id. */
  towns: Record<string, TownState>;
  /** Keyed by mine map object id. */
  mines: Record<string, MineState>;
  /** Ids of collected pickups (resources and chests), in collection order. */
  collected: string[];
  /** Live neutral stacks keyed by monster map object id. */
  monsters: Record<string, MonsterState>;
  pendingBattle: PendingBattle | null;
  /** Number of battles resolved so far (feeds battle seeds). */
  battles: number;
}

export type MoveStopReason =
  "arrived" | "no-mp" | "guarded" | "object" | "attack";

export type GameEvent =
  | {
      type: "moved";
      heroId: string;
      /** Cells entered, in order (excluding the starting cell). */
      cells: Array<[number, number]>;
      mpSpent: number;
      stop: MoveStopReason;
    }
  | { type: "visit-town"; heroId: string; townId: string }
  | { type: "mine-flagged"; mineId: string; owner: number }
  | {
      type: "pickup";
      pickupId: string;
      resource: ResourceId;
      amount: number;
    }
  /** The hero stands on a chest: call takeChest with "gold" or "xp". */
  | { type: "chest-offer"; heroId: string; pickupId: string }
  | { type: "battle"; battle: PendingBattle }
  | { type: "xp"; heroId: string; amount: number }
  | { type: "level-up"; heroId: string; level: number }
  | { type: "new-day"; day: number }
  | { type: "new-week"; day: number }
  | { type: "income"; player: number; amounts: Resources }
  | { type: "monster-defeated"; monsterId: string }
  | { type: "town-captured"; townId: string; owner: number }
  | { type: "hero-defeated"; heroId: string }
  | { type: "game-won"; player: number }
  | { type: "game-lost"; player: number };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: CommandError; message: string };

export type CommandError =
  | "game-over"
  | "battle-pending"
  | "no-battle"
  | "unknown-hero"
  | "unknown-town"
  | "unknown-object"
  | "unknown-building"
  | "unknown-creature"
  | "not-owner"
  | "not-in-town"
  | "not-on-object"
  | "already-built"
  | "built-today"
  | "requirements"
  | "cannot-build"
  | "resources"
  | "no-dwelling"
  | "stock"
  | "bad-count"
  | "army-full"
  | "bad-slot"
  | "empty-slot"
  | "different-creature"
  | "hero-needs-army"
  | "no-marketplace"
  | "bad-trade"
  | "bad-path"
  | "no-level-up"
  | "bad-choice"
  | "bad-result";
