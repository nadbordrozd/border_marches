/**
 * The game route: main menu with the new-game setup (a random map by seed
 * and size with two to four players, or a named map; the human's faction)
 * and Continue when a save exists, then the adventure screen until the
 * game ends or the player quits back to the menu.
 */
import { newGame } from "../core/game/index.ts";
import type { GameState, PlayerSetup } from "../core/game/index.ts";
import { FACTIONS, playableFactions } from "../data/factions.ts";
import {
  HERO_ROSTER,
  MAX_PLAYERS,
  MIN_PLAYERS,
  playerColour,
} from "../data/players.ts";
import { heroArt } from "../assets/unit-art.ts";
import type { FactionId } from "../data/types.ts";
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
 * (so a three-player game has all three factions).
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

/** Shows the main menu until a game is started or continued. */
function mainMenu(params: URLSearchParams): Promise<GameState> {
  return new Promise((resolve) => {
    const host = document.getElementById("ui") ?? document.body;
    const root = el("div.gm-menu");
    let size: MapSize =
      params.get("size") === "S" || params.get("size") === "L"
        ? (params.get("size") as MapSize)
        : "M";
    const seedInput = el("input.gm-seed");
    seedInput.type = "text";
    seedInput.inputMode = "numeric";
    const seedParam = params.get("seed");
    seedInput.value =
      seedParam !== null && /^\d+$/.test(seedParam)
        ? seedParam
        : String(randomSeed());
    seedInput.setAttribute("aria-label", "Map seed");
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
        b.title = `You and ${n - 1} computer ${n === 2 ? "player" : "players"}`;
        playersRow.append(b);
      }
    };
    renderPlayers();
    const wanted = playableFactions().find(
      (f) => f.id === params.get("faction"),
    );
    let faction: FactionId =
      wanted?.id ?? playableFactions()[0]?.id ?? "humans";
    const factionRow = el("div.gm-faction-row");
    const blurb = el("p.gm-faction-blurb");
    const heroBox = el("div.gm-menu-hero-box");
    const renderFactions = (): void => {
      factionRow.replaceChildren();
      const chosen = FACTIONS.find((x) => x.id === faction);
      blurb.textContent = chosen?.blurb ?? "";
      const hero = HERO_ROSTER.find((h) => h.faction === faction);
      heroBox.replaceChildren(
        img(
          hero !== undefined
            ? heroArt(hero.heroClass).key
            : "dinosaur-chieftain",
          "gm-menu-hero",
          2,
        ),
      );
      for (const f of FACTIONS.filter((x) => x.available)) {
        const b = button(
          f.name,
          () => {
            if (!f.available) return;
            faction = f.id;
            renderFactions();
          },
          "gm-btn gm-faction",
        );
        const chip = el("span.gm-town-chip");
        chip.style.background = f.colour ?? "#6b5a3e";
        b.prepend(chip);
        setTip(b, f.blurb);
        if (!f.available) {
          b.disabled = true;
          b.append(el("small.gm-soon", "soon"));
        }
        if (f.id === faction) b.classList.add("gm-selected");
        factionRow.append(b);
      }
    };
    renderFactions();

    // Map: a random map from the fields below, or a named map.
    let mapId: string | null =
      findNamedMap(params.get("map") ?? "")?.id ?? null;
    const mapRow = el("div.gm-map-row");
    const mapIntro = el("div.gm-map-intro");
    const sizeField = el("div.gm-field", el("label", "Map size"), sizeRow);
    const playersField = el("div.gm-field", el("label", "Players"), playersRow);
    const seedRow = el("div.gm-seed-row", seedInput);
    const seedField = el("div.gm-field", el("label", "Seed"), seedRow);
    const renderMaps = (): void => {
      mapRow.replaceChildren();
      const choices: Array<{ id: string | null; label: string; hint: string }> =
        [
          {
            id: null,
            label: "Random map",
            hint: "Any size, 2 to 4 players",
          },
          ...NAMED_MAPS.map((m) => ({
            id: m.id,
            label: m.name,
            hint: `${m.players} players, ${SIZES.find((s) => s.id === m.size)?.label ?? m.size}`,
          })),
        ];
      for (const c of choices) {
        const b = button(
          "",
          () => {
            mapId = c.id;
            renderMaps();
          },
          "gm-btn gm-map",
        );
        b.append(el("span.gm-map-name", c.label), el("small", c.hint));
        b.title = c.hint;
        if (c.id === mapId) b.classList.add("gm-selected");
        mapRow.append(b);
      }
      const def = mapId === null ? undefined : findNamedMap(mapId);
      for (const f of [sizeField, playersField, seedField]) {
        f.hidden = def !== undefined;
      }
      mapIntro.hidden = def === undefined;
      mapIntro.replaceChildren();
      if (def !== undefined) {
        mapIntro.append(
          el("p", def.intro),
          el("p.gm-map-setup", `Recommended: ${def.setup}`),
        );
      }
    };
    renderMaps();

    const you = el("span.gm-turn-chip");
    you.style.background = playerColour(0).hex;
    const status = el("div.gm-menu-status");
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
            ...(mapId !== null ? { map: mapId } : {}),
          });
          saveGame(browserStorage(), state);
          return state;
        });
      },
      "gm-btn gm-primary gm-menu-main",
    );
    const continueButton = button(
      saved === null ? "Continue" : `Continue (day ${saved.day})`,
      () => {
        if (saved !== null) void start(() => saved);
      },
      "gm-btn gm-menu-main",
    );
    continueButton.disabled = saved === null;

    const reroll = button("Random", () => {
      seedInput.value = String(randomSeed());
    });
    seedRow.append(reroll);

    root.append(
      el(
        "div.gm-menu-box",
        heroBox,
        el("h1.gm-title", "Border Marches"),
        el(
          "p.gm-subtitle",
          "Raise an army, claim the marches and outlast every rival.",
        ),
        continueButton,
        el(
          "div.gm-new",
          el("h2", "New game"),
          el("div.gm-field", el("label", "Map"), mapRow),
          mapIntro,
          sizeField,
          playersField,
          el("div.gm-field", el("label", you, "Your faction"), factionRow),
          blurb,
          seedField,
          newButton,
        ),
        status,
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
    );
    host.append(root);
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") newButton.click();
    });
    if (params.get("autostart") === "1") newButton.click();
  });
}

/** Menu, game, menu, ... */
export async function startGameApp(params: URLSearchParams): Promise<void> {
  const canvas = document.getElementById("game");
  if (canvas !== null) canvas.style.display = "none";
  installUiSounds();
  installTooltips();
  for (;;) {
    const state = await mainMenu(params);
    params.delete("autostart");
    await playGame(state);
  }
}
