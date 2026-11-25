// The keyword glossary (bead border_marches-bzc.46): every rules text the
// game shows (spells, creature abilities, artifacts, skills, feats, vows,
// Commands, specialties, birthrights, buildings, map objects, conditions
// and ground) is collected here; every keyword they use must have an
// entry, and every entry must be used, directly or inside the definition
// of a keyword a text uses (its box is then shown one level down).
import { describe, expect, it } from "vitest";
import {
  ability,
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
import { spellCastLines } from "../../src/ui/info-tips.ts";

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
    charge: 0,
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
});
