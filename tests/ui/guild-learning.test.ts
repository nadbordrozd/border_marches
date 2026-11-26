// Magic learning made visible (bead border_marches-bzc.81): each guild
// spell's state for the hero in the town (learnt, needs a school rank, not
// built, nobody here), how a rank is had, the learn dialog's model, the
// one-time explanation for a hero with no school, and the map card lines.
import { describe, expect, it } from "vitest";
import {
  moveHeroAlong,
  type GameState,
  type HeroState,
} from "../../src/core/game/index.ts";
import { cloneState } from "../../src/core/game/state.ts";
import { findPath } from "../../src/core/game/pathfinding.ts";
import { townGuild } from "../../src/core/magic/index.ts";
import type { MapObject } from "../../src/core/map/types.ts";
import {
  guildCardLine,
  guildSpellState,
  guildStateText,
  guildView,
  learnsNothingForNoSchool,
  learntModel,
  noSchoolModel,
  rankForTier,
  rankHowTo,
  siteLearningLine,
} from "../../src/ui/guild-learning.ts";
import { field, gameOn, ok, town } from "../core/game/helpers.ts";

/** A humans town at (2, 1) with `level` guild levels; a hero with no school. */
function withGuild(level: number): GameState {
  const s = cloneState(gameOn(field(5, 3), [town("t", 2, 1, 0)], 0, 1));
  const t = s.towns.t!;
  t.faction = "humans";
  for (let l = 1; l <= level; l++) t.buildings.push(`magic-guild-${l}`);
  const h = s.heroes[0]!;
  h.feats = [];
  h.pages = [];
  h.skills = [];
  return s;
}

const SCHOOL_SKILLS = [
  "greencraft",
  "covenant",
  "horology",
  "quietus",
  "stormcalling",
];

function ranked(s: GameState, rank: number): HeroState {
  const h = s.heroes[0]!;
  h.skills = SCHOOL_SKILLS.map((id) => ({ id, rank }));
  return h;
}

function enter(s: GameState) {
  return ok(moveHeroAlong(s, "hero-0", findPath(s, "hero-0", 2, 1)!.steps));
}

describe("guild spell state", () => {
  it("needs rank 1 for tiers 1-2, rank 2 for 3-4, rank 3 for 5", () => {
    expect([1, 2, 3, 4, 5].map(rankForTier)).toEqual([1, 1, 2, 2, 3]);
  });

  it("learnt, needs a rank, not built, or nobody to learn it", () => {
    const s = withGuild(2);
    const offer = townGuild(s.seed, s.towns.t!);
    const t1 = offer[0]![0]!;
    const t3 = offer[2]![0]!;
    const h = s.heroes[0]!;
    expect(guildSpellState(h, t1, 1, 2).kind).toBe("needs-rank");
    expect(guildSpellState(h, t3, 3, 2)).toEqual({
      kind: "not-built",
      level: 3,
    });
    expect(guildSpellState(undefined, t1, 1, 2)).toEqual({ kind: "no-hero" });
    ranked(s, 1);
    expect(guildSpellState(h, t1, 1, 2)).toEqual({ kind: "learns" });
    h.pages = [t1];
    expect(guildSpellState(h, t1, 1, 2)).toEqual({ kind: "learnt" });
    // A page already in the book is learnt even where the guild is unbuilt.
    h.pages = [t3];
    expect(guildSpellState(h, t3, 3, 0)).toEqual({ kind: "learnt" });
  });

  it("says each state in the guild's words", () => {
    expect(guildStateText({ kind: "learnt" })).toBe("Learnt");
    expect(
      guildStateText({ kind: "needs-rank", school: "storm", rank: 2 }),
    ).toBe("Can't learn yet: needs Storm rank 2");
    expect(guildStateText({ kind: "not-built", level: 3 })).toBe("Not built");
    expect(guildStateText({ kind: "no-hero" })).toMatch(/hero who visits/);
  });
});

describe("guild view", () => {
  it("a hero with no school: every built spell needs a rank, and how to get one", () => {
    const s = withGuild(2);
    const v = guildView(s, s.towns.t!, s.heroes[0])!;
    expect(v.built).toBe(2);
    expect(v.levels.length).toBeGreaterThanOrEqual(3);
    const built = v.levels.filter((l) => l.built).flatMap((l) => l.spells);
    expect(built.every((x) => x.state.kind === "needs-rank")).toBe(true);
    expect(built[0]!.text).toMatch(/^Can't learn yet: needs \w+ rank 1$/);
    expect(
      v.levels
        .filter((l) => !l.built)
        .flatMap((l) => l.spells)
        .every((x) => x.text === "Not built"),
    ).toBe(true);
    expect(v.summary).toMatch(/no school of magic/);
    expect(v.howTo).toMatch(/level-up/);
    expect(v.howTo).toMatch(/Tutor's Hut/);
    expect(v.howTo).toMatch(/Greencraft \(Bloom\)/);
  });

  it("after entering with rank 1 everywhere: tiers 1-2 learnt", () => {
    const s0 = withGuild(3);
    ranked(s0, 1);
    const s1 = enter(s0).state;
    const v = guildView(s1, s1.towns.t!, s1.heroes[0])!;
    const kinds = v.levels.map((l) => l.spells.map((x) => x.state.kind));
    expect(kinds[0]!.every((k) => k === "learnt")).toBe(true);
    expect(kinds[1]!.every((k) => k === "learnt")).toBe(true);
    expect(kinds[2]!.every((k) => k === "needs-rank")).toBe(true);
    expect(v.summary).toMatch(/has learnt \d+ of the \d+ spells/);
    expect(v.howTo).toMatch(/rank 2 tiers 1 to 4/);
  });

  it("with nobody in town it says a visiting hero learns them", () => {
    const s = withGuild(1);
    const v = guildView(s, s.towns.t!, undefined)!;
    expect(v.hero).toBeNull();
    expect(v.summary).toMatch(/hero who visits/);
    expect(v.levels[0]!.spells.every((x) => x.state.kind === "no-hero")).toBe(
      true,
    );
  });

  it("a faction without a guild has none", () => {
    const s = withGuild(0);
    s.towns.t!.faction = "lost-world";
    expect(guildView(s, s.towns.t!, s.heroes[0])).toBeNull();
  });

  it("names a seen Tutor's Hut that teaches a needed school", () => {
    const s = withGuild(1);
    const hut: MapObject = {
      id: "hut",
      kind: "site",
      x: 4,
      y: 0,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "tutors-hut", skill: "stormcalling" },
    };
    s.map.objects.push(hut);
    s.players[0]!.explored[hut.y * s.map.width + hut.x] = true;
    expect(rankHowTo(s, s.heroes[0], ["storm"])).toMatch(
      /seen a Tutor's Hut that teaches Stormcalling/,
    );
  });
});

describe("learning feedback", () => {
  it("the learn dialog lists the new pages and what still needs a rank", () => {
    const s0 = withGuild(3);
    ranked(s0, 1);
    const r = enter(s0);
    const e = r.events.find((x) => x.type === "spells-learnt");
    expect(e?.type).toBe("spells-learnt");
    if (e?.type !== "spells-learnt") return;
    const m = learntModel(r.state, e.heroId, e.townId, e.spells)!;
    expect(m.spells.map((x) => x.id)).toEqual(e.spells);
    expect(m.title).toBe(`${m.heroName} learns ${e.spells.length} spells`);
    expect(m.sentence).toMatch(/Mage Guild of/);
    expect(m.consequence).toMatch(/need \w+ rank 2/);
  });

  it("a hero with no school entering a guild town gets the explanation", () => {
    const s0 = withGuild(1);
    const r = enter(s0);
    expect(r.events.some((x) => x.type === "spells-learnt")).toBe(false);
    expect(learnsNothingForNoSchool(r.state, "hero-0", "t")).toBe(true);
    const m = noSchoolModel(r.state, "hero-0", "t")!;
    expect(m.sentence).toMatch(/no school of magic/);
    expect(m.howTo).toMatch(/school skill/);
    expect(m.scrolls).toMatch(/scroll/);
    // A school, or no guild built: no explanation.
    ranked(r.state, 1);
    expect(learnsNothingForNoSchool(r.state, "hero-0", "t")).toBe(false);
    const bare = withGuild(0);
    expect(learnsNothingForNoSchool(bare, "hero-0", "t")).toBe(false);
  });
});

describe("map card lines", () => {
  it("an own guild town tells the selected hero what it would learn", () => {
    const s = withGuild(2);
    const h = s.heroes[0]!;
    expect(guildCardLine(s, s.towns.t!, h)).toMatchObject({
      tone: "bad",
      text: expect.stringMatching(/no school of magic and learns nothing/),
    });
    ranked(s, 1);
    expect(guildCardLine(s, s.towns.t!, h)?.text).toMatch(
      /learns \d+ new spells? here/,
    );
    expect(guildCardLine(withGuild(0), withGuild(0).towns.t!, h)).toBeNull();
  });

  it("a school shrine says page or only a scroll; a tutor names the school", () => {
    const s = withGuild(0);
    const h = s.heroes[0]!;
    const shrine: MapObject = {
      id: "sh",
      kind: "site",
      x: 4,
      y: 1,
      footprint: { w: 1, h: 1 },
      blocked: [],
      data: { type: "school-shrine", spell: "jolt", tier: 1 },
    };
    expect(siteLearningLine(shrine, h)?.text).toMatch(
      /no Storm rank 1: only a scroll/,
    );
    ranked(s, 1);
    expect(siteLearningLine(shrine, h)?.tone).toBe("good");
    h.skills = [];
    const hut: MapObject = {
      ...shrine,
      data: { type: "tutors-hut", skill: "stormcalling" },
    };
    expect(siteLearningLine(hut, h)?.text).toMatch(/gives Storm rank 1/);
  });
});
