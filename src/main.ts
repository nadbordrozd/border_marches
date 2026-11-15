import "./style.css";
import { parseRoute } from "./router.ts";

const TITLE = "Border Marches";

function getCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('index.html must contain <canvas id="game">');
  }
  return canvas;
}

function showError(error: unknown): void {
  console.error(error);
  const box = document.createElement("pre");
  box.style.cssText =
    "position:fixed;inset:0;margin:0;padding:24px;color:#f0e6c8;background:#1b1712;font:13px monospace;white-space:pre-wrap";
  box.textContent = `${TITLE} could not start:\n\n${String(error)}`;
  document.body.append(box);
}

function start(): void {
  const route = parseRoute(window.location.search);
  document.title = TITLE;
  if (route.view === "map") {
    void import("./render/map/debug-page.ts")
      .then((m) => m.startMapDebug(getCanvas(), route))
      .catch(showError);
    return;
  }
  if (route.view === "battle") {
    void import("./ui/battle/debug.ts")
      .then((m) => m.startBattleDebug(route))
      .catch(showError);
    return;
  }
  void import("./ui/app.ts")
    .then((m) => m.startGameApp(route.params))
    .catch(showError);
}

start();
