import { statusStrength } from "./statusFacade.js";
import { Vitality } from "../components/Vitality.js";
import { sleepPreventsAction } from "./sleep.js";

/**
 * Canonical channel/cast interruption policy.
 * Order matters: first matching rule wins.
 */
export const CHANNEL_INTERRUPTION_RULES = Object.freeze([
  Object.freeze({
    reason: "dead",
    detail: "Dead actors cannot start or sustain channels.",
    when: (world, actorId) => {
      const vit = world.get(actorId, Vitality);
      return !!(vit && (vit.hp | 0) <= 0);
    },
  }),
  Object.freeze({
    reason: "stunned",
    detail: "Stun is a hard interrupt and blocks channel/cast start.",
    when: (world, actorId) => (
      statusStrength(world, actorId, "stunned") > 0
      || statusStrength(world, actorId, "stun") > 0
    ),
  }),
  Object.freeze({
    reason: "stasis",
    detail: "Stasis is a hard interrupt and freezes the actor outside of time.",
    when: (world, actorId) => statusStrength(world, actorId, "stasis") > 0,
  }),
  Object.freeze({
    reason: "mindlocked",
    detail: "Mindlock is a hard interrupt and blocks channel/cast start.",
    when: (world, actorId) => (
      statusStrength(world, actorId, "mindlocked") > 0
      || statusStrength(world, actorId, "mindlock") > 0
    ),
  }),
  Object.freeze({
    reason: "silenced",
    detail: "Silence blocks vocalized spellcasting and interrupts channels.",
    when: (world, actorId) => (
      statusStrength(world, actorId, "silenced") > 0
      || statusStrength(world, actorId, "silence") > 0
    ),
  }),
  Object.freeze({
    reason: "asleep",
    detail: "Sleep is a hard interrupt and blocks channel/cast start.",
    when: (world, actorId) => sleepPreventsAction(world, actorId),
  }),
]);

/**
 * Returns the canonical interruption reason, or "" when casting/channeling is allowed.
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} actorId
 * @returns {string}
 */
export function getChannelInterruptionReason(world, actorId) {
  const id = Number(actorId || 0) | 0;
  if (!(id > 0) || !world?.isAlive?.(id)) return "dead";
  for (let i = 0; i < CHANNEL_INTERRUPTION_RULES.length; i++) {
    const rule = CHANNEL_INTERRUPTION_RULES[i];
    try {
      if (rule.when(world, id)) return rule.reason;
    } catch {
      // Keep policy fail-safe: ignore broken checks and continue.
    }
  }
  return "";
}
