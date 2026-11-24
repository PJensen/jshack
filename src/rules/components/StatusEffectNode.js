import { defineComponent } from "../../lib/ecs-js/index.js";

/**
 * StatusEffectNode marks an attached runtime status effect.
 *
 * Preferred topology:
 * actor -> StatusEffectNode -> optional proc/stat/source child nodes.
 */
export const StatusEffectNode = defineComponent("StatusEffectNode", {
  key: "",
  stacks: 1,
  potency: 1,
  meta: null,
});
