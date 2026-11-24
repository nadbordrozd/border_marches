/**
 * Upgrading MVP (save v1) states to the multi-player shape (save v2).
 *
 * A v1 state is a one-player game: one Chieftain, the player's towns and
 * the Warlord's Hold. It becomes a one-player v2 game whose goal is still
 * the Hold (the "capture-towns" scenario), with the hero named from the
 * roster and the taverns drawn. Pure.
 */
import { HERO_ROSTER, playerColour } from "../../data/players.ts";
import { drawFromPool, refreshTaverns } from "./players.ts";
import { createRng, deriveSeed } from "../rng.ts";
import type { GameState, HeroState, PlayerState } from "./types.ts";

/** A v1 state as saved by the MVP (only the fields this reads). */
interface V1State extends Omit<
  GameState,
  "currentPlayer" | "players" | "heroes" | "pool" | "scenario"
> {
  players: Array<Pick<PlayerState, "id" | "resources" | "explored">>;
  heroes: Array<Omit<HeroState, "defId" | "name" | "artifacts">>;
}

/** The v2 state for a v1 one-player state. Throws on several players. */
export function upgradeV1State(v1: V1State): GameState {
  if (v1.players.length !== 1) {
    throw new Error("a v1 save holds exactly one player");
  }
  const state: GameState = {
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
    const defId = drawFromPool(state, rng, "lost-world");
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
  refreshTaverns(state);
  return state;
}
