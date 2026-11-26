/**
 * The adventure map's own dialogs in the one dialog shell (UI2-15, bead
 * bzc.65): the pre-battle dialog, a site's choice and the end-turn warning.
 * Each has a plain model (unit-tested in tests/ui/dialog-kinds.test.ts) and
 * a function that shows it with `dialog` and resolves with the choice;
 * src/ui/game.ts only calls these and acts on the answer.
 *
 * - Pre-battle: one title ("10 Bog Leeches attack!"), both armies as the
 *   hero sheet's army band (full battle sprites with counts, the creature
 *   card on hover), a note when a neutral stack splits into several, the
 *   estimate as a coloured word over a strength bar.
 * - Retreat (bead bzc.92): Retreat asks first, listing what is lost and
 *   what is kept (tests/ui/retreat-dialog.test.ts); Cancel is the default.
 * - Site: the site's map picture enlarged, one sentence, the options as
 *   rows with resource icons (costs and rewards) and number keys, Leave on
 *   Escape.
 * - End turn: each warning a row with the hero's portrait or the town's
 *   crest; a click selects that hero or opens that town.
 */
import { assetByKey } from "../assets/manifest.ts";
import { namedHeroPortrait } from "../assets/unit-art.ts";
import {
  battlePlayers,
  describeSite,
  dwellingOffer,
  objectName,
  siteOptions,
} from "../core/game/index.ts";
import type {
  BattleSetup,
  BattleSide,
  GameState,
  HeroState,
} from "../core/game/index.ts";
import type { ArmySlots, Stack } from "../core/game/types.ts";
import type { MapObject } from "../core/map/types.ts";
import {
  HIRE_COST,
  RETREAT_OFFER_REFRESHES,
  playerColour,
} from "../data/players.ts";
import type { ResourceAmounts } from "../data/types.ts";
import { creatureAsset } from "../render/map/scene.ts";
import { totalsByCreature } from "./battle/losses.ts";
import { dialog } from "./dialog.ts";
import type { DialogButton, DialogChoice, DialogOptions } from "./dialog.ts";
import { costView, el, img } from "./dom.ts";
import { creatureCount } from "./format.ts";
import { armyBand } from "./hero-screen.ts";
import { ODDS_TEXT, battleOdds } from "./hints.ts";
import type { Odds, TurnWarning } from "./hints.ts";
import { objectPictureKey, textWithIcons } from "./map-card.ts";
import { townRow } from "./side-panel.ts";
import { inspectCard, inspectIcon, inspectTiles } from "./inspect.ts";
import { rulesText } from "./keywords.ts";
import { setTip } from "./tooltip.ts";
import type { LearntModel, NoSchoolModel } from "./guild-learning.ts";
import {
  optionItem,
  siteNames,
  textIcons,
  withoutName,
} from "./visit-results.ts";
import type { VisitIcon, VisitResult } from "./visit-results.ts";

// ------------------------------------------------------------ pictures

/** A dialog picture: an asset drawn at a whole scale (or a fraction). */
export interface DialogPicture {
  readonly key: string;
  readonly scale: number;
}

/** The box a dialog's picture fills at most. */
export const DIALOG_PICTURE_BOX = { w: 224, h: 168 } as const;

/**
 * The largest whole scale (up to 3) at which the asset fits the dialog's
 * picture box; a too-big asset is halved (or thirded) instead.
 */
export function dialogPicture(key: string): DialogPicture {
  const a = assetByKey(key);
  const fits = (s: number): boolean =>
    a.w * s <= DIALOG_PICTURE_BOX.w && a.h * s <= DIALOG_PICTURE_BOX.h;
  const scale = [3, 2, 1, 1 / 2, 1 / 3].find(fits) ?? 1 / 4;
  return { key, scale };
}

function pictureView(p: DialogPicture): HTMLElement {
  const a = assetByKey(p.key);
  const image = img(p.key, "gm-dialog-pic");
  image.width = Math.round(a.w * p.scale);
  image.height = Math.round(a.h * p.scale);
  return image;
}

// ------------------------------------------------------------ pre-battle

export interface PreBattleArmy {
  /** Whose army: the hero's name, "Neutral", "Garrison" ... */
  readonly label: string;
  /** The hero's portrait key, if a hero leads it. */
  readonly portrait: string | null;
  /** The stacks as they deploy (at most 7). */
  readonly stacks: readonly Stack[];
}

export interface PreBattleModel {
  /** One title: "10 Bog Leeches attack!". */
  readonly title: string;
  readonly side: "attacker" | "defender";
  readonly own: PreBattleArmy;
  readonly enemy: PreBattleArmy;
  /** "The 10 Bog Leeches fight as 3 stacks: 4, 3 and 3." or null. */
  readonly split: string | null;
  /** The estimate; null without a hero of the player's in the fight. */
  readonly odds: Odds | null;
  readonly oddsWord: string | null;
  /** The player's share of the two armies' strength, 0..100. */
  readonly share: number | null;
  readonly canRetreat: boolean;
  /** What losing (or retreating) costs. */
  readonly consequence: string;
}

/** "4, 3 and 3". */
export function listWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function sideArmy(side: BattleSide, fallback: string): PreBattleArmy {
  const hero = side.hero;
  return {
    label: hero?.name ?? fallback,
    portrait:
      hero?.defId !== undefined || hero?.heroClass !== undefined
        ? namedHeroPortrait(hero.defId ?? "", hero.heroClass ?? "").key
        : null,
    stacks: side.stacks.map((s) => ({ creature: s.creature, count: s.count })),
  };
}

/**
 * The pre-battle dialog's model for `player` (the attacker unless only
 * the defender is theirs).
 */
export function preBattleModel(
  state: GameState,
  setup: BattleSetup,
  player: number,
): PreBattleModel {
  const pending = setup.battle;
  const sides = battlePlayers(state, pending);
  const side: "attacker" | "defender" =
    sides.defender === player && sides.attacker !== player
      ? "defender"
      : "attacker";
  const ownSide = setup[side];
  const enemySide = setup[side === "attacker" ? "defender" : "attacker"];
  let title: string;
  let enemyLabel = "Enemy";
  let split: string | null = null;
  const attacker = state.heroes.find((h) => h.id === pending.heroId);
  const colour = (owner: number | null | undefined): string =>
    playerColour(owner ?? 0).name;
  if (pending.kind === "monster") {
    const m = state.monsters[pending.objectId];
    const creature = m?.creature ?? enemySide.stacks[0]?.creature;
    const count = m?.count ?? enemySide.stacks.reduce((n, s) => n + s.count, 0);
    title =
      creature === undefined
        ? "Monsters attack!"
        : `${creatureCount(creature, count)} ${count === 1 ? "attacks" : "attack"}!`;
    enemyLabel = "Neutral";
    if (creature !== undefined && enemySide.stacks.length > 1) {
      split = `The ${creatureCount(creature, count)} fight as ${enemySide.stacks.length} stacks: ${listWords(enemySide.stacks.map((s) => String(s.count)))}.`;
    }
  } else if (pending.kind === "site") {
    const obj = state.map.objects.find((o) => o.id === pending.objectId);
    const name = obj === undefined ? "site" : objectName(state, obj);
    title = `The keepers of the ${name} attack!`;
    enemyLabel = "Keepers";
  } else if (pending.kind === "town") {
    const town = state.towns[pending.objectId];
    const name = town?.name ?? "the town";
    title =
      side === "attacker"
        ? `The garrison of ${name} stands ready.`
        : `${attacker?.name ?? "An enemy"} of ${colour(attacker?.owner)} attacks ${name}!`;
    enemyLabel = side === "attacker" ? `${name} garrison` : "Enemy";
  } else {
    const foe = state.heroes.find((h) => h.id === pending.objectId);
    const where =
      pending.townId !== undefined
        ? ` at ${state.towns[pending.townId]?.name ?? "the town"}`
        : "";
    title =
      side === "attacker"
        ? `${attacker?.name ?? "Your hero"} attacks ${foe?.name ?? "the enemy"} of ${colour(foe?.owner)}${where}!`
        : `${attacker?.name ?? "An enemy"} of ${colour(attacker?.owner)} attacks ${foe?.name ?? "your hero"}${where}!`;
  }
  const own = sideArmy(ownSide, "Your garrison");
  const enemy = sideArmy(enemySide, enemyLabel);
  const ownHero = state.heroes.find((h) => h.id === ownSide.hero?.id);
  let odds: Odds | null = null;
  let share: number | null = null;
  if (ownHero !== undefined) {
    const est = battleOdds(
      { ...ownHero, army: own.stacks.map((s) => ({ ...s })) },
      enemy.stacks,
    );
    odds = est.odds;
    share = Math.round((est.ratio / (1 + est.ratio)) * 100);
  }
  const canRetreat = ownSide.canRetreat === true && ownSide.hero !== null;
  return {
    title,
    side,
    own,
    enemy,
    split,
    odds,
    oddsWord: odds === null ? null : ODDS_TEXT[odds],
    share,
    canRetreat,
    consequence:
      ownSide.hero === null
        ? "If the garrison falls, the town is lost."
        : canRetreat
          ? "A retreating hero loses its army and waits in your tavern."
          : "If your army falls, the hero leaves the map.",
  };
}

export type PreBattleChoice = "fight" | "auto" | "retreat";

function bandView(army: PreBattleArmy, kind: "own" | "enemy"): HTMLElement {
  const slots: ArmySlots = army.stacks.map((s) => ({ ...s }));
  const band = armyBand(slots);
  band.classList.add("gm-battle-band");
  band.style.setProperty("--slots", String(Math.max(1, slots.length)));
  const head = el(
    "div.gm-battle-army-head",
    army.portrait === null ? null : img(army.portrait, "gm-battle-army-hero"),
    el("span", army.label),
  );
  return el(`div.gm-battle-army.gm-battle-army-${kind}`, head, band);
}

function estimateView(model: PreBattleModel): HTMLElement | null {
  if (model.odds === null || model.share === null) return null;
  const fill = el(`span.gm-battle-estimate-fill.gm-odds-bg-${model.odds}`);
  fill.style.width = `${model.share}%`;
  const bar = el("span.gm-battle-estimate-bar", fill);
  bar.setAttribute("aria-hidden", "true");
  return el(
    "div.gm-battle-estimate",
    el("span.gm-dim", "Estimate: "),
    el(`b.gm-odds-${model.odds}`, model.oddsWord ?? ""),
    bar,
  );
}

/** Shows the pre-battle dialog; resolves with Fight, Quick combat or Retreat. */
export function preBattleDialog(
  model: PreBattleModel,
): Promise<PreBattleChoice> {
  const buttons: Array<DialogButton<PreBattleChoice>> = [
    { label: "Fight", value: "fight", primary: true },
    { label: "Quick combat", value: "auto", key: "Q" },
  ];
  if (model.canRetreat)
    buttons.push({ label: "Retreat", value: "retreat", key: "R" });
  return dialog<PreBattleChoice>({
    title: model.title,
    className: "gm-battle-confirm",
    body: el(
      "div.gm-battle-armies",
      bandView(model.own, "own"),
      el("div.gm-battle-vs", "vs"),
      bandView(model.enemy, "enemy"),
      model.split === null ? null : el("p.gm-battle-split", model.split),
      estimateView(model),
    ),
    consequence: model.consequence,
    buttons,
  });
}

// ------------------------------------------------------------ retreat

/**
 * The retreat warning (bead bzc.92): what a retreat costs under the real
 * rules (RULES_V2 1.12, 4.4, 5.4; applyBattleResult and sendToTavern):
 * the battle is lost, the whole army is lost, the hero leaves the map,
 * keeps its level, skills, pages, scrolls and artifacts, and waits in its
 * owner's tavern until the second weekly refresh, for the hiring price.
 */
export interface RetreatModel {
  readonly title: string;
  /** The hero's portrait key. */
  readonly portrait: string | null;
  readonly sentence: string;
  /** What is lost, one line each. */
  readonly lost: readonly string[];
  /** What is kept, one line each. */
  readonly kept: readonly string[];
  /** Against fighting on and losing. */
  readonly consequence: string;
}

/** "for the rest of this week and all of next week" for 2 refreshes. */
function tavernStay(refreshes: number): string {
  if (refreshes <= 1) return "for the rest of this week";
  if (refreshes === 2) return "for the rest of this week and all of next week";
  return `for the rest of this week and the next ${refreshes - 1} weeks`;
}

/** The retreat warning's model for the player's `side` of the battle. */
export function retreatModel(
  state: GameState,
  setup: BattleSetup,
  side: "attacker" | "defender",
): RetreatModel {
  const own = setup[side];
  const enemy = setup[side === "attacker" ? "defender" : "attacker"];
  const hero = state.heroes.find((h) => h.id === own.hero?.id);
  const name = hero?.name ?? own.hero?.name ?? "Your hero";
  const army = totalsByCreature(own.stacks).map((s) =>
    creatureCount(s.creature, s.count),
  );
  const lost: string[] = [
    army.length === 0
      ? "Your whole army."
      : `Your whole army: ${listWords(army)}.`,
    `${name}, who leaves the map at once.`,
  ];
  if (
    hero !== undefined &&
    (hero.nextBattle.length > 0 || hero.buffs.length > 0)
  )
    lost.push("Potions and site blessings readied for this battle.");
  const kept: string[] = [
    `The hero's level ${hero?.level ?? 1}, stats, skills, feats, spells, scrolls and artifacts.`,
    `A place in your tavern ${tavernStay(RETREAT_OFFER_REFRESHES)}: rehiring costs ${HIRE_COST} gold and brings only a fresh starting army.`,
  ];
  const foe = enemy.hero?.name ?? null;
  return {
    title: "Retreat and lose your army?",
    portrait:
      hero === undefined
        ? null
        : namedHeroPortrait(hero.defId, hero.heroClass).key,
    sentence: `${name} flees without a fight, and the battle is lost.`,
    lost,
    kept,
    consequence:
      foe === null
        ? "Fighting and losing costs the army too, and the hero goes to the common pool, where any player may hire it."
        : `Fighting and losing costs the army too, the hero goes to the common pool, and ${foe} takes its artifacts.`,
  };
}

function retreatList(
  head: string,
  kind: "lost" | "kept",
  lines: readonly string[],
): HTMLElement {
  return el(
    `div.gm-retreat-list.gm-retreat-${kind}`,
    el("div.gm-retreat-head", head),
    el("ul", ...lines.map((line) => el("li", line))),
  );
}

/**
 * The retreat warning's dialog: true retreats. Cancel is the default
 * (Enter, focused at open, and Escape); retreating takes a click, with no
 * letter key, so a second R from the pre-battle dialog cannot confirm it.
 */
export function retreatDialogOptions(
  model: RetreatModel,
): DialogOptions<boolean> {
  return {
    title: model.title,
    className: "gm-retreat-dialog",
    picture:
      model.portrait === null ? null : img(model.portrait, "gm-dialog-hero", 2),
    sentence: model.sentence,
    body: el(
      "div.gm-retreat-lists",
      retreatList("You lose", "lost", model.lost),
      retreatList("You keep", "kept", model.kept),
    ),
    consequence: model.consequence,
    buttons: [
      { label: "Cancel", value: false, primary: true },
      { label: "Retreat anyway", value: true },
    ],
    cancel: false,
  };
}

/** Shows the retreat warning; resolves true to retreat. */
export function retreatDialog(model: RetreatModel): Promise<boolean> {
  return dialog<boolean>(retreatDialogOptions(model));
}

// ------------------------------------------------------------ sites

export interface SiteChoiceModel {
  readonly value: string;
  /** The option's words; "800 gold" draws as an icon and a number. */
  readonly label: string;
  readonly disabled: boolean;
  /** Why it is unavailable ("not enough gold"), or null. */
  readonly why: string | null;
  /** A creature to hire: its portrait. */
  readonly portrait: string | null;
  /** What it costs, when the words do not say (a hire). */
  readonly cost: ResourceAmounts | null;
  /**
   * The one thing it offers (bead bzc.108: a ware to buy, an item to sell,
   * a vault's prize, a skill to forget), shown as an inspectable icon.
   */
  readonly item: VisitIcon | null;
}

export interface SiteDialogModel {
  readonly title: string;
  readonly picture: DialogPicture | null;
  readonly sentence: string;
  readonly choices: readonly SiteChoiceModel[];
  /** When it can be used again, or whether this hero already has. */
  readonly consequence: string | null;
  /**
   * What the last choice gave (bead bzc.108: a ware just bought, a prize
   * just taken), as inspectable cards above the next question.
   */
  readonly gained: readonly VisitIcon[];
}

/**
 * The site dialog's model: the visit's text without the site's name in
 * front (the title says it), or "Anything else?" after a first choice,
 * led by that choice's outcome (`last`, bead bzc.81: what was bought or
 * learnt is read here, not floated behind the dialog).
 */
export function siteDialogModel(
  state: GameState,
  hero: HeroState,
  obj: MapObject,
  text: string,
  first: boolean,
  last: string | null = null,
): SiteDialogModel {
  const title = objectName(state, obj);
  const names = siteNames(state, obj);
  let sentence = withoutName(names, text);
  if (!first)
    sentence =
      last === null
        ? "Anything else?"
        : `${withoutName(names, last)} Anything else?`;
  const offer = dwellingOffer(state, obj);
  const choices = siteOptions(state, hero, obj).map((o): SiteChoiceModel => {
    const hire = /^hire:(\d+)$/.exec(o.id);
    const n = hire === null ? 0 : Number(hire[1]);
    let cost: ResourceAmounts | null = null;
    if (hire !== null && offer !== null && n > 0) {
      const total: ResourceAmounts = {};
      for (const [r, c] of Object.entries(offer.cost))
        total[r as keyof ResourceAmounts] = (c ?? 0) * n;
      cost = total;
    }
    return {
      value: o.id,
      label: o.label,
      disabled: o.disabled !== undefined,
      why: o.disabled ?? null,
      portrait:
        hire !== null && offer !== null
          ? creatureAsset(offer.creature).portrait
          : null,
      cost,
      item: optionItem(state, hero, obj, o.id),
    };
  });
  const site = describeSite(state, hero.owner, obj, hero.id);
  const consequence =
    site === null
      ? null
      : site.visited !== null
        ? site.visited.text
        : site.reset !== ""
          ? site.reset
          : null;
  const key = objectPictureKey(obj);
  return {
    title,
    picture: key === null ? null : dialogPicture(key),
    sentence,
    choices,
    consequence,
    gained: first || last === null ? [] : textIcons(last),
  };
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A choice row's picture: what it offers, inspectable (its click pins the
 * card and does not pick the row; the row's own hover and focus show the
 * card too), or a hired creature's portrait.
 */
function choicePicture(c: SiteChoiceModel): HTMLElement | null {
  if (c.item !== null) return inspectIcon(c.item, { focusable: false });
  return c.portrait === null ? null : img(c.portrait, "gm-dialog-portrait");
}

/** Shows a site's choice; resolves with the option id, or "" to leave. */
export function siteDialog(model: SiteDialogModel): Promise<string> {
  const enabled = model.choices.filter((c) => !c.disabled);
  const choices: Array<DialogChoice<string>> = model.choices.map((c) => ({
    value: c.value,
    label: textWithIcons(c.label),
    text: c.why === null ? c.label : `${c.label} (${c.why})`,
    picture: choicePicture(c),
    note:
      c.why !== null
        ? capital(c.why)
        : c.cost !== null
          ? el("span", "Costs ", costView(c.cost))
          : null,
    disabled: c.disabled,
    // The one thing to do here is the default; with several, none is.
    primary: enabled.length === 1 && enabled[0] === c,
  }));
  const gained = resultIcons(model.gained);
  return dialog<string>({
    title: model.title,
    className: "gm-site-dialog",
    picture: model.picture === null ? null : pictureView(model.picture),
    sentence: model.sentence,
    ...(gained !== null ? { body: gained } : {}),
    choices,
    consequence: model.consequence,
    buttons: [{ label: "Leave", value: "" }],
    cancel: "",
    // A row that offers one thing shows its card on hover and focus.
    onOpen: (_buttons, rows) =>
      model.choices.forEach((c, i) => {
        const row = rows[i];
        if (c.item !== null && row !== undefined) {
          const item = c.item;
          setTip(row, () => inspectCard(item));
        }
      }),
  });
}

// ------------------------------------------------------------ end turn

export interface EndTurnRow {
  /** "hero:<id>" or "town:<id>": what a click on the row answers. */
  readonly value: string;
  readonly kind: "hero" | "town";
  readonly id: string;
  readonly text: string;
  /** What a click does. */
  readonly action: string;
  /** The hero's portrait key (heroes). */
  readonly portrait: string | null;
  /** The town crest's colour (towns). */
  readonly crest: string | null;
}

/** The end-turn warning's rows: one per warning, heroes first. */
export function endTurnRows(
  state: GameState,
  warnings: readonly TurnWarning[],
): EndTurnRow[] {
  return warnings.map((w): EndTurnRow => {
    if (w.kind === "can-build") {
      return {
        value: `town:${w.id}`,
        kind: "town",
        id: w.id,
        text: w.text,
        action: "Open the town",
        portrait: null,
        crest: townRow(state, w.id, true)?.colour ?? null,
      };
    }
    const h = state.heroes.find((x) => x.id === w.id);
    return {
      value: `hero:${w.id}`,
      kind: "hero",
      id: w.id,
      text: w.text,
      action: "Select the hero",
      portrait:
        h === undefined ? null : namedHeroPortrait(h.defId, h.heroClass).key,
      crest: null,
    };
  });
}

export type EndTurnChoice =
  | { readonly kind: "end" }
  | { readonly kind: "stay" }
  | { readonly kind: "hero" | "town"; readonly id: string };

/** Parses an end-turn dialog answer ("end", "stay", "hero:<id>" ...). */
export function endTurnChoice(value: string): EndTurnChoice {
  if (value === "end" || value === "stay") return { kind: value };
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  if ((kind === "hero" || kind === "town") && id !== "") return { kind, id };
  return { kind: "stay" };
}

function rowPicture(row: EndTurnRow): HTMLElement | null {
  if (row.portrait !== null) return img(row.portrait, "gm-dialog-portrait");
  if (row.crest === null) return null;
  const crest = el("span.gm-town-crest.gm-dialog-crest");
  crest.style.setProperty("--crest", row.crest);
  crest.setAttribute("aria-hidden", "true");
  return crest;
}

/** Shows the end-turn warning; resolves with the answer. */
export async function endTurnDialog(
  rows: readonly EndTurnRow[],
): Promise<EndTurnChoice> {
  const value = await dialog<string>({
    title: "End the turn?",
    className: "gm-endturn-dialog",
    sentence: "There is still something to do today.",
    choices: rows.map((r) => ({
      value: r.value,
      label: r.text,
      text: `${r.text}: ${r.action.toLowerCase()}`,
      picture: rowPicture(r),
      note: r.action,
    })),
    consequence: "Unspent movement and unbuilt buildings do not carry over.",
    buttons: [
      { label: "End turn", value: "end", primary: true },
      { label: "Keep playing", value: "stay" },
    ],
    cancel: "stay",
  });
  return endTurnChoice(value);
}

// ------------------------------------------------------------ results

/**
 * What a result gave or holds (bead bzc.108): a tile per artifact, spell,
 * skill or stat, each opening the hero sheet's or spellbook's own card on
 * hover, focus, click or tap. Null without any.
 */
export function resultIcons(icons: readonly VisitIcon[]): HTMLElement | null {
  return icons.length === 0 ? null : inspectTiles(icons);
}

export type ResultChoice = "ok" | "show";

/**
 * A visit's informative outcome (bead bzc.81): the site's picture, the
 * outcome, what it gave or holds as icons, a dim note, and OK (Enter or
 * Escape); a rumour adds "Show on map" (S).
 */
export function resultDialog(result: VisitResult): Promise<ResultChoice> {
  const buttons: Array<DialogButton<ResultChoice>> = [
    { label: "OK", value: "ok", primary: true },
  ];
  if (result.area !== null)
    buttons.push({ label: "Show on map", value: "show", key: "S" });
  const key = result.picture;
  const icons = resultIcons(result.icons);
  return dialog<ResultChoice>({
    title: result.title,
    className: "gm-result-dialog",
    picture: key === null ? null : pictureView(dialogPicture(key)),
    sentence: rulesText(result.sentence),
    ...(icons !== null ? { body: icons } : {}),
    consequence: result.note,
    buttons,
    cancel: "ok",
  });
}

/** The spells a guild taught, as inspectable icons (bead bzc.108). */
export function learntIcons(model: LearntModel): VisitIcon[] {
  return model.spells.map((s) => ({ kind: "spell", id: s.id }));
}

/** The hero learnt pages (bead bzc.81): portrait, the new spells, OK. */
export function learntDialog(
  model: LearntModel,
  portrait: string | null,
): Promise<void> {
  return dialog<undefined>({
    title: model.title,
    className: "gm-result-dialog",
    picture: portrait === null ? null : img(portrait, "gm-dialog-hero", 2),
    sentence: model.sentence,
    body: inspectTiles(learntIcons(model)),
    consequence:
      model.consequence === null
        ? null
        : rulesText(model.consequence, { hover: true }),
    buttons: [{ label: "OK", value: undefined, primary: true }],
    cancel: undefined,
  });
}

/** Why a hero with no school learnt nothing in a guild town (once). */
export function noSchoolDialog(
  model: NoSchoolModel,
  portrait: string | null,
): Promise<void> {
  return dialog<undefined>({
    title: model.title,
    className: "gm-noschool-dialog",
    picture: portrait === null ? null : img(portrait, "gm-dialog-hero", 2),
    sentence: model.sentence,
    body: el(
      "div.gm-noschool-body",
      rulesText(model.howTo, { tag: "div", hover: true }),
      el("div.gm-dim", model.scrolls),
    ),
    buttons: [{ label: "OK", value: undefined, primary: true }],
    cancel: undefined,
  });
}
