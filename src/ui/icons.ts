/**
 * Content icons in the interface (bead border_marches-bzc.17): an <img> of
 * {@link iconFor}'s asset inside a span that draws the frame in CSS
 * (`.gm-icon` in game.css; docs/art/classes/icons.md "Frames"). The frame
 * is code, never part of the art.
 */
import { assetUrl } from "../assets/manifest.ts";
import { iconFor, type IconKind } from "../assets/icons.ts";
import { el } from "./dom.ts";

export interface IconOptions {
  /** Integer display scale (default 1). */
  readonly scale?: number;
  /** Draw the content's frame (default true; unframed kinds have none). */
  readonly framed?: boolean;
  /** 16 for the overlay variant where one exists (conditions). */
  readonly size?: 16 | 32;
  readonly className?: string;
}

/**
 * A framed icon element for a content id or catalogue name; unknown ids
 * show their kind's fallback. The name is the element's title and alt.
 */
export function iconElement(
  kind: IconKind,
  idOrName: string,
  options: IconOptions = {},
): HTMLElement {
  const ref = iconFor(kind, idOrName, options.size ?? 32);
  const scale = Math.max(1, Math.round(options.scale ?? 1));
  const image = el("img");
  image.src = assetUrl(ref.asset, import.meta.env.BASE_URL);
  image.width = ref.asset.w * scale;
  image.height = ref.asset.h * scale;
  image.alt = ref.name;
  image.draggable = false;
  const box = el(
    `span.gm-icon${options.className ? `.${options.className}` : ""}`,
    image,
  );
  box.title = ref.name;
  box.dataset["kind"] = kind;
  box.dataset["id"] = ref.id;
  if (ref.fallback) box.dataset["fallback"] = "true";
  if (ref.frame !== null && options.framed !== false) {
    box.classList.add("gm-icon-framed");
    box.style.setProperty("--icon-frame", ref.frame.colour);
    box.style.setProperty("--icon-shadow", ref.frame.shadow);
    box.style.setProperty("--icon-light", ref.frame.light);
    box.style.setProperty("--icon-px", `${scale}px`);
  }
  return box;
}
