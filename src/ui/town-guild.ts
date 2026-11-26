/**
 * The Mage Guild in the town screen (bead bzc.81): each guild spell with
 * its icon, name and where it stands for the hero in the town ("Learnt",
 * "Can't learn yet: needs Storm rank 2", "Not built"), and how a school
 * rank is had. The detail pane of a guild building lists its own level;
 * the Mage Guild button opens every level in the dialog shell. The models
 * are guild-learning.ts's.
 */
import { namedHeroPortrait } from "../assets/unit-art.ts";
import type { GameEvent, GameState } from "../core/game/index.ts";
import { iconElement } from "./icons.ts";
import { el } from "./dom.ts";
import { dialog } from "./dialog.ts";
import { learntDialog } from "./dialog-kinds.ts";
import { learntModel } from "./guild-learning.ts";
import type { GuildSpellView, GuildView } from "./guild-learning.ts";
import { spellTip } from "./info-tips.ts";
import { rulesText } from "./keywords.ts";
import { setInspect } from "./tooltip.ts";

/** One guild spell: icon, name and its state for the hero. */
export function guildSpellRow(s: GuildSpellView): HTMLElement {
  const icon = iconElement("spell", s.id);
  icon.removeAttribute("title");
  const row = el(
    "div.gm-guild-spell",
    icon,
    el(
      "span.gm-guild-spell-text",
      el("span.gm-guild-spell-name", s.name),
      rulesText(s.text, {
        className: `gm-guild-state gm-guild-${s.tone}`,
        hover: true,
      }),
    ),
  );
  row.dataset["spell"] = s.id;
  row.dataset["state"] = s.state.kind;
  if (s.state.kind === "not-built") row.classList.add("gm-guild-unbuilt");
  // Offered spells open the spellbook's card on click too (bead bzc.108).
  setInspect(icon, () => spellTip(s.id), `spell:${s.id}`);
  return row;
}

/** The spells of one guild level, for the building's detail pane. */
export function guildLevelPane(view: GuildView, level: number): HTMLElement {
  const lv = view.levels.find((l) => l.level === level);
  const box = el("div.gm-guild-pane");
  if (lv === undefined) return box;
  box.append(
    el(
      "div.gm-guild-pane-head",
      view.hero === null ? "Teaches" : `Teaches · for ${view.hero.name}`,
    ),
    el("div.gm-guild-list", ...lv.spells.map(guildSpellRow)),
  );
  return box;
}

/** Every level of the guild, as the Mage Guild dialog's body. */
export function guildLevelsView(view: GuildView): HTMLElement {
  const box = el("div.gm-guild-levels");
  for (const lv of view.levels) {
    const head = el(
      "div.gm-guild-level-head",
      el("b", `Level ${lv.level}`),
      el(
        `span.${lv.built ? "gm-good" : "gm-dim"}`,
        lv.built ? "built" : "not built",
      ),
    );
    box.append(
      el(
        `div.gm-guild-level${lv.built ? "" : ".gm-guild-level-unbuilt"}`,
        head,
        el("div.gm-guild-list", ...lv.spells.map(guildSpellRow)),
      ),
    );
  }
  return box;
}

/**
 * Shows a learn dialog for each `spells-learnt` event of a hero of
 * `player` (bead bzc.81): never for the AI's or another player's heroes.
 */
export async function showLearnt(
  state: GameState,
  events: readonly GameEvent[],
  player: number,
): Promise<void> {
  for (const e of events) {
    if (e.type !== "spells-learnt") continue;
    const hero = state.heroes.find((h) => h.id === e.heroId);
    if (hero === undefined || hero.owner !== player) continue;
    const model = learntModel(state, e.heroId, e.townId, e.spells);
    if (model === null) continue;
    await learntDialog(
      model,
      namedHeroPortrait(hero.defId, hero.heroClass).key,
    );
  }
}

/** Opens the Mage Guild: every level, the hero's states and the rule. */
export function guildDialog(townName: string, view: GuildView): Promise<void> {
  return dialog<undefined>({
    title: `Mage Guild of ${townName}`,
    className: "gm-guild-dialog",
    sentence: view.summary,
    body: guildLevelsView(view),
    consequence:
      view.howTo === null
        ? null
        : rulesText(view.howTo, { hover: true, className: "gm-guild-howto" }),
    buttons: [{ label: "Close", value: undefined, primary: true }],
    cancel: undefined,
  });
}
