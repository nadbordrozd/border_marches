/**
 * The keyword glossary (bead border_marches-bzc.46): every grammar term a
 * player meets in rules text (spells, creature abilities, artifacts,
 * skills, feats, conditions, ground, map objects), each with a one-to-two
 * sentence definition, in the manner of Slay the Spire's keywords. The
 * interface highlights these words wherever rules text is shown and lists
 * their definitions beside the tooltip (src/ui/keywords.ts).
 *
 * Matching is by word: each keyword lists the surface forms it answers to
 * as regular-expression sources, matched case-sensitively and only as
 * whole words. Case carries meaning: "Clock" is the school, "clock" a
 * condition's rounds left; "Hold" is the keyword, "holds" plain English.
 *
 * Pure data and string matching: no DOM, no engine imports. A test
 * (tests/ui/keywords.test.ts) checks that every condition and ground kind
 * has an entry and that every entry is used by some rules text.
 */

export type KeywordIconKind = "condition" | "ground" | "stat" | "school";

export interface KeywordDef {
  readonly id: string;
  /** The heading of its box. */
  readonly term: string;
  /** Regular-expression sources of the words it answers to (cased). */
  readonly forms: readonly string[];
  /** One or two sentences, in plain words. */
  readonly text: string;
  /** "Bloom bane · Hold" and similar, shown under the heading. */
  readonly tag?: string;
  /** A content icon, when the art has one. */
  readonly icon?: { readonly kind: KeywordIconKind; readonly id: string };
  /** The colour of the highlight (schools, boons and banes). */
  readonly tone?: "boon" | "bane" | "school";
  /**
   * Highlighted, but its box comes last when room is short (school names
   * and Power, which most spell cards mention in passing).
   */
  readonly minor?: boolean;
}

/** "word" -> "[Ww]ord": a form that may open a sentence. */
function cap(word: string): string {
  const first = word.charAt(0);
  return `[${first.toUpperCase()}${first.toLowerCase()}]${word.slice(1)}`;
}

function condition(
  id: string,
  term: string,
  tag: string,
  text: string,
  polarity: "boon" | "bane",
): KeywordDef {
  return {
    id,
    term,
    forms: [term],
    text,
    tag,
    icon: { kind: "condition", id },
    tone: polarity,
  };
}

function school(id: string, term: string, text: string): KeywordDef {
  return {
    id: `school-${id}`,
    term,
    forms: [term],
    text,
    tag: "School of magic",
    icon: { kind: "school", id },
    tone: "school",
    minor: true,
  };
}

/** The glossary, in the order its boxes are listed when several show. */
export const KEYWORDS: readonly KeywordDef[] = [
  // ------------------------------------------------------------ grammar
  {
    id: "condition",
    term: "Condition",
    forms: [cap("conditions?")],
    text: "A named effect on one stack, such as Venomed or Shielded: a boon or a bane, usually lasting a few rounds. A stack can bear at most six.",
  },
  {
    id: "boon",
    term: "Boon",
    forms: [cap("boons?")],
    text: "A condition that helps the stack bearing it.",
    tone: "boon",
  },
  {
    id: "bane",
    term: "Bane",
    forms: [cap("banes?")],
    text: "A condition that hurts the stack bearing it.",
    tone: "bane",
  },
  {
    id: "clock",
    term: "Clock",
    tag: "Rounds left",
    forms: ["[Cc]locks", "clock", "clockless"],
    text: "How many rounds a condition has left. It counts down at each round's end and the condition expires at 0; a clockless one lasts the whole battle.",
  },
  {
    id: "size",
    term: "Size",
    forms: ["size"],
    text: "The one number of a condition or spell: Defense lost for Venomed, Harm per turn for Burning, HP healed for a heal, and so on.",
  },
  {
    id: "gate",
    term: "Gate",
    forms: [cap("gated?")],
    text: "An HP limit on a condition: a stack with more total HP than the gate refuses it, so big stacks need stronger spells.",
  },
  {
    id: "hold",
    term: "Hold",
    forms: ["Holds?"],
    text: "A condition that stops a stack acting or takes it over (Frozen, Asleep, Turned). It lasts at most 2 rounds, can never be lengthened, and leaves the stack Wary.",
  },
  {
    id: "wary",
    term: "Wary",
    forms: ["Wary"],
    text: "When a Hold ends, the stack refuses every Hold for as many rounds as it was held.",
  },
  {
    id: "link",
    term: "Link",
    forms: [cap("links?"), cap("linked"), "far end", "near end"],
    text: "A condition that ties its bearer (the near end) to another stack (the far end), drawn as a line. It ends when either stack dies.",
  },
  {
    id: "debt",
    term: "Debt",
    forms: [cap("debts?")],
    text: "A condition that deals its size as Harm when its clock runs out. Ended any other way, it deals nothing.",
  },
  {
    id: "harm",
    term: "Harm",
    forms: ["Harm"],
    text: "Plain damage from spells, Burning, fire and debts. It ignores Attack, Defense and defending, and is never retaliated.",
  },
  {
    id: "strike",
    term: "Strike",
    forms: ["Strikes?"],
    text: "An attack by a stack: a melee hit, a shot or a retaliation. Its damage uses Attack and Defense.",
  },
  {
    id: "retaliation",
    term: "Retaliation",
    forms: [cap("retaliat(?:e|es|ed|ing|ion|ions)")],
    text: "Once a round, a stack attacked in melee strikes back at its attacker. A retaliation is never answered.",
  },
  {
    id: "extra-turn",
    term: "Extra turn",
    forms: [cap("extra turns?")],
    text: "Another turn straight after the current one. A stack gets at most one a round.",
  },
  {
    id: "wait",
    term: "Wait",
    forms: ["Wait"],
    text: "Skip for now and act later this round, after the stacks still to act.",
  },
  {
    id: "area",
    term: "Area effect",
    forms: [cap("area effects?")],
    text: "An effect centred on a hex that reaches every stack in range, friend or foe.",
  },
  {
    id: "remains",
    term: "Remains",
    forms: [cap("remains"), "corpses?", "bones", "wrecks?", "sweets"],
    text: "What a dead stack leaves on its hex: a corpse, bones, a wreck or sweets. Some spells and abilities use them up.",
    icon: { kind: "ground", id: "corpse" },
  },
  {
    id: "summon",
    term: "Summon",
    forms: [cap("summon(?:s|ed|ing)?")],
    text: "Make a new stack during the battle. It acts at the end of the round, leaves no remains and is gone when the battle ends.",
  },
  {
    id: "raise",
    term: "Raise",
    forms: [cap("rais(?:e|es|ed|ing)")],
    text: "Summon a stack on remains, using the remains up.",
  },
  {
    id: "revive",
    term: "Revive",
    forms: [cap("reviv(?:e|es|ed|ing)")],
    text: "The heal brings dead creatures of the stack back, never above its starting count. Without it a heal only restores wounded HP.",
  },
  {
    id: "blocking",
    term: "Blocking",
    forms: [cap("blocking"), cap("rocks?")],
    text: "Ground that nothing can enter or pass through, such as rock.",
    icon: { kind: "ground", id: "rock" },
  },
  {
    id: "fire",
    term: "Fire",
    forms: ["fire", "Fire(?=:)"],
    text: "Burning ground: a stack that enters it or starts its turn there takes its size as Harm.",
    icon: { kind: "ground", id: "fire" },
  },
  {
    id: "brambles",
    term: "Brambles",
    forms: ["brambles", "Brambles(?=:)"],
    text: "Thorny ground: a stack that enters it or starts its turn there takes its size as Harm and gains Slowed 1.",
    icon: { kind: "ground", id: "brambles" },
  },
  {
    id: "mist",
    term: "Mist",
    forms: ["mist", "Mist(?=:)"],
    text: "Foggy ground: a stack standing in it cannot shoot, and shots at it do half damage.",
    icon: { kind: "ground", id: "mist" },
  },
  {
    id: "seedling",
    term: "Seedling",
    forms: ["Seedlings?"],
    text: "A summoned plant (6 HP, Attack 3, Defense 3, Speed 4). When it dies it leaves brambles.",
    tag: "Summoned creature",
  },
  {
    id: "shade",
    term: "Shade",
    forms: ["Shades?"],
    text: "A summoned spirit (8 HP, Attack 5, Defense 3, Speed 6). When it dies it leaves mist.",
    tag: "Summoned creature",
  },

  // -------------------------------------------------------------- magic
  {
    id: "power",
    term: "Power",
    forms: ["Power"],
    text: "The hero's spell strength: every growing number of a spell gets bigger with it.",
    icon: { kind: "stat", id: "power" },
    minor: true,
  },
  {
    id: "lore",
    term: "Lore",
    forms: ["Lore"],
    text: "The hero's magic reserve: maximum mana is 10 per point of Lore, and more Lore returns more mana each day.",
    icon: { kind: "stat", id: "lore" },
  },
  {
    id: "page",
    term: "Page",
    forms: ["pages?"],
    text: "A spell the hero knows. Once cast it is spent until the battle ends.",
  },
  {
    id: "scroll",
    term: "Scroll",
    forms: [cap("scrolls?")],
    text: "A spell on paper: any hero can cast it once, with no mana and no skill, and then it is gone.",
  },
  {
    id: "condition-tool",
    term: "Condition tool",
    forms: [cap("condition tools?")],
    text: "One spell per school that works on a condition already in play: Feed grows it, Share copies it, Wind changes its clock, Pass on moves it, Set off explodes it.",
  },
  {
    id: "touch",
    term: "Touch",
    forms: ["touch(?:es|ed)?"],
    text: "A spell touches every stack it targets or catches in its area. Echo and Fuel can only use conditions on touched stacks.",
  },
  {
    id: "allied",
    term: "Allied schools",
    forms: [cap("allied")],
    text: "Neighbours on the wheel Bloom, Accord, Clock, Hush, Storm (and back to Bloom). Echo uses allied conditions.",
  },
  {
    id: "opposed",
    term: "Opposed schools",
    forms: [cap("opposed")],
    text: "Two schools that are not neighbours on the wheel. Fuel burns opposed conditions.",
  },
  {
    id: "echo",
    term: "Echo",
    forms: ["Echo(?:es|ed)?"],
    text: "Free with any hero cast: one condition of an allied school on a touched stack lasts 1 round longer. Not Holds or clockless conditions.",
  },
  {
    id: "fuel",
    term: "Fuel",
    forms: ["Fuel(?:s|led|ling)?"],
    text: "Once a battle: end one condition of an opposed school on a touched stack to double the spell's size. Never a Sworn.",
  },
  school(
    "bloom",
    "Bloom",
    "Healing, summoning and effects that grow. Allied with Storm and Accord; opposed to Clock and Hush.",
  ),
  school(
    "accord",
    "Accord",
    "Links, guarding, swaps and turning enemies. Allied with Bloom and Clock; opposed to Hush and Storm.",
  ),
  school(
    "clock",
    "Clock",
    "Turn order, extra and late turns, and clocks. Allied with Accord and Hush; opposed to Storm and Bloom.",
  ),
  school(
    "hush",
    "Hush",
    "Remains, draining, debts and silencing. Allied with Clock and Storm; opposed to Bloom and Accord.",
  ),
  school(
    "storm",
    "Storm",
    "Area Harm, fire, cold and pushing. Allied with Hush and Bloom; opposed to Accord and Clock.",
  ),

  // --------------------------------------------------------------- hero
  {
    id: "command",
    term: "Command",
    forms: ["Commands?"],
    text: "The hero's class order, once a battle, before a friendly stack acts. It costs no mana and does not use the round's cast.",
  },
  {
    id: "c",
    term: "C",
    forms: ["C"],
    text: "The strength of the hero's Command: 1, plus 1 for every 5 hero levels.",
  },
  {
    id: "morale",
    term: "Morale",
    forms: ["Morale"],
    text: "From -3 to +3. At the start of a battle, Morale +n makes the n strongest stacks Heartened; -n makes them Shaken.",
  },
  {
    id: "luck",
    term: "Luck",
    forms: ["Luck"],
    text: "From -3 to +3. At the start of a battle, Luck +n makes the n strongest stacks Lucky; -n makes them Jinxed.",
  },
  {
    id: "item-act",
    term: "Item act",
    forms: [cap("item acts?")],
    text: "An artifact's own action, once a battle, used by the hero before a friendly stack acts. It does not use the round's cast.",
  },
  {
    id: "native",
    term: "Native",
    forms: [cap("natives?")],
    text: "A stack whose creature belongs to the hero's faction. Natives get the faction's birthright.",
  },
  {
    id: "get-up",
    term: "Get up",
    forms: ["gets? up", "got up", "Not Done Yet"],
    text: "Undead birthright: a dead native stack that left remains returns at the next round start with a third of its starting count, once a battle. It crumbles after the battle.",
  },
  {
    id: "launched",
    term: "Launched",
    forms: ["Launched"],
    text: "Goblin birthright: a native caught in its own side's area effect takes nothing and is pushed 3 hexes away from the centre.",
  },
  {
    id: "drill",
    term: "Drill",
    forms: ["Drill"],
    text: "A town building that teaches one of the town's creatures an extra ability.",
  },
  {
    id: "fight-value",
    term: "Fight value",
    forms: [cap("fight value"), "FV"],
    text: "A number for how strong a stack or army is, from its creatures' stats and count.",
  },
  {
    id: "zone-of-control",
    term: "Zone of control",
    forms: [cap("zone of control")],
    text: "The 8 cells around a neutral stack: a hero who steps into them is attacked.",
  },

  // --------------------------------------------------------- conditions
  condition(
    "venomed",
    "Venomed",
    "Bloom bane",
    "Loses Defense equal to its size (never below 0).",
    "bane",
  ),
  condition(
    "burning",
    "Burning",
    "Storm bane",
    "Takes its size as Harm at the start of each of its turns.",
    "bane",
  ),
  condition(
    "frozen",
    "Frozen",
    "Storm bane · Hold",
    "Cannot act or retaliate. The first Strike against it does double damage and ends Frozen.",
    "bane",
  ),
  condition(
    "asleep",
    "Asleep",
    "Hush bane · Hold",
    "Cannot act or retaliate. Any damage wakes it.",
    "bane",
  ),
  condition(
    "turned",
    "Turned",
    "Accord bane · Hold",
    "Fights for the other side while it lasts.",
    "bane",
  ),
  condition(
    "delayed",
    "Delayed",
    "Clock bane",
    "Acts after every stack that is not Delayed, and cannot Wait.",
    "bane",
  ),
  condition(
    "hastened",
    "Hastened",
    "Clock boon",
    "Acts before every stack that is not Hastened.",
    "boon",
  ),
  condition(
    "heartened",
    "Heartened",
    "Accord boon",
    "After its turn you may end Heartened to give it an extra turn.",
    "boon",
  ),
  condition(
    "shaken",
    "Shaken",
    "Hush bane",
    "Acts last and cannot Wait, like Delayed.",
    "bane",
  ),
  condition(
    "lucky",
    "Lucky",
    "Bloom boon",
    "Its next attack or shot (not a retaliation) does 150% damage; then Lucky ends.",
    "boon",
  ),
  condition(
    "jinxed",
    "Jinxed",
    "Hush bane",
    "Cannot retaliate, and Strikes against it do more damage: + its size in percent.",
    "bane",
  ),
  condition(
    "sworn",
    "Sworn",
    "Accord boon · link",
    "Heals on it also heal the far end, and it may swap hexes with the far end instead of walking. Never burnt as Fuel.",
    "boon",
  ),
  condition(
    "challenged",
    "Challenged",
    "Accord bane · link",
    "Its Strikes against any stack but the far end do half damage.",
    "bane",
  ),
  condition(
    "mending",
    "Mending",
    "Bloom boon",
    "Heals its size in HP at the start of each of its turns, reviving.",
    "boon",
  ),
  condition(
    "thorned",
    "Thorned",
    "Bloom boon",
    "A stack that strikes it in melee takes its size as Harm.",
    "boon",
  ),
  condition(
    "ripening",
    "Ripening",
    "Bloom boon",
    "Its Strikes do more damage: + its size in percent. The size grows by 10 each turn.",
    "boon",
  ),
  condition(
    "scapegoat",
    "Scapegoat",
    "Accord boon · link",
    "Damage to it is taken by the far end instead, as Harm.",
    "boon",
  ),
  condition("shielded", "Shielded", "Accord boon", "+size Defense.", "boon"),
  condition(
    "warded",
    "Warded",
    "Accord boon",
    "Takes less Harm: - its size in percent.",
    "boon",
  ),
  condition(
    "mollified",
    "Mollified",
    "Accord bane",
    "Its Strikes do less damage: - its size in percent.",
    "bane",
  ),
  condition("quickened", "Quickened", "Clock boon", "+size Speed.", "boon"),
  condition(
    "slowed",
    "Slowed",
    "Clock bane",
    "-size Speed (never below 1).",
    "bane",
  ),
  condition(
    "reckoning",
    "Reckoning",
    "Hush bane · debt",
    "A debt: takes its size as Harm when its clock runs out.",
    "bane",
  ),
  condition("hushed", "Hushed", "Hush bane", "Cannot shoot.", "bane"),
  condition(
    "leeched",
    "Leeched",
    "Hush bane · link",
    "Takes its size as Harm at the start of its turn, and the far end heals that much.",
    "bane",
  ),
  condition(
    "drenched",
    "Drenched",
    "Storm bane",
    "Takes more Harm: + its size in percent.",
    "bane",
  ),
  condition("fired-up", "Fired Up", "Storm boon", "+size Attack.", "boon"),
];

const BY_ID: ReadonlyMap<string, KeywordDef> = new Map(
  KEYWORDS.map((k) => [k.id, k]),
);

export function keyword(id: string): KeywordDef {
  const k = BY_ID.get(id);
  if (k === undefined) throw new Error(`unknown keyword ${id}`);
  return k;
}

export function isKeyword(id: string): boolean {
  return BY_ID.has(id);
}

/** One keyword found in a text: [start, end) and its id. */
export interface KeywordMatch {
  readonly start: number;
  readonly end: number;
  readonly id: string;
}

/**
 * Proper names of content (skills, artifacts, feats, spells, buildings,
 * map objects) that contain a keyword's word but name something else:
 * "Teaches Drill Sergeant" is a skill, not the Drill building; a Border
 * Gate is no HP gate. Inside one of these no keyword is found (bead
 * border_marches-bzc.80). A name that is the keyword itself ("Sworn",
 * "Scapegoat") stays highlighted. A test (tests/ui/keywords.test.ts)
 * checks that every content name is either free of keywords, a keyword
 * itself, or listed here, and that every name listed here exists.
 */
export const NAMES: readonly string[] = [
  "Black Gate",
  "Border Gate",
  "Drill Sergeant",
  "Drill Yard",
  "Hush Now",
  "Long Echo",
  "Loose Scroll",
  "Lucky Penny",
  "Lucky Streak",
  "Quest Gate",
];

const EDGE = "A-Za-z0-9_";
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_ID = "";
const MATCHERS: ReadonlyArray<{ id: string; re: RegExp }> = [
  ...KEYWORDS.map((k) => ({ id: k.id, forms: k.forms })),
  // A name answers with its plural too ("Drill Yards").
  { id: NAME_ID, forms: NAMES.map((n) => `${escape(n)}s?`) },
].map(({ id, forms }) => ({
  id,
  re: new RegExp(`(?<![${EDGE}])(?:${forms.join("|")})(?![${EDGE}])`, "g"),
}));

/**
 * Every keyword in `text`, left to right, without overlaps: where two
 * match at one place the longer wins ("condition tool" over "condition"),
 * and a proper name (`NAMES`) hides the keywords inside it.
 */
export function findKeywords(text: string): KeywordMatch[] {
  const all: KeywordMatch[] = [];
  for (const { id, re } of MATCHERS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      all.push({ start: m.index, end: m.index + m[0].length, id });
    }
  }
  all.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: KeywordMatch[] = [];
  let at = 0;
  for (const m of all) {
    if (m.start < at) continue;
    out.push(m);
    at = m.end;
  }
  return out.filter((m) => m.id !== NAME_ID);
}

/** The ids of the keywords in `text`, once each, in order of appearance. */
export function keywordIds(text: string): string[] {
  return [...new Set(findKeywords(text).map((m) => m.id))];
}

/**
 * The keywords to explain for texts mentioning `direct`: those, then the
 * keywords their own definitions use (one level), then minor ones, once
 * each, at most `max` in all.
 */
export function explainKeywords(
  direct: readonly string[],
  max = 6,
): KeywordDef[] {
  const ids = [...new Set(direct)].filter(isKeyword);
  const major = ids.filter((id) => keyword(id).minor !== true);
  const nested: string[] = [];
  for (const id of major)
    for (const n of keywordIds(keyword(id).text))
      if (!ids.includes(n) && !nested.includes(n) && !keyword(n).minor)
        nested.push(n);
  const minor = ids.filter((id) => keyword(id).minor === true);
  return [...major, ...nested, ...minor].slice(0, max).map(keyword);
}
