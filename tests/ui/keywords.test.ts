// The keyword glossary (bead border_marches-bzc.46): every rules text the
// game shows (spells, creature abilities, artifacts, skills, feats, vows,
// Commands, specialties, birthrights, buildings, map objects, conditions
// and ground) is collected here; every keyword they use must have an
// entry, and every entry must be used, directly or inside the definition
// of a keyword a text uses (its box is then shown one level down).
import { describe, expect, it } from "vitest";
import {
  ability,
  act,
  conditionKind,
  conditionKindIds,
  groundKind,
  groundKindIds,
  hasAbility,
} from "../../src/core/battle/index.ts";
import type {
  BattleState,
  Condition,
  GroundFeature,
} from "../../src/core/battle/index.ts";
import {
  ITEM_ACT_IDS,
  stackModifierText,
  strikeModifierText,
} from "../../src/core/battle/hero-effects.ts";
import { specialtyText } from "../../src/core/game/index.ts";
import {
  ADVENTURE_SPELLS,
  BATTLE_SPELLS,
  SUMMONED_CREATURES,
  registerSpells,
} from "../../src/core/magic/index.ts";
import { ARTIFACT_LIST } from "../../src/data/artifacts.ts";
import { COMMANDS, NAMED_HEROES } from "../../src/data/classes.ts";
import { CREATURES, creatureAbilities } from "../../src/data/creatures.ts";
import { FACTIONS } from "../../src/data/factions.ts";
import { FEAT_LIST } from "../../src/data/feats.ts";
import {
  KEYWORDS,
  NAMES,
  explainKeywords,
  findKeywords,
  keyword,
  keywordIds,
} from "../../src/data/keywords.ts";
import { OBJECT_TYPES } from "../../src/data/objectTypes.ts";
import { SKILLS } from "../../src/data/skills.ts";
import {
  conditionTooltip,
  groundTooltip,
} from "../../src/ui/battle/grammar.ts";
import { SCHOOL_COLOUR, spellCastLines } from "../../src/ui/info-tips.ts";
import { SCHOOL_COLOURS } from "../../src/ui/battle/magic.ts";
import { ICON_FRAMES } from "../../src/assets/icons.ts";

registerSpells();

function sampleCondition(id: string): Condition {
  const def = conditionKind(id);
  return {
    uid: 0,
    kind: id,
    school: def.school,
    polarity: def.polarity,
    size: 3,
    maxSize: 9,
    clock: 2,
    gate: null,
    hold: def.hold === true,
    link: null,
    source: "test",
    roundsBorne: 0,
  };
}

function sampleGround(id: string): GroundFeature {
  const def = groundKind(id);
  return {
    hex: { col: 0, row: 0 },
    kind: id,
    class: def.class,
    school: def.school,
    size: 3,
    clock: 2,
    remains: null,
    source: "test",
  };
}

/** Every rules text the game shows, with where it comes from. */
function rulesTexts(): Array<{ from: string; text: string }> {
  const out: Array<{ from: string; text: string }> = [];
  const add = (from: string, text: string | undefined): void => {
    if (text !== undefined && text !== "") out.push({ from, text });
  };
  const noStacks = { stacks: [] } as unknown as BattleState;
  for (const s of BATTLE_SPELLS) {
    add(`spell ${s.id}`, s.text(1));
    for (const line of spellCastLines(s)) add(`spell ${s.id} cast`, line);
  }
  for (const s of ADVENTURE_SPELLS) add(`adventure ${s.id}`, s.text(1));
  for (const id of conditionKindIds())
    add(`condition ${id}`, conditionTooltip(noStacks, sampleCondition(id)));
  for (const id of groundKindIds())
    add(`ground ${id}`, groundTooltip(sampleGround(id)));
  const abilities = new Set<string>();
  for (const c of Object.values(CREATURES))
    for (const a of creatureAbilities(c)) abilities.add(a);
  for (const c of Object.values(SUMMONED_CREATURES))
    for (const a of c.abilities) abilities.add(a);
  // Drills (town buildings) and birthrights grant abilities too.
  for (const f of FACTIONS) {
    if (f.birthright?.ability !== undefined)
      abilities.add(f.birthright.ability);
    for (const b of Object.values(f.town?.buildings ?? {}))
      if (b.drill !== undefined) abilities.add(b.drill.ability);
  }
  for (const a of abilities)
    if (hasAbility(a)) add(`ability ${a}`, ability(a).description);
  for (const a of ARTIFACT_LIST) add(`artifact ${a.id}`, a.text);
  for (const s of Object.values(SKILLS))
    s?.ranks.forEach((r, i) => add(`skill ${s.id} ${i + 1}`, r.text));
  for (const f of FEAT_LIST) {
    add(`feat ${f.id}`, f.text);
    add(`vow ${f.id}`, f.restrictionText);
  }
  for (const [id, c] of Object.entries(COMMANDS)) add(`command ${id}`, c.text);
  for (const h of NAMED_HEROES)
    add(`specialty ${h.id}`, specialtyText(h.specialty));
  for (const f of FACTIONS) {
    add(`birthright ${f.id}`, f.birthright?.text);
    for (const [id, b] of Object.entries(f.town?.buildings ?? {}))
      add(`building ${f.id} ${id}`, b.effect);
  }
  for (const [id, o] of Object.entries(OBJECT_TYPES))
    add(`object ${id}`, o.text);
  return out;
}

/** Every content name the game shows (titles, "Teaches X", lists). */
function contentNames(): Array<{ from: string; name: string }> {
  const out: Array<{ from: string; name: string }> = [];
  const add = (from: string, name: string | undefined): void => {
    if (name !== undefined && name !== "") out.push({ from, name });
  };
  for (const s of [...BATTLE_SPELLS, ...ADVENTURE_SPELLS])
    add(`spell ${s.id}`, s.name);
  for (const a of ARTIFACT_LIST) add(`artifact ${a.id}`, a.name);
  for (const s of Object.values(SKILLS)) add(`skill ${s?.id}`, s?.name);
  for (const f of FEAT_LIST) add(`feat ${f.id}`, f.name);
  for (const [id, c] of Object.entries(COMMANDS)) add(`command ${id}`, c.name);
  for (const h of NAMED_HEROES) add(`hero ${h.id}`, h.name);
  const abilities = new Set<string>();
  for (const c of Object.values(CREATURES)) {
    add(`creature ${c.id}`, c.name);
    add(`creature ${c.id}`, c.plural);
    for (const a of creatureAbilities(c)) abilities.add(a);
  }
  for (const c of Object.values(SUMMONED_CREATURES))
    for (const a of c.abilities) abilities.add(a);
  for (const id of ITEM_ACT_IDS) add(`item act ${id}`, act(id).name);
  for (const f of FACTIONS) {
    add(`faction ${f.id}`, f.name);
    add(`birthright ${f.id}`, f.birthright?.name);
    if (f.birthright?.ability !== undefined)
      abilities.add(f.birthright.ability);
    for (const [id, b] of Object.entries(f.town?.buildings ?? {})) {
      add(`building ${f.id} ${id}`, b.name);
      if (b.drill !== undefined) abilities.add(b.drill.ability);
    }
  }
  for (const a of abilities)
    if (hasAbility(a)) add(`ability ${a}`, ability(a).name);
  for (const [id, o] of Object.entries(OBJECT_TYPES))
    add(`object ${id}`, o.name);
  return out;
}

describe("keyword registry", () => {
  it("has unique ids and one-to-two sentence definitions", () => {
    const ids = KEYWORDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of KEYWORDS) {
      const sentences = k.text.split(/[.!?](?:\s|$)/).filter((s) => s !== "");
      expect(sentences.length, k.id).toBeLessThanOrEqual(2);
      expect(k.forms.length, k.id).toBeGreaterThan(0);
    }
  });

  it("gives every condition and ground kind an entry", () => {
    for (const id of conditionKindIds()) {
      const name = conditionKind(id).name;
      expect(keywordIds(name), `condition ${name}`).toHaveLength(1);
    }
    for (const id of groundKindIds()) {
      const name = groundKind(id).name.toLowerCase();
      expect(keywordIds(name), `ground ${name}`).toHaveLength(1);
    }
  });

  it("finds the jargon of the rules texts", () => {
    const text =
      "Condition tool. Pick a bane and a stack next to its bearer: the bane moves. Harm, a Hold with a gate, the far end of a link, its clock and Fuel.";
    expect(keywordIds(text)).toEqual([
      "condition-tool",
      "bane",
      "harm",
      "hold",
      "gate",
      "link",
      "clock",
      "fuel",
    ]);
  });

  it("matches whole words and keeps case meaningful", () => {
    // "Clock" the school, "clock" the rounds left; "holds" is plain English.
    expect(keywordIds("a Clock spell's clock")).toEqual([
      "school-clock",
      "clock",
    ]);
    expect(keywordIds("Your player holds the key")).toEqual([]);
    // "Fired Up" is a condition, not fire; "Hushed" is not the school.
    expect(keywordIds("Fired Up and Hushed")).toEqual(["fired-up", "hushed"]);
    // The longer keyword wins where two start at one place.
    const m = findKeywords("a condition tool");
    expect(m).toEqual([{ start: 2, end: 16, id: "condition-tool" }]);
  });

  it("passes over content names that only contain a keyword's word", () => {
    // Bead bzc.80: a skill, a map object or an artifact named with a
    // keyword's word is not that keyword.
    expect(keywordIds("Teaches Drill Sergeant at rank 1.")).toEqual([]);
    expect(keywordIds("Drill Yards sell a Drill.")).toEqual(["drill"]);
    expect(keywordIds("Lucky Penny: the stack starts Lucky.")).toEqual([
      "lucky",
    ]);
    expect(keywordIds("Hush Now, a Hush spell")).toEqual(["school-hush"]);
    expect(keywordIds("the Border Gate's gate")).toEqual(["gate"]);
    // A name that is the keyword itself stays one.
    expect(keywordIds("Sworn")).toEqual(["sworn"]);
  });

  it("explains nested keywords one level down, at most the cap", () => {
    const ids = explainKeywords(["hold"]).map((k) => k.id);
    expect(ids[0]).toBe("hold");
    // Hold's definition names Frozen, Asleep, Turned and Wary.
    expect(ids).toContain("wary");
    expect(ids).toContain("frozen");
    // Wary's own definition is not expanded again (one level only).
    expect(explainKeywords(["hold"], 3)).toHaveLength(3);
  });
});

describe("rules texts and the glossary", () => {
  const texts = rulesTexts();

  it("collects the texts of every content family", () => {
    const families = new Set(texts.map((t) => t.from.split(" ")[0]));
    for (const f of [
      "spell",
      "adventure",
      "condition",
      "ground",
      "ability",
      "artifact",
      "skill",
      "feat",
      "vow",
      "command",
      "specialty",
      "birthright",
      "building",
      "object",
    ])
      expect(families, f).toContain(f);
  });

  it("every highlighted term has a registry entry", () => {
    for (const t of texts)
      for (const m of findKeywords(t.text))
        expect(() => keyword(m.id), `${t.from}: ${t.text}`).not.toThrow();
  });

  it("every registry term is used by a rules text or a used term's box", () => {
    const direct = new Set(texts.flatMap((t) => keywordIds(t.text)));
    const shown = new Set(direct);
    for (const id of direct)
      for (const n of keywordIds(keyword(id).text)) shown.add(n);
    const unused = KEYWORDS.map((k) => k.id).filter((id) => !shown.has(id));
    expect(unused).toEqual([]);
  });

  it("no content name is taken for a keyword it only contains", () => {
    // Bead bzc.80: every name is free of keywords, the keyword itself
    // ("Sworn", "Not Done Yet"), or listed in NAMES.
    const names = contentNames();
    expect(names.length).toBeGreaterThan(300);
    for (const { from, name } of names) {
      const found = findKeywords(name);
      if (found.length === 0) continue;
      expect(found, `${from}: ${name}`).toEqual([
        { start: 0, end: name.length, id: found[0]?.id },
      ]);
    }
  });

  it("every listed name is a content name", () => {
    const known = new Set(contentNames().map((n) => n.name));
    expect(NAMES.filter((n) => !known.has(n))).toEqual([]);
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it("spell texts use no undefined jargon", () => {
    // Old grammar shorthand the plain-language pass replaced.
    for (const s of BATTLE_SPELLS) {
      const text = s.text(1);
      expect(text, s.id).not.toMatch(/\bclock \d|\bAdd \w+,|\bbears\b/);
      expect(text.length, s.id).toBeLessThanOrEqual(170);
    }
  });

  it("hero, item, town and map texts use no shorthand", () => {
    // Bead bzc.70: artifacts, skills, feats, vows, Commands, specialties,
    // birthrights, buildings and map objects in the same plain style
    // ("for 2 rounds", "deal 10% more damage", "next to"), each rank of a
    // skill readable on its own (no "Also:").
    const plain = new Set([
      "artifact",
      "skill",
      "feat",
      "vow",
      "command",
      "specialty",
      "birthright",
      "building",
      "object",
    ]);
    const shorthand =
      /\bclock \d|\bclock min\b|\bclockless\b|\bAlso:|\bBattle start:|\bx \d+%|\bbears\b|\bbearing\b|\bflags it\b|\bnext cell\b|\bFV\b|\bXP\b|\bstraight step\b|\bnaming the\b|\bsize \d/;
    const checked = texts.filter((t) => plain.has(t.from.split(" ")[0] ?? ""));
    expect(checked.length).toBeGreaterThan(300);
    for (const t of checked) {
      expect(t.text, t.from).not.toMatch(shorthand);
      expect(t.text.length, t.from).toBeLessThanOrEqual(200);
    }
  });

  it("creature ability texts use no shorthand", () => {
    // Bead bzc.74: faction, stray and summon abilities in the same style
    // ("becomes Shaken for 2 rounds. Gate 12 HP per Banshee.", "deal 50%
    // more damage", "instead of attacking"). "Adjacent" stays only where
    // Long Shadow stretches the reach; elsewhere it is "next to". Ground
    // sizes read like the spells' ("brambles of size 4").
    const shorthand =
      /\bclock \d|\bclock min\b|\bclockless\b|\bx \d+%|\bbears\b|\bbearing\b|\bnaming the\b|\bgate \d|\bmax \+|\bin place of\b|\bx count\b|\b\d+ x (?:their|its|the)\b|\bconsumed\b|\bApplies to\b/;
    const checked = texts.filter((t) => t.from.startsWith("ability "));
    expect(checked.length).toBeGreaterThan(50);
    for (const t of checked) {
      expect(t.text, t.from).not.toMatch(shorthand);
      expect(t.text.length, t.from).toBeLessThanOrEqual(220);
    }
  });

  it("condition, ground, hero-effect and item-act texts use no shorthand", () => {
    // Bead bzc.76: "deal 50% more damage", "takes 25% less Harm", "deals
    // double damage" instead of "x 150%"; item acts as their artifacts say
    // them; hero Strike and stat bonuses name creatures, not ids.
    const shorthand =
      /\bx \d+%|\bclock \d|\bclock min\b|\bbears\b|\bbearing\b|\bin place of\b|\b\d+ x\b|\bexactly as the\b|\badjacent\b|\bmax \d/;
    const checked = texts.filter((t) =>
      ["condition", "ground"].includes(t.from.split(" ")[0] ?? ""),
    );
    for (const id of ITEM_ACT_IDS)
      checked.push({ from: `item act ${id}`, text: act(id).text });
    for (const strike of ["all", "melee", "shot"] as const)
      for (const direction of ["dealt", "taken"] as const)
        for (const percent of [25, -20])
          checked.push({
            from: `hero strike ${strike} ${direction} ${percent}`,
            text: strikeModifierText({
              label: "Test",
              strike,
              direction,
              percent,
              targetBears: ["delayed", "slowed", "shaken"],
            }),
          });
    checked.push({
      from: "hero stack squire",
      text: stackModifierText({
        label: "Test",
        creature: "squire",
        attack: 2,
        defense: 0,
        speed: 0,
      }),
    });
    expect(checked.length).toBeGreaterThan(40);
    for (const t of checked) {
      expect(t.text, t.from).not.toMatch(shorthand);
      expect(t.text, t.from).not.toMatch(/\bsquire\b|\bdelayed\b/);
      // Condition tooltips carry their "(Accord boon, size 3, ...)" header.
      expect(t.text.length, t.from).toBeLessThanOrEqual(220);
    }
    expect(
      strikeModifierText({
        label: "Pile On",
        strike: "all",
        direction: "dealt",
        percent: 25,
        targetBears: ["delayed", "slowed", "shaken"],
      }),
    ).toBe(
      "Strikes by this side's stacks deal 25% more damage to Delayed, Slowed or Shaken stacks (hero).",
    );
  });
});

describe("school colours", () => {
  it("info cards use the spellbook's colours, which follow the icon frames", () => {
    expect(SCHOOL_COLOUR).toBe(SCHOOL_COLOURS);
    for (const s of ["bloom", "accord", "clock", "hush", "storm"] as const)
      expect(SCHOOL_COLOUR[s], s).toBe(ICON_FRAMES[s].colour);
  });
});
