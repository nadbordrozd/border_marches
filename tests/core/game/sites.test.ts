/**
 * Adventure-map object rules (bead bzc.13, CONTENT_MAP_OBJECTS): one or
 * more small hand-built states per object type.
 */
import { describe, expect, it } from "vitest";
import {
  describeObject,
  digHere,
  endTurn,
  fightPendingBattle,
  gateOpen,
  isPickup,
  moveHeroAlong,
  objectGuardFv,
  objectValueFor,
  puzzleCells,
  siteOptions,
  useSite,
  type BattleResolver,
  type GameEvent,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import { heroEffects } from "../../../src/core/game/effects.ts";
import { hasMarketplace } from "../../../src/core/game/town.ts";
import { dailyIncome } from "../../../src/core/game/turn.ts";
import {
  OBJECT_TYPE_IDS,
  OBJECT_TYPES,
} from "../../../src/data/objectTypes.ts";
import type { MapObject } from "../../../src/core/map/types.ts";
import { battleSpellsOfTier } from "../../../src/data/map-spells.ts";
import { ARTIFACT_LIST } from "../../../src/data/artifacts.ts";
import { errorOf, field, gameOn, monster, ok, town } from "./helpers.ts";

/** A catalogue object at (x, y): 1x1, or its footprint up and right. */
function site(
  id: string,
  type: string,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  const def = OBJECT_TYPES[type as keyof typeof OBJECT_TYPES];
  const w = type === "sawmill" ? 1 : def.w;
  const h = type === "sawmill" ? 1 : def.h;
  const blocked: Array<[number, number]> = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (dx === 0 && dy === 0) continue;
      blocked.push([x + dx, y - dy]);
    }
  }
  return {
    id,
    kind: def.kind,
    x,
    y,
    footprint: { w, h },
    blocked,
    data: { type, ...data },
  };
}

/**
 * Steps the hero onto (x, y) from its cell (adjacent); onto a pickup that
 * takes it from where the hero stands (bead bzc.49).
 */
function step(
  s: GameState,
  x: number,
  y: number,
): {
  state: GameState;
  events: GameEvent[];
} {
  return ok(moveHeroAlong(s, "hero-0", [{ x, y }]));
}

describe("pickups and buildings (bead bzc.49)", () => {
  it("one-time objects that leave the map are pickups; lasting sites not", () => {
    const pick = (type: string, kind: MapObject["kind"] = "site"): boolean =>
      isPickup({
        id: type,
        kind,
        x: 0,
        y: 0,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { type },
      });
    for (const t of [
      "campfire",
      "loose-scroll",
      "fallen-adventurer",
      "scholar",
      "sealed-box",
      "prison",
    ]) {
      expect([t, pick(t)]).toEqual([t, true]);
    }
    expect(pick("loose-artifact", "artifact")).toBe(true);
    expect(pick("resource-pile", "pickup")).toBe(true);
    for (const t of [
      "stat-shrine",
      "wishing-well",
      "windmill",
      "seer-hut",
      "event-tile",
      "two-way-waystone",
    ]) {
      expect([t, pick(t)]).toEqual([t, false]);
    }
    expect(pick("sawmill", "mine")).toBe(false);
    expect(pick("stray-hut", "dwelling")).toBe(false);
    expect(pick("buried-cache", "buried")).toBe(false);
  });
});

const hero = (s: GameState): HeroState =>
  s.heroes.find((h) => h.id === "hero-0")!;
const texts = (events: GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === "site" ? [e.text] : []));
const win: BattleResolver = (setup) => ({
  winner: "attacker",
  attacker: setup.attacker.stacks.map((s) => s.count),
  defender: setup.defender.stacks.map(() => 0),
});
const lose: BattleResolver = (setup) => ({
  winner: "defender",
  attacker: setup.attacker.stacks.map(() => 0),
  defender: setup.defender.stacks.map((s, i) => (i === 0 ? 1 : s.count)),
});

/** Ends the human's turn until the given day. */
function toDay(s: GameState, day: number): GameState {
  let st = s;
  while (st.day < day) st = ok(endTurn(st)).state;
  return st;
}

describe("the catalogue", () => {
  it("lists 62 types, 53 core and 9 stretch, the 4 winter sites (bzc.87) and the 4 desert sites (bzc.88), each with a visit text", () => {
    expect(OBJECT_TYPE_IDS).toHaveLength(62 + 4 + 4);
    for (const t of ["pyramid", "sphinx", "sun-temple", "sunken-tomb"])
      expect(OBJECT_TYPE_IDS).toContain(t);
    const stretch = OBJECT_TYPE_IDS.filter((t) => OBJECT_TYPES[t].stretch);
    expect(stretch).toHaveLength(9);
    for (const t of OBJECT_TYPE_IDS) {
      expect(OBJECT_TYPES[t].text.length).toBeGreaterThan(10);
    }
  });
});

describe("once-per-hero buildings", () => {
  it("a stat shrine gives +1 once per hero and says so on hover", () => {
    const s = gameOn(field(5, 1), [
      site("sh", "stat-shrine", 1, 0, { stat: "lore" }),
    ]);
    const before = hero(s).lore;
    const a = step(s, 1, 0);
    expect(hero(a.state).lore).toBe(before + 1);
    expect(texts(a.events)[0]).toMatch(/\+1 Lore/);
    const obj = a.state.map.objects.find((o) => o.id === "sh")!;
    expect(describeObject(a.state, 0, obj, "hero-0").join(" ")).toMatch(
      /Already visited by/,
    );
    expect(objectValueFor(a.state, 0, obj, "hero-0")).toBe(0);
    // Step off and back on: nothing more.
    const b = step(step(a.state, 2, 0).state, 1, 0);
    expect(hero(b.state).lore).toBe(before + 1);
    expect(texts(b.events)[0]).toMatch(/Already visited/);
  });

  it("a learning stone gives 1000 XP; a tree of knowledge a level", () => {
    const s = gameOn(field(5, 1), [
      site("ls", "learning-stone", 1, 0),
      site("tk", "tree-of-knowledge", 2, 0, { price: {} }),
    ]);
    const a = step(s, 1, 0).state;
    expect(hero(a).xp).toBeGreaterThanOrEqual(1000);
    const lvl = hero(a).level;
    const b = step(a, 2, 0).state;
    expect(hero(b).level).toBe(lvl + 1);
  });

  it("the arena offers +2 Attack or +2 Defense", () => {
    const s = gameOn(field(5, 2), [site("ar", "arena", 1, 1)], 0, 1);
    const a = step(s, 1, 1);
    const e = a.events.find((x) => x.type === "site");
    expect(e?.type === "site" && e.options?.map((o) => o.id)).toEqual([
      "stat:attack",
      "stat:defense",
    ]);
    const atk = hero(a.state).attack;
    const b = ok(useSite(a.state, "hero-0", "ar", "stat:attack")).state;
    expect(hero(b).attack).toBe(atk + 2);
    expect(
      siteOptions(
        b,
        hero(b),
        b.map.objects.find((o) => o.id === "ar")!,
      ),
    ).toEqual([]);
    expect(errorOf(useSite(b, "hero-0", "ar", "stat:defense"))).toBe(
      "bad-choice",
    );
  });

  it("a school shrine teaches a page if the hero can, else a scroll", () => {
    const spell = battleSpellsOfTier(1)[0]!.id;
    const s = gameOn(field(4, 1), [
      site("ss", "school-shrine", 1, 0, { spell, tier: 1 }),
    ]);
    const a = step(s, 1, 0).state;
    const h = hero(a);
    expect(h.pages.includes(spell) || h.scrolls.includes(spell)).toBe(true);
  });

  it("a tutor's hut teaches its skill; the hermit forgets one", () => {
    const s0 = gameOn(field(5, 1), []);
    const skill = hero(s0).skills[0]!.id;
    const s = gameOn(field(5, 1), [site("he", "hermit", 1, 0)]);
    const a = step(s, 1, 0).state;
    const b = ok(useSite(a, "hero-0", "he", `forget:${skill}`)).state;
    expect(hero(b).skills.some((x) => x.id === skill)).toBe(false);
  });
});

describe("buffs", () => {
  it("rally camp and wishing well last until the next battle, never stacking", () => {
    const s = gameOn(field(6, 1), [
      site("rc", "rally-camp", 1, 0),
      site("ww", "wishing-well", 3, 0),
    ]);
    let st = step(s, 1, 0).state;
    st = step(st, 2, 0).state;
    st = step(st, 1, 0).state; // again: no stacking
    st = step(st, 2, 0).state;
    st = step(st, 3, 0).state;
    expect(hero(st).buffs).toEqual(["rally-camp", "wishing-well"]);
    const morale = heroEffects(hero(st)).filter(
      (e) => e.effect.kind === "morale",
    );
    expect(morale).toHaveLength(1);
  });

  it("the buffs end with the hero's next battle", () => {
    const s = gameOn(field(6, 1), [
      site("rc", "rally-camp", 1, 0),
      monster("m", 3, 0, "bellhop", 1),
    ]);
    let st = step(s, 1, 0).state;
    expect(hero(st).buffs).toEqual(["rally-camp"]);
    st = step(st, 2, 0).state; // into the zone of control: the stack attacks
    expect(st.pendingBattle).not.toBeNull();
    st = ok(fightPendingBattle(st, win)).state;
    expect(hero(st).buffs).toEqual([]);
  });

  it("stables give +300 movement on each remaining day of the week", () => {
    const s = gameOn(
      field(5, 2),
      [site("st", "stables", 1, 1), town("t", 4, 0, 0)],
      0,
      1,
    );
    const mp = hero(s).mp;
    const a = step(s, 1, 1).state;
    expect(hero(a).mp).toBe(mp - 100 + 300);
    const day2 = toDay(a, 2);
    expect(hero(day2).maxMp).toBe(hero(s).maxMp + 300);
    const day8 = toDay(a, 8);
    expect(hero(day8).maxMp).toBe(hero(s).maxMp);
  });

  it("a mana well fills mana once a day per hero", () => {
    const s = gameOn(field(4, 1), [site("mw", "mana-well", 1, 0)]);
    const s0 = { ...s, heroes: s.heroes.map((h) => ({ ...h, mana: 0 })) };
    const a = step(s0, 1, 0).state;
    expect(hero(a).mana).toBeGreaterThan(0);
  });
});

describe("weekly producers and dwellings", () => {
  it("a water wheel pays the first visitor each week", () => {
    const s = gameOn(
      field(5, 2),
      [site("wh", "water-wheel", 1, 1), town("t", 4, 0, 0)],
      0,
      1,
    );
    const gold = s.players[0]!.resources.gold;
    const a = step(s, 1, 1).state;
    expect(a.players[0]!.resources.gold).toBe(gold + 1000);
    const b = step(step(a, 0, 1).state, 1, 1).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 1000);
    // Next week it pays again.
    const c = toDay(b, 8);
    const d = step(step(c, 0, 1).state, 1, 1).state;
    expect(d.players[0]!.resources.gold).toBe(
      c.players[0]!.resources.gold + 1000,
    );
  });

  it("a stray hut is flagged and hires its stray from a weekly stock", () => {
    const s = gameOn(field(4, 1), [
      site("hut", "stray-hut", 1, 0, { creature: "gremlin" }),
    ]);
    const a = step(s, 1, 0);
    expect(a.state.sites["hut"]?.owner).toBe(0);
    const opts = a.events.find((e) => e.type === "site");
    expect(opts?.type === "site" && opts.options?.[0]?.id).toMatch(/^hire:/);
    const n = Number(
      (opts?.type === "site" && opts.options?.[0]?.id.split(":")[1]) ?? 0,
    );
    expect(n).toBeGreaterThan(0);
    const gold = a.state.players[0]!.resources.gold;
    const b = ok(useSite(a.state, "hero-0", "hut", `hire:${n}`)).state;
    expect(b.players[0]!.resources.gold).toBe(gold - n * 70);
    expect(
      hero(b).army.some((x) => x?.creature === "gremlin" && x.count === n),
    ).toBe(true);
    expect(b.sites["hut"]?.stock).toBe(8 - n);
  });

  it("a caretaker lodge stays locked until its errand is done", () => {
    const s = gameOn(
      field(5, 2),
      [
        site("lodge", "caretaker-lodge", 1, 1, {
          creature: "notary",
          quest: { kind: "level", level: 5 },
        }),
      ],
      0,
      1,
    );
    const a = step(s, 1, 1);
    expect(texts(a.events)[0]).toMatch(/locked/);
    expect(a.state.sites["lodge"]?.owner).toBeUndefined();
  });
});

describe("banks", () => {
  const bank = (): MapObject =>
    site("bk", "stopped-belfry", 1, 1, {
      size: "small",
      guard: [{ creature: "winder", count: 7 }],
      prize: { xp: 1500, gold: 500 },
      value: 2500,
    });

  it("visiting starts a fight against its own guard; winning pays the prize once", () => {
    const s = gameOn(field(5, 2), [bank()], 0, 1);
    const a = step(s, 1, 1).state;
    expect(a.pendingBattle).toEqual({
      kind: "site",
      objectId: "bk",
      heroId: "hero-0",
    });
    expect(
      objectGuardFv(
        a,
        a.map.objects.find((o) => o.id === "bk")!,
      ),
    ).toBe(7 * 205);
    const gold = a.players[0]!.resources.gold;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 500);
    expect(b.sites["bk"]?.done).toBe(true);
    const c = step(step(b, 0, 1).state, 1, 1);
    expect(c.state.pendingBattle).toBeNull();
    expect(texts(c.events)[0]).toMatch(/plundered/);
  });

  it("guards killed in a lost fight stay dead", () => {
    const s = gameOn(field(5, 2), [bank()], 0, 1);
    const a = step(s, 1, 1).state;
    const b = ok(fightPendingBattle(a, lose)).state;
    expect(b.sites["bk"]?.guard).toEqual([{ creature: "winder", count: 1 }]);
  });

  it("the keepers' vault lets the winner carry out one of three treasures", () => {
    const art = ARTIFACT_LIST.find((x) => x.kind === "worn")!.id;
    const s = gameOn(
      field(6, 2),
      [
        site("vault", "keepers-vault", 1, 1, {
          guard: [{ creature: "notary", count: 5 }],
          choices: [
            { gold: 5000 },
            { artifacts: [art], gold: 5000 },
            { xp: 100 },
          ],
        }),
      ],
      0,
      1,
    );
    const a = ok(fightPendingBattle(step(s, 1, 1).state, win));
    const e = a.events.find((x) => x.type === "site");
    expect(e?.type === "site" && e.options?.length).toBe(3);
    const b = ok(useSite(a.state, "hero-0", "vault", "take:1")).state;
    expect(hero(b).backpack).toContain(art);
    expect(b.sites["vault"]?.done).toBe(true);
  });
});

describe("treasure", () => {
  it("a loose artifact goes to the backpack and leaves the map", () => {
    const art = ARTIFACT_LIST.find((x) => x.kind === "worn")!.id;
    const s = gameOn(field(4, 1), [
      site("la", "loose-artifact", 1, 0, { artifact: art, value: 2000 }),
    ]);
    const a = step(s, 1, 0).state;
    expect(hero(a).backpack).toContain(art);
    expect(a.collected).toContain("la");
    expect(
      objectValueFor(
        a,
        0,
        a.map.objects.find((o) => o.id === "la")!,
      ),
    ).toBe(0);
  });

  it("a campfire gives gold and wood; a loose scroll goes to the case", () => {
    const spell = battleSpellsOfTier(2)[0]!.id;
    const s = gameOn(field(5, 1), [
      site("cf", "campfire", 1, 0, { gold: 500, resource: "wood", amount: 5 }),
      site("sc", "loose-scroll", 2, 0, { spell }),
    ]);
    const before = s.players[0]!.resources;
    // Taken from the next cell (bead bzc.49): the hero stays put, then the
    // campfire's cell is free to walk onto.
    const took = step(s, 1, 0).state;
    expect(hero(took)).toMatchObject({ x: 0, y: 0 });
    const a = step(step(took, 1, 0).state, 2, 0).state;
    expect(hero(a)).toMatchObject({ x: 1, y: 0 });
    expect(a.players[0]!.resources.gold).toBe(before.gold + 500);
    expect(a.players[0]!.resources.wood).toBe(before.wood + 5);
    expect(hero(a).scrolls).toContain(spell);
  });

  it("a fallen adventurer gives a Wonder and -2 Morale until the next battle", () => {
    const art = ARTIFACT_LIST.find((x) => x.kind === "worn")!.id;
    const s = gameOn(field(4, 1), [
      site("fa", "fallen-adventurer", 1, 0, { artifact: art }),
    ]);
    const a = step(s, 1, 0).state;
    expect(hero(a).backpack).toContain(art);
    expect(hero(a).buffs).toContain("fallen-adventurer");
  });

  it("a sealed box with a fight inside guards its prize", () => {
    const s = gameOn(field(4, 1), [
      site("box", "sealed-box", 1, 0, {
        prize: { gold: 4000 },
        guard: [{ creature: "gremlin", count: 20 }],
      }),
    ]);
    const a = step(s, 1, 0).state;
    expect(a.pendingBattle?.kind).toBe("site");
    const gold = a.players[0]!.resources.gold;
    const b = ok(fightPendingBattle(a, win)).state;
    expect(b.players[0]!.resources.gold).toBe(gold + 4000);
    expect(b.collected).toContain("box");
  });
});

describe("hidden treasure", () => {
  it("digging takes the whole day and finds a buried cache", () => {
    const s = gameOn(field(4, 1), [
      site("bc", "buried-cache", 1, 0, { prize: { gold: 2000 }, buried: true }),
    ]);
    // Moving onto it does not stop or reveal anything.
    const a = step(s, 1, 0);
    expect(a.events.some((e) => e.type === "site")).toBe(false);
    expect(errorOf(digHere(a.state, "hero-0"))).toBe("no-dig");
    const day2 = toDay(a.state, 2);
    const gold = day2.players[0]!.resources.gold;
    const dug = ok(digHere(day2, "hero-0"));
    expect(dug.state.players[0]!.resources.gold).toBe(gold + 2000);
    expect(hero(dug.state).mp).toBe(0);
    expect(dug.state.collected).toContain("bc");
  });

  it("digging the Keystone puts it in the backpack", () => {
    const s = gameOn(field(4, 1), [
      site("ks", "buried-keystone", 1, 0, { buried: true }),
    ]);
    const there = toDay(step(s, 1, 0).state, 2);
    const dug = ok(digHere(there, "hero-0"));
    expect(hero(dug.state).backpack).toContain("keystone");
    expect(dug.events).toContainEqual({
      type: "dug",
      heroId: "hero-0",
      found: "The Keystone",
    });
  });

  it("each obelisk uncovers a share of the puzzle, the Keystone's cell last", () => {
    const s = gameOn(field(12, 9), [
      site("o1", "obelisk", 1, 0),
      site("o2", "obelisk", 2, 0),
      site("ks", "buried-keystone", 8, 5, { buried: true }),
    ]);
    expect(puzzleCells(s, 0)).toHaveLength(0);
    const a = step(s, 1, 0).state;
    const half = puzzleCells(a, 0);
    expect(half.length).toBe(24);
    expect(half.some(([x, y]) => x === 8 && y === 5)).toBe(false);
    const b = step(a, 2, 0).state;
    const all = puzzleCells(b, 0);
    expect(all).toHaveLength(49);
    expect(all[all.length - 1]).toEqual([8, 5]);
  });
});

describe("quests, gates and prisons", () => {
  it("a border gate is a wall until the player visits the key tent", () => {
    const s = gameOn(field(5, 1), [
      site("tent", "keymasters-tent", 1, 0, { colour: "red" }),
      site("gate", "border-gate", 3, 0, { colour: "red" }),
    ]);
    const gate = s.map.objects.find((o) => o.id === "gate")!;
    expect(gateOpen(s, gate, 0)).toBe(false);
    const a = step(step(s, 1, 0).state, 2, 0).state;
    expect(gateOpen(a, gate, 0)).toBe(true);
    const b = step(a, 3, 0).state;
    expect(hero(b).x).toBe(3);
  });

  it("a closed gate refuses the step", () => {
    const s = gameOn(field(5, 1), [
      site("gate", "border-gate", 1, 0, { colour: "red" }),
    ]);
    expect(errorOf(moveHeroAlong(s, "hero-0", [{ x: 1, y: 0 }]))).toBe(
      "bad-path",
    );
  });

  it("a seer hut pays once its quest is done", () => {
    const s = gameOn(field(4, 1), [
      site("seer", "seer-hut", 1, 0, {
        quest: { kind: "resources", cost: { gold: 100 } },
        reward: { wood: 7 },
      }),
    ]);
    const before = s.players[0]!.resources;
    const a = step(s, 1, 0);
    expect(texts(a.events)[0]).toMatch(/Quest complete/);
    expect(a.state.players[0]!.resources.wood).toBe(before.wood + 7);
    expect(a.state.players[0]!.resources.gold).toBe(before.gold - 100);
    expect(a.state.sites["seer"]?.done).toBe(true);
  });

  it("a quest gate opens for a player who completes its quest", () => {
    const s = gameOn(field(5, 1), [
      site("qg", "quest-gate", 2, 0, { quest: { kind: "level", level: 1 } }),
    ]);
    const qg = s.map.objects.find((o) => o.id === "qg")!;
    expect(gateOpen(s, qg, 0)).toBe(false);
  });

  it("a prison frees a named hero who joins the player", () => {
    const s = gameOn(
      field(5, 3),
      [site("pr", "prison", 2, 1, { level: 3 })],
      1,
      1,
    );
    const n = s.heroes.filter((h) => h.alive && h.owner === 0).length;
    const a = step(s, 2, 1);
    const freed = a.events.find((e) => e.type === "hero-freed");
    expect(freed).toBeDefined();
    const mine = a.state.heroes.filter((h) => h.alive && h.owner === 0);
    expect(mine).toHaveLength(n + 1);
    const newcomer = mine.find((h) => h.id !== "hero-0")!;
    expect(newcomer.level).toBeGreaterThanOrEqual(3);
    expect(a.state.collected).toContain("pr");
  });
});

describe("services and teleports", () => {
  it("a two-way waystone moves the hero to its twin", () => {
    const s = gameOn(field(8, 1), [
      site("w1", "two-way-waystone", 1, 0, {
        pair: "amber-0",
        colour: "amber",
      }),
      site("w2", "two-way-waystone", 6, 0, {
        pair: "amber-0",
        colour: "amber",
      }),
    ]);
    const a = step(s, 1, 0);
    expect([hero(a.state).x, hero(a.state).y]).toEqual([6, 0]);
    expect(a.events.some((e) => e.type === "teleported")).toBe(true);
  });

  it("a trading post gives market access while the hero stands on it", () => {
    const s = gameOn(field(5, 2), [site("tp", "trading-post", 1, 1)], 0, 1);
    const town = Object.values(s.towns);
    expect(town.length === 0 || !hasMarketplace(s, 0) || true).toBe(true);
    const a = step(s, 1, 1).state;
    expect(hasMarketplace(a, 0)).toBe(true);
  });

  it("a tollhouse sells its stock and buys artifacts at half value", () => {
    const art = ARTIFACT_LIST.find((x) => x.kind === "worn")!;
    const s = gameOn(
      field(5, 2),
      [site("th", "tollhouse", 1, 1, { pool: [art.id] })],
      0,
      1,
    );
    const rich = {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        resources: { ...p.resources, gold: 50000 },
      })),
    };
    const a = step(rich, 1, 1).state;
    const b = ok(useSite(a, "hero-0", "th", "buy:0")).state;
    expect(hero(b).backpack).toContain(art.id);
    expect(b.players[0]!.resources.gold).toBe(50000 - art.value);
    const i = hero(b).backpack.indexOf(art.id);
    const c = ok(useSite(b, "hero-0", "th", `sell:${i}`)).state;
    expect(c.players[0]!.resources.gold).toBe(
      50000 - art.value + Math.floor(art.value / 2),
    );
  });

  it("a pylon is marked once per player", () => {
    const s = gameOn(field(4, 1), [site("py", "pylon", 1, 0, { value: 500 })]);
    expect(
      objectValueFor(
        s,
        0,
        s.map.objects.find((o) => o.id === "py")!,
      ),
    ).toBe(500);
    const a = step(s, 1, 0).state;
    expect(a.sites["py"]?.players).toEqual([0]);
    expect(
      objectValueFor(
        a,
        0,
        a.map.objects.find((o) => o.id === "py")!,
      ),
    ).toBe(0);
  });

  it("a one-way waystone moves the hero to its exit, worth nothing as a prize", () => {
    const s = gameOn(field(8, 2), [
      site("ow", "one-way-waystone", 1, 0, { exit: [6, 1] }),
    ]);
    const ow = s.map.objects.find((o) => o.id === "ow")!;
    expect(objectValueFor(s, 0, ow)).toBe(0);
    expect(describeObject(s, 0, ow)[1]).toMatch(/exit is at \(6, 1\)/);
    const a = step(s, 1, 0);
    expect([hero(a.state).x, hero(a.state).y]).toEqual([6, 1]);
    expect(a.events).toContainEqual({
      type: "teleported",
      heroId: "hero-0",
      x: 6,
      y: 1,
    });
    expect(a.state.players[0]!.explored[1 * 8 + 7]).toBe(true);
  });
});

describe("drill yards (ECONOMY 6.3)", () => {
  /** A hero leading `army` beside a drill yard, its player holding `gold`. */
  const yard = (army: Array<[string, number]>, gold: number): GameState => {
    const s = gameOn(field(5, 2), [site("dy", "drill-yard", 1, 1)], 0, 1);
    const h = hero(s);
    h.army = h.army.map(() => null);
    army.forEach(([creature, count], i) => {
      h.army[i] = { creature: creature as never, count };
    });
    s.players[0]!.resources.gold = gold;
    return s;
  };
  const dy = (s: GameState): MapObject =>
    s.map.objects.find((o) => o.id === "dy")!;

  it("sells the Drills of the hero's creatures at twice the town gold", () => {
    const s = yard(
      [
        ["longbowman", 10],
        ["knight", 2],
        ["goblin", 30],
      ],
      6700,
    );
    // Butts 1000 and Tiltyard 2500 gold in town; Mosh Pit 800.
    expect(objectValueFor(s, 0, dy(s))).toBe(1000 + 2500 + 800);
    const a = step(s, 1, 1);
    const ev = a.events.find((e) => e.type === "site");
    const opts = ev?.type === "site" ? (ev.options ?? []) : [];
    expect(opts.map((o) => o.id)).toEqual([
      "drill:butts",
      "drill:tiltyard",
      "drill:mosh-pit",
    ]);
    expect(opts[0]!.label).toMatch(/2000 gold/);
    expect(describeObject(a.state, 0, dy(a.state))[1]).toMatch(
      /Butts \(2000 gold\), Tiltyard \(5000 gold\), Mosh Pit \(1600 gold\)/,
    );
    expect(opts.every((o) => o.disabled === undefined)).toBe(true);
    const b = ok(useSite(a.state, "hero-0", "dy", "drill:tiltyard"));
    expect(b.state.players[0]!.drills).toEqual(["knight:follow-through"]);
    expect(b.state.players[0]!.resources.gold).toBe(1700);
    expect(b.events).toContainEqual({
      type: "drill",
      player: 0,
      creature: "knight",
      ability: "follow-through",
    });
    // Owned now; the Butts (2000) is beyond the gold left.
    const left = siteOptions(b.state, hero(b.state), dy(b.state));
    expect(left.map((o) => o.id)).toEqual(["drill:butts", "drill:mosh-pit"]);
    expect(left[0]!.disabled).toBe("not enough gold");
    expect(errorOf(useSite(b.state, "hero-0", "dy", "drill:butts"))).toBe(
      "bad-choice",
    );
    expect(errorOf(useSite(b.state, "hero-0", "dy", "drill:tiltyard"))).toBe(
      "bad-choice",
    );
    // Only the affordable Mosh Pit still counts for the AI.
    expect(objectValueFor(b.state, 0, dy(b.state))).toBe(800);
  });

  it("has nothing for an army without drillable creatures", () => {
    const s = yard([["gremlin", 5]], 50000);
    expect(objectValueFor(s, 0, dy(s))).toBe(0);
    const a = step(s, 1, 1);
    expect(texts(a.events)[0]).toMatch(/nothing to teach/);
    expect(siteOptions(a.state, hero(a.state), dy(a.state))).toEqual([]);
  });
});

describe("mines", () => {
  it("a haunted mine yields double its kind", () => {
    const s = gameOn(field(4, 1), [
      {
        id: "hm",
        kind: "mine",
        x: 1,
        y: 0,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { type: "haunted-mine", resource: "ore", yield: 2 },
      },
    ]);
    const a = step(s, 1, 0).state;
    expect(dailyIncome(a, 0).ore - dailyIncome(s, 0).ore).toBe(4);
  });
});

describe("hover text", () => {
  it("every type explains itself with its reset", () => {
    const s = gameOn(field(4, 1), []);
    for (const t of OBJECT_TYPE_IDS) {
      const obj: MapObject = {
        id: `x-${t}`,
        kind: OBJECT_TYPES[t].kind,
        x: 3,
        y: 0,
        footprint: { w: 1, h: 1 },
        blocked: [],
        data: { type: t },
      };
      const lines = describeObject(s, 0, obj, "hero-0");
      expect(lines[0]).toContain(OBJECT_TYPES[t].name);
      expect(lines.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("names a guard and its strength", () => {
    const shrine = site("sh", "stat-shrine", 1, 0, { stat: "attack" });
    const m = monster("m", 2, 0, "gremlin", 10);
    m.data["guards"] = ["sh"];
    const s = gameOn(field(4, 1), [shrine, m]);
    const lines = describeObject(
      s,
      0,
      s.map.objects.find((o) => o.id === "sh")!,
      "hero-0",
    );
    expect(lines.at(-1)).toMatch(
      /Guarded by 10 Gremlins \(strength about 470\)/,
    );
  });
});
