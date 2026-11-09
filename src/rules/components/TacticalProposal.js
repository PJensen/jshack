import { defineComponent } from "../../lib/ecs-js/index.js";

/**
 * A transient tactical candidate owned by the actor it proposes for.
 * Arbitration consumes these entities and writes one TacticalIntent on the
 * actor, so competing producers never overwrite the selected objective.
 */
export const TacticalProposal = defineComponent("TacticalProposal", {
  kind: "",
  source: "",
  priority: 0,
  targetId: 0,
  targetX: 0,
  targetY: 0,
  dx: 0,
  dy: 0,
  expiresAtStep: 0,
}, {
  validate(rec) {
    return typeof rec.kind === "string"
      && typeof rec.source === "string"
      && Number.isInteger(rec.priority)
      && Number.isInteger(rec.targetId)
      && Number.isInteger(rec.targetX)
      && Number.isInteger(rec.targetY)
      && Number.isInteger(rec.dx)
      && Number.isInteger(rec.dy)
      && Number.isInteger(rec.expiresAtStep);
  },
});
