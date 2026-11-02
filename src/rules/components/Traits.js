import { defineComponent } from "../../lib/ecs-js/index.js";

export const Traits = defineComponent('Traits', {
  feline: false,
  ambidextrous: false,
  gluttonous: false,
  iron_stomach: false,
  ratCorpsesEaten: 0,
  // Deathless: eat 3 wight corpses → permanent slow regen
  wightCorpsesEaten: 0,
  deathless: false,
  // Third Eye: survive floating_eye mindwipe → sense enemies through walls
  third_eye: false,
  // Demon Fire: eat demon corpse (40%) → +1 fire bonus damage on melee
  demon_fire: false,
  // Dragonheart: eat dragon corpse → big fire resist nudge
  dragonheart: false,
  // Polymorph Control: choose which creature the target becomes
  polymorph_control: false,
});
