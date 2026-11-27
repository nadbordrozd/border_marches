/**
 * Registers the battle content of the v0.2 factions (abilities, condition
 * kinds, acts and effects) in the battle registries: the Realm, the
 * Restless, the Goblin Horde and the Candy Kingdom. Imported for its side
 * effect by src/core/battle/index.ts.
 */

import { registerCandy } from "./candy.ts";
import { registerStampede } from "./common.ts";
import { registerGoblins } from "./goblins.ts";
import { registerHumans } from "./humans.ts";
import { registerUndead } from "./undead.ts";

registerStampede();
registerHumans();
registerUndead();
registerGoblins();
registerCandy();

export { commandC } from "./common.ts";
export { CHAPEL_OF_OATHS } from "./humans.ts";
export { LAUNCH_RAMP, lineDirection } from "./goblins.ts";
export { reelInLimits } from "./candy.ts";
