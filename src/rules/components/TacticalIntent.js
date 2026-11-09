import { defineComponent } from "../../lib/ecs-js/index.js";

export const TACTICAL_KINDS = Object.freeze({
  flank: "flank",
  hold: "hold",
  kite: "kite",
  pursue: "pursue",
  retreat: "retreat",
  rally: "rally",
});

export const TACTICAL_SOURCES = Object.freeze({
  chase: "chase",
  policy: "policy",
});

/**
 * TacticalIntent is the authoritative objective for one AI actor this turn.
 * It is resolved into canonical action intents by tacticalIntentSystem.
 *
 * A missing TacticalIntent means that no tactical decision was made. In
 * particular, it does not mean hold: hold is an explicit objective.
 */
export const TacticalIntent = defineComponent("TacticalIntent", {
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
    return Object.prototype.hasOwnProperty.call(TACTICAL_KINDS, rec.kind)
      && Object.prototype.hasOwnProperty.call(TACTICAL_SOURCES, rec.source)
      && Number.isInteger(rec.priority)
      && Number.isInteger(rec.targetId)
      && Number.isInteger(rec.targetX)
      && Number.isInteger(rec.targetY)
      && Number.isInteger(rec.dx)
      && Number.isInteger(rec.dy)
      && Number.isInteger(rec.expiresAtStep);
  },
});
