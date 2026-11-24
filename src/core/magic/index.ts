/**
 * Magic content (RULES_V2.md 2, CONTENT_SPELLS.md): battle spells as cast
 * acts, their condition and ground kinds, summoned creatures, the hero
 * magic adapter, magic guilds and adventure spells.
 *
 * Call {@link registerSpells} (idempotent) before a battle that may cast.
 */

export * from "./kinds.ts";
export * from "./spells.ts";
export * from "./targets.ts";
export * from "./catalog.ts";
export * from "./hero.ts";
export * from "./guild.ts";
export * from "./adventure.ts";
