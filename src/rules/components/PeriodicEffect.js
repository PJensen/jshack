import { defineComponent } from "../../lib/ecs-js/index.js";

// Each operation has its own cadence and magnitude beneath an effect instance.
export const PeriodicEffect = defineComponent("PeriodicEffect", {
  operation: "",
  amount: 0,
  baseAmount: 0,
  interval: 1,
  ticksLeft: 1,
  damageType: "generic",
});
