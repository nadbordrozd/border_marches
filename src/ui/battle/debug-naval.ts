/**
 * Naval sample battles for the battle debug view (`?view=battle&naval=deck`,
 * bead bzc.153): one hand-built setup per layout of docs/design/NAVAL.md
 * 3.2, for stepped screenshots (`steps=N`). Not a game state: the layout,
 * deck guns and Wet Landing are set as the game layer would set them.
 */
import type { BattleLayout } from "../../core/battle/index.ts";
import type {
  BattleSetup as GameBattleSetup,
  BattleSide as GameBattleSide,
  BattleStack as GameBattleStack,
} from "../../core/game/battle.ts";
import { DECK_GUN_BASE_HARM, PIRATE_DECK_GUN_HARM } from "../../data/naval.ts";

export const NAVAL_DEBUG_LAYOUTS: readonly BattleLayout[] = [
  "deck",
  "open-water",
  "pier-deck",
  "pier-water",
  "beach",
];

const REALM: GameBattleStack[] = [
  { creature: "squire", count: 30 },
  { creature: "longbowman", count: 14 },
  { creature: "man-at-arms", count: 10 },
  { creature: "knight", count: 5 },
];

const DEFENDERS: Readonly<Record<BattleLayout, GameBattleStack[]>> = {
  land: [{ creature: "goblin", count: 30 }],
  deck: [
    { creature: "corsair", count: 8 },
    { creature: "siren", count: 6 },
    { creature: "corsair", count: 7 },
  ],
  "open-water": [
    { creature: "jellyfish", count: 20 },
    { creature: "hammerhead", count: 3 },
    { creature: "giant-crab", count: 9 },
    { creature: "sea-serpent", count: 1 },
  ],
  "pier-deck": [
    { creature: "corsair", count: 9 },
    { creature: "corsair", count: 8 },
  ],
  "pier-water": [
    { creature: "drowned-sailor", count: 12 },
    { creature: "siren", count: 5 },
    { creature: "giant-crab", count: 8 },
  ],
  beach: [
    { creature: "goblin", count: 40 },
    { creature: "wolf-rider", count: 8 },
  ],
};

/** The sample naval battle of a layout, or null for an unknown name. */
export function navalSampleBattle(
  name: string,
  seed: number,
): GameBattleSetup | null {
  const layout = NAVAL_DEBUG_LAYOUTS.find((l) => l === name);
  if (layout === undefined) return null;
  const afloat = layout !== "pier-deck" && layout !== "pier-water";
  const attacker: GameBattleSide = {
    owner: 0,
    hero: { id: "debug-captain", attack: 2, defense: 2, name: "Captain" },
    stacks: REALM,
    defenseBonus: 0,
    faction: "humans",
    ...(afloat && layout !== "beach" ? { deckGun: DECK_GUN_BASE_HARM } : {}),
    ...(layout === "beach" ? { wetLanding: true } : {}),
  };
  const pirates = layout === "deck" || layout === "pier-deck";
  const defender: GameBattleSide = {
    owner: null,
    hero: null,
    stacks: DEFENDERS[layout],
    defenseBonus: 0,
    ...(pirates ? { deckGun: PIRATE_DECK_GUN_HARM } : {}),
  };
  return {
    seed,
    terrain: layout === "beach" ? "sand" : "water",
    layout,
    ...(afloat ? {} : { attackerTerrain: "grass" as const }),
    attacker,
    defender,
    battle: { kind: "monster", objectId: "debug-sea", heroId: "debug-captain" },
  };
}
