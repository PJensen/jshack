import { aiChaseSystem as proposeChase } from "../../src/rules/systems/aiChaseSystem.js";
import { tacticalArbitrationSystem } from "../../src/rules/systems/tacticalArbitrationSystem.js";
import { tacticalIntentSystem } from "../../src/rules/systems/tacticalIntentSystem.js";

export function aiChaseSystem(world) {
  proposeChase(world);
  tacticalArbitrationSystem(world);
  tacticalIntentSystem(world);
}
