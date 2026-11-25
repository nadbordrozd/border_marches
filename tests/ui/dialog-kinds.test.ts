// The adventure map's dialogs in the one shell (UI2-15, bead
// border_marches-bzc.65): the pre-battle model (one title, both armies as
// they deploy, the split note, the estimate), the site model (the map
// picture enlarged, one sentence without the name, options with costs and
// reasons) and the end-turn rows (portraits and crests that select the
// hero or open the town).
import { describe, expect, it } from "vitest";
import { assetByKey } from "../../src/assets/manifest.ts";
import { battleSetup } from "../../src/core/game/index.ts";
import type { GameState } from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import { getCreature } from "../../src/data/creatures.ts";
import { OBJECT_TYPES } from "../../src/data/objectTypes.ts";
import {
  DIALOG_PICTURE_BOX,
  dialogPicture,
  endTurnChoice,
  endTurnRows,
  listWords,
  preBattleModel,
  siteDialogModel,
} from "../../src/ui/dialog-kinds.ts";
import { endTurnWarnings } from "../../src/ui/hints.ts";
import { objectPictureKey } from "../../src/ui/map-card.ts";
import {
  field,
  gameOn,
  heroStart,
  monster,
  town,
} from "../core/game/helpers.ts";

function site(
  id: string,
  type: keyof typeof OBJECT_TYPES,
  x: number,
  y: number,
  data: Record<string, unknown> = {},
): MapObject {
  return {
    id,
    kind: OBJECT_TYPES[type].kind,
    x,
    y,
    footprint: { w: 1, h: 1 },
    blocked: [],
    data: { type, ...data },
  };
}

function fighting(s: GameState, objectId: string): GameState {
  const hero = s.heroes.find((h) => h.owner === 0)!;
  return {
    ...s,
    pendingBattle: { kind: "monster", objectId, heroId: hero.id },
  };
}

describe("pre-battle dialog", () => {
  it("titles a neutral fight with the count and explains the split", () => {
    const s = fighting(
      gameOn(field(8, 3), [monster("m", 3, 1, "goblin", 10)], 1, 1),
      "m",
    );
    const m = preBattleModel(s, battleSetup(s)!, 0);
    expect(m.title).toBe("10 Goblins attack!");
    expect(m.side).toBe("attacker");
    expect(m.enemy.label).toBe("Neutral");
    expect(m.enemy.stacks.map((x) => x.count)).toEqual([4, 3, 3]);
    expect(m.split).toBe("The 10 Goblins fight as 3 stacks: 4, 3 and 3.");
    // The player's band is the hero's army as it deploys, led by the hero.
    const hero = s.heroes.find((h) => h.owner === 0)!;
    expect(m.own.label).toBe(hero.name);
    expect(m.own.portrait).toBeTruthy();
    expect(m.own.stacks).toEqual(
      hero.army.filter((x) => x !== null).map((x) => ({ ...x })),
    );
    expect(m.odds).not.toBeNull();
    expect(m.oddsWord).toBeTruthy();
    expect(m.share).toBeGreaterThan(0);
    expect(m.share).toBeLessThan(100);
  });

  it("has no split note for a single creature, and says 'attacks'", () => {
    const s = fighting(
      gameOn(field(8, 3), [monster("m", 3, 1, "troll", 1)], 1, 1),
      "m",
    );
    const m = preBattleModel(s, battleSetup(s)!, 0);
    expect(m.title).toBe(`1 ${getCreature("troll").name} attacks!`);
    expect(m.split).toBeNull();
  });

  it("names the stakes: retreat to the tavern, or the hero lost", () => {
    const s = fighting(
      gameOn(
        field(8, 3),
        [monster("m", 3, 1, "goblin", 10), town("t", 6, 1, 0)],
        1,
        1,
      ),
      "m",
    );
    const own = preBattleModel(s, battleSetup(s)!, 0);
    expect(own.canRetreat).toBe(true);
    expect(own.consequence).toMatch(/tavern/);
    const bare = fighting(
      gameOn(field(8, 3), [monster("m", 3, 1, "goblin", 10)], 1, 1),
      "m",
    );
    const none = preBattleModel(bare, battleSetup(bare)!, 0);
    expect(none.canRetreat).toBe(false);
    expect(none.consequence).toMatch(/leaves the map/);
  });

  it("joins a list the plain way", () => {
    expect(listWords(["4"])).toBe("4");
    expect(listWords(["4", "3"])).toBe("4 and 3");
    expect(listWords(["4", "3", "3"])).toBe("4, 3 and 3");
  });
});

describe("site dialog", () => {
  it("enlarges the map picture to fit the box", () => {
    const obj = site("a", "arena", 4, 1);
    const key = objectPictureKey(obj)!;
    const p = dialogPicture(key);
    const a = assetByKey(key);
    expect(a.w * p.scale).toBeLessThanOrEqual(DIALOG_PICTURE_BOX.w);
    expect(a.h * p.scale).toBeLessThanOrEqual(DIALOG_PICTURE_BOX.h);
    // As big as fits: one more step up would overflow (or it is at 3x).
    if (p.scale < 3 && p.scale >= 1)
      expect(
        a.w * (p.scale + 1) > DIALOG_PICTURE_BOX.w ||
          a.h * (p.scale + 1) > DIALOG_PICTURE_BOX.h,
      ).toBe(true);
  });

  it("drops the name from the sentence and lists the options", () => {
    const s = gameOn(field(8, 3), [site("a", "arena", 4, 1)], 1, 1);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const obj = s.map.objects.find((o) => o.id === "a")!;
    const m = siteDialogModel(
      s,
      hero,
      obj,
      "Arena: the hero gains +2 Attack or +2 Defense, your choice.",
      true,
    );
    expect(m.title).toBe("Arena");
    expect(m.sentence).toBe(
      "The hero gains +2 Attack or +2 Defense, your choice.",
    );
    expect(m.picture?.key).toBe(objectPictureKey(obj));
    expect(m.choices.map((c) => c.label)).toEqual(["+2 Attack", "+2 Defense"]);
    expect(m.choices.every((c) => !c.disabled && c.why === null)).toBe(true);
    expect(
      siteDialogModel(s, hero, obj, "Arena: anything", false).sentence,
    ).toBe("Anything else?");
  });

  it("keeps an unaffordable option with its reason", () => {
    const s = cloneState(
      gameOn(field(8, 3), [site("ac", "academy", 4, 1)], 1, 1),
    );
    s.players[0]!.resources.gold = 100;
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const obj = s.map.objects.find((o) => o.id === "ac")!;
    const m = siteDialogModel(s, hero, obj, "Academy: pay.", true);
    expect(m.choices.length).toBe(2);
    expect(m.choices[0]!.label).toMatch(/for 2000 gold$/);
    expect(m.choices[0]!.disabled).toBe(true);
    expect(m.choices[0]!.why).toBe("not enough gold");
  });

  it("shows a hire with the creature's portrait and its total cost", () => {
    const s = cloneState(
      gameOn(
        field(8, 3),
        [site("d", "faction-outpost", 4, 1, { creature: "goblin" })],
        1,
        1,
      ),
    );
    s.sites["d"] = { owner: 0 };
    s.players[0]!.resources.gold = 100000;
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const obj = s.map.objects.find((o) => o.id === "d")!;
    const m = siteDialogModel(s, hero, obj, "Faction Outpost: 5.", true);
    const hire = m.choices.find((c) => c.value.startsWith("hire:"))!;
    const n = Number(hire.value.slice(5));
    expect(n).toBeGreaterThan(0);
    expect(hire.portrait).toBeTruthy();
    expect(hire.cost?.gold).toBe((getCreature("goblin").cost.gold ?? 0) * n);
  });
});

describe("end-turn warning", () => {
  it("gives each hero its portrait and each town its crest", () => {
    const s = gameOn(field(8, 3), [town("t", 6, 1, 0)], 1, 1);
    const hero = s.heroes.find((h) => h.owner === 0)!;
    const rows = endTurnRows(s, [
      { kind: "unmoved", id: hero.id, text: `${hero.name} has not moved` },
      { kind: "can-build", id: "t", text: "Town can build today" },
    ]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        value: `hero:${hero.id}`,
        kind: "hero",
        action: "Select the hero",
        crest: null,
      }),
    );
    expect(rows[0]!.portrait).toBeTruthy();
    expect(rows[1]).toEqual(
      expect.objectContaining({
        value: "town:t",
        kind: "town",
        action: "Open the town",
        portrait: null,
      }),
    );
    expect(rows[1]!.crest).toMatch(/^#/);
  });

  it("rows come from the warnings the game computes", () => {
    const s = gameOn(field(8, 3), [], 1, 1);
    const rows = endTurnRows(s, endTurnWarnings(s, 0));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === "hero")).toBe(true);
  });

  it("reads the answer back", () => {
    expect(endTurnChoice("end")).toEqual({ kind: "end" });
    expect(endTurnChoice("stay")).toEqual({ kind: "stay" });
    expect(endTurnChoice("hero:hero-0")).toEqual({
      kind: "hero",
      id: "hero-0",
    });
    expect(endTurnChoice("town:t:2")).toEqual({ kind: "town", id: "t:2" });
    expect(endTurnChoice("nonsense")).toEqual({ kind: "stay" });
  });
});

describe("hero battle", () => {
  it("names both heroes and their players", () => {
    const s = cloneState(gameOn(field(8, 3), [heroStart(4, 1, 1)], 1, 1));
    const mine = s.heroes.find((h) => h.owner === 0)!;
    const foe = s.heroes.find((h) => h.owner === 1)!;
    s.pendingBattle = { kind: "hero", objectId: foe.id, heroId: mine.id };
    const m = preBattleModel(s, battleSetup(s)!, 0);
    expect(m.title).toMatch(
      new RegExp(`^${mine.name} attacks ${foe.name} of `),
    );
    expect(m.enemy.label).toBe(foe.name);
    expect(m.split).toBeNull();
    // From the defender's side the same fight reads the other way.
    const d = preBattleModel(s, battleSetup(s)!, 1);
    expect(d.side).toBe("defender");
    expect(d.title).toMatch(
      new RegExp(`^${mine.name} of .* attacks ${foe.name}`),
    );
    expect(d.own.label).toBe(foe.name);
  });
});
