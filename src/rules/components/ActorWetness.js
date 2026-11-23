import { defineComponent } from "../../lib/ecs-js/index.js";

export const ActorWetness = defineComponent("ActorWetness", {
  amount: 0,
  appliedAtStep: 0,
  dryAtStep: 0,
});
