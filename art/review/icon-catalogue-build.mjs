// Builds src/assets/icon-catalogue.json from the content documents
// (bead border_marches-bzc.17): every content id that has, or should have,
// an icon, with its display name and its frame. Re-run when the catalogue
// documents change; tests/assets/icons.test.ts checks the result.
//
//   node art/review/icon-catalogue-build.mjs && npx prettier --write src/assets/icon-catalogue.json
import fs from "node:fs";

const read = (file) => fs.readFileSync(`docs/design/${file}`, "utf8").split("\n");

/** Kebab-case id of a catalogue name; must match contentId() in src/assets/icons.ts. */
export function contentId(name) {
  return name
    .toLowerCase()
    .replace(/\(cursed\)/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Bold first cells of the table rows between two line indexes. */
function rows(lines, from, to) {
  const out = [];
  for (const line of lines.slice(from, to)) {
    const match = /^\| \*\*(.+?)\*\*(.*?)\|(.*)$/.exec(line);
    if (match) out.push({ name: match[1].trim(), suffix: match[2].trim(), cells: match[3].split("|").map((c) => c.trim()) });
  }
  return out;
}
const at = (lines, heading) => {
  const i = lines.findIndex((l) => l.startsWith(heading));
  if (i < 0) throw new Error(`no heading ${heading}`);
  return i;
};
const school = (s) => s.toLowerCase();

const catalogue = { spell: {}, artifact: {}, condition: {}, ground: {}, skill: {}, feat: {}, vow: {}, stat: {}, school: {} };
const add = (kind, name, frame, extra = {}) => {
  const id = contentId(name);
  if (catalogue[kind][id]) throw new Error(`duplicate ${kind} ${id}`);
  catalogue[kind][id] = { name, frame, ...extra };
};

// Spells, conditions, ground.
const spells = read("CONTENT_SPELLS.md");
for (const s of ["Bloom", "Accord", "Clock", "Hush", "Storm"]) {
  const from = at(spells, `### 3.${["Bloom", "Accord", "Clock", "Hush", "Storm"].indexOf(s) + 1} ${s}`);
  for (const r of rows(spells, from, from + 30).slice(0, 10)) add("spell", r.name, school(s), { school: school(s), tier: Number(r.cells[0]) });
}
const adv = at(spells, "## 4. Adventure spells");
for (const r of rows(spells, adv, adv + 30)) add("spell", r.name, school(r.cells[0]), { school: school(r.cells[0]), tier: Number(r.cells[1]), adventure: true });
const cond = at(spells, "### 2.1 Conditions");
for (const r of rows(spells, cond, at(spells, "### 2.2 Ground"))) add("condition", r.name, school(r.cells[0]), { school: school(r.cells[0]), polarity: r.cells[1] });
const ground = at(spells, "### 2.2 Ground");
for (const r of rows(spells, ground, at(spells, "### 2.3 Makers"))) {
  const s = r.cells[1] === "-" ? null : school(r.cells[1]);
  add("ground", r.name, s, { school: s, class: r.cells[0] });
}

// Skills, feats, vows.
const heroes = read("CONTENT_HEROES.md");
for (const r of rows(heroes, at(heroes, "### School skills"), at(heroes, "### Army skills"))) add("skill", r.name, school(r.cells[0]), { school: school(r.cells[0]), group: "school" });
for (const r of rows(heroes, at(heroes, "### Army skills"), at(heroes, "### Journey skills"))) add("skill", r.name, "skill", { group: "army" });
for (const r of rows(heroes, at(heroes, "### Journey skills"), at(heroes, "## 2. Feats"))) add("skill", r.name, "skill", { group: "journey" });
for (const r of rows(heroes, at(heroes, "## 2. Feats"), at(heroes, "## 3. Vows"))) add("feat", r.name, "feat");
for (const r of rows(heroes, at(heroes, "## 3. Vows"), at(heroes, "## 4. Specialties"))) add("vow", r.name, "vow");

// Artifacts.
const arts = read("CONTENT_ARTIFACTS.md");
const section = (a, b, grade) => {
  for (const r of rows(arts, at(arts, a), at(arts, b))) add("artifact", r.name, r.suffix.includes("cursed") ? "cursed" : grade, { grade: r.suffix.includes("cursed") ? "cursed" : grade, slot: r.cells[0] });
};
section("## 2. Trinkets", "## 3. Wonders", "trinket");
section("## 3. Wonders", "## 4. Cursed Wonders", "wonder");
section("## 4. Cursed Wonders", "## 5. Marvels", "cursed");
section("## 5. Marvels", "## 6. Consumables", "piece");
section("## 6. Consumables", "### 6.1", "consumable");
for (const line of arts.slice(at(arts, "## 5. Marvels"), at(arts, "## 6. Consumables"))) {
  const match = /^### (.+)$/.exec(line);
  if (match) add("artifact", match[1].trim(), "marvel", { grade: "marvel", slot: null });
}

// Content outside those tables (bead border_marches-9is), by its game id:
// the Realm's two conditions (FACTION_HUMANS), the demo Guarded condition
// of the battle grammar view (src/ui/battle/debug.ts), the Sweets remains
// (RULES_V2) and the Keystone relic (CONTENT_MAP_OBJECTS 4), framed like
// the Marvels as the hero screen colours it.
const addId = (kind, id, name, frame, extra = {}) => {
  if (catalogue[kind][id]) throw new Error(`duplicate ${kind} ${id}`);
  catalogue[kind][id] = { name, frame, ...extra };
};
addId("condition", "sworn", "Sworn", "accord", { school: "accord", polarity: "boon" });
addId("condition", "challenged", "Challenged", "accord", { school: "accord", polarity: "bane" });
addId("condition", "demo-guard", "Guarded", "accord", { school: "accord", polarity: "boon", demo: true });
addId("ground", "sweets", "sweets", null, { school: null, class: "remains" });
addId("artifact", "keystone", "The Keystone", "marvel", { grade: "marvel", slot: null, relic: true });

// Bead bzc.82: the hero screen's other numbers, each an icon (HoMM2 style).
for (const s of ["Attack", "Defense", "Power", "Lore", "Mana", "Movement", "Experience", "Level", "Sight", "Morale", "Luck", "Command", "Spellbook", "Scroll case"]) add("stat", s, null);
for (const s of ["Bloom", "Accord", "Clock", "Hush", "Storm"]) add("school", s, school(s));

const counts = Object.fromEntries(Object.entries(catalogue).map(([k, v]) => [k, Object.keys(v).length]));
fs.writeFileSync("src/assets/icon-catalogue.json", `${JSON.stringify(catalogue, null, 1)}\n`);
console.log(counts);
