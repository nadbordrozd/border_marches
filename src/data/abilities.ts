/**
 * Creature abilities as data. The battle engine implements the rules; the
 * numbers it needs are here so the preview text and the engine agree.
 * Rules: FACTION_LOST_WORLD.md section 3 and GAME_DESIGN.md section 8.1.
 */
import type { AbilityId } from "./types.ts";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** Exact rule text for tooltips and previews. */
  text: string;
  /** Rule parameters (integers; percentages are whole percent). */
  params: Readonly<Record<string, number>>;
}

export const ABILITIES: Readonly<Record<AbilityId, AbilityDef>> = {
  mob: {
    id: "mob",
    name: "Mob",
    text: "+1 Attack for each other friendly stack adjacent to the target (max +5). Applies to attacks and retaliations.",
    params: { attackPerStack: 1, maxAttack: 5 },
  },
  venom: {
    id: "venom",
    name: "Venom",
    text: "A stack hit by this creature (shot or melee) has -3 Defense until the end of the next round. A new hit refreshes the duration; it never stacks. Defense cannot go below 0.",
    params: { defense: 3, rounds: 1 },
  },
  "pack-hunter": {
    id: "pack-hunter",
    name: "Pack Hunter",
    text: "+20% damage for each other friendly stack adjacent to the target (max +100%). Applies to attacks and retaliations.",
    params: { percentPerStack: 20, maxPercent: 100 },
  },
  "war-drums": {
    id: "war-drums",
    name: "War Drums",
    text: "Other friendly stacks adjacent to this stack get +2 Attack. Several War Drums do not stack.",
    params: { attack: 2 },
  },
  charge: {
    id: "charge",
    name: "Charge",
    text: "+15% damage for each hex moved this turn before the attack (max +75% at 5 hexes). Retaliations have moved 0 hexes.",
    params: { percentPerHex: 15, maxPercent: 75 },
  },
  terror: {
    id: "terror",
    name: "Terror",
    text: "Stacks attacked by this creature cannot retaliate.",
    params: {},
  },
  bony: {
    id: "bony",
    name: "Bony",
    text: "Ranged attacks deal half damage to this creature.",
    params: { rangedPercent: 50 },
  },
  regenerate: {
    id: "regenerate",
    name: "Regenerate",
    text: "At the start of its turn its top creature heals to full HP.",
    params: {},
  },
  warcry: {
    id: "warcry",
    name: "Warcry",
    text: "Other friendly stacks adjacent to this stack get +2 Defense.",
    params: { defense: 2 },
  },
};
