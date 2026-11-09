import { CastSpellIntent } from "../components/Intents/CastSpellIntent.js";
import { Brain } from "../components/Brain.js";
import { Mana } from "../components/Mana.js";
import { Channeling } from "../components/Channeling.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { getSpell } from "../data/spells.js";
import { getProcPackage } from "../data/procPackages.js";
import { runSpellScript } from "../scripts/spells.js";
import { MANA_REGEN_COOLDOWN } from "../data/regenConstants.js";
import { combatSeed, hashString32, mulberry32 } from "../utils/rng.js";
import { statusStrength } from "../utils/statusFacade.js";
import { resolveDerivedStats } from "../utils/derivedStats.js";
import { Player } from "../components/Player.js";
import { isSpellOnCooldown, setSpellCooldown } from "../utils/spellCooldowns.js";
import { Position } from "../components/Position.js";
import { isTargetHiddenByInvisibility } from "../utils/spellTargeting.js";
import { getChannelInterruptionReason } from "../utils/channelInterruptionPolicy.js";
import { hasEquippedProcPackageInSlot } from "../utils/spellProcGear.js";
import { ensureActiveEffects } from "../utils/effects.js";
import { Vitality } from "../components/Vitality.js";
import { Devotion } from "../components/Devotion.js";
import { effectiveMaxHp } from "../utils/passiveBonuses.js";
import { getDeityInstance } from "./deitySystem.js";
import { Stamina } from "../components/Stamina.js";
import { STAMINA_REGEN_COOLDOWN } from "../data/regenConstants.js";
import { spellCost, spellCostPerTick, spellCostResource } from "../data/spells.js";
/** @typedef {import('../../lib/ecs-js/index.js').World} World */

// ── Spirit wisp spell boost ───────────────────────────────────────
// The deity's spirit conduit sometimes surges alongside ranged spells
// and amplifies their damage when the player is hurting.
// Requires an active deity patron with non-wrathful standing.
const SPIRIT_BOOST_HP_THRESHOLD = 0.5;  // HP% below which boost can proc
const SPIRIT_BOOST_MIN_CHANCE = 0.20;   // chance at exactly the threshold
const SPIRIT_BOOST_MAX_CHANCE = 0.40;   // chance when near death
const SPIRIT_BOOST_POWER_MULT = 1.3;    // 30% extra damage
const SPIRIT_BOOST_WRATH_GATE = 0.3;    // deity wrath must be below this

/**
 * Accept both raw ids ("flash_heal") and item-style ids ("spell:flash_heal").
 * @param {any} value
 * @returns {string}
 */
function normalizeSpellId(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("spell:") ? raw.slice(6) : raw;
}

/**
 * @param {any} brain
 * @returns {string[]}
 */
function normalizedLearnedSpellIds(brain) {
  const raw = Array.isArray(brain?.learnedSpellIds) ? brain.learnedSpellIds : [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (let i = 0; i < raw.length; i++) {
    const id = normalizeSpellId(raw[i]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readEchoGrimoireState(world, actorId) {
  const ae = world.get(actorId, ActiveEffects);
  const effects = Array.isArray(ae?.effects) ? ae.effects : [];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (String(effect?.key || "") !== "echo_grimoire_memory") continue;
    const spellId = String(effect?.meta?.spellId || "");
    const turnsLeft = Math.max(0, Number(effect?.turnsLeft || 0) | 0);
    return { effect, spellId, turnsLeft };
  }
  return null;
}

function upsertEchoGrimoireState(world, actorId, spellId, repeatWindowTurns) {
  const ae = ensureActiveEffects(world, actorId);
  if (!ae) return;
  const effects = ae.effects;
  const id = String(spellId || "");
  let rec = null;
  for (let i = 0; i < effects.length; i++) {
    if (String(effects[i]?.key || "") === "echo_grimoire_memory") {
      rec = effects[i];
      break;
    }
  }
  if (rec) {
    rec.turnsLeft = repeatWindowTurns;
    rec.potency = 1;
    rec.stacks = 1;
    rec.startedAtTurn = world.step;
    rec.sourceId = actorId;
    rec.meta = { ...(rec.meta || {}), spellId: id };
    return;
  }
  effects.push({
    key: "echo_grimoire_memory",
    turnsLeft: repeatWindowTurns,
    potency: 1,
    stacks: 1,
    startedAtTurn: world.step,
    sourceId: actorId,
    meta: { spellId: id },
  });
}

/**
 * @param {World} world
 * @param {number} actor
 * @param {{ id:string }} intendedSpell
 * @param {string[]} learnedSpellIds
 * @returns {{ kind: "normal"|"miscast"|"fizzle", spell: any }}
 */
function resolveConfusedCast(world, actor, intendedSpell, learnedSpellIds) {
  const confusePower = statusStrength(world, actor, "confused");
  if (confusePower <= 0) return { kind: "normal", spell: intendedSpell };
  // Spells marked clearMindedCasting resolve normally even when confused
  // (e.g. blink handles confusion inside its own targeting, flash_heal is
  // a desperate reflex, phase_strike muscle memory).
  if (intendedSpell?.clearMindedCasting) {
    return { kind: "normal", spell: intendedSpell };
  }

  const alternatives = [];
  for (let i = 0; i < learnedSpellIds.length; i++) {
    const id = normalizeSpellId(learnedSpellIds[i]);
    if (!id || id === intendedSpell.id) continue;
    const def = getSpell(id);
    if (def) alternatives.push(def);
  }
  if (alternatives.length === 0) return { kind: "fizzle", spell: intendedSpell };

  const salt = hashString32(intendedSpell.id) ^ 0xC05FACE;
  const r = mulberry32(combatSeed(world.seed, world.step, actor, alternatives.length, salt));
  const idx = (r() * alternatives.length) | 0;
  return { kind: "miscast", spell: alternatives[idx] };
}

/**
 * Resolve CastSpellIntent:
 * - Validate that actor knows the spell
 * - Check resource (mana/stamina/life) and deduct cost
 * - Confused casters miscast to another learned spell, or fizzle if none exists
 * - Emit 'castSpell' semantic event for bridge/display to react to
 * - Clear intent
 * Emits on failure:
 * - 'spell:unknown' | 'spell:not-known' | 'spell:oom' | 'spell:fizzle'
 * @param {World} world
 */
export function castSpellSystem(world) {
  for (const [actor, intent] of world.query(CastSpellIntent)) {
    /** @type {{ learnedSpellIds?: string[] }|null} */
    const brain0 = /** @type any */ (world.get(actor, Brain));
    let spellId = normalizeSpellId(intent?.spellId);
    const learned0 = normalizedLearnedSpellIds(brain0);
    // If no spell specified, default to first learned
    if (!spellId) {
      const first = learned0[0] || null;
      if (first) spellId = first;
    }
    const spell = getSpell(spellId);
    if (!spell) {
      world.emit('spell:unknown', { actor, spellId });
      world.remove(actor, CastSpellIntent);
      continue;
    }

    const interruption = getChannelInterruptionReason(world, actor);
    if (interruption) {
      world.emit("spell:fizzle", {
        actor,
        spellId: spell.id,
        reason: interruption,
      });
      world.remove(actor, CastSpellIntent);
      continue;
    }

    const targetId = Number(intent?.targetId || 0) | 0;
    if (targetId > 0 && targetId !== actor) {
      const sourcePos = world.get(actor, Position);
      const targetPos = world.get(targetId, Position);
      if (isTargetHiddenByInvisibility(world, {
        sourceId: actor,
        targetId,
        sourcePos,
        targetPos,
        allowAdjacentInvisibleTarget: true,
        hostileOnly: true,
      })) {
        world.emit("spell:fizzle", {
          actor,
          spellId: spell.id,
          reason: "target_invisible",
          targetId,
        });
        world.remove(actor, CastSpellIntent);
        continue;
      }
    }

    /** @type {{ learnedSpellIds?: string[] }|null} */
    const brain = /** @type any */ (world.get(actor, Brain));
    const learned = normalizedLearnedSpellIds(brain);
    const fromChanneling = !!intent._fromChanneling;
    if (!fromChanneling && (!brain || !learned.includes(spell.id))) {
      world.emit('spell:not-known', { actor, spellId: spell.id });
      world.remove(actor, CastSpellIntent);
      continue;
    }
    if (brain && Array.isArray(brain.learnedSpellIds)) {
      // One-time migration of legacy "spell:*" ids to canonical ids.
      if (brain.learnedSpellIds.length !== learned.length || brain.learnedSpellIds.some((id, i) => String(id ?? "") !== learned[i])) {
        brain.learnedSpellIds = learned.slice();
      }
    }

    const minIntelligence = Math.max(0, Number(spell?.minIntelligence || 0) | 0);
    if (minIntelligence > 0) {
      const resolved = resolveDerivedStats(world, actor);
      const currentIntelligence = Math.max(
        Number(resolved?.intelligence || 0),
        Number(brain?.intelligence || 0),
      );
      if (currentIntelligence < minIntelligence) {
        world.emit("spell:int-too-low", {
          actor,
          spellId: spell.id,
          need: minIntelligence,
          have: currentIntelligence,
        });
        world.remove(actor, CastSpellIntent);
        continue;
      }
    }

    // Cooldown gate (player only)
    if (!fromChanneling && world.has(actor, Player)) {
      const cdTurns = Number(spell.cooldown || 0) | 0;
      if (cdTurns > 0 && isSpellOnCooldown(world, spell.id)) {
        world.emit('spell:on-cooldown', { actor, spellId: spell.id });
        world.remove(actor, CastSpellIntent);
        continue;
      }
    }

    /** @type {{ mana?: number, maxMana?:number }|null} */
    const mana = /** @type any */ (world.get(actor, Mana));
    /** @type {{ stamina?: number, maxStamina?:number }|null} */
    const stamina = /** @type any */ (world.get(actor, Stamina));
    /** @type {{ hp?: number, maxHp?:number }|null} */
    const vit = /** @type any */ (world.get(actor, Vitality));

    const confusion = resolveConfusedCast(world, actor, spell, learned);
    const resolvedSpell = confusion.spell;
    const hasEchoGrimoire = hasEquippedProcPackageInSlot(world, actor, "offhand", "echoGrimoire");
    const echoParams = hasEchoGrimoire ? getProcPackage("echoGrimoire")?.params || {} : {};
    const repeatWindowTurns = Math.max(1, Number(echoParams.repeatWindowTurns || 3) | 0);
    const powerPercent = Math.max(0, Number(echoParams.powerPercent ?? 80));
    const echoState = hasEchoGrimoire ? readEchoGrimoireState(world, actor) : null;
    const isSustainedChannel = !!resolvedSpell?.channeling;
    const echoRepeat = !!(!isSustainedChannel && echoState && echoState.turnsLeft > 0 && echoState.spellId && echoState.spellId === resolvedSpell.id);
    let spellPowerScale = echoRepeat ? powerPercent / 100 : 1;
    const resource = spellCostResource(resolvedSpell);
    const baseCost = isSustainedChannel
      ? spellCostPerTick(resolvedSpell)
      : spellCost(resolvedSpell);
    const resourceCost = echoRepeat ? 0 : baseCost;
    const reserve = resource === "life" ? 1 : 0;
    const requiredToStart = isSustainedChannel
      ? Math.max(0, resourceCost) * 2 + reserve
      : resourceCost + reserve;

    let have = 0;
    if (resource === "stamina") {
      have = Number(stamina?.stamina ?? 0);
    } else if (resource === "life") {
      have = Number(vit?.hp ?? 0);
    } else {
      have = Number(mana?.mana ?? 0);
    }
    const costKind = resource === "stamina" ? "stamina" : resource === "life" ? "life" : "mana";

    // Sustained channels gate on one tick of resource up front but spend it during the
    // realtime channel loop. Cast-time channels keep the existing upfront payment.
    if (!fromChanneling) {
      if (have < requiredToStart) {
        world.emit('spell:oom', { actor, spellId: resolvedSpell.id, need: requiredToStart, have, costKind });
        world.remove(actor, CastSpellIntent);
        continue;
      }

      if (!isSustainedChannel) {
        if (resource === "stamina" && stamina) {
          stamina.stamina = have - resourceCost;
          stamina.regenCooldown = STAMINA_REGEN_COOLDOWN;
        } else if (resource === "life" && vit) {
          const floor = 1;
          vit.hp = Math.max(floor, have - resourceCost);
        } else if (mana) {
          // Deduct upfront mana and suppress regen this turn for instant/cast-time spells.
          mana.mana = have - resourceCost;
          mana.regenCooldown = MANA_REGEN_COOLDOWN;
        }
      }
    }

    if (confusion.kind === "fizzle") {
      world.emit("spell:fizzle", { actor, spellId: spell.id, confused: true });
      world.remove(actor, CastSpellIntent);
      continue;
    }

    if (confusion.kind === "miscast") {
      world.emit("spell:miscast", {
        actor,
        fromSpellId: spell.id,
        toSpellId: resolvedSpell.id,
        confused: true,
      });
    }

    // Cast time: begin channeling instead of immediate cast
    const castTime = Number(resolvedSpell.castTime || 0) | 0;
    if (castTime > 0 && !fromChanneling) {
      const casterPos = world.get(actor, Position);
      const channelTargetId = intent.targetId || actor;
      try {
        world.add(actor, Channeling, {
          mode: "cast",
          turnsRemaining: castTime,
          turnsTotal: castTime,
          manaPerTick: 0,
          spellId: resolvedSpell.id,
          targetId: channelTargetId,
          x: intent.x ?? null,
          y: intent.y ?? null,
          breakOnNoLos: !!resolvedSpell.breakOnNoLos,
          breakOnMove: !!resolvedSpell.breakOnMove,
          breakOnDamage: !!resolvedSpell.breakOnDamage,
          damageSetbackTurns: Math.max(0, Number(resolvedSpell.damageSetbackTurns || 0) | 0),
          anchorX: casterPos ? (casterPos.x | 0) : null,
          anchorY: casterPos ? (casterPos.y | 0) : null,
        });
      } catch {}
      world.emit('channeling:start', {
        actor,
        spellId: resolvedSpell.id,
        castTime,
        targetId: channelTargetId,
        x: intent.x ?? null,
        y: intent.y ?? null,
      });
      world.remove(actor, CastSpellIntent);
      continue;
    }

    if (isSustainedChannel && !fromChanneling) {
      try {
        world.add(actor, Channeling, {
          mode: "sustain",
          turnsRemaining: 0,
          turnsTotal: 0,
          manaPerTick: resource === "mana" ? resourceCost : 0,
          staminaPerTick: resource === "stamina" ? resourceCost : 0,
          lifePerTick: resource === "life" ? resourceCost : 0,
          spellId: resolvedSpell.id,
          targetId: intent.targetId || actor,
          x: intent.x ?? null,
          y: intent.y ?? null,
        });
      } catch {}
      world.emit("channeling:start", {
        actor,
        spellId: resolvedSpell.id,
        mode: "sustain",
        manaPerTick: resource === "mana" ? resourceCost : 0,
        staminaPerTick: resource === "stamina" ? resourceCost : 0,
        lifePerTick: resource === "life" ? resourceCost : 0,
      });
      world.remove(actor, CastSpellIntent);
      continue;
    }

    // Spirit wisp spell boost — deity-mediated, non-self spells, when player is hurting
    let spiritBoosted = false;
    if (world.has(actor, Player) && resolvedSpell.targeting !== 'self') {
      const devotion = world.get(actor, Devotion);
      const deityId = devotion?.deityId;
      const deity = deityId ? getDeityInstance(deityId) : null;
      if (deity) {
        const precise = deity._queryPrecise?.() || null;
        const wrath = Number(precise?.wrath || 0);
        if (wrath < SPIRIT_BOOST_WRATH_GATE) {
          const vit = world.get(actor, Vitality);
          if (vit) {
            const maxHp = effectiveMaxHp(world, actor, vit) || (vit.maxHp | 0);
            const hpPct = maxHp > 0 ? (vit.hp | 0) / maxHp : 1;
            if (hpPct < SPIRIT_BOOST_HP_THRESHOLD && hpPct > 0) {
              // Chance scales linearly: lower HP → higher chance
              // Serenity further boosts chance (deity is protective)
              const serenity = Number(precise?.serenity || 0);
              const t = 1 - (hpPct / SPIRIT_BOOST_HP_THRESHOLD); // 0 at threshold, 1 at 0 HP
              const baseChance = SPIRIT_BOOST_MIN_CHANCE + (SPIRIT_BOOST_MAX_CHANCE - SPIRIT_BOOST_MIN_CHANCE) * t;
              const chance = Math.min(0.6, baseChance + serenity * 0.1);
              if (world.rand() < chance) {
                spellPowerScale *= SPIRIT_BOOST_POWER_MULT;
                spiritBoosted = true;
              }
            }
          }
        }
      }
    }

    // Run scripted behavior (pure rules)
    const runtimeSpell = (echoRepeat || spellPowerScale !== 1)
      ? { ...resolvedSpell, powerScale: spellPowerScale }
      : resolvedSpell;
    try { runSpellScript(world, actor, runtimeSpell, intent); } catch (e) { console.error('[castSpellSystem] runSpellScript failed for "' + (resolvedSpell?.id || '?') + '":', e); }

    // Start cooldown (player only)
    if (world.has(actor, Player)) {
      const cdTurns = Number(resolvedSpell.cooldown || 0) | 0;
      if (cdTurns > 0) setSpellCooldown(world, resolvedSpell.id, cdTurns, cdTurns);
    }

    // Emit semantic cast event that bridge/display can turn into effects
    world.emit('castSpell', {
      actor,
      spellId: resolvedSpell.id,
      targetId: intent.targetId || actor,
      miscast: confusion.kind === "miscast",
      intendedSpellId: confusion.kind === "miscast" ? spell.id : undefined,
      powerScale: spellPowerScale,
      echoRepeat,
      spiritBoosted,
    });
    if (spiritBoosted) {
      world.emit('spirit:spellBoost', {
        actor,
        spellId: resolvedSpell.id,
        targetId: intent.targetId || actor,
        powerScale: spellPowerScale,
      });
    }
    if (hasEchoGrimoire && resolvedSpell.id) {
      upsertEchoGrimoireState(world, actor, resolvedSpell.id, repeatWindowTurns);
      if (echoRepeat) {
        world.emit("proc:echoGrimoire:echo", { actor, spellId: resolvedSpell.id, powerScale: spellPowerScale });
      }
    }
    world.remove(actor, CastSpellIntent);
  }
}
