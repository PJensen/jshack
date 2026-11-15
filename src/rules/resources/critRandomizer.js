import { defineWorldResource } from "../../lib/ecs-js/index.js";

/**
 * Runtime-only crit bag state, keyed by actor entity ID.
 *
 * The bag tracks combat history, not character data, so it intentionally does
 * not belong on an actor component or in saved world state.
 */
export const CritRandomizerResource = defineWorldResource(
  "jshack:critRandomizer",
  {
    create: () => new Map(),
    reset: (state) => {
      state.clear();
    },
  },
);
