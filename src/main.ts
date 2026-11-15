import "./style.css";
import { parseRoute } from "./router.ts";
import type { Route } from "./router.ts";
import { startMapDebug } from "./render/map/debug-page.ts";

const TITLE = "Border Marches";

function getCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("game");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('index.html must contain <canvas id="game">');
  }
  return canvas;
}

/** Placeholder screen until the map, battle and game screens exist. */
function drawPlaceholder(canvas: HTMLCanvasElement, route: Route): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#1b1712";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e8c77a";
  ctx.font = "bold 48px Georgia, serif";
  ctx.fillText(TITLE, w / 2, h / 2 - 16);
  ctx.fillStyle = "#a89a80";
  ctx.font = "16px Georgia, serif";
  const seed = route.seed === null ? "" : `, seed ${route.seed}`;
  ctx.fillText(`view: ${route.view}${seed}`, w / 2, h / 2 + 32);
}

function start(): void {
  const canvas = getCanvas();
  const route = parseRoute(window.location.search);
  document.title = TITLE;
  if (route.view === "map") {
    startMapDebug(canvas, route).catch((error: unknown) => {
      console.error(error);
      drawPlaceholder(canvas, route);
    });
    return;
  }
  if (route.view === "battle") {
    void import("./ui/battle/debug.ts").then((m) => m.startBattleDebug(route));
    return;
  }
  const redraw = (): void => drawPlaceholder(canvas, route);
  window.addEventListener("resize", redraw);
  redraw();
}

start();
