import { defineComponent } from "../../lib/ecs-js/index.js";

// Lifecycle state belongs to the applied package, independent of its source item.
export const EffectInstance = defineComponent("EffectInstance", {
  definitionId: "",
  sourceActorId: 0,
  appliedAt: 0,
  processedAt: -1,
  permanent: false,
});
