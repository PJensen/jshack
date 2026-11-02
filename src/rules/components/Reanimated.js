import { defineComponent } from "../../lib/ecs-js/index.js";

/** Marks a temporary ally raised from a corpse; its death must not create food. */
export const Reanimated = defineComponent("Reanimated", {
  sourceIdentity: "",
});
