// One-off: creates the icon sets (bead border_marches-bzc.17). Kept for the record.
import fs from "node:fs";

const families = {
  "icons-spells": "Spell symbols: 50 battle and 10 adventure spells, plus the five school emblems.",
  "icons-artifacts": "Artifact items: 30 Trinkets, 20 Wonders, 6 cursed Wonders, 12 Marvel pieces, 4 assembled Marvels, 12 consumables.",
  "icons-conditions": "Condition and ground symbols for battle overlays: 25 condition kinds and 7 ground kinds.",
  "icons-heroes": "Hero symbols: 24 secondary skills, the four primary stats, feats and vows.",
};
for (const [set, what] of Object.entries(families)) {
  const dir = `art/sets/${set}`;
  if (fs.existsSync(`${dir}/recipes.json`)) continue;
  fs.mkdirSync(dir, { recursive: true });
  const doc = {
    set,
    bead: "border_marches-bzc.17",
    class: "icons",
    exploration: false,
    _doc: `${what} 32x32 symbols on a transparent background, docs/art/classes/icons.md. One generate-image-v2 call at 32x32 returns 64 candidates of a mixed subject ("each image a different one of these"); the best take per subject is accepted. Frames (school, grade) are drawn by code, never baked. Never downscaled or mirrored. Recipes are never edited after generation: add a new id (new seed) instead.`,
    shared: {},
    defaults: { endpoint: "generate-image-v2", fragments: ["style", "light-bottom-left", "class-symbol-32"], noBackground: true },
    recipes: [],
    outputs: [],
  };
  fs.writeFileSync(`${dir}/recipes.json`, `${JSON.stringify(doc, null, 2)}\n`);
}
