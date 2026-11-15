import { defineComponent } from "../../lib/ecs-js/index.js";

export const CritRandomizerState = defineComponent("CritRandomizerState", {
  physicalChance: -1,
  physicalCritsRemaining: 0,
  physicalNonCritsRemaining: 0,
  spellChance: -1,
  spellCritsRemaining: 0,
  spellNonCritsRemaining: 0,
});
