import { ItemInfo } from '../components/ItemInfo.js';
import { Stamina } from '../components/Stamina.js';
import { combatSeed, mulberry32, rngInt } from '../utils/rng.js';
import { upsertTimedEffect } from '../utils/effectSemantics.js';
import { ensureActiveEffects } from '../utils/effects.js';
import { effectiveMaxStamina } from '../utils/passiveBonuses.js';
import { applyHealing } from '../utils/applyHealing.js';
import { ELEMENT_TINT_POISON } from './elementTints.js';

export const WEAPON_COATING_DEFS = Object.freeze({
  poison: Object.freeze({
    // Higher proc rate to make applied poison meaningfully tactical while still
    // allowing occasional non-proc hits for variability.
    chancePct: 75,
    consumeOnHit: true,
    seedSalt: 0xc0470001,
    emitEvent: 'proc:poisoned',
    elementTint: ELEMENT_TINT_POISON,
    effect: Object.freeze({ key: 'poison', turnsLeft: 4, potency: 2, stacks: 1 }),
  }),
  paralysis: Object.freeze({
    chancePct: 40,
    consumeOnHit: true,
    seedSalt: 0xc0470002,
    emitEvent: 'proc:paralyzed',
    elementTint: null,
    effect: Object.freeze({ key: 'stun', turnsLeft: 4, potency: 1, stacks: 1, sourceKey: 'potion_paralysis' }),
  }),
  blindness: Object.freeze({
    chancePct: 50,
    consumeOnHit: true,
    seedSalt: 0xc0470003,
    emitEvent: 'proc:blinded',
    elementTint: null,
    effect: Object.freeze({ key: 'blinded', turnsLeft: 3, potency: 1, stacks: 1 }),
  }),
  confusion: Object.freeze({
    chancePct: 45,
    consumeOnHit: true,
    seedSalt: 0xc0470004,
    emitEvent: 'proc:confused',
    elementTint: null,
    effect: Object.freeze({ key: 'confused', turnsLeft: 3, potency: 1, stacks: 1 }),
  }),
  hallucination: Object.freeze({
    chancePct: 35,
    consumeOnHit: true,
    seedSalt: 0xc0470005,
    emitEvent: 'proc:hallucinating',
    elementTint: null,
    effect: Object.freeze({ key: 'hallucinating', turnsLeft: 5, potency: 1, stacks: 1 }),
  }),
  weakness: Object.freeze({
    chancePct: 50,
    consumeOnHit: true,
    seedSalt: 0xc0470006,
    emitEvent: 'proc:weakened',
    elementTint: null,
    effect: Object.freeze({ key: 'weakened', turnsLeft: 4, potency: 1, stacks: 1 }),
  }),
  acid: Object.freeze({
    chancePct: 65,
    consumeOnHit: true,
    seedSalt: 0xc0470007,
    emitEvent: 'proc:acid_splash',
    elementTint: 'acid',
    effect: Object.freeze({ key: 'burning', turnsLeft: 2, potency: 1, stacks: 1 }),
    bonusDamage: 2,
    bonusDamageType: 'acid',
  }),
  oil: Object.freeze({
    chancePct: 60,
    consumeOnHit: true,
    seedSalt: 0xc0470008,
    emitEvent: 'proc:ignited',
    elementTint: 'fire',
    effect: Object.freeze({ key: 'burning', turnsLeft: 3, potency: 2, stacks: 1 }),
  }),
  lifedraw: Object.freeze({
    chancePct: 100,
    consumeOnHit: true,
    seedSalt: 0xc0470009,
    elementTint: 'blood',
    healAttacker: 1,
  }),
  adrenaline: Object.freeze({
    chancePct: 100,
    consumeOnHit: true,
    seedSalt: 0xc047000a,
    elementTint: 'fire',
    restoreStamina: 3,
  }),
  lethargy: Object.freeze({
    chancePct: 100,
    consumeOnHit: true,
    seedSalt: 0xc047000b,
    emitEvent: 'proc:slowed',
    elementTint: null,
    effect: Object.freeze({ key: 'slowed', turnsLeft: 4, potency: 1, stacks: 1 }),
  }),
});

function upsertEffect(world, entityId, effect) {
  const ae = ensureActiveEffects(world, entityId);
  if (ae) {
    upsertTimedEffect(ae.effects, { stacks: 1, ...effect });
  }
}

export function applyWeaponCoatingOnHit(world, ctx) {
  const attacker = Number(ctx?.attacker || 0) | 0;
  const defender = Number(ctx?.defender || 0) | 0;
  const weaponId = Number(ctx?.weaponId || 0) | 0;
  const didHit = Boolean(ctx?.didHit);
  if (!(attacker > 0) || !(defender > 0) || !(weaponId > 0) || !didHit) {
    return { attempted: false, procced: false, kind: '', chargesBefore: 0, chargesAfter: 0 };
  }

  const weaponInfo = world.get(weaponId, ItemInfo);
  const coating = weaponInfo?.coating;
  const kind = String(coating?.kind || '').toLowerCase();
  const chargesBefore = Math.max(0, Number(coating?.charges || 0) | 0);
  if (!weaponInfo || !kind || chargesBefore <= 0) {
    return { attempted: false, procced: false, kind, chargesBefore, chargesAfter: chargesBefore };
  }

  const def = WEAPON_COATING_DEFS[kind];
  if (!def) {
    return { attempted: false, procced: false, kind, chargesBefore, chargesAfter: chargesBefore };
  }

  const chancePct = Math.max(0, Math.min(100, Number(def.chancePct || 0) | 0));
  if (chancePct <= 0) {
    return { attempted: true, procced: false, kind, chargesBefore, chargesAfter: chargesBefore };
  }

  let chargesAfter = chargesBefore;
  if (def.consumeOnHit) {
    chargesAfter = Math.max(0, chargesBefore - 1);
    if (chargesAfter > 0) {
      weaponInfo.coating = { ...coating, charges: chargesAfter };
    } else {
      delete weaponInfo.coating;
    }
  }

  const procRng = mulberry32(combatSeed(world.seed, world.step, attacker, defender, Number(def.seedSalt || 0) | 0));
  const didProc = rngInt(procRng, 1, 100) <= chancePct;
  if (!didProc) {
    return { attempted: true, procced: false, kind, chargesBefore, chargesAfter };
  }

  if (def.effect) upsertEffect(world, defender, { ...def.effect });

  if ((def.healAttacker | 0) > 0) {
    applyHealing(world, {
      target: attacker,
      amount: def.healAttacker,
      source: attacker,
      cause: `coating_${kind}`,
    });
  }

  if ((def.restoreStamina | 0) > 0) {
    const stam = world.get(attacker, Stamina);
    if (stam) {
      const before = Number(stam.stamina || 0);
      const cap = effectiveMaxStamina(world, attacker, stam);
      stam.stamina = Math.min(cap, before + (def.restoreStamina | 0));
      const restored = stam.stamina - before;
      if (restored > 0) world.emit?.('stamina_restored', { id: attacker, amount: restored, source: defender, cause: `coating_${kind}` });
    }
  }

  if ((def.bonusDamage | 0) > 0) {
    world.emit?.("damage", {
      target: defender,
      amount: def.bonusDamage | 0,
      source: attacker,
      type: String(def.bonusDamageType || "physical"),
      cause: `coating_${kind}`,
    });
  }

  if (def.emitEvent) {
    world.emit?.(String(def.emitEvent), { actor: attacker, target: defender });
  }

  return { attempted: true, procced: true, kind, chargesBefore, chargesAfter };
}
