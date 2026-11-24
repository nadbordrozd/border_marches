/**
 * Registers the battle content of the three v0.2 factions (abilities,
 * condition kinds, acts and effects) in the battle registries. Imported
 * for its side effect by src/core/battle/index.ts.
 */

import { registerStampede } from "./common.ts";
import { registerGoblins } from "./goblins.ts";
import { registerHumans } from "./humans.ts";
import { registerUndead } from "./undead.ts";

registerStampede();
registerHumans();
registerUndead();
registerGoblins();

export { commandC } from "./common.ts";
export { CHAPEL_OF_OATHS } from "./humans.ts";
export { LAUNCH_RAMP, lineDirection } from "./goblins.ts";
