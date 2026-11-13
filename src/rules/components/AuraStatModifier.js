import { defineComponent } from "../../lib/ecs-js/index.js";

/** Runtime combat contribution owned by one aura field and one recipient. */
export const AuraStatModifier = defineComponent("AuraStatModifier", {
  auraId: 0,
  sourceId: 0,
  stat: "",
  amount: 0,
  key: "",
});
