// Affix definitions: triggers can be onBeforeHit, onHit, onDamaged, onKill, onEquip, onUnequip
// Scripts are registered via the central scripting router.
import { mulberry32, rngInt, combatSeed } from "../utils/rng.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Vitality } from "../components/Vitality.js";
import { Position } from "../components/Position.js";
import { Faction } from "../components/Faction.js";
import { Mana } from "../components/Mana.js";
import { Stamina } from "../components/Stamina.js";
import { registerScript, ScriptVerb } from "../scripting.js";
import { dealDamage } from "../utils/dealDamage.js";
import { forEachInRadius } from "../utils/spatialIndex.js";
import { areFactionsHostile } from "../utils/factionHostility.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import { effectiveMaxMana, effectiveMaxStamina } from "../utils/passiveBonuses.js";
import { ELEMENT_TINT_FIRE, ELEMENT_TINT_POISON, ELEMENT_TINT_FROST, ELEMENT_TINT_ACID, ELEMENT_TINT_ELECTRIC } from "./elementTints.js";

const AFFIX_THORNS = "affix:thorns1";
const AFFIX_VAMP = "affix:vamp1";
const AFFIX_FIERCE = "affix:fierce";
const AFFIX_GUARD = "affix:guard1";
const AFFIX_LIFE = "affix:life1";
const AFFIX_ATTUNED = "affix:attuned1";
const AFFIX_FIRE_WARD = "affix:fireWard1";
const AFFIX_POISON_WARD = "affix:poisonWard1";
const AFFIX_KINETIC_WARD = "affix:kineticWard1";
const AFFIX_CAUSTIC = "affix:caustic1";
const AFFIX_CAPACITIVE = "affix:capacitive1";
const AFFIX_INSULATED = "affix:insulated1";
const AFFIX_LUCKY = "affix:lucky1";
const AFFIX_VENOMOUS = "affix:venomous1";
const AFFIX_CHAIN_LIGHTNING = "affix:chainLightning1";
const AFFIX_FIRESTORM = "affix:firestorm1";
const AFFIX_SOUL_DRAIN = "affix:soulDrain1";
const AFFIX_BERSERK = "affix:berserk1";
const AFFIX_SHIELD_WALL = "affix:shieldWall1";
const AFFIX_MANA_SURGE = "affix:manaSurge1";
const AFFIX_EXECUTIONER = "affix:executioner1";
const AFFIX_FROSTBITE = "affix:frostbite1";
const AFFIX_HEMORRHAGE = "affix:hemorrhage1";
const AFFIX_SECOND_WIND = "affix:secondWind1";
const AFFIX_FLAMING = "affix:flaming";
const AFFIX_STUNNING = "affix:stunning1";
const AFFIX_WEAKEN = "affix:weaken1";
const AFFIX_AGONY = "affix:agony1";
const AFFIX_CRIPPLE = "affix:cripple1";
const AFFIX_PLAGUE = "affix:plague1";
const AFFIX_SOULFIRE = "affix:soulfire1";

/**
 * Push or stack an active effect directly on an entity.
 * @param {any} world
 * @param {number} entityId
 * @param {{ key:string, turnsLeft:number, potency:number, stacks?:number }} effect
 */
function upsertEffect(world, entityId, effect) {
  const ae = world.get(entityId, ActiveEffects);
  if (ae && Array.isArray(ae.effects)) {
    upsertTimedEffect(ae.effects, { stacks: 1, ...effect });
    return;
  }
  try { world.add(entityId, ActiveEffects, { effects: [{ stacks: 1, ...effect }] }); } catch {} // ECS: may already exist
}

/**
 * Deterministic combat proc roll.
 * @param {any} world
 * @param {number} attacker
 * @param {number} defender
 * @param {number} salt
 * @param {number} chancePct
 */
function procRoll(world, attacker, defender, salt, chancePct) {
  const pct = Math.max(0, Math.min(100, chancePct | 0));
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  const step = (world && world.step) | 0;
  const seed = combatSeed(world?.seed ?? 0, step, attacker | 0, defender | 0, salt | 0);
  const r = mulberry32(seed);
  return rngInt(r, 1, 100) <= pct;
}

/**
 * Apply a tiny typed bonus hit that cannot kill by itself.
 * @param {any} world
 * @param {any} ctx
 * @param {string} type
 * @param {number} amount
 * @param {string} cause
 */
function applyNonLethalTypedChip(world, ctx, type, amount, cause) {
  const attacker = (ctx && ctx.attacker) | 0;
  const defender = (ctx && ctx.defender) | 0;
  if (!(defender > 0) || !world || !world.isAlive?.(defender)) return 0;
  if (!((ctx && ctx.damage) > 0)) return 0;
  const vit = world.get(defender, Vitality);
  if (!vit || (vit.hp | 0) <= 1) return 0;
  const result = dealDamage(world, {
    target: defender,
    amount: Math.max(1, amount | 0),
    source: attacker,
    type,
    cause,
    noTrigger: true,
  });
  return Math.max(0, Number(result?.amount || 0));
}

registerScript(AFFIX_THORNS, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    try {
      const attacker = (ctx && ctx.attacker) | 0;
      const defender = (ctx && ctx.defender) | 0;
      const step = (world && world.step) | 0;
      const seed = combatSeed(world?.seed ?? 0, step, attacker, defender, 0xc0ffee01);
      const r = mulberry32(seed);
      const roll = rngInt(r, 1, 100);
      if (roll <= 20) {
        ctx.retaliate(2);
        world.emit('proc:thorns', { actor: ctx.defender, target: ctx.attacker });
        try {
          const ae = world.get(defender, ActiveEffects);
          if (ae && Array.isArray(ae.effects)) {
            ae.effects.push({ key: "thorns", turnsLeft: 3, potency: 1 });
          } else {
            world.add(defender, ActiveEffects, { effects: [{ key: "thorns", turnsLeft: 3, potency: 1 }] });
          }
        } catch (e) { console.error('[affixes] thorns effect application failed:', e); }
      }
    } catch {
      ctx.retaliate(2);
    }
  },
});

registerScript(AFFIX_VAMP, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    const amt = Math.max(1, Math.floor(ctx.damage / 3));
    ctx.healAttacker(amt);
    world.emit('proc:vampiric', { actor: ctx.attacker, target: ctx.defender, amount: amt });
  },
});

registerScript(AFFIX_FIERCE, {
  [ScriptVerb.AffixOnBeforeHit]: (world, ctx) => {
    ctx.damage += 1;
    world.emit('proc:fierce', { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_GUARD, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("evade", 1);
  },
});

registerScript(AFFIX_LIFE, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("maxHp", 5);
  },
});

registerScript(AFFIX_ATTUNED, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("manaRegen", 0.25);
  },
});

registerScript(AFFIX_FIRE_WARD, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("fireResist", 0.15);
  },
});

registerScript(AFFIX_POISON_WARD, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("poisonResist", 0.15);
  },
});

registerScript(AFFIX_KINETIC_WARD, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("kineticDR", 2);
  },
});

registerScript(AFFIX_CAUSTIC, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    const dealt = applyNonLethalTypedChip(world, ctx, "acid", 1, "affix:caustic");
    if (dealt > 0) {
      world.emit("proc:caustic", { actor: ctx.attacker, target: ctx.defender, amount: dealt });
    }
  },
});

registerScript(AFFIX_CAPACITIVE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    const dealt = applyNonLethalTypedChip(world, ctx, "electric", 1, "affix:capacitive");
    if (dealt > 0) {
      world.emit("proc:capacitive", { actor: ctx.attacker, target: ctx.defender, amount: dealt });
    }
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee03, 35)) return;
    upsertEffect(world, ctx.defender, { key: "shock", turnsLeft: 2, potency: 1, stacks: 1 });
    world.emit("proc:shocked", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_INSULATED, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("electricOhms", 600);
  },
});

registerScript(AFFIX_LUCKY, {
  [ScriptVerb.AffixPassive]: (_world, ctx) => {
    ctx.addBonus("luck", 3);
  },
});

registerScript(AFFIX_VENOMOUS, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee04, 40)) return;
    upsertEffect(world, ctx.defender, { key: "poison", turnsLeft: 4, potency: 2, stacks: 1 });
    world.emit("proc:poisoned", { actor: ctx.attacker, target: ctx.defender });
  },
});

// ── Proc affixes ──────────────────────────────────────────────────

registerScript(AFFIX_CHAIN_LIGHTNING, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee10, 30)) return;
    const dealt = applyNonLethalTypedChip(world, ctx, "electric", 2, "affix:chainLightning");
    if (dealt <= 0) return;
    const defPos = world.get(ctx.defender, Position);
    if (!defPos) return;
    let chained = false;
    forEachInRadius(world, defPos.x, defPos.y, 2, (nearId) => {
      if (chained || nearId === ctx.defender || nearId === ctx.attacker) return;
      if (!world.isAlive(nearId)) return;
      const nearFac = world.get(nearId, Faction)?.key || "";
      const atkFac = world.get(ctx.attacker, Faction)?.key || "";
      if (!areFactionsHostile(atkFac, nearFac)) return;
      dealDamage(world, { target: nearId, amount: 1, source: ctx.attacker, type: "electric", cause: "affix:chainLightning", noTrigger: true });
      chained = true;
    });
    world.emit("proc:chainLightning", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_FIRESTORM, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee11, 12)) return;
    applyNonLethalTypedChip(world, ctx, "fire", 1, "affix:firestorm");
    upsertEffect(world, ctx.defender, { key: "burning", turnsLeft: 3, potency: 2, stacks: 1 });
    world.emit("proc:firestorm", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_SOUL_DRAIN, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee12, 18)) return;
    const amt = Math.max(1, Math.floor(ctx.damage / 2));
    ctx.healAttacker(amt);
    world.emit("proc:soulDrain", { actor: ctx.attacker, target: ctx.defender, amount: amt });
  },
});

registerScript(AFFIX_BERSERK, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee13, 10)) return;
    upsertEffect(world, ctx.attacker, { key: "berserk", turnsLeft: 5, potency: 1, stacks: 1 });
    world.emit("proc:berserking", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_SHIELD_WALL, {
  [ScriptVerb.AffixOnDamaged]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee14, 15)) return;
    upsertEffect(world, ctx.defender, { key: "stoneskin", turnsLeft: 4, potency: 2, stacks: 1 });
    world.emit("proc:shieldWall", { actor: ctx.defender, target: ctx.attacker });
  },
});

registerScript(AFFIX_MANA_SURGE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee15, 20)) return;
    const mana = world.get(ctx.attacker, Mana);
    if (!mana) return;
    const maxMana = effectiveMaxMana(world, ctx.attacker, mana);
    mana.mana = Math.min(maxMana, (Number(mana.mana) || 0) + 3);
    world.emit("proc:manaSurge", { actor: ctx.attacker, amount: 3 });
  },
});

registerScript(AFFIX_EXECUTIONER, {
  [ScriptVerb.AffixOnBeforeHit]: (world, ctx) => {
    const vit = world.get(ctx.defender, Vitality);
    if (!vit) return;
    if (vit.hp / vit.maxHp >= 0.3) return;
    ctx.damage += 3;
    world.emit("proc:executioner", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_FROSTBITE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee16, 20)) return;
    upsertEffect(world, ctx.defender, { key: "frost", turnsLeft: 3, potency: 1, stacks: 1 });
    world.emit("proc:frostbite", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_HEMORRHAGE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee17, 25)) return;
    upsertEffect(world, ctx.defender, { key: "bleed", turnsLeft: 4, potency: 2, stacks: 1 });
    world.emit("proc:hemorrhage", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_FLAMING, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee19, 50)) return;
    upsertEffect(world, ctx.defender, { key: "burning", turnsLeft: 3, potency: 2, stacks: 1 });
    world.emit("proc:flaming", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_STUNNING, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee1a, 25)) return;
    upsertEffect(world, ctx.defender, { key: "stun", turnsLeft: 1, potency: 1, stacks: 1 });
    world.emit("proc:stunned", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_SECOND_WIND, {
  [ScriptVerb.AffixOnDamaged]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee18, 10)) return;
    upsertEffect(world, ctx.defender, { key: "regen", turnsLeft: 5, potency: 1, stacks: 1 });
    const stam = world.get(ctx.defender, Stamina);
    if (stam) {
      const maxStam = effectiveMaxStamina(world, ctx.defender, stam);
      stam.stamina = Math.min(maxStam, (Number(stam.stamina) || 0) + 5);
    }
    world.emit("proc:secondWind", { actor: ctx.defender });
  },
});

registerScript(AFFIX_WEAKEN, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee1b, 20)) return;
    upsertEffect(world, ctx.defender, { key: "weaken", turnsLeft: 3, potency: 1, stacks: 1 });
    world.emit("proc:weaken", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_AGONY, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee1c, 25)) return;
    upsertEffect(world, ctx.defender, { key: "agony", turnsLeft: 4, potency: 2, stacks: 1 });
    world.emit("proc:agony", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_CRIPPLE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee1d, 20)) return;
    applyNonLethalTypedChip(world, ctx, "pierce", 1, "affix:cripple");
    upsertEffect(world, ctx.defender, { key: "frost", turnsLeft: 2, potency: 1, stacks: 1 });
    world.emit("proc:cripple", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_PLAGUE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee1e, 20)) return;
    upsertEffect(world, ctx.defender, { key: "poison", turnsLeft: 4, potency: 2, stacks: 1 });
    upsertEffect(world, ctx.defender, { key: "disease", turnsLeft: 3, potency: 1, stacks: 1 });
    world.emit("proc:plague", { actor: ctx.attacker, target: ctx.defender });
  },
});

registerScript(AFFIX_SOULFIRE, {
  [ScriptVerb.AffixOnHit]: (world, ctx) => {
    if (!procRoll(world, ctx.attacker, ctx.defender, 0xc0ffee1f, 15)) return;
    ctx.healAttacker(2);
    upsertEffect(world, ctx.defender, { key: "burning", turnsLeft: 3, potency: 2, stacks: 1 });
    world.emit("proc:soulfire", { actor: ctx.attacker, target: ctx.defender });
  },
});

function emitProc(ctx, name, payload) {
  ctx?.proc?.emit?.(name, payload);
}

function procDamageAmount(ctx) {
  return Math.max(0, Number(ctx?.damage?.amount ?? ctx?.damage ?? 0));
}

function actorMatchesProcRole(ctx, role) {
  const actor = Number(ctx?.actor || 0) | 0;
  if (!(actor > 0)) return true;
  if (role === "source") return actor === (Number(ctx?.source || 0) | 0);
  if (role === "target") return actor === (Number(ctx?.target || 0) | 0);
  return true;
}

registerScript(AFFIX_THORNS, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "target")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee01, 20)) return;
    ctx.proc.dealDamage(ctx.source, 2, "physical", {
      source: ctx.target,
      cause: "retaliation",
      bypassResist: true,
      noTrigger: true,
    });
    ctx.proc.applyStatus(ctx.target, "thorns", 3, 1);
    emitProc(ctx, "proc:thorns", { actor: ctx.target, target: ctx.source });
  },
});

registerScript(AFFIX_VAMP, {
  [ScriptVerb.ProcEvaluate]: (_world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    const amount = Math.max(1, Math.floor(procDamageAmount(ctx) / 3));
    ctx.proc.heal(ctx.source, amount);
    emitProc(ctx, "proc:vampiric", { actor: ctx.source, target: ctx.target, amount });
  },
});

registerScript(AFFIX_FIERCE, {
  [ScriptVerb.ProcEvaluate]: (_world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    ctx.proc.addBonusDamage(1);
    emitProc(ctx, "proc:fierce", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_CAUSTIC, {
  [ScriptVerb.ProcEvaluate]: (_world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (procDamageAmount(ctx) <= 0) return;
    ctx.proc.dealDamage(ctx.target, 1, "acid", {
      source: ctx.source,
      cause: "affix:caustic",
      noTrigger: true,
      nonLethal: true,
    });
    emitProc(ctx, "proc:caustic", { actor: ctx.source, target: ctx.target, amount: 1 });
  },
});

registerScript(AFFIX_CAPACITIVE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0) || source === target) return;
    if (procDamageAmount(ctx) <= 0) return;
    ctx.proc.dealDamage(target, 1, "electric", {
      source,
      cause: "affix:capacitive",
      noTrigger: true,
      nonLethal: true,
    });
    emitProc(ctx, "proc:capacitive", { actor: source, target, amount: 1 });
    if (!procRoll(world, source, target, 0xc0ffee03, 35)) return;
    ctx.proc.applyStatus(target, "shock", 2, 1);
    emitProc(ctx, "proc:shocked", { actor: source, target });
  },
});

registerScript(AFFIX_VENOMOUS, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee04, 40)) return;
    ctx.proc.applyStatus(ctx.target, "poison", 4, 2);
    emitProc(ctx, "proc:poisoned", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_CHAIN_LIGHTNING, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee10, 30)) return;
    const targetVit = world.get(ctx.target, Vitality);
    if (!targetVit || (targetVit.hp | 0) <= 1) return;
    ctx.proc.dealDamage(ctx.target, 2, "electric", {
      source: ctx.source,
      cause: "affix:chainLightning",
      noTrigger: true,
      nonLethal: true,
    });
    const atkPos = world.get(ctx.source, Position);
    const defPos = world.get(ctx.target, Position);
    let chainTarget = null;
    if (defPos) {
      forEachInRadius(world, defPos.x, defPos.y, 2, (nearId) => {
        if (chainTarget || nearId === ctx.target || nearId === ctx.source) return;
        if (!world.isAlive(nearId)) return;
        const nearFac = world.get(nearId, Faction)?.key || "";
        const atkFac = world.get(ctx.source, Faction)?.key || "";
        if (!areFactionsHostile(atkFac, nearFac)) return;
        ctx.proc.dealDamage(nearId, 1, "electric", {
          source: ctx.source,
          cause: "affix:chainLightning",
          noTrigger: true,
          nonLethal: true,
        });
        const nearPos = world.get(nearId, Position);
        if (nearPos) chainTarget = { x: nearPos.x, y: nearPos.y };
      });
    }
    emitProc(ctx, "proc:chainLightning", {
      actor: ctx.source,
      target: ctx.target,
      from: atkPos ? { x: atkPos.x, y: atkPos.y } : null,
      to: defPos ? { x: defPos.x, y: defPos.y } : null,
      chainTo: chainTarget,
    });
  },
});

registerScript(AFFIX_FIRESTORM, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee11, 12)) return;
    if (procDamageAmount(ctx) > 0) {
      ctx.proc.dealDamage(ctx.target, 1, "fire", {
        source: ctx.source,
        cause: "affix:firestorm",
        noTrigger: true,
        nonLethal: true,
      });
    }
    ctx.proc.applyStatus(ctx.target, "burning", 3, 2);
    emitProc(ctx, "proc:firestorm", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_SOUL_DRAIN, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee12, 18)) return;
    const amount = Math.max(1, Math.floor(procDamageAmount(ctx) / 2));
    ctx.proc.heal(ctx.source, amount);
    emitProc(ctx, "proc:soulDrain", { actor: ctx.source, target: ctx.target, amount });
  },
});

registerScript(AFFIX_BERSERK, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee13, 10)) return;
    ctx.proc.applyStatus(ctx.source, "berserk", 5, 1);
    emitProc(ctx, "proc:berserking", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_SHIELD_WALL, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "target")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee14, 15)) return;
    ctx.proc.applyStatus(ctx.target, "stoneskin", 4, 2);
    emitProc(ctx, "proc:shieldWall", { actor: ctx.target, target: ctx.source });
  },
});

registerScript(AFFIX_MANA_SURGE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee15, 20)) return;
    ctx.proc.restoreResource(ctx.source, "mana", 3);
    emitProc(ctx, "proc:manaSurge", { actor: ctx.source, amount: 3 });
  },
});

registerScript(AFFIX_EXECUTIONER, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    const vit = world.get(ctx.target, Vitality);
    if (!vit || !(Number(vit.maxHp) > 0)) return;
    if (Number(vit.hp) / Number(vit.maxHp) >= 0.3) return;
    ctx.proc.addBonusDamage(3);
    emitProc(ctx, "proc:executioner", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_FROSTBITE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee16, 20)) return;
    ctx.proc.applyStatus(ctx.target, "frost", 3, 1);
    emitProc(ctx, "proc:frostbite", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_HEMORRHAGE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee17, 25)) return;
    ctx.proc.applyStatus(ctx.target, "bleed", 4, 2);
    emitProc(ctx, "proc:hemorrhage", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_SECOND_WIND, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "target")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee18, 10)) return;
    ctx.proc.applyStatus(ctx.target, "regen", 5, 1);
    ctx.proc.restoreResource(ctx.target, "stamina", 5);
    emitProc(ctx, "proc:secondWind", { actor: ctx.target });
  },
});

registerScript(AFFIX_FLAMING, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee19, 50)) return;
    ctx.proc.applyStatus(ctx.target, "burning", 3, 2);
    emitProc(ctx, "proc:flaming", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_STUNNING, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee1a, 25)) return;
    ctx.proc.applyStatus(ctx.target, "stun", 1, 1);
    emitProc(ctx, "proc:stunned", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_WEAKEN, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee1b, 20)) return;
    ctx.proc.applyStatus(ctx.target, "weaken", 3, 1);
    emitProc(ctx, "proc:weaken", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_AGONY, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee1c, 25)) return;
    ctx.proc.applyStatus(ctx.target, "agony", 4, 2);
    emitProc(ctx, "proc:agony", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_CRIPPLE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee1d, 20)) return;
    ctx.proc.dealDamage(ctx.target, 1, "pierce", {
      source: ctx.source,
      cause: "affix:cripple",
      noTrigger: true,
      nonLethal: true,
    });
    ctx.proc.applyStatus(ctx.target, "frost", 2, 1);
    emitProc(ctx, "proc:cripple", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_PLAGUE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee1e, 20)) return;
    ctx.proc.applyStatus(ctx.target, "poison", 4, 2);
    ctx.proc.applyStatus(ctx.target, "disease", 3, 1);
    emitProc(ctx, "proc:plague", { actor: ctx.source, target: ctx.target });
  },
});

registerScript(AFFIX_SOULFIRE, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (!actorMatchesProcRole(ctx, "source")) return;
    if (!procRoll(world, ctx.source, ctx.target, 0xc0ffee1f, 15)) return;
    ctx.proc.heal(ctx.source, 2);
    ctx.proc.applyStatus(ctx.target, "burning", 3, 2);
    emitProc(ctx, "proc:soulfire", { actor: ctx.source, target: ctx.target });
  },
});

const AFFIX_REGISTRY = new Map();

function normalizeRefList(value, fallbackSingle = null) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string" || (entry && typeof entry === "object"));
  if (typeof fallbackSingle === "string" || (fallbackSingle && typeof fallbackSingle === "object")) return [fallbackSingle];
  return [];
}

function normalizeTriggerScripts(spec) {
  const source = (spec?.triggerScripts && typeof spec.triggerScripts === "object") ? spec.triggerScripts : null;
  const out = Object.create(null);
  if (source) {
    for (const [trigger, refs] of Object.entries(source)) {
      const list = normalizeRefList(refs);
      if (list.length > 0) out[String(trigger)] = list;
    }
    return out;
  }

  const legacyTriggers = Array.isArray(spec?.triggers) ? spec.triggers : [];
  const legacyScript = spec?.script ?? null;
  for (let i = 0; i < legacyTriggers.length; i++) {
    const trigger = String(legacyTriggers[i] || "");
    const list = normalizeRefList(null, legacyScript);
    if (trigger && list.length > 0) out[trigger] = list;
  }
  return out;
}

function normalizePassiveRefs(spec) {
  if (Array.isArray(spec?.passiveRefs)) return normalizeRefList(spec.passiveRefs);
  if (Array.isArray(spec?.passives)) return normalizeRefList(spec.passives);
  return normalizeRefList(null, spec?.passive ?? spec?.passiveRef ?? null);
}

function normalizeAffixRecord(id, spec) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("affix id is required");
  const slots = Array.isArray(spec?.slots) ? spec.slots.map((slot) => String(slot || "")).filter(Boolean) : [];
  const triggerScripts = normalizeTriggerScripts(spec);
  const passiveRefs = normalizePassiveRefs(spec);
  const display = spec?.display && typeof spec.display === "object"
    ? Object.freeze({
        context: String(spec.display.context || "Equip"),
        format: String(spec.display.format || ""),
        values: Object.freeze({
          ...(spec.display.values && typeof spec.display.values === "object" ? spec.display.values : {}),
        }),
      })
    : null;
  return Object.freeze({
    id: normalizedId,
    name: String(spec?.name || normalizedId),
    description: String(spec?.description || ""),
    slots: Object.freeze(slots),
    weight: Number(spec?.weight || 0),
    elementTint: spec?.elementTint || null,
    visualAffinity: spec?.visualAffinity || null,
    display,
    passiveRefs: Object.freeze(passiveRefs),
    triggerScripts: Object.freeze(Object.fromEntries(
      Object.entries(triggerScripts).map(([trigger, refs]) => [trigger, Object.freeze(refs.slice())]),
    )),
  });
}

export function registerAffixDefinition(id, spec) {
  const record = normalizeAffixRecord(id, spec);
  AFFIX_REGISTRY.set(record.id, record);
  return record;
}

export function unregisterAffixDefinition(id) {
  AFFIX_REGISTRY.delete(String(id || ""));
}

[
  ["thorns1", { name: "Thorns I", slots: ["armor"], weight: 30, display: { context: "Equip", format: "When hit, {chance}% chance to retaliate for {damage} damage and gain thorns for {turns} turns.", values: { chance: 20, damage: 2, turns: 3 } }, triggerScripts: { onHit: [AFFIX_THORNS] } }],
  ["vamp1", { name: "Vampiric I", slots: ["weapon"], weight: 20, display: { context: "Equip", format: "On hit, heal for one-third of the damage dealt." }, triggerScripts: { onHit: [AFFIX_VAMP] } }],
  ["fierce", { name: "Fierce", slots: ["weapon"], weight: 25, display: { context: "Equip", format: "Attacks deal +1 damage." }, triggerScripts: { onBeforeHit: [AFFIX_FIERCE] } }],
  ["guard1", { name: "Guarded", slots: ["armor"], weight: 25, display: { context: "Equip", format: "+1 evade." }, passiveRefs: [AFFIX_GUARD] }],
  ["life1", { name: "Healthy", slots: ["armor", "ring"], weight: 22, display: { context: "Equip", format: "+5 max HP." }, passiveRefs: [AFFIX_LIFE] }],
  ["attuned1", { name: "Attuned", slots: ["ring"], weight: 20, display: { context: "Equip", format: "+0.25 mana regeneration." }, passiveRefs: [AFFIX_ATTUNED] }],
  ["fireWard1", { name: "Flame Ward", slots: ["armor", "head", "neck", "belt", "gloves", "offhand", "ring", "legs", "feet", "ranged"], weight: 18, display: { context: "Equip", format: "+15% fire resistance." }, passiveRefs: [AFFIX_FIRE_WARD] }],
  ["poisonWard1", { name: "Venom Ward", slots: ["armor", "head", "neck", "belt", "gloves", "offhand", "ring", "legs", "feet", "ranged"], weight: 18, display: { context: "Equip", format: "+15% poison resistance." }, passiveRefs: [AFFIX_POISON_WARD] }],
  ["kineticWard1", { name: "Fortified", slots: ["armor", "head", "neck", "belt", "gloves", "offhand", "ring", "legs", "feet", "ranged"], weight: 15, display: { context: "Equip", format: "+2 kinetic damage reduction." }, passiveRefs: [AFFIX_KINETIC_WARD] }],
  ["caustic1", { name: "Caustic", slots: ["weapon"], weight: 16, display: { context: "Equip", format: "On hit, deal +1 acid damage." }, elementTint: ELEMENT_TINT_ACID, triggerScripts: { onHit: [AFFIX_CAUSTIC] } }],
  ["capacitive1", { name: "Capacitive", slots: ["weapon"], weight: 15, display: { context: "Equip", format: "On hit, deal +1 electric damage; {chance}% chance to shock for {turns} turns.", values: { chance: 35, turns: 2 } }, elementTint: ELEMENT_TINT_ELECTRIC, triggerScripts: { onHit: [AFFIX_CAPACITIVE] } }],
  ["insulated1", { name: "Insulated", slots: ["armor", "offhand"], weight: 16, display: { context: "Equip", format: "+600 electric ohms." }, passiveRefs: [AFFIX_INSULATED] }],
  ["lucky1", { name: "Lucky", slots: ["ring", "armor"], weight: 18, display: { context: "Equip", format: "+3 luck." }, passiveRefs: [AFFIX_LUCKY] }],
  ["venomous1", { name: "Venomous", slots: ["weapon"], weight: 14, display: { context: "Equip", format: "On hit, {chance}% chance to poison for {turns} turns.", values: { chance: 40, turns: 4 } }, elementTint: ELEMENT_TINT_POISON, triggerScripts: { onHit: [AFFIX_VENOMOUS] } }],
  ["chainLightning1", { name: "Chain Lightning", slots: ["weapon"], weight: 8, display: { context: "Equip", format: "On hit, {chance}% chance to strike a nearby enemy for {damage} electric damage.", values: { chance: 30, damage: 1 } }, elementTint: ELEMENT_TINT_ELECTRIC, triggerScripts: { onHit: [AFFIX_CHAIN_LIGHTNING] } }],
  ["firestorm1", { name: "Firestorm", slots: ["weapon"], weight: 10, display: { context: "Equip", format: "On hit, {chance}% chance to deal +{damage} fire damage and burn for {turns} turns.", values: { chance: 12, damage: 1, turns: 3 } }, elementTint: ELEMENT_TINT_FIRE, triggerScripts: { onHit: [AFFIX_FIRESTORM] } }],
  ["soulDrain1", { name: "Soul Drain", slots: ["weapon"], weight: 7, display: { context: "Equip", format: "On hit, {chance}% chance to heal for half the damage dealt.", values: { chance: 18 } }, triggerScripts: { onHit: [AFFIX_SOUL_DRAIN] } }],
  ["berserk1", { name: "Berserking", slots: ["weapon", "ring"], weight: 8, display: { context: "Equip", format: "On hit, {chance}% chance to gain berserk for {turns} turns.", values: { chance: 10, turns: 5 } }, triggerScripts: { onHit: [AFFIX_BERSERK] } }],
  ["shieldWall1", { name: "Stoneskin Proc", slots: ["armor", "offhand"], weight: 10, display: { context: "Equip", format: "When damaged, {chance}% chance to gain stoneskin for {turns} turns.", values: { chance: 15, turns: 4 } }, triggerScripts: { onDamaged: [AFFIX_SHIELD_WALL] } }],
  ["helmGuard1", { name: "Helm Guard", slots: ["head"], weight: 16, display: { context: "Equip", format: "+1 evade." }, passiveRefs: [AFFIX_GUARD] }],
  ["helmAttuned1", { name: "Helm of Attunement", slots: ["head"], weight: 14, display: { context: "Equip", format: "+0.25 mana regeneration." }, passiveRefs: [AFFIX_ATTUNED] }],
  ["manaSurge1", { name: "Mana Surge", slots: ["ring", "weapon"], weight: 10, display: { context: "Equip", format: "On hit, {chance}% chance to restore {mana} mana.", values: { chance: 20, mana: 3 } }, triggerScripts: { onHit: [AFFIX_MANA_SURGE] } }],
  ["executioner1", { name: "Executioner", slots: ["weapon"], weight: 6, display: { context: "Equip", format: "Attacks against targets below {threshold}% HP deal +{damage} damage.", values: { threshold: 30, damage: 3 } }, triggerScripts: { onBeforeHit: [AFFIX_EXECUTIONER] } }],
  ["frostbite1", { name: "Frostbite", slots: ["weapon"], weight: 10, display: { context: "Equip", format: "On hit, {chance}% chance to frost for {turns} turns.", values: { chance: 20, turns: 3 } }, elementTint: ELEMENT_TINT_FROST, triggerScripts: { onHit: [AFFIX_FROSTBITE] } }],
  ["hemorrhage1", { name: "Hemorrhage", slots: ["weapon"], weight: 12, display: { context: "Equip", format: "On hit, {chance}% chance to bleed for {turns} turns.", values: { chance: 25, turns: 4 } }, triggerScripts: { onHit: [AFFIX_HEMORRHAGE] } }],
  ["secondWind1", { name: "Second Wind", slots: ["armor", "offhand"], weight: 8, display: { context: "Equip", format: "When damaged, {chance}% chance to regenerate and restore {stamina} stamina.", values: { chance: 10, stamina: 5 } }, triggerScripts: { onDamaged: [AFFIX_SECOND_WIND] } }],
  ["flaming", { name: "Flaming", slots: ["weapon"], weight: 8, display: { context: "Equip", format: "On hit, {chance}% chance to burn for {turns} turns.", values: { chance: 50, turns: 3 } }, elementTint: ELEMENT_TINT_FIRE, triggerScripts: { onHit: [AFFIX_FLAMING] } }],
  ["stunning1", { name: "Stunning", slots: ["weapon"], weight: 0, display: { context: "Equip", format: "On hit, {chance}% chance to stun for {turns} turn.", values: { chance: 25, turns: 1 } }, triggerScripts: { onHit: [AFFIX_STUNNING] } }],
  ["earthshaker", { name: "Earthshaker", slots: ["weapon", "gloves", "feet"], weight: 6, display: { context: "Equip", format: "Earthshatter creates a Volcanic Fissure instead of a normal quake." } }],
  ["weaken1", { name: "Weakening", slots: ["weapon"], weight: 9, display: { context: "Equip", format: "On hit, {chance}% chance to weaken for {turns} turns.", values: { chance: 20, turns: 3 } }, triggerScripts: { onHit: [AFFIX_WEAKEN] } }],
  ["agony1", { name: "Agony", slots: ["weapon"], weight: 8, display: { context: "Equip", format: "On hit, {chance}% chance to inflict agony for {turns} turns.", values: { chance: 25, turns: 4 } }, triggerScripts: { onHit: [AFFIX_AGONY] } }],
  ["cripple1", { name: "Crippling", slots: ["weapon"], weight: 7, display: { context: "Equip", format: "On hit, {chance}% chance to frost and deal +1 pierce damage for {turns} turns.", values: { chance: 20, turns: 2 } }, triggerScripts: { onHit: [AFFIX_CRIPPLE] } }],
  ["plague1", { name: "Plague", slots: ["weapon"], weight: 6, display: { context: "Equip", format: "On hit, {chance}% chance to inflict poison for {poisonTurns} turns and disease for {diseaseTurns} turns.", values: { chance: 20, poisonTurns: 4, diseaseTurns: 3 } }, elementTint: ELEMENT_TINT_POISON, triggerScripts: { onHit: [AFFIX_PLAGUE] } }],
  ["soulfire1", { name: "Soulfire", slots: ["weapon"], weight: 7, display: { context: "Equip", format: "On hit, {chance}% chance to heal {heal} HP and burn for {turns} turns.", values: { chance: 15, heal: 2, turns: 3 } }, elementTint: ELEMENT_TINT_FIRE, triggerScripts: { onHit: [AFFIX_SOULFIRE] } }],
].forEach(([id, spec]) => {
  registerAffixDefinition(id, spec);
});

export function getAffix(id) { return AFFIX_REGISTRY.get(String(id || "")) || null; }
export function listAffixes() { return Array.from(AFFIX_REGISTRY.values()).map((record) => ({ ...record })); }
export function listAffixEntries() { return Array.from(AFFIX_REGISTRY.values()).map((record) => ({ id: record.id, record })); }
export function listAffixIds() { return Array.from(AFFIX_REGISTRY.keys()); }
export function getAffixName(id) { return String(getAffix(id)?.name || id || ""); }
export function getAffixDescription(id) { return String(getAffix(id)?.description || ""); }
export function getAffixElementTint(id) { return getAffix(id)?.elementTint || null; }
export function getAffixVisualAffinity(id) { return getAffix(id)?.visualAffinity || null; }
export function getAffixWeight(id) { return Number(getAffix(id)?.weight || 0); }
export function getAffixPassiveRefs(id) {
  const refs = getAffix(id)?.passiveRefs;
  return Array.isArray(refs) ? refs.slice() : [];
}
export function getAffixPassiveRef(id) { return getAffixPassiveRefs(id)[0] || null; }
export function getAffixTriggerScripts(id, trigger) {
  const record = getAffix(id);
  if (!record) return [];
  const list = record.triggerScripts?.[String(trigger || "")];
  return Array.isArray(list) ? list.slice() : [];
}
export function getAffixTriggerScript(id) { return getAffixTriggerScripts(id, "onHit")[0] || null; }
export function getAffixTriggers(id) {
  const record = getAffix(id);
  return record ? Object.keys(record.triggerScripts) : [];
}
export function affixHasTrigger(id, trigger) {
  return getAffixTriggerScripts(id, trigger).length > 0;
}
export function affixSupportsSlot(id, slot) {
  const slots = getAffix(id)?.slots;
  return Array.isArray(slots) && slots.includes(String(slot || ""));
}
