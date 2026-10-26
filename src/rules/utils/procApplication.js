import { Mana } from "../components/Mana.js";
import { Stamina } from "../components/Stamina.js";
import { Vitality } from "../components/Vitality.js";
import { upsertTimedEffect } from "./effectSemantics.js";
import { applyStatusEffect, ensureActiveEffects, isInvulnerabilityEffectKey } from "./effects.js";
import { effectiveMaxMana, effectiveMaxStamina } from "./passiveBonuses.js";
import { applyHealing } from "./applyHealing.js";
import { getEffectDefinition } from "../data/effectInstances.js";

function applyStatusEffects(world, out) {
  for (let i = 0; i < out.statusesToApply.length; i++) {
    const entry = out.statusesToApply[i];
    const entityId = Number(entry?.target || 0) | 0;
    if (!(entityId > 0) || !world.isAlive?.(entityId)) continue;
    if (getEffectDefinition(entry?.status?.key) || isInvulnerabilityEffectKey(entry?.status?.key)) {
      applyStatusEffect(world, entityId, { stacks: 1, ...(entry.status || {}), sourceId: Number(entry?.source || 0) | 0 });
      continue;
    }
    const activeEffects = ensureActiveEffects(world, entityId);
    if (!activeEffects || !Array.isArray(activeEffects.effects)) continue;
    upsertTimedEffect(activeEffects.effects, { stacks: 1, ...(entry.status || {}) });
  }
}

function applyResourceRestore(world, out) {
  for (let i = 0; i < out.resourcesToRestore.length; i++) {
    const entry = out.resourcesToRestore[i];
    const entityId = Number(entry?.target || 0) | 0;
    const amount = Math.max(0, Number(entry?.amount || 0));
    if (!(entityId > 0) || !world.isAlive?.(entityId) || amount <= 0) continue;
    const resource = String(entry?.resource || "");

    if (resource === "stamina") {
      const stamina = world.get(entityId, Stamina);
      if (!stamina) continue;
      world.set(entityId, Stamina, {
        ...stamina,
        stamina: Math.min(effectiveMaxStamina(world, entityId, stamina), Number(stamina.stamina || 0) + amount),
      });
      continue;
    }

    if (resource === "mana") {
      const mana = world.get(entityId, Mana);
      if (!mana) continue;
      world.set(entityId, Mana, {
        ...mana,
        mana: Math.min(effectiveMaxMana(world, entityId, mana), Number(mana.mana || 0) + amount),
      });
    }
  }
}

function applyVitalityRestore(world, out) {
  for (let i = 0; i < out.vitalityToRestore.length; i++) {
    const entry = out.vitalityToRestore[i];
    const entityId = Number(entry?.target || 0) | 0;
    const amount = Math.max(0, Number(entry?.amount || 0));
    if (!(entityId > 0) || !world.isAlive?.(entityId) || amount <= 0) continue;
    applyHealing(world, {
      target: entityId,
      amount,
      source: Number(entry?.source || 0) | 0,
      cause: "proc",
    });
  }
}

function applyDirectDamage(world, out, options) {
  const applyDamage = typeof options?.applyDamage === "function" ? options.applyDamage : null;
  if (!applyDamage) return;

  for (let i = 0; i < out.directDamage.length; i++) {
    const entry = out.directDamage[i];
    const target = Number(entry?.target || 0) | 0;
    let amount = Math.max(0, Number(entry?.amount || 0));
    if (!(target > 0) || !world.isAlive?.(target) || amount <= 0) continue;

    if (entry?.nonLethal) {
      const vitality = world.get(target, Vitality);
      if (!vitality) continue;
      amount = Math.min(amount, Math.max(0, Number(vitality.hp || 0) - 1));
      if (amount <= 0) continue;
    }

    applyDamage(world, {
      target,
      amount,
      source: Number(entry?.source || 0) | 0,
      type: String(entry?.type || "physical"),
      cause: String(entry?.cause || "proc"),
      bypassResist: !!entry?.bypassResist,
      bypassInvuln: !!entry?.bypassInvuln,
      noTrigger: !!entry?.noTrigger,
      offhand: !!entry?.offhand,
      at: entry?.at || undefined,
    });
  }
}

export function rollBonusDamage(world, bonusDamage, rng = null) {
  let total = 0;
  const rand = typeof rng === "function"
    ? rng
    : (typeof world?.rand === "function" ? () => world.rand() : () => 0);

  for (let i = 0; i < bonusDamage.length; i++) {
    const entry = bonusDamage[i];
    const min = Number(entry?.min || 0);
    const max = Number(entry?.max ?? min);
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    const span = Math.max(0, Math.floor(high - low));
    total += span <= 0 ? low : (low + Math.floor(rand() * (span + 1)));
  }

  return Math.max(0, Math.floor(total));
}

export function applyProcAccumulator(world, out, options = {}) {
  if (!out || typeof out !== "object") return;
  applyStatusEffects(world, out);
  applyResourceRestore(world, out);
  applyVitalityRestore(world, out);
  applyDirectDamage(world, out, options);

  if (typeof world?.emit !== "function") return;
  for (let i = 0; i < out.messages.length; i++) {
    const message = out.messages[i];
    try {
      world.emit("proc:message", { source: message?.source || 0, text: String(message?.text || "") });
    } catch {
      // keep proc application side-effect safe
    }
  }
  const presentations = Array.isArray(out.presentations) ? out.presentations : [];
  for (let i = 0; i < presentations.length; i++) {
    const presentation = presentations[i];
    world.emit("script:present", presentation);
  }
}
