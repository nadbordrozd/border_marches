/**
 * The game route: main menu with the new-game setup (map seed and size,
 * two to four players, the human's faction) and Continue when a save
 * exists, then the adventure screen until the game ends or the player
 * quits back to the menu.
 */
import { newGame } from "../core/game/index.ts";
import type { GameState, PlayerSetup } from "../core/game/index.ts";
import { FACTIONS, playableFactions } from "../data/factions.ts";
import { MAX_PLAYERS, MIN_PLAYERS, playerColour } from "../data/players.ts";
import type { FactionId } from "../data/types.ts";
import { generateMap } from "../core/map/generate.ts";
import type { MapSize, PlayerCount } from "../core/map/generate.ts";
import { button, el, img, wait } from "./dom.ts";
import { playGame } from "./game.ts";
import { loadGameMapAssets } from "./hero-sprite.ts";
import { browserStorage, readSave, saveGame } from "./save.ts";
import { installUiSounds, soundControl } from "./sound-control.ts";
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
}

/**
 * The players of a new game: the human first with its faction, then AI
 * players. Until the faction bead adds more, every AI plays the first
 * playable faction (the Lost World).
 */
export function playerSetups(setup: GameSetup): PlayerSetup[] {
  const aiFaction = playableFactions()[0]?.id ?? "lost-world";
  return Array.from({ length: setup.players }, (_, i) => ({
    kind: i === 0 ? "human" : "ai",
    faction: i === 0 ? setup.faction : aiFaction,
  }));
}

/**
 * Generates a map with one start per player (every start active, so each
 * has its town and hero; bead bzc.3) and the initial state for a new game.
 */
export function createGame(setup: GameSetup): GameState {
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
    let faction: FactionId = playableFactions()[0]?.id ?? "lost-world";
    const factionRow = el("div.gm-faction-row");
    const renderFactions = (): void => {
      factionRow.replaceChildren();
      for (const f of FACTIONS) {
        const b = button(
          f.name,
          () => {
            if (!f.available) return;
            faction = f.id;
            renderFactions();
          },
          "gm-btn gm-faction",
        );
        b.title = f.blurb;
        if (!f.available) {
          b.disabled = true;
          b.append(el("small.gm-soon", "soon"));
        }
        if (f.id === faction) b.classList.add("gm-selected");
        factionRow.append(b);
      }
    };
    renderFactions();
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
          const state = createGame({ seed, size, players, faction });
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

    root.append(
      el(
        "div.gm-menu-box",
        img("dinosaur-chieftain", "gm-menu-hero", 2),
        el("h1.gm-title", "Border Marches"),
        el(
          "p.gm-subtitle",
          "Lead your tribe across the marches and outlast every rival.",
        ),
        continueButton,
        el(
          "div.gm-new",
          el("h2", "New game"),
          el("div.gm-field", el("label", "Map size"), sizeRow),
          el("div.gm-field", el("label", "Players"), playersRow),
          el("div.gm-field", el("label", you, "Your faction"), factionRow),
          el(
            "div.gm-field",
            el("label", "Seed"),
            el("div.gm-seed-row", seedInput, reroll),
          ),
          newButton,
        ),
        status,
        soundControl(),
        el(
          "div.gm-keys",
          "Click a cell to plan a path, click again (or Space) to walk. E end turn, H next hero, K kingdom, T town, arrows pan, +/- zoom.",
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
  for (;;) {
    const state = await mainMenu(params);
    params.delete("autostart");
    await playGame(state);
  }
}
