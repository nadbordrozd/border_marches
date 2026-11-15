/**
 * Hero experience and level-up choices (GAME_DESIGN.md section 6.1).
 */
import { LEVEL_UP_CHOICES, type LevelUpChoice } from "../../data/hero.ts";
import { levelForXp } from "./progression.ts";
import { cloneState, fail, findHero, must, success } from "./state.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
} from "./types.ts";

/**
 * Adds XP to a hero in place; each level gained adds one pending level-up
 * choice and a "level-up" event.
 */
export function gainXp(
  hero: HeroState,
  amount: number,
  events: GameEvent[],
): void {
  if (amount <= 0) return;
  hero.xp += amount;
  events.push({ type: "xp", heroId: hero.id, amount });
  const level = levelForXp(hero.xp);
  for (let l = hero.level + 1; l <= level; l++) {
    hero.pendingLevelUps++;
    events.push({ type: "level-up", heroId: hero.id, level: l });
  }
  hero.level = Math.max(hero.level, level);
}

/** The offers for the hero's next pending level-up (empty when none). */
export function levelUpOffers(
  state: GameState,
  heroId: string,
): readonly LevelUpChoice[] {
  const hero = findHero(state, heroId);
  return hero !== undefined && hero.pendingLevelUps > 0 ? LEVEL_UP_CHOICES : [];
}

/**
 * Takes one pending level-up: +1 Attack or +1 Defense. Allowed while a
 * battle is pending (so a chained fight uses the new stat).
 */
export function chooseLevelUp(
  state: GameState,
  heroId: string,
  choice: LevelUpChoice,
): CommandResult {
  if (state.status !== "playing") return fail("game-over", "the game is over");
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive) {
    return fail("unknown-hero", `no hero ${heroId}`);
  }
  if (hero.pendingLevelUps <= 0)
    return fail("no-level-up", "no level-up pending");
  if (!LEVEL_UP_CHOICES.includes(choice)) {
    return fail("bad-choice", `bad level-up choice ${String(choice)}`);
  }
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  h.pendingLevelUps--;
  if (choice === "attack") h.attack++;
  else h.defense++;
  return success(next);
}
