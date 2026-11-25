/**
 * Artifacts on the adventure map (RULES_V2 4.1 to 4.5, CONTENT_ARTIFACTS
 * 6.1): the eleven worn slots, the backpack, the scroll case, equipping,
 * curses, Marvel assembly, consumables and handing items over at a
 * meeting. Commands return a new state; helpers marked "in place" change
 * the state they are given (for other commands to build on).
 */
import {
  CONSUMABLES_PER_SLOT,
  WORN_SLOTS,
  findArtifact,
  isCursed,
  wornDef,
  type SlotKind,
} from "../../data/artifacts.ts";
import { getCreature } from "../../data/creatures.ts";
import type { ResourceAmounts } from "../../data/types.ts";
import { mutableStore } from "../magic/hero.ts";
import { backpackSize, scrollCaseSize } from "./effects.ts";
import { fightValue } from "./progression.ts";
import { digHere } from "./sites.ts";
import { slotBarred } from "./hero.ts";
import { canAfford, subtractResources } from "./resources.ts";
import {
  checkTurn,
  cloneState,
  fail,
  findHero,
  findPlayer,
  must,
  revealDisc,
  success,
} from "./state.ts";
import { adjacent } from "./town.ts";
import type {
  CommandResult,
  GameEvent,
  GameState,
  HeroState,
} from "./types.ts";

/** An empty set of worn slots. */
export function emptyWorn(): Array<string | null> {
  return WORN_SLOTS.map(() => null);
}

/** Backpack slots a list of items takes: consumables share by three. */
export function slotsUsed(items: readonly string[]): number {
  const counts = new Map<string, number>();
  let n = 0;
  for (const id of items) {
    if (findArtifact(id)?.kind === "consumable") {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    } else n++;
  }
  for (const c of counts.values()) n += Math.ceil(c / CONSUMABLES_PER_SLOT);
  return n;
}

/** Backpack slots the hero uses now. */
export function backpackSlotsUsed(hero: HeroState): number {
  return slotsUsed(hero.backpack);
}

/** Whether the hero's backpack has room for one more of `id`. */
export function canCarry(hero: HeroState, id: string): boolean {
  return slotsUsed([...hero.backpack, id]) <= backpackSize(hero);
}

/**
 * Puts an artifact into the hero's backpack, in place. False (and nothing
 * changes) when the backpack is full: the item stays where it was.
 */
export function giveArtifact(hero: HeroState, id: string): boolean {
  if (findArtifact(id) === undefined || !canCarry(hero, id)) return false;
  hero.backpack.push(id);
  return true;
}

/** Puts a scroll in the hero's case, in place; false when it is full. */
export function giveScroll(hero: HeroState, spell: string): boolean {
  if (hero.scrolls.length >= scrollCaseSize(hero)) return false;
  hero.scrolls.push(spell);
  return true;
}

/** Worn slot indices of a slot kind. */
export function slotsOfKind(kind: SlotKind): number[] {
  const out: number[] = [];
  WORN_SLOTS.forEach((k, i) => {
    if (k === kind) out.push(i);
  });
  return out;
}

/** Why the hero may not wear `id` in worn slot `slot`, or null. */
export function wearError(
  hero: HeroState,
  id: string,
  slot: number,
): {
  error: "bad-item" | "bad-slot" | "vow" | "one-marvel";
  message: string;
} | null {
  const def = wornDef(id);
  if (def === undefined) {
    return { error: "bad-item", message: `${id} cannot be worn` };
  }
  if (WORN_SLOTS[slot] !== def.slot) {
    return {
      error: "bad-slot",
      message: `${def.name} goes in a ${def.slot} slot`,
    };
  }
  if (slotBarred(hero, slot)) {
    return { error: "vow", message: "a vow keeps this slot empty" };
  }
  if (def.grade === "marvel") {
    const other = hero.worn.some(
      (w, i) => i !== slot && w !== null && wornDef(w)?.grade === "marvel",
    );
    if (other) {
      return {
        error: "one-marvel",
        message: "a hero wears at most one Marvel",
      };
    }
  }
  return null;
}

function heroOnTurn(
  state: GameState,
  heroId: string,
): { hero: HeroState } | { fail: CommandResult } {
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive) {
    return { fail: fail("unknown-hero", `no hero ${heroId}`) };
  }
  const blocked = checkTurn(state, hero.owner);
  if (blocked !== null) return { fail: blocked };
  return { hero };
}

/**
 * Wears the backpack item at `index` (RULES_V2 4.1). `slot` is a worn slot
 * index; by default the first empty slot of its kind, else the first. A
 * worn item in the way goes to the backpack (it may not be cursed).
 */
export function equip(
  state: GameState,
  heroId: string,
  index: number,
  slot?: number,
): CommandResult {
  const got = heroOnTurn(state, heroId);
  if ("fail" in got) return got.fail;
  const hero = got.hero;
  const id = hero.backpack[index];
  if (id === undefined) return fail("bad-slot", `no backpack item ${index}`);
  const def = wornDef(id);
  if (def === undefined) return fail("bad-item", `${id} cannot be worn`);
  const kindSlots = slotsOfKind(def.slot);
  const target =
    slot ?? kindSlots.find((i) => hero.worn[i] === null) ?? kindSlots[0];
  if (target === undefined) return fail("bad-slot", "no slot");
  const why = wearError(hero, id, target);
  if (why !== null) return fail(why.error, why.message);
  const occupant = hero.worn[target] ?? null;
  if (occupant !== null && isCursed(occupant)) {
    return fail("cursed", `${wornDef(occupant)?.name ?? occupant} is cursed`);
  }
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  h.backpack.splice(index, 1);
  if (occupant !== null) h.backpack.splice(index, 0, occupant);
  h.worn[target] = id;
  return success(next);
}

/** Takes off the item in worn slot `slot` into the backpack. */
export function unequip(
  state: GameState,
  heroId: string,
  slot: number,
): CommandResult {
  const got = heroOnTurn(state, heroId);
  if ("fail" in got) return got.fail;
  const hero = got.hero;
  const id = hero.worn[slot] ?? null;
  if (id === null) return fail("empty-slot", `slot ${slot} is empty`);
  if (isCursed(id)) {
    return fail(
      "cursed",
      `${wornDef(id)?.name ?? id} is cursed: lift it first`,
    );
  }
  if (!canCarry(hero, id)) return fail("backpack-full", "the backpack is full");
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  h.worn[slot] = null;
  h.backpack.push(id);
  return success(next);
}

/** Destroys the backpack item at `index` (RULES_V2 4.1). */
export function destroyArtifact(
  state: GameState,
  heroId: string,
  index: number,
): CommandResult {
  const got = heroOnTurn(state, heroId);
  if ("fail" in got) return got.fail;
  if (got.hero.backpack[index] === undefined) {
    return fail("bad-slot", `no backpack item ${index}`);
  }
  const next = cloneState(state);
  must(findHero(next, heroId), "hero").backpack.splice(index, 1);
  return success(next);
}

/** Every item the hero holds, worn or carried. */
function holds(hero: HeroState, id: string): boolean {
  return hero.worn.includes(id) || hero.backpack.includes(id);
}

/** Marvels whose three pieces the hero holds (RULES_V2 4.5). */
export function assemblable(hero: HeroState): string[] {
  const out: string[] = [];
  for (const id of new Set([...hero.worn, ...hero.backpack])) {
    if (id === null) continue;
    const marvel = wornDef(id)?.pieceOf;
    if (marvel === undefined || out.includes(marvel)) continue;
    const pieces = wornDef(marvel)?.pieces ?? [];
    if (pieces.length === 3 && pieces.every((p) => holds(hero, p))) {
      out.push(marvel);
    }
  }
  return out;
}

/**
 * Assembles a Marvel from its three pieces, worn or carried (RULES_V2
 * 4.5): free, cannot be undone; the Marvel goes to the backpack. A Marvel
 * with a cursed piece is cursed (its data says so).
 */
export function assemble(
  state: GameState,
  heroId: string,
  marvel: string,
): CommandResult {
  const got = heroOnTurn(state, heroId);
  if ("fail" in got) return got.fail;
  if (!assemblable(got.hero).includes(marvel)) {
    return fail("no-assembly", `cannot assemble ${marvel}`);
  }
  const pieces = must(wornDef(marvel)?.pieces, "pieces");
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  for (const p of pieces) {
    const w = h.worn.indexOf(p);
    if (w >= 0) h.worn[w] = null;
    else h.backpack.splice(h.backpack.indexOf(p), 1);
  }
  if (!canCarry(h, marvel)) {
    return fail("backpack-full", "no backpack room for the Marvel");
  }
  h.backpack.push(marvel);
  return success(next, [
    { type: "artifact-assembled", heroId, artifact: marvel },
  ]);
}

/**
 * Uses the consumable at backpack `index` (CONTENT_ARTIFACTS 6.1): on the
 * player's turn, never in battle; it is destroyed and acts at once. A
 * second pending effect of the same kind is refused and the item kept.
 */
export function useConsumable(
  state: GameState,
  heroId: string,
  index: number,
): CommandResult {
  const got = heroOnTurn(state, heroId);
  if ("fail" in got) return got.fail;
  const hero = got.hero;
  const id = hero.backpack[index];
  const def = id === undefined ? undefined : findArtifact(id);
  if (id === undefined || def?.kind !== "consumable") {
    return fail("not-consumable", "not a consumable");
  }
  const use = def.use;
  if (use.kind === "next-battle" && hero.nextBattle.includes(id)) {
    return fail(
      "already-used",
      `${def.name} already waits for the next battle`,
    );
  }
  if (use.kind === "redraw" && hero.redraw) {
    return fail("already-used", "the next offer is already redrawn");
  }
  if (use.kind === "dig") {
    // The shovel is a tool: it digs here (sites.ts digHere, 300 movement
    // points whatever is spent) and stays in the backpack.
    return digHere(state, heroId);
  }
  const conduct =
    use.kind === "safe-conduct"
      ? safeConductTarget(state, hero, use.maxFightValue)
      : null;
  if (use.kind === "safe-conduct" && conduct === null) {
    return fail(
      "no-target",
      `no adjacent neutral stack of fight value ${use.maxFightValue} or less`,
    );
  }
  const cache = use.kind === "mark-cache" ? nearestBuried(state, hero) : null;
  if (use.kind === "mark-cache" && cache === null) {
    return fail("no-target", "no buried cache on this map");
  }
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  h.backpack.splice(index, 1);
  switch (use.kind) {
    case "safe-conduct": {
      // Recorded like Parley: no zone of control for this hero today.
      const store = mutableStore(next, heroId);
      if (store.parleyDay !== next.day) store.parley = [];
      store.parleyDay = next.day;
      store.parley = [...(store.parley ?? []), conduct as string];
      break;
    }
    case "mark-cache": {
      const m = next.magic ?? { heroes: {} };
      const player = String(h.owner);
      const old = m.marks?.[player] ?? [];
      const cell = cache as [number, number];
      const has = old.some((c) => c[0] === cell[0] && c[1] === cell[1]);
      next.magic = {
        ...m,
        marks: { ...(m.marks ?? {}), [player]: has ? old : [...old, cell] },
      };
      break;
    }
    case "next-battle":
      h.nextBattle.push(id);
      break;
    case "mana":
      h.mana += use.amount;
      break;
    case "movement":
      h.mp += use.amount;
      break;
    case "reveal": {
      const p = findPlayer(next, h.owner);
      if (p !== undefined)
        revealDisc(next.map, p.explored, h.x, h.y, use.radius);
      break;
    }
    case "redraw":
      h.redraw = true;
      break;
  }
  return success(next, [{ type: "consumable-used", heroId, artifact: id }]);
}

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Letter of Safe Conduct's stack: the strongest neutral stack adjacent to
 * the hero whose stack fight value is at most `maxFv` (ties: monster id).
 */
export function safeConductTarget(
  state: GameState,
  hero: HeroState,
  maxFv: number,
): string | null {
  let best: { id: string; fv: number } | null = null;
  for (const m of Object.values(state.monsters).sort((a, b) =>
    a.id < b.id ? -1 : 1,
  )) {
    if (chebyshev(m.x, m.y, hero.x, hero.y) !== 1) continue;
    const fv = m.count * fightValue(getCreature(m.creature));
    if (fv > maxFv) continue;
    if (best === null || fv > best.fv) best = { id: m.id, fv };
  }
  return best?.id ?? null;
}

/** Dog-Eared Map's cell: the nearest buried object (ties: object order). */
export function nearestBuried(
  state: GameState,
  hero: HeroState,
): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const o of state.map.objects) {
    if (o.data["buried"] !== true) continue;
    const d = chebyshev(o.x, o.y, hero.x, hero.y);
    if (d < bestD) {
      best = [o.x, o.y];
      bestD = d;
    }
  }
  return best;
}

/**
 * Lifts the curse of the worn item in `slot` for `cost` (RULES_V2 4.3: a
 * site, 1000 gold and 2 essence by default, or a guild-3 town for 2000
 * gold). The item goes to the backpack, still cursed. Map sites (bead
 * bzc.13) and the town screen call this with their price.
 */
export function liftCurse(
  state: GameState,
  heroId: string,
  slot: number,
  cost: ResourceAmounts,
): CommandResult {
  const got = heroOnTurn(state, heroId);
  if ("fail" in got) return got.fail;
  const hero = got.hero;
  const id = hero.worn[slot] ?? null;
  if (id === null || !isCursed(id)) {
    return fail("bad-item", "no cursed item in that slot");
  }
  const player = must(findPlayer(state, hero.owner), "player");
  if (!canAfford(player.resources, cost)) {
    return fail("resources", "not enough resources");
  }
  if (!canCarry(hero, id)) return fail("backpack-full", "the backpack is full");
  const next = cloneState(state);
  const h = must(findHero(next, heroId), "hero");
  const p = must(findPlayer(next, h.owner), "player");
  p.resources = subtractResources(p.resources, cost);
  h.worn[slot] = null;
  h.backpack.push(id);
  return success(next, [{ type: "curse-lifted", heroId, artifact: id }]);
}

/** Where an item is handed from at a meeting. */
export interface ItemRef {
  place: "worn" | "backpack" | "scrolls";
  index: number;
}

/**
 * Hands one item from a hero to another of the same player on an adjacent
 * cell (a meeting, RULES_V2 5.3): free, into the receiver's backpack (or
 * scroll case). Worn cursed items cannot be handed over (4.3).
 */
export function handOver(
  state: GameState,
  fromId: string,
  toId: string,
  item: ItemRef,
): CommandResult {
  const got = heroOnTurn(state, fromId);
  if ("fail" in got) return got.fail;
  const from = got.hero;
  const to = findHero(state, toId);
  if (to === undefined || !to.alive) {
    return fail("unknown-hero", `no hero ${toId}`);
  }
  if (to.owner !== from.owner) return fail("not-owner", "not your hero");
  if (!adjacent(from, to)) {
    return fail("not-adjacent", "the heroes must stand side by side");
  }
  const list =
    item.place === "worn"
      ? from.worn
      : item.place === "backpack"
        ? from.backpack
        : from.scrolls;
  const id = list[item.index] ?? null;
  if (id === null) return fail("empty-slot", "nothing there");
  if (item.place === "worn" && isCursed(id)) {
    return fail("cursed", `${wornDef(id)?.name ?? id} is cursed`);
  }
  if (item.place === "scrolls") {
    if (to.scrolls.length >= scrollCaseSize(to)) {
      return fail("scroll-case-full", `${to.name}'s scroll case is full`);
    }
  } else if (!canCarry(to, id)) {
    return fail("backpack-full", `${to.name}'s backpack is full`);
  }
  const next = cloneState(state);
  const f = must(findHero(next, fromId), "hero");
  const t = must(findHero(next, toId), "other hero");
  if (item.place === "worn") f.worn[item.index] = null;
  else if (item.place === "backpack") f.backpack.splice(item.index, 1);
  else f.scrolls.splice(item.index, 1);
  if (item.place === "scrolls") t.scrolls.push(id);
  else t.backpack.push(id);
  return success(next);
}

/**
 * A hero beaten by a hero (RULES_V2 4.4), in place: all its artifacts, worn
 * (slot order) then carried, and all its scrolls move to the winner's
 * backpack and case while there is room; the rest are destroyed. Cursed
 * items arrive unworn. Returns the artifact ids that moved.
 */
export function takeSpoils(winner: HeroState, loser: HeroState): string[] {
  const moved: string[] = [];
  const items = [
    ...loser.worn.filter((w): w is string => w !== null),
    ...loser.backpack,
  ];
  for (const id of items) {
    if (giveArtifact(winner, id)) moved.push(id);
  }
  for (const spell of loser.scrolls) giveScroll(winner, spell);
  loser.worn = emptyWorn();
  loser.backpack = [];
  loser.scrolls = [];
  loser.nextBattle = [];
  return moved;
}

/** Every artifact id a hero holds, worn first (for displays and tests). */
export function heroArtifacts(hero: HeroState): string[] {
  return [
    ...hero.worn.filter((w): w is string => w !== null),
    ...hero.backpack,
  ];
}

/** Events helper for callers that report spoils. */
export function spoilsEvent(
  winner: HeroState,
  loser: HeroState,
  moved: string[],
): GameEvent {
  return {
    type: "artifacts-won",
    heroId: winner.id,
    fromHeroId: loser.id,
    artifacts: moved,
  };
}
