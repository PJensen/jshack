import { defineComponent } from "../../lib/ecs-js/index.js";

/**
 * Duration stores turn-based lifetime for an attached runtime node.
 * `turnsLeft: Infinity` is the canonical non-expiring duration.
 */
export const Duration = defineComponent("Duration", {
  turnsLeft: 0,
  onsetLeft: 0,
  maxTurns: 0,
  startedAtTurn: 0,
});
