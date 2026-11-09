import { defineComponent } from "../../lib/ecs-js/index.js";

/**
 * Channeling — tracks an in-progress cast-time spell.
 *
 * mode:           "cast" for countdown casts, "sustain" for realtime drains.
 * turnsRemaining: how many more world ticks until the cast completes.
 * turnsTotal:     the original total cast time (for UI progress display).
 * manaPerTick:    mana spent on each sustain tick.
 * staminaPerTick: stamina spent on each sustain tick.
 * lifePerTick:    life spent on each sustain tick.
 * spellId:        the spell being channeled.
 * targetId:       entity target (0 = self).
 * x, y:           optional tile target coordinates.
 * breakOnNoLos:   if true, cancel the channel when caster loses LOS to targetId.
 * breakOnMove:    if true, cancel the channel when caster moves from anchorX/anchorY.
 * anchorX, anchorY: caster position when channel started (used by breakOnMove).
 */
export const Channeling = defineComponent("Channeling", {
  mode: "cast",
  turnsRemaining: 0,
  turnsTotal: 0,
  manaPerTick: 0,
  staminaPerTick: 0,
  lifePerTick: 0,
  spellId: "",
  itemActionId: "",
  targetId: 0,
  x: null,
  y: null,
  breakOnNoLos: false,
  breakOnMove: false,
  breakOnDamage: false,
  damageSetbackTurns: 0,
  anchorX: null,
  anchorY: null,
});
