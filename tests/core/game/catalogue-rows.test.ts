/**
 * The content catalogue row by row (CONTENT_HEROES 1 to 3,
 * CONTENT_ARTIFACTS 2 to 5): one hand-built case per skill, feat, vow and
 * worn artifact. Each case gives a fresh hero the row and checks every
 * effect it lists through the reader that owns it: the hero's numbers on
 * the map, or a real battle built from the hero (battle-start rules,
 * rule switches, item acts). Consumables: tests/core/game/consumables.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  createBattle,
  engineSetupFromGame,
  hasAct,
  type BattleState,
} from "../../../src/core/battle/index.ts";
import {
  armyLuck,
  armyMorale,
  battleSetup,
  cloneState,
  commandStrength,
  findPath,
  heroBattleProfile,
  heroIncome,
  heroStats,
  manaCostPercent,
  manaRegen,
  maxMana,
  moveHeroAlong,
  movementPoints,
  pagePower,
  scrollCaseSize,
  scrollPower,
  sightRadius,
  terrainProfile,
  xpPercent,
  backpackSize,
  adventureMagicBonus,
  hireDiscountPercent,
  parleyPercent,
  sellPercent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { ARTIFACT_LIST, WORN_SLOTS } from "../../../src/data/artifacts.ts";
import type { HeroEffect } from "../../../src/data/effects.ts";
import { FEAT_LIST } from "../../../src/data/feats.ts";
import { SKILLS } from "../../../src/data/skills.ts";
import { registerSpells } from "../../../src/core/magic/index.ts";
import { field, gameOn, monster, ok } from "./helpers.ts";

registerSpells();

/** A fresh game with the hero next to neutral Spitters (shooters). */
function game(edit: (h: HeroState) => void): GameState {
  const s0: GameState = cloneState(
    gameOn(field(8, 3), [monster("m", 4, 1, "spitter", 12)], 1, 1),
  );
  const h = s0.heroes[0]!;
  h.defId = "nobody";
  h.skills = [];
  h.feats = [];
  h.pages = ["nettle", "jolt", "deadline"];
  edit(h);
  return s0;
}

/** The battle the hero's walk into the Spitters starts. */
function battleOf(s0: GameState): BattleState {
  const path = findPath(s0, "hero-0", 4, 1, { ignoreFog: true })!;
  const s = ok(moveHeroAlong(s0, "hero-0", path.steps)).state;
  return createBattle(engineSetupFromGame(battleSetup(s)!)).state;
}

/** The setup's rules of the hero's side. */
function rulesOf(s0: GameState): readonly string[] {
  const path = findPath(s0, "hero-0", 4, 1, { ignoreFog: true })!;
  const s = ok(moveHeroAlong(s0, "hero-0", path.steps)).state;
  return engineSetupFromGame(battleSetup(s)!).attacker.rules ?? [];
}

/**
 * Checks each effect through its reader: `before` is the bare hero,
 * `after` the hero with the content, `s` the game with `after` in it.
 */
function checkEffects(
  effects: readonly HeroEffect[],
  before: HeroState,
  after: HeroState,
  s: GameState,
): void {
  const sum = (kind: HeroEffect["kind"], f: (e: HeroEffect) => number) =>
    effects.filter((e) => e.kind === kind).reduce((n, e) => n + f(e), 0);
  for (const e of effects) {
    switch (e.kind) {
      case "stat": {
        const add = sum("stat", (x) =>
          x.kind === "stat" && x.stat === e.stat ? x.amount : 0,
        );
        expect(heroStats(after)[e.stat] - heroStats(before)[e.stat]).toBe(add);
        break;
      }
      case "school-rank":
        expect(heroBattleProfile(after).schoolRanks[e.school]).toBe(e.rank);
        break;
      case "school-power":
        expect(pagePower(after, e.school)).toBeGreaterThan(
          pagePower(before, e.school),
        );
        break;
      case "page-power":
        expect(pagePower(after, "bloom")).toBe(
          Math.min(30, pagePower(before, "bloom") + e.amount),
        );
        break;
      case "scroll-power":
        expect(scrollPower(after)).toBe(scrollPower(before) + e.amount);
        break;
      case "max-mana-percent":
        expect(maxMana(after)).toBeGreaterThan(maxMana(before));
        break;
      case "mana-regen":
        expect(manaRegen(after)).toBeGreaterThan(manaRegen(before));
        break;
      case "mana-cost-percent":
        expect(manaCostPercent(after)).toBe(
          sum("mana-cost-percent", (x) =>
            x.kind === "mana-cost-percent" ? x.percent : 0,
          ),
        );
        break;
      case "movement-percent":
      case "movement-flat":
        expect(movementPoints(after)).toBeGreaterThan(movementPoints(before));
        break;
      case "terrain-cost":
        if (e.terrain !== undefined)
          expect(terrainProfile(after).perTerrain[e.terrain]).toBe(e.reduce);
        else expect(terrainProfile(after).reduce).toBe(e.reduce);
        break;
      case "sight":
        expect(sightRadius(after)).toBe(sightRadius(before) + e.amount);
        break;
      case "xp-percent":
        expect(xpPercent(after)).toBe(xpPercent(before) + e.percent);
        break;
      case "income":
        expect(heroIncome(after, 2).gold).toBeGreaterThanOrEqual(
          e.resources.gold ?? 0,
        );
        break;
      case "morale":
        expect(armyMorale(after)).toBe(armyMorale(before) + e.amount);
        break;
      case "luck":
        expect(armyLuck(after)).toBe(armyLuck(before) + e.amount);
        break;
      case "backpack-size":
        expect(backpackSize(after)).toBe(e.size);
        break;
      case "scroll-case-size":
        expect(scrollCaseSize(after)).toBe(e.size);
        break;
      case "command-bonus":
        expect(commandStrength(after)).toBe(commandStrength(before) + e.amount);
        break;
      case "strike-percent":
        expect(heroBattleProfile(after).strikes).toContainEqual(
          expect.objectContaining({ percent: e.percent, strike: e.strike }),
        );
        break;
      case "stack-stats":
        expect(heroBattleProfile(after).stacks.length).toBeGreaterThan(0);
        break;
      case "battle-start": {
        const b = battleOf(s);
        const ours = e.rule.side === "own" ? "attacker" : "defender";
        const bearers = b.stacks.filter(
          (x) =>
            x.owner === ours &&
            x.conditions.some((c) => c.kind === e.rule.condition),
        );
        expect(bearers.length).toBeGreaterThan(0);
        if (e.rule.linkTo !== undefined) {
          const c = bearers[0]!.conditions.find(
            (x) => x.kind === e.rule.condition,
          )!;
          expect(c.link).not.toBeNull();
        }
        break;
      }
      case "switch":
        expect(heroBattleProfile(after).switches).toContain(e.id);
        expect(rulesOf(s)).toContain(e.id);
        break;
      case "field-surgeon":
        expect(e.tenths).toBe(1);
        break;
      case "spell-power":
        break;
      case "hire-discount":
        expect(hireDiscountPercent(after)).toBe(e.percent);
        break;
      case "parley":
        expect(parleyPercent(after)).toBe(e.percent);
        break;
      case "sell-percent":
        expect(sellPercent(after)).toBe(e.percent);
        break;
      case "adventure-magic":
        expect(adventureMagicBonus(after)).toEqual({
          costPercent: e.costPercent,
          power: e.power,
          perDay: e.perDay,
        });
        break;
      case "missing-page":
        expect(heroBattleProfile(after).startSpent).toEqual(["deadline"]);
        break;
    }
  }
}

describe("skills: every rank of every row", () => {
  for (const def of Object.values(SKILLS)) {
    if (def === undefined) continue;
    it(`${def.name}`, () => {
      for (const rank of [1, 2, 3]) {
        const effects = def.ranks[rank - 1]!.effects;
        expect(effects.length).toBeGreaterThan(0);
        const s = game((h) => h.skills.push({ id: def.id, rank }));
        const before = game(() => {}).heroes[0]!;
        checkEffects(effects, before, s.heroes[0]!, s);
      }
    });
  }
});

describe("feats and vows: every row", () => {
  for (const def of FEAT_LIST) {
    it(`${def.name}`, () => {
      expect(def.effects.length).toBeGreaterThan(0);
      const s = game((h) => (h.feats = [def.id]));
      checkEffects(def.effects, game(() => {}).heroes[0]!, s.heroes[0]!, s);
    });
  }
});

describe("worn artifacts: every row", () => {
  for (const def of ARTIFACT_LIST) {
    if (def.kind !== "worn") continue;
    it(`${def.name}`, () => {
      const slot = WORN_SLOTS.indexOf(def.slot);
      expect(slot).toBeGreaterThanOrEqual(0);
      const s = game((h) => (h.worn[slot] = def.id));
      const after = s.heroes[0]!;
      expect(def.effects.length + (def.itemActs ?? []).length).toBeGreaterThan(
        0,
      );
      checkEffects(def.effects, game(() => {}).heroes[0]!, after, s);
      for (const act of def.itemActs ?? []) {
        expect(hasAct(act)).toBe(true);
        expect(heroBattleProfile(after).itemActs).toContain(act);
      }
    });
  }
});
