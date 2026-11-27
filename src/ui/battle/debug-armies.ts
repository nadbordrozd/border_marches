/**
 * Faction battles for the standalone battle view (`?view=battle`):
 * `armies=humans,undead` fights a Realm army against a Restless one, each
 * led by a level 6 hero of the faction (`lean=magic` for the magic
 * classes, default might) with its Command and a few pages. With `steps=N`
 * or `auto=1` the battle AI plays both sides (bead bzc.20's visual check).
 * `vanguard=N` (and `enemyVanguard=N`) give a hero Vanguard rank N, so
 * the battle opens with the deployment phase (bead bzc.34).
 */

import { heroBattleProfile } from "../../core/game/battle-profile.ts";
import type {
  BattleSetup as GameBattleSetup,
  BattleSide as GameBattleSide,
} from "../../core/game/battle.ts";
import { maxMana } from "../../core/game/effects.ts";
import { patternStat } from "../../core/game/hero.ts";
import { newHeroState } from "../../core/game/players.ts";
import type { Terrain } from "../../core/map/types.ts";
import { NAMED_HEROES, getHeroClass } from "../../data/classes.ts";
import { rosterOf } from "../../data/factionCreatures.ts";
import type { CreatureId } from "../../data/types.ts";

const FACTIONS = ["humans", "undead", "goblins", "candy", "dwarves"] as const;
type Faction = (typeof FACTIONS)[number];

/** Counts per tier 1..6 for a mid-game army. */
const COUNTS = [40, 16, 8, 4, 2, 1];

/** Pages per faction for the magic classes (tiers 1 to 3). */
const PAGES: Readonly<Record<Faction, readonly string[]>> = {
  humans: ["regrow", "close-ranks", "sanctuary-oath"],
  undead: ["lullaby", "bad-omen", "treacle"],
  goblins: ["jolt", "broadside", "hothead"],
  candy: ["late-bell", "treacle", "sanctuary-oath"],
  dwarves: ["jolt", "bad-omen", "broadside"],
};

function side(
  faction: Faction,
  lean: "might" | "magic",
  owner: number,
  vanguard = 0,
): GameBattleSide {
  const def = NAMED_HEROES.find(
    (h) => h.faction === faction && getHeroClass(h.heroClass).leaning === lean,
  );
  if (!def) throw new Error(`no ${lean} hero of ${faction}`);
  const hero = newHeroState(`debug-${faction}-${owner}`, def, owner, 0, 0);
  const cls = getHeroClass(def.heroClass);
  for (let l = 2; l <= 6; l++) hero[patternStat(cls, l)] += 1;
  hero.level = 6;
  if (lean === "magic")
    hero.pages = [...new Set([...hero.pages, ...PAGES[faction]])];
  hero.mana = maxMana(hero);
  // vanguard=N: the hero holds Vanguard rank N (the deployment phase).
  if (vanguard >= 1 && vanguard <= 3) {
    hero.skills = [
      ...hero.skills.filter((k) => k.id !== "vanguard"),
      { id: "vanguard", rank: vanguard },
    ];
  }
  return {
    owner,
    hero: {
      id: hero.id,
      name: hero.name,
      // Its own portrait at the ends of the action bar, as in a game.
      defId: def.id,
      heroClass: def.heroClass,
      attack: hero.attack,
      defense: hero.defense,
      profile: heroBattleProfile(hero),
    },
    stacks: rosterOf(faction).map((c, i) => ({
      creature: c.id as CreatureId,
      count: COUNTS[i] ?? 1,
    })),
    defenseBonus: 0,
    faction,
  };
}

/** The faction battle the parameters ask for, or null. */
export function factionBattleSetup(
  params: URLSearchParams,
  seed: number,
  terrain: Terrain,
): GameBattleSetup | null {
  const spec = params.get("armies");
  if (spec === null) return null;
  const [a, d] = spec.split(",");
  const isFaction = (x: string | undefined): x is Faction =>
    (FACTIONS as readonly string[]).includes(x ?? "");
  if (!isFaction(a) || !isFaction(d)) return null;
  const lean = params.get("lean") === "magic" ? "magic" : "might";
  const rank = (key: string): number => Number(params.get(key) ?? "0") || 0;
  return {
    seed,
    terrain,
    attacker: side(a, lean, 0, rank("vanguard")),
    defender: side(d, lean, 1, rank("enemyVanguard")),
    battle: { kind: "hero", objectId: "debug-hero-2", heroId: "debug-hero" },
  };
}
