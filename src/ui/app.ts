/**
 * The game route: main menu with the new-game setup in two columns (bead
 * bzc.66: left the map, random by size and players or a named map with its
 * poster; right the human's faction as three cards; the computer players'
 * difficulty and the seed folded under Options) and Continue when a save
 * exists, then
 * the adventure screen until the game ends or the player quits back to the
 * menu. The menu also opens the gallery (src/ui/gallery.ts; `?gallery=<tab>`
 * opens it at once).
 */
import { newGame } from "../core/game/index.ts";
import {
  applyDifficulty,
  DIFFICULTIES,
  DIFFICULTY_INFO,
  isDifficulty,
  type Difficulty,
} from "../core/ai/difficulty.ts";
import type { GameState, PlayerSetup } from "../core/game/index.ts";
import { findFaction, playableFactions } from "../data/factions.ts";
import { CREATURES, getCreature } from "../data/creatures.ts";
import { MAX_PLAYERS, MIN_PLAYERS, playerColour } from "../data/players.ts";
import { heroArt, unitArt } from "../assets/unit-art.ts";
import type { CreatureId, FactionId } from "../data/types.ts";
import { generateMap } from "../core/map/generate.ts";
import type { MapSize, PlayerCount } from "../core/map/generate.ts";
import {
  NAMED_MAPS,
  buildNamedMap,
  findNamedMap,
  type NamedMapDef,
} from "../core/map/named.ts";
import { button, el, img, kbd, wait } from "./dom.ts";
import { playGame } from "./game.ts";
import { loadGameMapAssets } from "./hero-sprite.ts";
import { installMagicWheel, magicWheelButton } from "./magic-wheel.ts";
import { magicWheelModel } from "./magic-wheel-model.ts";
import { minimapPixels } from "./minimap.ts";
import { browserStorage, readSave, saveGame } from "./save.ts";
import { installUiSounds, soundControl } from "./sound-control.ts";
import { installTooltips, setTip } from "./tooltip.ts";
import "./game.css";

const SIZES: ReadonlyArray<{ id: MapSize; label: string }> = [
  { id: "S", label: "Small 36x36" },
  { id: "M", label: "Medium 48x48" },
  { id: "L", label: "Large 72x72" },
];

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export interface GameSetup {
  seed: number;
  size: MapSize;
  /** Two to four. */
  players: number;
  /** The human's faction (player 0). */
  faction: FactionId;
  /**
   * A named map's id (src/data/named-maps.ts): the map, its size and its
   * player count come from it, and seed, size and players are ignored.
   */
  map?: string;
  /**
   * The computer players' difficulty (bead bzc.23; default normal): kept
   * in the state; Hard also gives them a small head start.
   */
  difficulty?: Difficulty;
}

/**
 * The players of a named map: the human takes seat 0 with its faction and
 * the computer the map's recommended factions for the other seats; when
 * the human picks a faction recommended for another seat, the two swap.
 */
export function namedPlayerSetups(
  def: NamedMapDef,
  faction: FactionId,
): PlayerSetup[] {
  const factions = [...def.factions];
  const k = factions.indexOf(faction);
  if (k > 0) factions[k] = factions[0] ?? faction;
  factions[0] = faction;
  return factions.map((f, i) => ({
    kind: i === 0 ? "human" : "ai",
    faction: f,
  }));
}

/**
 * The players of a new game: the human first with its faction, then AI
 * players, each on the next playable faction after the human's in turn
 * (so a four-player game has four of the five factions).
 */
export function playerSetups(setup: GameSetup): PlayerSetup[] {
  const named = setup.map === undefined ? undefined : findNamedMap(setup.map);
  if (named !== undefined) return namedPlayerSetups(named, setup.faction);
  const playable = playableFactions().map((f) => f.id);
  const start = Math.max(0, playable.indexOf(setup.faction));
  return Array.from({ length: setup.players }, (_, i) => ({
    kind: i === 0 ? "human" : "ai",
    faction:
      i === 0
        ? setup.faction
        : (playable[(start + i) % playable.length] ?? setup.faction),
  }));
}

/**
 * Generates a map with one start per player (every start active, so each
 * has its town and hero; bead bzc.3) and the initial state for a new game.
 * A named map is built from its seed and edits instead (bead bzc.18).
 */
export function createGame(setup: GameSetup): GameState {
  return applyDifficulty(createMapGame(setup), setup.difficulty ?? "normal");
}

function createMapGame(setup: GameSetup): GameState {
  if (setup.map !== undefined) {
    const def = findNamedMap(setup.map);
    if (def === undefined) throw new Error(`no map called ${setup.map}`);
    return newGame(buildNamedMap(def), {
      players: namedPlayerSetups(def, setup.faction),
    });
  }
  const players = Math.min(
    MAX_PLAYERS,
    Math.max(MIN_PLAYERS, setup.players),
  ) as PlayerCount;
  const map = generateMap(setup.seed, {
    size: setup.size,
    players,
    activePlayers: players,
  });
  return newGame(map, { players: playerSetups(setup) });
}

/**
 * The play style line of each faction card on the setup screen (bead
 * bzc.66): one style word, then what the birthright does in practice. The
 * longer blurb is the card's tooltip and the detail line under the cards.
 */
const PLAY_STYLE: Readonly<Partial<Record<FactionId, string>>> = {
  humans: "Steady: paired stacks share heals and swap places.",
  undead: "Attrition: the fallen rise once; outlast the enemy.",
  goblins: "Explosive: bomb freely; your own goblins fly off unhurt.",
  candy: "Clinging: what you strike stays put; reel it in, shoot it.",
  dwarves: "Siege: Defend to stoke steam; shell where they will stand.",
};

/**
 * What a faction card shows: the faction's first hero class and three of
 * its creatures (the lowest tier, a middle one and the highest).
 */
export function factionShowcase(faction: FactionId): {
  heroClass: string;
  creatures: CreatureId[];
} {
  const def = findFaction(faction);
  const line = Object.values(CREATURES)
    .filter((c) => c.faction === faction)
    .sort((a, b) => a.tier - b.tier);
  const picks = [
    line[0],
    line[Math.floor((line.length - 1) / 2)],
    line[line.length - 1],
  ];
  const creatures: CreatureId[] = [];
  for (const c of picks) {
    if (c !== undefined && !creatures.includes(c.id)) creatures.push(c.id);
  }
  return { heroClass: def?.heroClasses[0] ?? "chieftain", creatures };
}

/**
 * The setup rows that only a random map uses: a named map brings its own
 * size, players and seed, so those rows hide when one is chosen.
 */
export function randomMapRows(mapId: string | null): {
  size: boolean;
  players: boolean;
  seed: boolean;
} {
  const random = mapId === null || findNamedMap(mapId) === undefined;
  return { size: random, players: random, seed: random };
}

/**
 * Minimap pixels of each named map at its start, unfogged (the poster
 * thumbnail of the map picker); built once per page, after the menu shows.
 */
const mapPosters = new Map<string, ImageData | null>();

function namedMapPoster(def: NamedMapDef): ImageData | null {
  if (mapPosters.has(def.id)) return mapPosters.get(def.id) ?? null;
  let poster: ImageData | null = null;
  try {
    const state = createGame({
      seed: def.seed,
      size: def.size,
      players: def.players,
      faction: def.factions[0] ?? "humans",
      map: def.id,
    });
    // Player -1 sees no fog: the whole map, every town in its owner colour.
    poster = new ImageData(
      minimapPixels(state, -1),
      state.map.width,
      state.map.height,
    );
  } catch (error) {
    console.error(error);
  }
  mapPosters.set(def.id, poster);
  return poster;
}

/** Shows the main menu until a game is started or continued. */
function mainMenu(params: URLSearchParams): Promise<GameState> {
  return new Promise((resolve) => {
    const host = document.getElementById("ui") ?? document.body;
    const root = el("div.gm-menu");
    const autostart = params.get("autostart") === "1";

    // ------------------------------------------------ random map rows
    let size: MapSize =
      params.get("size") === "S" || params.get("size") === "L"
        ? (params.get("size") as MapSize)
        : "M";
    const sizeRow = el("div.gm-size-row");
    const renderSizes = (): void => {
      sizeRow.replaceChildren();
      for (const s of SIZES) {
        const b = button(
          s.label,
          () => {
            size = s.id;
            renderSizes();
          },
          "gm-btn gm-size",
        );
        if (s.id === size) b.classList.add("gm-selected");
        b.setAttribute("aria-pressed", String(s.id === size));
        sizeRow.append(b);
      }
    };
    renderSizes();
    let players = Math.min(
      MAX_PLAYERS,
      Math.max(MIN_PLAYERS, Number(params.get("players") ?? 2) || 2),
    );
    const playersRow = el("div.gm-size-row");
    const renderPlayers = (): void => {
      playersRow.replaceChildren();
      for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
        const b = button(
          `${n} players`,
          () => {
            players = n;
            renderPlayers();
          },
          "gm-btn gm-size",
        );
        if (n === players) b.classList.add("gm-selected");
        b.setAttribute("aria-pressed", String(n === players));
        setTip(
          b,
          `You and ${n - 1} computer ${n === 2 ? "player" : "players"}`,
        );
        playersRow.append(b);
      }
    };
    renderPlayers();

    // ------------------------------------------------ options (folded)
    const seedInput = el("input.gm-seed");
    seedInput.type = "text";
    seedInput.inputMode = "numeric";
    const seedParam = params.get("seed");
    seedInput.value =
      seedParam !== null && /^\d+$/.test(seedParam)
        ? seedParam
        : String(randomSeed());
    seedInput.setAttribute("aria-label", "Map seed");
    const optionsSummary = el("small.gm-options-now");
    const wantedLevel = params.get("difficulty");
    let difficulty: Difficulty = isDifficulty(wantedLevel)
      ? wantedLevel
      : "normal";
    const difficultyRow = el("div.gm-size-row");
    const difficultyBlurb = el("p.gm-options-blurb");
    let mapId: string | null =
      findNamedMap(params.get("map") ?? "")?.id ?? null;
    // The fold's summary says what the folded options are set to.
    const renderSummary = (): void => {
      const level = DIFFICULTY_INFO[difficulty].name;
      optionsSummary.textContent = randomMapRows(mapId).seed
        ? `${level} computer, seed ${seedInput.value.trim() || "random"}`
        : `${level} computer`;
    };
    const renderDifficulty = (): void => {
      difficultyRow.replaceChildren();
      difficultyBlurb.textContent = DIFFICULTY_INFO[difficulty].blurb;
      for (const d of DIFFICULTIES) {
        const info = DIFFICULTY_INFO[d];
        const b = button(
          info.name,
          () => {
            difficulty = d;
            renderDifficulty();
          },
          "gm-btn gm-size",
        );
        setTip(b, info.blurb);
        if (d === difficulty) b.classList.add("gm-selected");
        b.setAttribute("aria-pressed", String(d === difficulty));
        difficultyRow.append(b);
      }
      renderSummary();
    };
    renderDifficulty();
    const seedRow = el("div.gm-seed-row", seedInput);
    const seedField = el("div.gm-field", el("label", "Seed"), seedRow);
    seedRow.append(
      button("Random", () => {
        seedInput.value = String(randomSeed());
        renderSummary();
      }),
    );
    seedInput.addEventListener("input", renderSummary);

    // ------------------------------------------------ map column
    const posterCanvases = new Map<string, HTMLCanvasElement[]>();
    const paintPoster = (canvas: HTMLCanvasElement, data: ImageData): void => {
      canvas.width = data.width;
      canvas.height = data.height;
      canvas.getContext("2d")?.putImageData(data, 0, 0);
      canvas.classList.add("gm-ready");
    };
    const posterCanvas = (def: NamedMapDef, cls: string): HTMLCanvasElement => {
      const canvas = el("canvas.gm-map-poster");
      canvas.classList.add(cls);
      canvas.setAttribute("aria-hidden", "true");
      const list = posterCanvases.get(def.id) ?? [];
      list.push(canvas);
      posterCanvases.set(def.id, list);
      const ready = mapPosters.get(def.id);
      if (ready) paintPoster(canvas, ready);
      return canvas;
    };
    const mapRow = el("div.gm-map-row");
    const mapIntro = el("div.gm-map-intro");
    const bigPosters = new Map<string, HTMLCanvasElement>();
    const randomNote = el(
      "p.gm-map-note",
      "A fresh map from the seed (under Options): every player starts with a town and a hero; neutral towns, mines, monsters and treasure lie between.",
    );
    const sizeField = el("div.gm-field", el("label", "Map size"), sizeRow);
    const playersField = el("div.gm-field", el("label", "Players"), playersRow);
    // One row per map: a poster thumbnail, its name and its own details,
    // all visible in the row, so no tooltip repeats them (bead bzc.42).
    const choices: Array<{
      id: string | null;
      label: string;
      hint: string;
      def?: NamedMapDef;
    }> = [
      { id: null, label: "Random map", hint: "Any size, 2 to 4 players" },
      ...NAMED_MAPS.map((m) => ({
        id: m.id,
        label: m.name,
        hint: `${m.players} players, ${SIZES.find((s) => s.id === m.size)?.label ?? m.size}`,
        def: m,
      })),
    ];
    const mapButtons = choices.map((c) => {
      const b = button(
        "",
        () => {
          mapId = c.id;
          renderMaps();
        },
        "gm-btn gm-map-choice",
      );
      b.append(
        c.def !== undefined
          ? posterCanvas(c.def, "gm-map-thumb")
          : el("span.gm-map-thumb.gm-map-random", "?"),
        el(
          "span.gm-map-text",
          el("span.gm-map-name", c.label),
          el("small.gm-map-hint", c.hint),
        ),
      );
      mapRow.append(b);
      return b;
    });
    const renderMaps = (): void => {
      choices.forEach((c, i) => {
        const selected = c.id === mapId;
        mapButtons[i]?.classList.toggle("gm-selected", selected);
        mapButtons[i]?.setAttribute("aria-pressed", String(selected));
      });
      const rows = randomMapRows(mapId);
      sizeField.hidden = !rows.size;
      playersField.hidden = !rows.players;
      seedField.hidden = !rows.seed;
      const def = mapId === null ? undefined : findNamedMap(mapId);
      mapIntro.hidden = def === undefined;
      randomNote.hidden = def !== undefined;
      mapIntro.replaceChildren();
      if (def !== undefined) {
        let big = bigPosters.get(def.id);
        if (big === undefined) {
          big = posterCanvas(def, "gm-map-poster-big");
          bigPosters.set(def.id, big);
        }
        mapIntro.append(
          big,
          el("p", def.intro),
          el("p.gm-map-setup", `Recommended: ${def.setup}`),
        );
      }
      renderSummary();
    };
    renderMaps();

    // ------------------------------------------------ faction column
    const wanted = playableFactions().find(
      (f) => f.id === params.get("faction"),
    );
    let faction: FactionId =
      wanted?.id ?? playableFactions()[0]?.id ?? "humans";
    const factionCards = el("div.gm-faction-cards");
    const factionDetail = el("div.gm-faction-detail");
    const cards = playableFactions().map((f) => {
      const show = factionShowcase(f.id);
      const card = button(
        "",
        () => {
          faction = f.id;
          renderFactions();
        },
        "gm-btn gm-faction-card",
      );
      card.style.setProperty("--gm-faction-colour", f.colour ?? "#6b5a3e");
      const army = el("span.gm-faction-army");
      for (const id of show.creatures) {
        const sprite = img(unitArt(id).key, "gm-faction-unit");
        sprite.alt = getCreature(id).name;
        army.append(sprite);
      }
      card.append(
        img(heroArt(show.heroClass).key, "gm-faction-hero"),
        el(
          "span.gm-faction-text",
          el("span.gm-faction-name", f.name),
          el("span.gm-faction-style", PLAY_STYLE[f.id] ?? f.blurb),
        ),
        army,
      );
      factionCards.append(card);
      return { id: f.id, card };
    });
    const wheelModel = magicWheelModel();
    const wheelButton = magicWheelButton(() => ({ faction }));
    const renderFactions = (): void => {
      for (const { id, card } of cards) {
        card.classList.toggle("gm-selected", id === faction);
        card.setAttribute("aria-pressed", String(id === faction));
      }
      const chosen = findFaction(faction);
      factionDetail.replaceChildren(
        el("p", el("b", `${chosen?.name ?? ""}. `), chosen?.blurb ?? ""),
      );
      if (chosen?.birthright !== undefined) {
        factionDetail.append(
          el(
            "p.gm-faction-birthright",
            el("b", `Birthright, ${chosen.birthright.name}: `),
            chosen.birthright.text,
          ),
        );
      }
      // Its magic in one line and the wheel (bead bzc.100).
      const magic = wheelModel.factions.find((f) => f.id === faction);
      if (magic !== undefined && magic.magical) {
        const row = el(
          "p.gm-faction-magic",
          el("b", "Magic: "),
          magic.schools
            .map(
              (s) =>
                `${wheelModel.schools.find((x) => x.id === s)?.name ?? s} ${magic.weights[s]}`,
            )
            .join(", "),
          `; guild to level ${magic.guildCap}. `,
        );
        row.append(wheelButton);
        factionDetail.append(row);
      }
    };
    renderFactions();

    // ------------------------------------------------ status, start
    const status = el("div.gm-menu-status");
    status.setAttribute("role", "status");
    const read = readSave(browserStorage());
    const saved = read.kind === "ok" ? read.state : null;
    if (read.kind === "rejected") {
      status.textContent = `${read.message} Start a new game.`;
    } else if (read.kind === "ok" && read.upgraded) {
      status.textContent = "An older saved game was upgraded.";
    }

    const start = async (make: () => GameState): Promise<void> => {
      status.textContent = "Preparing the marches...";
      root.classList.add("gm-loading");
      await wait(30); // let the status paint
      try {
        const state = make();
        await loadGameMapAssets();
        root.remove();
        resolve(state);
      } catch (error) {
        console.error(error);
        status.textContent = `Could not start: ${String(error)}`;
        root.classList.remove("gm-loading");
      }
    };

    // Continue is the first, gold button when a save exists and absent
    // otherwise; then New game is the gold one (UI_V2, UI2-16).
    const newButton = button(
      "New game",
      () => {
        const raw = seedInput.value.trim();
        const seed = /^\d+$/.test(raw) ? Number(raw) >>> 0 : randomSeed();
        void start(() => {
          const state = createGame({
            seed,
            size,
            players,
            faction,
            difficulty,
            ...(mapId !== null ? { map: mapId } : {}),
          });
          saveGame(browserStorage(), state);
          return state;
        });
      },
      saved === null
        ? "gm-btn gm-primary gm-menu-main gm-menu-new"
        : "gm-btn gm-menu-main gm-menu-new",
    );
    const continueButton =
      saved === null
        ? null
        : button(
            `Continue (day ${saved.day})`,
            () => void start(() => saved),
            "gm-btn gm-primary gm-menu-main gm-menu-continue",
          );

    // The gallery (bead 3nb): every sprite and card of the game, in tabs.
    const galleryButton = button(
      "Gallery",
      () => void openGalleryFromMenu(),
      "gm-btn gm-menu-gallery",
    );
    setTip(
      galleryButton,
      "Every creature, hero, spell, artifact, skill, map object and building, with its sprites and full card.",
    );
    const openGalleryFromMenu = async (tab?: string | null): Promise<void> => {
      const { openGallery } = await import("./gallery.ts");
      const { isGalleryTab } = await import("./gallery-data.ts");
      root.hidden = true;
      try {
        const wantedTab = tab ?? null;
        await openGallery(
          host,
          isGalleryTab(wantedTab) ? wantedTab : undefined,
        );
      } finally {
        root.hidden = false;
        galleryButton.focus();
      }
    };

    const options = el(
      "details.gm-options",
      el("summary", el("span.gm-options-label", "Options"), optionsSummary),
      el(
        "div.gm-options-body",
        el(
          "div.gm-options-col",
          el("div.gm-field", el("label", "Computer"), difficultyRow),
          difficultyBlurb,
        ),
        el("div.gm-options-col", seedField),
      ),
    );

    const you = el("span.gm-turn-chip");
    you.style.background = playerColour(0).hex;

    root.append(
      el(
        "div.gm-menu-box",
        el(
          "header.gm-menu-head",
          el(
            "div.gm-menu-titles",
            el("h1.gm-title", "Border Marches"),
            el(
              "p.gm-subtitle",
              "Raise an army, claim the marches and outlast every rival.",
            ),
          ),
          el("div.gm-menu-actions", continueButton, galleryButton),
        ),
        el(
          "section.gm-new",
          el(
            "div.gm-new-cols",
            el(
              "div.gm-new-col.gm-new-map",
              el("h2", "Choose a map"),
              mapRow,
              mapIntro,
              sizeField,
              playersField,
              randomNote,
            ),
            el(
              "div.gm-new-col.gm-new-faction",
              el("h2", you, "Choose your faction"),
              factionCards,
            ),
            // Under the map column on a wide screen, so five faction cards
            // and the New game bar fit 800 px (bead bzc.135); after the
            // cards when the columns stack.
            factionDetail,
          ),
          el("div.gm-new-bar", options, status, newButton),
        ),
        el(
          "footer.gm-menu-foot",
          soundControl(),
          el(
            "div.gm-keys",
            "Click a cell to plan a path, click again or ",
            kbd("Space"),
            " to walk. ",
            kbd("E"),
            " end turn, ",
            kbd("H"),
            " next hero, ",
            kbd("T"),
            " town, ",
            kbd("?"),
            " all keys.",
          ),
        ),
      ),
    );
    host.append(root);
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") newButton.click();
    });
    if (autostart) {
      newButton.click();
      return;
    }
    if (params.has("gallery")) {
      const tab = params.get("gallery");
      params.delete("gallery"); // once: not again after a game
      void openGalleryFromMenu(tab);
    }
    // Posters: one named map per tick once the menu has painted.
    NAMED_MAPS.forEach((def, i) => {
      setTimeout(
        () => {
          if (!root.isConnected) return;
          const data = namedMapPoster(def);
          if (data === null) return;
          for (const c of posterCanvases.get(def.id) ?? []) {
            paintPoster(c, data);
          }
        },
        120 + i * 80,
      );
    });
  });
}

/** Menu, game, menu, ... */
export async function startGameApp(params: URLSearchParams): Promise<void> {
  const canvas = document.getElementById("game");
  if (canvas !== null) canvas.style.display = "none";
  installUiSounds();
  installTooltips();
  installMagicWheel();
  for (;;) {
    const state = await mainMenu(params);
    params.delete("autostart");
    await playGame(state);
  }
}
