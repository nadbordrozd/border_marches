/**
 * Upgrading saved states to the current shape (save v3).
 *
 * - v1 (the one-player MVP) -> v2: one Chieftain, the player's towns and
 *   the Warlord's Hold become a one-player multi-player game whose goal is
 *   still the Hold (the "capture-towns" scenario), with the hero named
 *   from the roster and the taverns drawn.
 * - v2 -> v3 (heroes v2, RULES_V2 3 and 4): every hero gains Power and
 *   Lore from its class, full mana, its starting skills and pages, empty
 *   worn slots and scroll case; its old opaque artifact ids that name a
 *   known artifact go to the backpack (others are dropped). Level and XP
 *   are kept; a hero whose XP passes more levels on the new curve gains
 *   them with its next XP.
 *
 * Pure: the input is not modified.
 */
import { findArtifact } from "../../data/artifacts.ts";
import { getHeroClass } from "../../data/classes.ts";
import { findHeroDef, HERO_ROSTER, playerColour } from "../../data/players.ts";
import { emptyWorn } from "./artifacts.ts";
import { maxMana, movementPoints } from "./effects.ts";
import {
  drawFromPool,
  refreshTaverns,
  startingPages,
  startingSkills,
} from "./players.ts";
import { createRng, deriveSeed } from "../rng.ts";
import type { GameState, HeroState, PlayerState } from "./types.ts";

/** A v2 hero as saved (fields v3 added are missing). */
export type V2Hero = Omit<
  HeroState,
  | "power"
  | "lore"
  | "mana"
  | "levelUpStep"
  | "redraw"
  | "skills"
  | "feats"
  | "pages"
  | "scrolls"
  | "worn"
  | "backpack"
  | "nextBattle"
  | "mpDebt"
> & { artifacts?: string[] };

/** A v2 state as saved. */
export type V2State = Omit<GameState, "heroes"> & { heroes: V2Hero[] };

/** A v1 state as saved by the MVP (only the fields this reads). */
interface V1State extends Omit<
  GameState,
  "currentPlayer" | "players" | "heroes" | "pool" | "scenario"
> {
  players: Array<Pick<PlayerState, "id" | "resources" | "explored">>;
  heroes: Array<Omit<V2Hero, "defId" | "name" | "artifacts">>;
}

/** The v3 hero for a v2 hero. */
export function upgradeV2Hero(h: V2Hero): HeroState {
  const def = findHeroDef(h.defId) ?? {
    id: h.defId,
    name: h.name,
    heroClass: h.heroClass,
    faction: getHeroClass(h.heroClass).faction,
  };
  const cls = getHeroClass(h.heroClass);
  const { artifacts, ...rest } = h;
  const hero: HeroState = {
    ...rest,
    army: h.army.map((s) => (s === null ? null : { ...s })),
    power: cls.stats.power,
    lore: cls.stats.lore,
    mana: 0,
    levelUpStep: "skill",
    redraw: false,
    skills: startingSkills(def),
    feats: [],
    pages: startingPages(def),
    scrolls: [],
    worn: emptyWorn(),
    backpack: (artifacts ?? []).filter((id) => findArtifact(id) !== undefined),
    nextBattle: [],
    mpDebt: 0,
  };
  hero.mana = maxMana(hero);
  hero.maxMp = movementPoints(hero);
  return hero;
}

/** The v3 state for a v2 state. */
export function upgradeV2State(v2: V2State): GameState {
  return { ...v2, heroes: v2.heroes.map(upgradeV2Hero) };
}

/** The v2 state for a v1 one-player state. Throws on several players. */
function upgradeV1ToV2(v1: V1State): V2State {
  if (v1.players.length !== 1) {
    throw new Error("a v1 save holds exactly one player");
  }
  const state: V2State = {
    ...v1,
    currentPlayer: v1.players[0]?.id ?? 0,
    players: v1.players.map((p) => ({
      id: p.id,
      kind: "human",
      faction: "lost-world",
      colour: playerColour(p.id).id,
      resources: { ...p.resources },
      explored: [...p.explored],
      eliminated: false,
      townlessDays: 0,
      tavern: { offer: [], retreated: [] },
    })),
    heroes: [],
    pool: HERO_ROSTER.map((h) => h.id),
    scenario: null,
    towns: Object.fromEntries(
      Object.entries(v1.towns).map(([id, t]) => [id, { ...t }]),
    ),
  };
  for (const hero of v1.heroes) {
    const rng = createRng(deriveSeed(v1.seed, "start-hero", hero.owner));
    const defId = drawFromPool(
      state as unknown as GameState,
      rng,
      "lost-world",
    );
    const def = HERO_ROSTER.find((h) => h.id === defId);
    state.heroes.push({
      ...hero,
      army: hero.army.map((s) => (s === null ? null : { ...s })),
      defId: def?.id ?? "chieftain",
      name: def?.name ?? "Chieftain",
      artifacts: [],
    });
  }
  const holds = Object.values(state.towns).filter((t) => t.isHold);
  if (holds.length > 0) {
    state.scenario = { kind: "capture-towns", townIds: holds.map((t) => t.id) };
  }
  return state;
}

/** The current (v3) state for a v1 one-player state. */
export function upgradeV1State(v1: V1State): GameState {
  const state = upgradeV2State(upgradeV1ToV2(v1));
  refreshTaverns(state);
  return state;
}
