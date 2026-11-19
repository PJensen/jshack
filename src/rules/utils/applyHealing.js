import { HealingModifiers } from "../components/HealingModifiers.js";
import { Vitality } from "../components/Vitality.js";
import { effectiveMaxHp } from "./passiveBonuses.js";
import { recordHealingApplied } from "./healingApplied.js";

const ZERO_RESULT = Object.freeze({ applied: false, amount: 0, rawAmount: 0, resolvedAmount: 0 });

function finiteMultiplier(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

/**
 * Canonical healing pipeline. All ordinary HP restoration flows through here.
 * Resurrection and explicit HP initialization are not healing.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {{target:number, amount:number, source?:number, cause?:string, bypassModifiers?:boolean, maxHp?:number, critical?:boolean}} spec
 */
export function applyHealing(world, spec) {
  const target = Number(spec.target || 0) | 0;
  if (!(target > 0) || !world.isAlive(target)) return { ...ZERO_RESULT, reason: "invalid-target" };

  const vit = world.get(target, Vitality);
  if (!vit || (vit.hp | 0) <= 0) return { ...ZERO_RESULT, reason: "no-vitality" };

  const rawAmount = Math.max(0, Number(spec.amount || 0) | 0);
  if (rawAmount <= 0) return { ...ZERO_RESULT, reason: "zero-amount" };

  const source = Number(spec.source || 0) | 0;
  let resolvedAmount = rawAmount;
  if (!spec.bypassModifiers) {
    const sourceMods = source > 0 ? world.get(source, HealingModifiers) : null;
    const targetMods = world.get(target, HealingModifiers);
    const outgoing = finiteMultiplier(sourceMods?.outgoingMultiplier, 1);
    const incoming = finiteMultiplier(targetMods?.incomingMultiplier, 1);
    const suppression = Math.min(1, finiteMultiplier(targetMods?.suppression, 0));
    resolvedAmount = Math.max(0, Math.floor(rawAmount * outgoing * incoming * (1 - suppression)));
  }
  if (resolvedAmount <= 0) return { ...ZERO_RESULT, rawAmount, reason: "suppressed" };

  const hpBefore = vit.hp | 0;
  const defaultCap = effectiveMaxHp(world, target, vit);
  const requestedCap = Number(spec.maxHp);
  const maxHp = Number.isFinite(requestedCap) ? Math.max(0, requestedCap | 0) : defaultCap;
  const hpAfter = Math.min(maxHp, hpBefore + resolvedAmount);
  const amount = Math.max(0, hpAfter - hpBefore);
  if (amount <= 0) return { ...ZERO_RESULT, rawAmount, resolvedAmount, reason: "full-health" };

  vit.hp = hpAfter;
  const payload = {
    id: target,
    target,
    source,
    cause: String(spec.cause || "healing"),
    amount,
    rawAmount,
    resolvedAmount,
    hpBefore,
    hpAfter,
    maxHp,
    ...(spec.critical ? { critical: true } : {}),
  };
  recordHealingApplied(world, { ...payload, step: world.step | 0 });
  world.emit("healed", payload);
  return { applied: true, amount, rawAmount, resolvedAmount, reason: "applied" };
}
