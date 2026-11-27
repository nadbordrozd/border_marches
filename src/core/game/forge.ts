/**
 * The Infernal Forge (bead border_marches-bzc.125, CONTENT_MAP_OBJECTS
 * 3.14): a hero feeds the forge one of its Trinkets, worn or carried and
 * never a cursed one, pays {@link FORGE_COST}, and gets the forge's seeded
 * Wonder in its place. Each hero once.
 *
 * - A carried Trinket is replaced in the backpack where it lay.
 * - A worn Trinket leaves its slot: the Wonder is worn there when it fits
 *   that slot (and no vow keeps it out), else it goes to the backpack,
 *   which then needs room.
 *
 * Pure helpers; sites.ts offers the choices and applies one.
 */
import { findArtifact, isCursed, wornDef } from "../../data/artifacts.ts";
import { FORGE_COST } from "../../data/objectTypes.ts";
import type { MapObject } from "../map/types.ts";
import { canCarry, wearError } from "./artifacts.ts";
import type { HeroState } from "./types.ts";

/** One Trinket the forge would take: "w" worn slot or "p" backpack index. */
export interface ForgeOffer {
  readonly where: "w" | "p";
  readonly index: number;
  readonly artifact: string;
}

/** The forge's Wonder (its seeded `data.wonder`), or null. */
export function forgeWonder(obj: MapObject): string | null {
  const w = obj.data["wonder"];
  return typeof w === "string" && wornDef(w) !== undefined ? w : null;
}

/** A Trinket the forge takes: worn-kind, Trinket grade, not cursed. */
function reforgeable(id: string): boolean {
  const def = wornDef(id);
  return def !== undefined && def.grade === "trinket" && !isCursed(id);
}

/** The hero's Trinkets the forge would take, worn ones first. */
export function forgeOffers(hero: HeroState): ForgeOffer[] {
  const out: ForgeOffer[] = [];
  hero.worn.forEach((a, index) => {
    if (a !== null && reforgeable(a))
      out.push({ where: "w", index, artifact: a });
  });
  hero.backpack.forEach((a, index) => {
    if (reforgeable(a)) out.push({ where: "p", index, artifact: a });
  });
  return out;
}

/** The option id of an offer ("reforge:w3", "reforge:p0"). */
export function forgeOptionId(o: ForgeOffer): string {
  return `reforge:${o.where}${o.index}`;
}

/** The offer an option argument ("w3", "p0") names, or undefined. */
export function forgeOfferAt(
  hero: HeroState,
  arg: string,
): ForgeOffer | undefined {
  return forgeOffers(hero).find((o) => `${o.where}${o.index}` === arg);
}

/** Why this offer cannot be reforged now (besides the price), or null. */
export function forgeBlock(
  hero: HeroState,
  offer: ForgeOffer,
  wonder: string,
): string | null {
  if (offer.where === "p") return null;
  if (wearError(hero, wonder, offer.index) === null) return null;
  // The Wonder goes to the backpack instead of the slot.
  return canCarry(hero, wonder) ? null : "the backpack is full";
}

/**
 * Reforges in place: the Trinket goes, the Wonder takes its place (worn in
 * the same slot when it may be, else in the backpack). Returns false (and
 * changes nothing) when it cannot. The price is the caller's.
 */
export function reforge(
  hero: HeroState,
  offer: ForgeOffer,
  wonder: string,
): boolean {
  if (forgeBlock(hero, offer, wonder) !== null) return false;
  if (offer.where === "p") {
    if (hero.backpack[offer.index] !== offer.artifact) return false;
    hero.backpack[offer.index] = wonder;
    return true;
  }
  if (hero.worn[offer.index] !== offer.artifact) return false;
  if (wearError(hero, wonder, offer.index) === null) {
    hero.worn[offer.index] = wonder;
    return true;
  }
  hero.worn[offer.index] = null;
  hero.backpack.push(wonder);
  return true;
}

/** The gain of reforging (the Wonder's value less the Trinket's). */
export function forgeGain(offer: ForgeOffer, wonder: string): number {
  return (
    (findArtifact(wonder)?.value ?? 0) -
    (findArtifact(offer.artifact)?.value ?? 0)
  );
}

/** The forge's price as resource amounts. */
export const FORGE_PRICE: Readonly<{ gold: number; essence: number }> =
  FORGE_COST;
