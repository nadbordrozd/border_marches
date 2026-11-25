/**
 * The gallery of the main menu (bead border_marches-3nb): every creature,
 * hero, spell, artifact, skill, feat, map object, town and building of the
 * game in tabs, each with its sprites at native size and enlarged (crisp
 * pixels), its name and its full card. The cards are the game's own hover
 * cards (src/ui/info-tips.ts, the hero screen's artifact text, the battle
 * condition and ground text), so the text is never written twice. The
 * entries come from src/ui/gallery-data.ts, built from the registries.
 *
 * Each tab has a search box over names and card text. The tab, each tab's
 * search and scroll position are kept for the session. Esc or Back returns
 * to the menu.
 */
import type { BattleState, Condition } from "../core/battle/index.ts";
import { conditionKind, groundKind } from "../core/battle/index.ts";
import { specialtyText } from "../core/game/index.ts";
import { SUMMONED_CREATURES, isSpell, spellInfo } from "../core/magic/index.ts";
import { COMMANDS, HERO_CLASSES, NAMED_HEROES } from "../data/classes.ts";
import { getCreature, isCreatureId } from "../data/creatures.ts";
import {
  MARKET_BUY_PRICE,
  MARKET_SELL_PRICE,
  MINES,
  PICKUPS,
} from "../data/economy.ts";
import { SCHOOL_NAMES, STAT_NAMES, PRIMARY_STATS } from "../data/effects.ts";
import { findFaction } from "../data/factions.ts";
import { findFeat } from "../data/feats.ts";
import {
  OBJECT_TYPES,
  RESET_TEXT,
  isObjectTypeId,
} from "../data/objectTypes.ts";
import { findSkill } from "../data/skills.ts";
import type { ResourceId } from "../core/map/types.ts";
import { decorationById } from "../assets/decorations.ts";
import { assetByKey } from "../assets/manifest.ts";
import { conditionTooltip, groundTooltip } from "./battle/grammar.ts";
import { button, el, img, kbd } from "./dom.ts";
import {
  GALLERY_TAB_IDS,
  galleryTab,
  galleryTabLabel,
  tabEntries,
  type GalleryArt,
  type GalleryEntry,
  type GalleryTabId,
} from "./gallery-data.ts";
import { itemTooltip } from "./hero-screen.ts";
import { iconElement } from "./icons.ts";
import { highlightKeywords } from "./keywords.ts";
import {
  abilityText,
  buildingTip,
  creatureTip,
  spellTip,
} from "./info-tips.ts";
import { hideTip, tipCard, titleCard, type TipBody } from "./tooltip.ts";
import "./gallery.css";

/** Size the enlarged copy aims at: icons x4, portraits and sprites x2. */
const ENLARGED_PX = 128;
/** A figure wider than this takes a whole row of the grid. */
const WIDE_PX = 380;

/** Session memory: the open tab, and each tab's search and scroll. */
let lastTab: GalleryTabId = "creatures";
const queries = new Map<GalleryTabId, string>();
const scrolls = new Map<GalleryTabId, number>();

/** The enlarged scale of a picture of size w x h: 2 to 4. */
export function enlargedScale(w: number, h: number): number {
  return Math.max(2, Math.min(4, Math.floor(ENLARGED_PX / Math.max(w, h))));
}

function artSize(art: GalleryArt): { w: number; h: number } {
  if (art.type === "icon") return { w: 32, h: 32 };
  const a = assetByKey(art.key);
  return { w: a.w, h: a.h };
}

function picture(art: GalleryArt, scale: number): HTMLElement {
  if (art.type === "icon") {
    const node = iconElement(art.icon, art.id, { scale });
    node.removeAttribute("title");
    return node;
  }
  const image = img(art.key, "gx-img", scale);
  image.loading = "lazy";
  image.alt = art.label;
  return image;
}

/** One picture at native size and enlarged, with its label. */
function figure(art: GalleryArt): HTMLElement {
  const { w, h } = artSize(art);
  const scale = enlargedScale(w, h);
  const fig = el(
    "figure.gx-fig",
    el("div.gx-pics", picture(art, 1), picture(art, scale)),
    el("figcaption", `${art.label} · ${w}x${h}, x1 and x${scale}`),
  );
  if (w + w * scale > WIDE_PX) fig.classList.add("gx-fig-wide");
  return fig;
}

// ------------------------------------------------------------ cards

function signedLine(label: string, value: string): HTMLElement {
  return el("div.gm-tip-line", el("b", `${label}: `), value);
}

/** A summoned creature (magic's, not recruited): the creature card's layout. */
function summonCard(id: string): TipBody {
  const def = Object.hasOwn(SUMMONED_CREATURES, id)
    ? SUMMONED_CREATURES[id]
    : undefined;
  if (def === undefined) return id;
  const stats = el("div.gm-tip-stats");
  stats.style.gridTemplateColumns = "auto auto auto auto";
  const pairs: Array<[string, number | string]> = [
    ["Attack", def.attack],
    ["Defense", def.defense],
    ["Damage", def.damage],
    ["Health", def.hp],
    ["Speed", def.speed],
    (def.shots ?? 0) > 0 ? ["Shots", def.shots ?? 0] : ["Melee", ""],
  ];
  for (const [k, v] of pairs) stats.append(el("span", k), el("b", String(v)));
  return tipCard(
    def.name ?? id,
    [
      stats,
      def.abilities.length === 0 ? null : el("div.gm-tip-section", "Abilities"),
      ...def.abilities.map((a) => {
        const t = abilityText(a);
        return el(
          "div.gm-tip-line",
          el("b.gm-tip-ability", t.name),
          t.text === "" ? "" : `: ${t.text}`,
        );
      }),
      el(
        "div.gm-tip-line.gm-tip-dim",
        "Summoned by spells only: never recruited, gone after the battle.",
      ),
    ],
    { subtitle: `Tier ${def.tier} · Summon` },
  );
}

function heroClassCard(id: string): TipBody {
  const cls = HERO_CLASSES[id];
  if (cls === undefined) return id;
  const command = COMMANDS[cls.command];
  const stats = el("div.gm-tip-stats");
  stats.style.gridTemplateColumns = "auto auto auto auto";
  for (const s of PRIMARY_STATS)
    stats.append(el("span", STAT_NAMES[s]), el("b", String(cls.stats[s])));
  const army = cls.startingArmy
    .map((a) =>
      isCreatureId(a.creature)
        ? `${a.count} ${getCreature(a.creature).plural}`
        : `${a.count} ${a.creature}`,
    )
    .join(", ");
  return tipCard(
    cls.name,
    [
      stats,
      signedLine(
        "Starting skills",
        cls.startingSkills.map((s) => findSkill(s)?.name ?? s).join(", "),
      ),
      cls.startingPage === undefined
        ? null
        : signedLine(
            "Starting page",
            isSpell(cls.startingPage)
              ? spellInfo(cls.startingPage).name
              : cls.startingPage,
          ),
      command === undefined
        ? null
        : el(
            "div.gm-tip-line",
            el("b.gm-tip-ability", `Command: ${command.name}`),
            `: ${command.text}`,
          ),
      signedLine("Starting army", army),
      el(
        "div.gm-tip-line.gm-tip-dim",
        `Native terrain: ${cls.nativeTerrain}. Level-up pattern: ${cls.pattern
          .map((s) => STAT_NAMES[s])
          .join(", ")}.`,
      ),
    ],
    {
      subtitle: `${cls.leaning === "might" ? "Might" : "Magic"} class · ${findFaction(cls.faction)?.name ?? cls.faction}`,
    },
  );
}

function heroCard(id: string): TipBody {
  const hero = NAMED_HEROES.find((h) => h.id === id);
  if (hero === undefined) return id;
  const cls = HERO_CLASSES[hero.heroClass];
  return tipCard(
    hero.name,
    [
      el(
        "div.gm-tip-line",
        el("b.gm-tip-ability", "Specialty"),
        `: ${specialtyText(hero.specialty)}`,
      ),
      cls === undefined
        ? null
        : el(
            "div.gm-tip-line.gm-tip-dim",
            `Command: ${COMMANDS[cls.command]?.name ?? cls.command}. Starts with ${cls.startingSkills
              .map((s) => findSkill(s)?.name ?? s)
              .join(" and ")}.`,
          ),
    ],
    {
      subtitle: `${cls?.name ?? hero.heroClass} · ${findFaction(hero.faction)?.name ?? hero.faction}`,
    },
  );
}

const RANK_NAMES = ["Basic", "Advanced", "Expert"] as const;

function skillCard(id: string): TipBody {
  const def = findSkill(id);
  if (def === undefined) return id;
  const family = `${def.family[0]?.toUpperCase()}${def.family.slice(1)} skill`;
  return tipCard(
    def.name,
    def.ranks.map((r, i) =>
      el(
        "div.gm-tip-line",
        el("b", `${RANK_NAMES[i] ?? `Rank ${i + 1}`}: `),
        r.text,
      ),
    ),
    {
      subtitle:
        def.school === undefined
          ? family
          : `${family} · ${SCHOOL_NAMES[def.school]}`,
    },
  );
}

function featCard(id: string): TipBody {
  const def = findFeat(id);
  if (def === undefined) return id;
  const vow = def.restrictionText !== undefined;
  return tipCard(
    def.name,
    [
      def.text,
      vow
        ? el(
            "div.gm-tip-line.gm-tip-bad",
            `Restriction: ${def.restrictionText ?? ""}`,
          )
        : null,
      def.tags.length === 0
        ? null
        : el(
            "div.gm-tip-line.gm-tip-dim",
            `Offered more to heroes with ${def.tags
              .map((t) => findSkill(t)?.name ?? t)
              .join(", ")}.`,
          ),
    ],
    { subtitle: vow ? "Vow" : "Feat" },
  );
}

function objectCard(id: string): TipBody {
  if (!isObjectTypeId(id)) return id;
  const def = OBJECT_TYPES[id];
  return tipCard(
    def.name,
    [
      def.text,
      el("div.gm-tip-line.gm-tip-dim", RESET_TEXT[def.reset]),
      el(
        "div.gm-tip-line.gm-tip-dim",
        [
          `Footprint ${def.w}x${def.h}`,
          def.value > 0 ? `value ${def.value} gold` : null,
          def.terrain.length > 0 ? `prefers ${def.terrain.join(", ")}` : null,
          def.vanishes ? "removed once used" : null,
          def.stretch ? "stretch content" : null,
        ]
          .filter((x) => x !== null)
          .join(" · "),
      ),
    ],
    { subtitle: `Map ${def.kind}` },
  );
}

const TERRAIN_NAMES: Readonly<Record<string, string>> = {
  grass: "Grass",
  jungle: "Jungle",
  steppe: "Steppe",
  badlands: "Badlands",
  wasteland: "Wasteland",
};

function decorationCard(id: string): TipBody {
  const d = decorationById(id);
  if (d === undefined) return id;
  return tipCard(
    d.name,
    [
      d.text,
      el(
        "div.gm-tip-line.gm-tip-dim",
        [
          d.passable
            ? "Heroes walk over it"
            : `Blocks the way · ${d.cols} cell${d.cols === 1 ? "" : "s"}`,
          `on ${d.terrains.map((t) => TERRAIN_NAMES[t] ?? t).join(", ")}`,
        ].join(" · "),
      ),
    ],
    { subtitle: d.passable ? "Decoration" : "Prop" },
  );
}

function townCard(faction: string): TipBody {
  const f = findFaction(faction);
  if (f === undefined || f.town === null) return faction;
  const garrison = f.town.neutralGarrison
    .map((g) =>
      isCreatureId(g.creature)
        ? `${g.count} ${getCreature(g.creature).plural}`
        : `${g.count} ${g.creature}`,
    )
    .join(", ");
  return tipCard(
    f.name,
    [
      f.blurb,
      f.birthright === undefined
        ? null
        : el(
            "div.gm-tip-line",
            el("b.gm-tip-ability", `Birthright: ${f.birthright.name}`),
            `: ${f.birthright.text}`,
          ),
      signedLine(
        "Hero classes",
        f.heroClasses.map((c) => HERO_CLASSES[c]?.name ?? c).join(", "),
      ),
      signedLine("Town names", f.town.townNames.join(", ")),
      signedLine("Neutral garrison", garrison),
      f.schools === undefined
        ? null
        : el(
            "div.gm-tip-line.gm-tip-dim",
            `Magic leanings: ${Object.entries(f.schools)
              .map(
                ([s, w]) =>
                  `${SCHOOL_NAMES[s as keyof typeof SCHOOL_NAMES] ?? s} ${w}`,
              )
              .join(", ")}; guild up to level ${f.guildCap ?? "?"}.`,
          ),
    ],
    { subtitle: "Faction town" },
  );
}

/** A condition as the battle shows it, at its default size and clock. */
function conditionCard(id: string): TipBody {
  const def = conditionKind(id);
  const size = def.defaultSize ?? 1;
  const c: Condition = {
    uid: 0,
    kind: id,
    school: def.school,
    polarity: def.polarity,
    size,
    maxSize: size,
    clock: def.defaultClock === undefined ? 3 : def.defaultClock,
    gate: null,
    hold: def.hold === true,
    link: null,
    source: "gallery",
    roundsBorne: 0,
  };
  let text: string;
  try {
    text = conditionTooltip({ stacks: [] } as unknown as BattleState, c);
  } catch {
    text = def.name;
  }
  return tipCard(def.name, [text], {
    subtitle: `${SCHOOL_NAMES[def.school]} ${def.polarity} · shown at size ${size}`,
  });
}

function groundCard(id: string): TipBody {
  const def = groundKind(id);
  let text: string;
  try {
    text = groundTooltip({
      hex: { col: 0, row: 0 },
      kind: id,
      class: def.class,
      school: def.school,
      size: 1,
      clock: def.defaultClock === undefined ? 3 : def.defaultClock,
      remains: null,
      source: "gallery",
    });
  } catch {
    text = def.name;
  }
  return tipCard(def.name, [text], {
    subtitle: `${def.class}${def.school === null ? "" : ` · ${SCHOOL_NAMES[def.school]}`}`,
  });
}

function resourceCard(id: string): TipBody {
  const r = id as ResourceId;
  const mine = MINES[r];
  const pickup = PICKUPS[r];
  return tipCard(
    pickup.name.replace(/ pile$| crystals$/, ""),
    [
      `${mine.name}: +${mine.income} a day once flagged.`,
      `${pickup.name} on the map: ${pickup.min} to ${pickup.max}.`,
      r === "gold"
        ? null
        : el(
            "div.gm-tip-line.gm-tip-dim",
            `Marketplace: buy for ${MARKET_BUY_PRICE[r]} gold, sell for ${MARKET_SELL_PRICE[r]} gold.`,
          ),
    ],
    { subtitle: "Resource" },
  );
}

/** The card of an entry: the game's own hover card where there is one. */
export function entryCard(entry: GalleryEntry): TipBody {
  switch (entry.kind) {
    case "creature":
      return creatureTip(entry.id);
    case "summon":
      return summonCard(entry.id);
    case "hero-class":
      return heroClassCard(entry.id);
    case "hero":
      return heroCard(entry.id);
    case "spell":
      return spellTip(entry.id);
    case "artifact":
      return titleCard(itemTooltip(entry.id));
    case "skill":
      return skillCard(entry.id);
    case "feat":
      return featCard(entry.id);
    case "object":
      return objectCard(entry.id);
    case "decoration":
      return decorationCard(entry.id);
    case "town":
      return townCard(entry.id);
    case "building":
      return buildingTip(
        { faction: entry.faction ?? "neutral", buildings: [] },
        entry.id,
        { catalogue: true },
      );
    case "condition":
      return conditionCard(entry.id);
    case "ground":
      return groundCard(entry.id);
    case "resource":
      return resourceCard(entry.id);
  }
}

function entryNode(entry: GalleryEntry, sectionTitle: string): HTMLElement {
  const card = entryCard(entry);
  const text = el(
    "div.gx-text",
    typeof card === "string"
      ? el("div.gm-tip-card", el("div.gm-tip-title", card))
      : card,
  );
  // Keywords in the card's rules text explain themselves on hover.
  highlightKeywords(text, true);
  const figures = entry.art.map(figure);
  const node = el(
    "article.gx-card.gm-inset",
    figures.length === 0 ? null : el("div.gx-art", ...figures),
    text,
    entry.artNote === null ? null : el("div.gx-note", entry.artNote),
    el("div.gx-id", `${entry.kind} · ${entry.id}`),
  );
  if (figures.some((f) => f.classList.contains("gx-fig-wide")))
    node.classList.add("gx-wide");
  // Icons sit beside their card; sprites stand above it.
  if (entry.art.length > 0 && entry.art.every((a) => a.type === "icon"))
    node.classList.add("gx-row");
  node.dataset["search"] = [
    entry.name,
    entry.id,
    sectionTitle,
    text.textContent ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return node;
}

// ------------------------------------------------------------ screen

/**
 * Opens the gallery over `host` on `tab` (else the session's last tab);
 * resolves when the player goes back to the menu.
 */
export function openGallery(
  host: HTMLElement,
  tab?: GalleryTabId,
): Promise<void> {
  return new Promise((resolve) => {
    let current: GalleryTabId = tab ?? lastTab;
    const root = el("div.gm-gallery");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "Gallery");
    const tabs = el("nav.gx-tabs");
    tabs.setAttribute("role", "tablist");
    const search = el("input.gm-seed.gx-search");
    search.type = "search";
    search.setAttribute("aria-label", "Search this tab");
    const count = el("span.gx-count");
    const body = el("main.gx-body");
    body.tabIndex = -1;

    const close = (): void => {
      scrolls.set(current, body.scrollTop);
      lastTab = current;
      window.removeEventListener("keydown", onKey, true);
      hideTip();
      root.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const back = button("Back", close, "gm-btn gx-back");
    back.append(kbd("Esc"));

    const tabButtons = GALLERY_TAB_IDS.map((id) => {
      const b = button(galleryTabLabel(id), () => show(id), "gm-btn gx-tab");
      b.setAttribute("role", "tab");
      b.dataset["tab"] = id;
      tabs.append(b);
      return b;
    });

    const filter = (): void => {
      const q = search.value.trim().toLowerCase();
      queries.set(current, search.value);
      const words = q.split(/\s+/).filter((w) => w !== "");
      let shown = 0;
      let total = 0;
      for (const sec of body.querySelectorAll<HTMLElement>(".gx-section")) {
        let any = false;
        for (const card of sec.querySelectorAll<HTMLElement>(".gx-card")) {
          total++;
          const hay = card.dataset["search"] ?? "";
          const hit = words.every((w) => hay.includes(w));
          card.hidden = !hit;
          if (hit) {
            any = true;
            shown++;
          }
        }
        sec.hidden = !any;
      }
      count.textContent =
        q === "" ? `${total} entries` : `${shown} of ${total}`;
      body.querySelector(".gx-empty")?.toggleAttribute("hidden", shown > 0);
    };

    function show(id: GalleryTabId): void {
      if (body.childElementCount > 0) scrolls.set(current, body.scrollTop);
      current = id;
      lastTab = id;
      const data = galleryTab(id);
      for (const b of tabButtons) {
        const on = b.dataset["tab"] === id;
        b.classList.toggle("gm-selected", on);
        b.setAttribute("aria-selected", String(on));
      }
      search.placeholder = `Search ${data.label.toLowerCase()}...`;
      search.value = queries.get(id) ?? "";
      body.replaceChildren(
        ...data.sections.map((s) =>
          el(
            "section.gx-section",
            el(
              "h2.gm-rule.gx-section-title",
              `${s.title} (${s.entries.length})`,
            ),
            el("div.gx-grid", ...s.entries.map((e) => entryNode(e, s.title))),
          ),
        ),
        el("p.gx-empty", "Nothing matches the search."),
      );
      root.dataset["tab"] = id;
      root.dataset["entries"] = String(tabEntries(data).length);
      filter();
      body.scrollTop = scrolls.get(id) ?? 0;
    }

    search.addEventListener("input", filter);

    root.append(
      el(
        "header.gx-head.gm-frame",
        el("h1.gx-title", "Gallery"),
        tabs,
        el("div.gx-tools", search, count, back),
      ),
      body,
    );
    host.append(root);
    window.addEventListener("keydown", onKey, true);
    show(current);
    tabButtons.find((b) => b.dataset["tab"] === current)?.focus();
  });
}
