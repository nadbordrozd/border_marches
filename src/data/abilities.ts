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
    text: "+1 Attack for each other friendly stack adjacent to the target (at most +5), retaliations included.",
    params: { attackPerStack: 1, maxAttack: 5 },
  },
  venom: {
    id: "venom",
    name: "Venom",
    text: "A stack this creature strikes (shot or melee) gets -3 Defense until the end of the next round. A new hit restarts the time but does not add up. Defense cannot go below 0.",
    params: { defense: 3, rounds: 1 },
  },
  "pack-hunter": {
    id: "pack-hunter",
    name: "Pack Hunter",
    text: "Deals 20% more damage for each other friendly stack adjacent to the target (at most 100% more), retaliations included.",
    params: { percentPerStack: 20, maxPercent: 100 },
  },
  "war-drums": {
    id: "war-drums",
    name: "War Drums",
    text: "Other friendly stacks adjacent to this stack get +2 Attack. Two War Drums on one stack do not add up.",
    params: { attack: 2 },
  },
  charge: {
    id: "charge",
    name: "Charge",
    text: "Its melee attack deals 15% more damage for each hex it walked this turn before attacking (at most 75% more, at 5 hexes). No bonus when it retaliates.",
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
    text: "Shots deal half damage to this creature.",
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
