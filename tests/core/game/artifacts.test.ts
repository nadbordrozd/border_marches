/**
 * Artifacts on the map (RULES_V2 4, CONTENT_ARTIFACTS 6.1): slots,
 * backpack, scroll case, curses, Marvel assembly, consumables, trading at
 * a meeting and spoils. Hand-built states only.
 */
import { describe, expect, it } from "vitest";
import {
  assemblable,
  assemble,
  backpackSlotsUsed,
  canCarry,
  cloneState,
  destroyArtifact,
  equip,
  giveArtifact,
  handOver,
  heroStats,
  liftCurse,
  maxMana,
  unequip,
  useConsumable,
  type GameState,
  type HeroState,
} from "../../../src/core/game/index.ts";
import {
  ARTIFACT_LIST,
  GRADE_VALUES,
  PIECE_VALUE,
  WORN_SLOTS,
  wornDef,
} from "../../../src/data/artifacts.ts";
import { errorOf, field, gameOn, ok } from "./helpers.ts";

function game(edit: (h: HeroState) => void = () => {}): GameState {
  const s = cloneState(gameOn(field(8, 3), []));
  const h = s.heroes[0]!;
  h.defId = "nobody";
  edit(h);
  return s;
}

const hero = (s: GameState, i = 0): HeroState => s.heroes[i]!;
const RING_1 = WORN_SLOTS.indexOf("ring");

describe("artifact data (RULES_V2 4.2, 4.5)", () => {
  it("has eleven worn slots and rows across every grade", () => {
    expect(WORN_SLOTS).toHaveLength(11);
    const worn = ARTIFACT_LIST.filter((a) => a.kind === "worn");
    expect(worn.some((a) => a.kind === "worn" && a.grade === "trinket")).toBe(
      true,
    );
    expect(worn.some((a) => a.kind === "worn" && a.cursed === true)).toBe(true);
    expect(ARTIFACT_LIST.filter((a) => a.kind === "consumable").length).toBe(
      12,
    );
  });

  it("keeps Marvels and their pieces consistent", () => {
    for (const a of ARTIFACT_LIST) {
      if (a.kind !== "worn" || a.grade !== "marvel") continue;
      expect(a.value).toBe(GRADE_VALUES.marvel);
      const pieces = a.pieces!.map((p) => wornDef(p)!);
      expect(pieces.every((p) => p.pieceOf === a.id)).toBe(true);
      expect(pieces.every((p) => p.grade === "wonder")).toBe(true);
      expect(pieces.every((p) => p.value === PIECE_VALUE)).toBe(true);
      // A Marvel with a cursed piece is cursed (4.5).
      expect(a.cursed === true).toBe(pieces.some((p) => p.cursed === true));
    }
  });
});

describe("equipping (RULES_V2 4.1)", () => {
  it("wears a backpack item in its slot and takes it off again", () => {
    let s = game((h) => (h.backpack = ["tin-sabre", "knuckle-dusters"]));
    s = ok(equip(s, "hero-0", 0)).state;
    expect(hero(s).worn[WORN_SLOTS.indexOf("weapon")]).toBe("tin-sabre");
    expect(heroStats(hero(s)).attack).toBe(3);
    s = ok(equip(s, "hero-0", 0)).state; // knuckle-dusters: first ring
    expect(hero(s).worn[RING_1]).toBe("knuckle-dusters");
    expect(hero(s).backpack).toEqual([]);
    s = ok(unequip(s, "hero-0", RING_1)).state;
    expect(hero(s).backpack).toEqual(["knuckle-dusters"]);
    expect(errorOf(unequip(s, "hero-0", RING_1))).toBe("empty-slot");
  });

  it("fills both rings, then swaps into the first", () => {
    let s = game((h) => {
      h.backpack = ["knuckle-dusters", "moneylenders-ring", "knuckle-dusters"];
    });
    s = ok(equip(s, "hero-0", 0)).state;
    s = ok(equip(s, "hero-0", 0)).state;
    expect(hero(s).worn.slice(RING_1, RING_1 + 2)).toEqual([
      "knuckle-dusters",
      "moneylenders-ring",
    ]);
    s = ok(equip(s, "hero-0", 0)).state;
    expect(hero(s).backpack).toEqual(["knuckle-dusters"]);
  });

  it("refuses the wrong slot, consumables and a second Marvel", () => {
    const s = game((h) => {
      h.backpack = ["tin-sabre", "blue-tonic", "the-hourglass-with-no-bottom"];
      h.worn[9] = "the-hourglass-with-no-bottom";
    });
    expect(errorOf(equip(s, "hero-0", 0, 0))).toBe("bad-slot");
    expect(errorOf(equip(s, "hero-0", 1))).toBe("bad-item");
    expect(errorOf(equip(s, "hero-0", 2, 10))).toBe("one-marvel");
  });

  it("keeps a vow's slot empty", () => {
    const s = game((h) => {
      h.feats = ["vow-of-the-barefoot-pilgrim"];
      h.backpack = ["seven-furlong-boots"];
    });
    expect(errorOf(equip(s, "hero-0", 0))).toBe("vow");
  });

  it("is only for the player whose turn it is", () => {
    const s = game((h) => (h.backpack = ["tin-sabre"]));
    s.currentPlayer = 1;
    expect(errorOf(equip(s, "hero-0", 0))).toBe("not-your-turn");
  });
});

describe("backpack and consumables (RULES_V2 4.1, CONTENT_ARTIFACTS 6.1)", () => {
  it("holds 12 slots; three consumables of a kind share one", () => {
    const s = game((h) => {
      h.backpack = Array.from({ length: 11 }, () => "pot-lid");
      h.backpack.push("blue-tonic", "blue-tonic", "blue-tonic");
    });
    const h = hero(s);
    expect(backpackSlotsUsed(h)).toBe(12);
    expect(canCarry(h, "blue-tonic")).toBe(false);
    expect(giveArtifact(h, "tin-sabre")).toBe(false);
    h.backpack.pop();
    expect(giveArtifact(h, "blue-tonic")).toBe(true);
    // Packrat 2: backpack 16.
    h.skills.push({ id: "packrat", rank: 2 });
    expect(giveArtifact(h, "tin-sabre")).toBe(true);
  });

  it("destroys a carried item", () => {
    const s = game((h) => (h.backpack = ["tin-sabre"]));
    expect(hero(ok(destroyArtifact(s, "hero-0", 0)).state).backpack).toEqual(
      [],
    );
  });

  it("uses consumables at once and refuses a second pending one", () => {
    let s = game((h) => {
      h.backpack = [
        "blue-tonic",
        "road-cordial",
        "bottled-cheer",
        "bottled-cheer",
        "signal-lantern",
      ];
      h.mana = maxMana(h);
    });
    const mp = hero(s).mp;
    s = ok(useConsumable(s, "hero-0", 0)).state;
    expect(hero(s).mana).toBe(maxMana(hero(s)) + 20); // above the maximum
    s = ok(useConsumable(s, "hero-0", 0)).state;
    expect(hero(s).mp).toBe(mp + 400);
    s = ok(useConsumable(s, "hero-0", 0)).state;
    expect(hero(s).nextBattle).toEqual(["bottled-cheer"]);
    expect(errorOf(useConsumable(s, "hero-0", 0))).toBe("already-used");
    expect(hero(s).backpack).toEqual(["bottled-cheer", "signal-lantern"]);
    expect(errorOf(useConsumable(s, "hero-0", 9))).toBe("not-consumable");
    const before = s.players[0]!.explored.filter(Boolean).length;
    s = ok(useConsumable(s, "hero-0", 1)).state;
    expect(s.players[0]!.explored.filter(Boolean).length).toBeGreaterThan(
      before - 1,
    );
  });
});

describe("curses (RULES_V2 4.3)", () => {
  it("sticks once worn until lifted, then is still cursed", () => {
    let s = game((h) => (h.backpack = ["the-albatross", "sprig-pendant"]));
    s = ok(equip(s, "hero-0", 0)).state;
    const neck = WORN_SLOTS.indexOf("neck");
    expect(heroStats(hero(s))).toMatchObject({ attack: 6, defense: 6 });
    expect(errorOf(unequip(s, "hero-0", neck))).toBe("cursed");
    expect(errorOf(equip(s, "hero-0", 0))).toBe("cursed");
    s.players[0]!.resources.gold = 999;
    expect(
      errorOf(liftCurse(s, "hero-0", neck, { gold: 1000, essence: 2 })),
    ).toBe("resources");
    s.players[0]!.resources.gold = 5000;
    const r = ok(liftCurse(s, "hero-0", neck, { gold: 1000, essence: 2 }));
    expect(hero(r.state).worn[neck]).toBeNull();
    expect(hero(r.state).backpack).toContain("the-albatross");
    expect(r.state.players[0]!.resources.gold).toBe(4000);
    // It can be worn again (by choice).
    const idx = hero(r.state).backpack.indexOf("the-albatross");
    expect(ok(equip(r.state, "hero-0", idx)).state).toBeDefined();
  });
});

describe("Marvels in pieces (RULES_V2 4.5)", () => {
  it("assembles from worn and carried pieces; a cursed piece curses it", () => {
    let s = game((h) => {
      h.worn[9] = "the-upper-bulb";
      h.backpack = ["the-lower-bulb", "a-pinch-of-sand"];
    });
    expect(assemblable(hero(s))).toEqual(["the-hourglass-with-no-bottom"]);
    s = ok(assemble(s, "hero-0", "the-hourglass-with-no-bottom")).state;
    expect(hero(s).worn[9]).toBeNull();
    expect(hero(s).backpack).toEqual(["the-hourglass-with-no-bottom"]);
    expect(wornDef("the-hourglass-with-no-bottom")?.cursed).toBe(true);
    expect(errorOf(assemble(s, "hero-0", "the-hourglass-with-no-bottom"))).toBe(
      "no-assembly",
    );
  });
});

describe("meetings (RULES_V2 5.3)", () => {
  function two(): GameState {
    const s = game((h) => {
      h.x = 1;
      h.y = 1;
    });
    const b = structuredClone(s.heroes[0]!);
    b.id = "hero-x";
    b.x = 2;
    s.heroes.push(b);
    return s;
  }

  it("hands artifacts and scrolls to an adjacent own hero", () => {
    const s0 = two();
    const a = s0.heroes[0]!;
    const b = s0.heroes[1]!;
    a.worn[0] = "thinking-cap";
    a.backpack = ["tin-sabre"];
    a.scrolls = ["jolt"];
    a.worn[1] = "the-albatross";
    let s = ok(handOver(s0, a.id, b.id, { place: "worn", index: 0 })).state;
    s = ok(handOver(s, a.id, b.id, { place: "backpack", index: 0 })).state;
    s = ok(handOver(s, a.id, b.id, { place: "scrolls", index: 0 })).state;
    const bb = s.heroes.find((h) => h.id === b.id)!;
    expect(bb.backpack).toEqual(["thinking-cap", "tin-sabre"]);
    expect(bb.scrolls).toEqual(["jolt"]);
    expect(errorOf(handOver(s, a.id, b.id, { place: "worn", index: 1 }))).toBe(
      "cursed",
    );
    const far = cloneState(s);
    far.heroes.find((h) => h.id === b.id)!.x = 5;
    expect(
      errorOf(handOver(far, b.id, a.id, { place: "backpack", index: 0 })),
    ).toBe("not-adjacent");
  });
});
