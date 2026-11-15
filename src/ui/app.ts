/**
 * The game route: main menu (New Game with map size and seed, Continue when
 * a save exists), then the adventure screen until the game ends or the
 * player quits back to the menu.
 */
import { newGame } from "../core/game/index.ts";
import type { GameState } from "../core/game/index.ts";
import { generateMap } from "../core/map/generate.ts";
import type { MapSize } from "../core/map/generate.ts";
import { button, el, img, wait } from "./dom.ts";
import { playGame } from "./game.ts";
import { loadGameMapAssets } from "./hero-sprite.ts";
import { browserStorage, loadGame, saveGame } from "./save.ts";
import "./game.css";

const SIZES: ReadonlyArray<{ id: MapSize; label: string }> = [
  { id: "S", label: "Small 36x36" },
  { id: "M", label: "Medium 48x48" },
  { id: "L", label: "Large 72x72" },
];

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** Generates a map and the initial state for a new game. */
export function createGame(seed: number, size: MapSize): GameState {
  return newGame(generateMap(seed, { size }));
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
    const status = el("div.gm-menu-status");
    const saved = loadGame(browserStorage());

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
          const state = createGame(seed, size);
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
          "Lead the Lost World tribe across the marches and take the Warlord's Hold.",
        ),
        continueButton,
        el(
          "div.gm-new",
          el("h2", "New game"),
          el("div.gm-field", el("label", "Map size"), sizeRow),
          el(
            "div.gm-field",
            el("label", "Seed"),
            el("div.gm-seed-row", seedInput, reroll),
          ),
          newButton,
        ),
        status,
        el(
          "div.gm-keys",
          "Click a cell to plan a path, click again (or Space) to walk. E end turn, H hero, T town, arrows pan, +/- zoom.",
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
  for (;;) {
    const state = await mainMenu(params);
    params.delete("autostart");
    await playGame(state);
  }
}
