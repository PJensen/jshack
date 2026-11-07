// rules/data/combatInteractions.js
// Data-driven combat interaction rules.
//
// Each rule is a plain object with:
//   phase:  "beforeHit" | "hit"   — which combat event to hook
//   gate:   (world, ctx) => bool  — return true if this rule should fire
//   apply:  (world, ctx) => void  — mutate ctx.damage, emit events, etc.
//
// Rules are evaluated in order on every melee hit via world.on(phase).
// To add a new interaction: push an entry to COMBAT_INTERACTION_RULES.
// No changes to combatSystem.js required.

import { Beatitude, BUC_BLESSED } from "../components/Beatitude.js";
import { CreatureType, CREATURE_TYPES } from "../components/CreatureType.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Vitality } from "../components/Vitality.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { blind, getEffectiveVisionRange } from "../utils/blind.js";
import { effectStrength, statusStrength } from "../utils/statusFacade.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import { ensureActiveEffects } from "../utils/effects.js";
import { combatSeed, mulberry32 } from "../utils/rng.js";

// ── Rule definitions ─────────────────────────────────────────────────

export const COMBAT_INTERACTION_RULES = [

  // Blessed weapon vs undead: +2 flat damage
  {
    id: "blessed_weapon_vs_undead",
    phase: "beforeHit",
    gate(world, ctx) {
      if (!(ctx.weaponId > 0)) return false;
      const beat = world.get(ctx.weaponId, Beatitude);
      if (!beat || beat.state !== BUC_BLESSED) return false;
      const ct = world.get(ctx.defender, CreatureType);
      return ct?.type === CREATURE_TYPES.undead;
    },
    apply(world, ctx) {
      ctx.damage += 2;
      world.emit("combat:blessed_strike", {
        attacker: ctx.attacker, defender: ctx.defender,
        weaponId: ctx.weaponId, creatureType: CREATURE_TYPES.undead, bonusDmg: 2,
      });
    },
  },

  // Blessed weapon vs demon: +2 flat damage + banish at <15% HP
  {
    id: "blessed_weapon_vs_demon",
    phase: "beforeHit",
    gate(world, ctx) {
      if (!(ctx.weaponId > 0)) return false;
      const beat = world.get(ctx.weaponId, Beatitude);
      if (!beat || beat.state !== BUC_BLESSED) return false;
      const ct = world.get(ctx.defender, CreatureType);
      return ct?.type === CREATURE_TYPES.demon;
    },
    apply(world, ctx) {
      ctx.damage += 2;
      const vit = world.get(ctx.defender, Vitality);
      const hpPct = vit ? (vit.hp / vit.maxHp) : 1;
      if (hpPct < 0.15) {
        ctx.damage = Math.max(ctx.damage, (vit?.hp || 0) + 1);
        world.emit("combat:banish", {
          attacker: ctx.attacker, defender: ctx.defender, weaponId: ctx.weaponId,
        });
      }
      world.emit("combat:blessed_strike", {
        attacker: ctx.attacker, defender: ctx.defender,
        weaponId: ctx.weaponId, creatureType: CREATURE_TYPES.demon, bonusDmg: 2,
      });
    },
  },

  // Sunlight weapon vs undead: +4 flat damage (holy radiance)
  {
    id: "sunlight_weapon_vs_undead",
    phase: "beforeHit",
    gate(world, ctx) {
      if (!(ctx.weaponId > 0)) return false;
      const info = world.get(ctx.weaponId, ItemInfo);
      if (!info || !Array.isArray(info.tags) || !info.tags.includes("sunlight")) return false;
      const ct = world.get(ctx.defender, CreatureType);
      return ct?.type === CREATURE_TYPES.undead;
    },
    apply(world, ctx) {
      ctx.damage += 4;
      world.emit("combat:holy_strike", {
        attacker: ctx.attacker, defender: ctx.defender,
        weaponId: ctx.weaponId, creatureType: CREATURE_TYPES.undead, bonusDmg: 4,
      });
    },
  },

  // Sunlight weapon on hit: permanent blindness (vision → 0)
  {
    id: "sunlight_weapon_blind",
    phase: "hit",
    gate(world, ctx) {
      if (!(ctx.weaponId > 0)) return false;
      const info = world.get(ctx.weaponId, ItemInfo);
      return !!(info && Array.isArray(info.tags) && info.tags.includes("sunlight"));
    },
    apply(world, ctx) {
      const curVision = getEffectiveVisionRange(world, ctx.defender);
      const rampOut = (world.rand() < 0.5) ? 2 : 3;
      blind(world, ctx.defender, Math.max(1, curVision - 2), 0, 0, rampOut, undefined, { stack: true });
      world.emit("combat:sunblind", {
        attacker: ctx.attacker, defender: ctx.defender, weaponId: ctx.weaponId,
      });
    },
  },

  // Frozen + blunt = 2x damage (shatter)
  {
    id: "frozen_shatter_blunt",
    phase: "beforeHit",
    gate(world, ctx) {
      return ctx.damageType === "blunt"
        && statusStrength(world, ctx.defender, "frozen") + effectStrength(world, ctx.defender, "frost_nova") > 0;
    },
    apply(world, ctx) {
      ctx.damage = Math.floor(ctx.damage * 2);
      world.emit("combat:shatter", {
        attacker: ctx.attacker, defender: ctx.defender,
        damageType: "blunt", mult: 2,
      });
    },
  },

  // Frozen + pierce = 1.5x damage (shatter)
  {
    id: "frozen_shatter_pierce",
    phase: "beforeHit",
    gate(world, ctx) {
      return ctx.damageType === "pierce"
        && statusStrength(world, ctx.defender, "frozen") + effectStrength(world, ctx.defender, "frost_nova") > 0;
    },
    apply(world, ctx) {
      ctx.damage = Math.floor(ctx.damage * 1.5);
      world.emit("combat:shatter", {
        attacker: ctx.attacker, defender: ctx.defender,
        damageType: "pierce", mult: 1.5,
      });
    },
  },

  // Torch hit: +2 fire damage, 35% chance to apply burning (3 turns)
  {
    id: "torch_ignite",
    phase: "hit",
    gate(world, ctx) {
      if (!(ctx.weaponId > 0)) return false;
      const info = world.get(ctx.weaponId, ItemInfo);
      return info?.id === "torch";
    },
    apply(world, ctx) {
      const seed = combatSeed(world.seed, world.step, ctx.attacker, ctx.defender, 0x70FC4);
      const roll = mulberry32(seed)();
      if (roll < 0.35) {
        const ae = ensureActiveEffects(world, ctx.defender);
        if (ae) {
          upsertTimedEffect(ae.effects, { key: "burn", turnsLeft: 3, potency: 1, stacks: 1 });
          world.emit("combat:torch_ignite", {
            attacker: ctx.attacker, defender: ctx.defender, weaponId: ctx.weaponId,
          });
        }
      }
    },
  },

];

// ── Installer ────────────────────────────────────────────────────────

const INSTALLED = Symbol.for("jshack:combatInteractions:installed");

/**
 * Install all combat interaction rules onto a world.
 * Safe to call multiple times — installs once per world.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function installCombatInteractions(world) {
  if (!world || world[INSTALLED]) return;
  world[INSTALLED] = true;

  const byPhase = Object.create(null);
  for (const rule of COMBAT_INTERACTION_RULES) {
    const phase = rule.phase || "beforeHit";
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(rule);
  }

  for (const [phase, rules] of Object.entries(byPhase)) {
    world.on(phase, (ctx) => {
      if (!(ctx.damage > 0)) return;
      for (const rule of rules) {
        try {
          if (rule.gate(ctx.world, ctx)) rule.apply(ctx.world, ctx);
        } catch (e) {
          console.error(`[combatInteraction] rule "${rule.id}" failed:`, e);
        }
      }
    });
  }
}
