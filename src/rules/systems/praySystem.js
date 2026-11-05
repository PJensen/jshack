import { PrayIntent } from "../components/Intents/PrayIntent.js";
import { Devotion } from "../components/Devotion.js";
import { Player } from "../components/Player.js";
import { Vitality } from "../components/Vitality.js";
import { Hunger } from "../components/Hunger.js";
import { Mana } from "../components/Mana.js";
import { Status } from "../components/Status.js";
import { Position } from "../components/Position.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { Beatitude } from "../components/Beatitude.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { isDeityFavoring, resolvePlayerActiveDeity } from "./deitySystem.js";
import { hasStatus, statusStrength } from "../utils/statusFacade.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { getHungerLevel } from "../data/food.js";
import { createFrom } from "../../lib/ecs-js/archetype.js";
import { HealthPotion } from "../archetypes/Items.js";
import { ensureActiveEffects } from "../utils/effects.js";
import { effectiveMaxHp, effectiveMaxMana } from "../utils/passiveBonuses.js";
import { applyHealing } from "../utils/applyHealing.js";

const PRAYER_STREAK_KEY = Symbol.for('jshack:prayer:boonStreak');
const PRAYER_LAST_BOON_KEY = Symbol.for('jshack:prayer:lastBoonTurn');
const PRAYER_BACKFIRE_CHANCE = 0.03;

const HARMFUL_STATUSES = Object.freeze(new Set([
  'disease', 'poisoned', 'cursed', 'bleeding', 'weakened', 'blinded', 'deafened',
]));

function ensurePrayerStore(world, key) {
  const current = world[key];
  if (current instanceof Map) return current;
  const created = new Map();
  world[key] = created;
  return created;
}

function deterministicRoll(world, actorId, salt = 0) {
  const step = Number(world?.step || 0) | 0;
  const actor = Number(actorId || 0) | 0;
  const n = Math.sin((step + 1) * 12.9898 + actor * 78.233 + Number(salt || 0) * 0.137) * 43758.5453;
  return n - Math.floor(n);
}

function pushEffect(world, actorId, effect) {
  const ae = ensureActiveEffects(world, actorId);
  if (!ae) return false;
  ae.effects.push(effect);
  return true;
}

function emitIntervention(world, payload) {
  world.emit('deity:intervention', payload);
}

function emitBoon(world, payload) {
  world.emit('deity:boon', payload);
  emitIntervention(world, {
    playerId: payload?.actor,
    deityId: payload?.deityId,
    deityName: payload?.deityName,
    kind: 'boon',
    effect: payload?.boon,
    message: payload?.message,
  });
}

function removeHarmfulStatuses(world, actorId) {
  const st = world.get(actorId, Status);
  if (!st || !Array.isArray(st.statuses)) return 0;
  const before = st.statuses.length;
  st.statuses = st.statuses.filter((entry) => !HARMFUL_STATUSES.has(String(entry?.type || '').toLowerCase()));
  return Math.max(0, before - st.statuses.length);
}

function uncurseEquipped(world, actorId, maxItems = 2) {
  const eq = world.get(actorId, Equipment);
  if (!eq) return [];
  const uncursed = [];
  for (const slot of NON_AMMO_GEAR_SLOTS) {
    if (uncursed.length >= maxItems) break;
    const itemId = Number(eq[slot] || 0) | 0;
    if (!(itemId > 0)) continue;
    const beat = world.get(itemId, Beatitude);
    if (!beat || beat.state !== 'cursed') continue;
    beat.state = 'uncursed';
    uncursed.push({ itemId, name: world.get(itemId, NamedIdentity)?.name || 'item' });
  }
  return uncursed;
}

function spawnSupplyDrop(world, actorId) {
  const pos = world.get(actorId, Position);
  if (!pos) return null;
  const itemId = createFrom(world, HealthPotion, {});
  world.add(itemId, Position, { x: pos.x | 0, y: pos.y | 0 });
  return itemId;
}

function applyPrayerBoon(world, actorId, context) {
  const { deityId, deityName, distress, prayerPower = 1 } = context || {};
  const needs = Array.isArray(distress?.needs) ? distress.needs : [];

  const vit = world.get(actorId, Vitality);
  const mana = world.get(actorId, Mana);
  const hunger = world.get(actorId, Hunger);

  const hpRatio = vit?.maxHp > 0 ? (vit.hp / vit.maxHp) : 1;
  const manaRatio = mana?.maxMana > 0 ? (mana.mana / mana.maxMana) : 1;
  const hungry = !!hunger && hunger?.satiation <= 0 && getHungerLevel(Number(hunger?.hunger || 0)) !== 'sated';

  const desperate = !!distress?.desperate;
  const troubled = !!distress?.troubled;

  const candidates = [];
  if (needs.includes('extinguish')) candidates.push('extinguish');
  if (desperate || hpRatio < 0.65 || needs.includes('healing')) candidates.push('renewal');
  if (mana && (manaRatio < 0.75 || needs.includes('cure'))) candidates.push('mana_surge');
  if (needs.includes('cure') || needs.includes('blessing')) candidates.push('cleanse');
  if (hungry || needs.includes('food')) candidates.push('sustain');
  if (desperate || troubled) candidates.push('protection');
  candidates.push('fortune');
  candidates.push('supply_drop');

  const pickIndex = Math.floor(deterministicRoll(world, actorId, Number(world.step || 0) + candidates.length) * candidates.length);
  const boon = candidates[Math.max(0, Math.min(candidates.length - 1, pickIndex))] || 'fortune';

  // Extinguish boon: deity puts out fire and heals a small amount
  if (boon === 'extinguish') {
    const ae = world.get(actorId, ActiveEffects);
    if (ae && Array.isArray(ae.effects)) {
      ae.effects = ae.effects.filter(e => e.key !== 'burn' && e.key !== 'burning');
    }
    if (vit) {
      const cap = effectiveMaxHp(world, actorId, vit);
      const heal = Math.max(2, Math.floor(cap * 0.1 * Math.max(0.75, prayerPower)));
      applyHealing(world, { target: actorId, amount: heal, source: actorId, cause: 'divine:extinguish' });
    }
    emitBoon(world, {
      actor: actorId, deityId, deityName,
      boon: 'extinguish',
      message: `${deityName} douses the flames that consume you.`,
    });
    return true;
  }

  if (boon === 'renewal' && vit) {
    const renewalCap = effectiveMaxHp(world, actorId, vit);
    const heal = Math.max(4, Math.floor(renewalCap * (desperate ? 0.45 : 0.28) * Math.max(0.75, prayerPower)));
    const applied = applyHealing(world, {
      target: actorId,
      amount: heal,
      source: actorId,
      cause: 'divine:renewal',
    }).amount;
    if (applied > 0) {
      emitBoon(world, {
        actor: actorId,
        deityId,
        deityName,
        boon: 'renewal',
        amount: applied,
        message: `${deityName} floods you with restorative grace (+${applied} HP).`,
      });
      return true;
    }
  }

  if (boon === 'mana_surge' && mana) {
    const maxM = effectiveMaxMana(world, actorId, mana);
    const restore = Math.max(6, Math.floor(maxM * (desperate ? 0.5 : 0.34) * Math.max(0.75, prayerPower)));
    const before = mana.mana;
    mana.mana = Math.min(maxM, mana.mana + restore);
    mana.regenCooldown = 0;
    mana.manaRegen = Math.min(2.0, Number(mana.manaRegen || 0) + 0.08);
    pushEffect(world, actorId, { key: 'mana_regen_boost', turnsLeft: 20, potency: 2, stacks: 1 });
    const applied = Math.max(0, mana.mana - before);
    emitBoon(world, {
      actor: actorId,
      deityId,
      deityName,
      boon: 'mana_surge',
      amount: applied,
      message: `${deityName} ignites your spirit (+${applied} MP, boosted regen).`,
    });
    return true;
  }

  if (boon === 'cleanse') {
    const removed = removeHarmfulStatuses(world, actorId);
    const uncursed = uncurseEquipped(world, actorId, 2);
    if (removed > 0 || uncursed.length > 0) {
      emitBoon(world, {
        actor: actorId,
        deityId,
        deityName,
        boon: 'cleanse',
        removed,
        uncursed: uncursed.length,
        message: `${deityName} purges your burdens (${removed} afflictions, ${uncursed.length} curses lifted).`,
      });
      return true;
    }
  }

  if (boon === 'sustain' && hunger) {
    hunger.hunger = Math.max(0, Number(hunger.hunger || 0) - (desperate ? 700 : 450));
    hunger.satiation = Math.max(Number(hunger.satiation || 0), 70);
    emitBoon(world, {
      actor: actorId,
      deityId,
      deityName,
      boon: 'sustain',
      message: `${deityName} fills your belly with impossible strength.`,
    });
    return true;
  }

  if (boon === 'protection') {
    pushEffect(world, actorId, { key: 'blessed', turnsLeft: 40, potency: 1, stacks: 1 });
    pushEffect(world, actorId, { key: 'regen', turnsLeft: desperate ? 24 : 16, potency: desperate ? 2 : 1, stacks: 1 });
    emitBoon(world, {
      actor: actorId,
      deityId,
      deityName,
      boon: 'protection',
      message: `${deityName} wraps you in a radiant ward.`,
    });
    return true;
  }

  if (boon === 'supply_drop') {
    const itemId = spawnSupplyDrop(world, actorId);
    if (itemId > 0) {
      emitBoon(world, {
        actor: actorId,
        deityId,
        deityName,
        boon: 'supply_drop',
        itemId,
        message: `${deityName} hurls a healing draught to your feet!`,
      });
      return true;
    }
  }

  // Fallback: fortune always lands.
  pushEffect(world, actorId, { key: 'lucky', turnsLeft: desperate ? 180 : 120, potency: desperate ? 3 : 2, stacks: 1 });
  emitBoon(world, {
    actor: actorId,
    deityId,
    deityName,
    boon: 'fortune',
    message: `${deityName} bends fate in your favor.`,
  });
  return true;
}

/**
 * praySystem --- processes PrayIntent by calling deity.pray()
 * Detects player distress and boosts prayer effectiveness when in need.
 * (Spam is handled by deity's Supplicant system --- predictability angers gods)
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function praySystem(world) {
  const unanswered = ensurePrayerStore(world, PRAYER_STREAK_KEY);
  const lastBoonTurn = ensurePrayerStore(world, PRAYER_LAST_BOON_KEY);

  for (const [id] of world.query(PrayIntent)) {
    // Only players with devotion can pray
    if (world.has(id, Player)) {
      const devotion = world.get(id, Devotion);
      if (devotion) {
        const resolved = resolvePlayerActiveDeity(world, id);
        if (resolved?.deity) {
          const { deityId, deity } = resolved;
          // Assess player distress to determine prayer urgency
          const distress = assessDistress(world, id);

          // Normal prayer
          deity.pray();

          // If player is suffering, boost serenity to increase miracle chance
          if (distress.desperate) {
            // Desperate plea --- offer suffering as devotion, which pleases healing deities
            deity.offer('suffering', {
              value: distress.severity,
              alignment: 'lawful' // Suffering offerings appeal to order/healing deities
            });
          } else if (distress.troubled) {
            // Moderate need --- small serenity boost via lesser offering
            deity.offer('plea', {
              value: distress.severity * 0.5,
              alignment: 'neutral'
            });
          }

          const deityFavoring = isDeityFavoring(deity);

          if (!deityFavoring) {
            const backfireRoll = world.rand();
            const eq = world.get(id, Equipment);
            let cursedItem = null;
            if (eq) {
              for (const slot of NON_AMMO_GEAR_SLOTS) {
                const itemId = Number(eq[slot] || 0) | 0;
                if (!(itemId > 0)) continue;
                const beat = world.get(itemId, Beatitude);
                if (!beat || beat.state !== 'cursed') {
                  cursedItem = {
                    itemId,
                    name: world.get(itemId, NamedIdentity)?.name || 'item',
                  };
                  break;
                }
              }
            }

            if (cursedItem && backfireRoll < PRAYER_BACKFIRE_CHANCE) {
              world.emit('curse:equipment', {
                actor: id,
                itemId: cursedItem.itemId,
                source: 'prayer_backfire',
              });
              world.emit('deity:intervention', {
                playerId: id,
                deityId,
                deityName: deity.name,
                kind: 'prayer_curse',
                itemId: cursedItem.itemId,
                itemName: cursedItem.name,
              });
            } else {
              world.emit('deity:intervention', {
                playerId: id,
                deityId,
                deityName: deity.name,
                kind: 'prayer_refusal',
              });
            }
          }

          // Prayer-based curse removal: a healthy player can focus spiritual energy
          if (deityFavoring && !distress.desperate && !distress.troubled) {
            const vit = world.get(id, Vitality);
            const hpPct = vit ? (vit.hp / vit.maxHp) : 0;
            if (hpPct > 0.8) {
              const eq = world.get(id, Equipment);
              if (eq) {
                for (const slot of NON_AMMO_GEAR_SLOTS) {
                  const itemId = eq[slot];
                  if (!Number.isInteger(itemId) || itemId <= 0) continue;
                  const beat = world.get(itemId, Beatitude);
                  if (beat && beat.state === 'cursed') {
                    beat.state = 'uncursed';
                    const itemName = world.get(itemId, NamedIdentity)?.name || 'item';
                    world.emit('prayer:curse-removed', {
                      actor: id,
                      itemId,
                      name: itemName,
                      deityId,
                    });
                    world.emit('deity:intervention', {
                      playerId: id,
                      deityId,
                      deityName: deity.name,
                      kind: 'prayer_uncurse',
                      itemId,
                      itemName,
                    });
                    break; // one item per prayer
                  }
                }
              }
            }
          }

          // Emit event for logging/UI feedback
          world.emit('prayer', {
            actor: id,
            deityId,
            distress
          });
          world.emit('prayer:insight', {
            actor: id,
            deityId,
            deityName: deity.name,
            pantheon: devotion?.pantheon === true,
            severity: Number(distress.severity || 0),
            desperate: !!distress.desperate,
            troubled: !!distress.troubled,
            needs: Array.isArray(distress.needs) ? distress.needs : [],
          });

          // Fast prayer-boon resolver (on top of classic miracle system)
          const streak = Math.max(0, Number(unanswered.get(id) || 0));
          const sinceBoon = (Number(world.step || 0) | 0) - (Number(lastBoonTurn.get(id) || -99999) | 0);
          const prayerPower = Math.max(0.8, 1 + (distress.severity * 0.8));
          const baseChance = 0.22;
          const distressBonus = distress.severity * 0.56;
          const pityBonus = Math.min(0.44, streak * 0.08);
          const droughtBonus = sinceBoon > 10 ? 0.12 : 0;
          // Praying at 1 HP: even an unfavorable deity might answer
          const playerVit = world.get(id, Vitality);
          const deathsDoorBonus = (playerVit && (playerVit.hp | 0) <= 1) ? 0.35 : 0;
          // Cursed equipped items offend the divine — each one dulls the prayer.
          const prayEq = world.get(id, Equipment);
          let cursedEquippedCount = 0;
          if (prayEq) {
            for (const slot of NON_AMMO_GEAR_SLOTS) {
              const slotId = Number(prayEq[slot] || 0) | 0;
              if (slotId > 0) { const b = world.get(slotId, Beatitude); if (b?.state === 'cursed') cursedEquippedCount++; }
            }
          }
          const cursedPenalty = Math.min(0.30, cursedEquippedCount * 0.07);
          const chance = Math.min(0.95, baseChance + distressBonus + pityBonus + droughtBonus + deathsDoorBonus - cursedPenalty);
          const roll = deterministicRoll(world, id, streak + 17);

          if (deityFavoring && roll < chance) {
            const applied = applyPrayerBoon(world, id, {
              deityId,
              deityName: deity.name,
              distress,
              prayerPower,
            });
            if (applied) {
              unanswered.set(id, 0);
              lastBoonTurn.set(id, Number(world.step || 0) | 0);
            } else {
              unanswered.set(id, streak + 1);
            }
          } else {
            unanswered.set(id, streak + 1);
          }
        }
      }
    }

    // Consume the intent
    try { world.remove(id, PrayIntent); } catch {} // ECS: may not exist
  }
}

/**
 * Assess how much the player is suffering.
 * @returns {{ desperate: boolean, troubled: boolean, severity: number, needs: string[] }}
 */
function assessDistress(world, playerId) {
  const needs = [];
  let severity = 0;

  // Check vitality (HP)
  if (world.has(playerId, Vitality)) {
    const vit = world.get(playerId, Vitality);
    const hpPercent = vit.hp / vit.maxHp;
    if (hpPercent < 0.2) {
      needs.push('healing');
      severity += 0.8; // Critical HP
    } else if (hpPercent < 0.4) {
      needs.push('healing');
      severity += 0.4; // Low HP
    }
  }

  // Check hunger
  if (world.has(playerId, Hunger)) {
    const hunger = world.get(playerId, Hunger);
    if (hunger?.satiation > 0) {
      // Satiated actors are not in food distress.
    } else {
      const level = getHungerLevel(Number(hunger?.hunger || 0));
      if (level === 'wasting' || level === 'starving') {
        needs.push('food');
        severity += 0.9;
      } else if (level === 'famished') {
        needs.push('food');
        severity += 0.5;
      } else if (level === 'hungry' || level === 'peckish') {
        needs.push('food');
        severity += 0.2;
      }
    }
  }

  // Check for harmful status effects (active-effects first).
  if (hasStatus(world, playerId, 'disease') || hasStatus(world, playerId, 'poisoned')) {
    needs.push('cure');
    severity += 0.6;
  }
  if (hasStatus(world, playerId, 'cursed')) {
    needs.push('blessing');
    severity += 0.7;
  }
  if (hasStatus(world, playerId, 'bleeding')) {
    needs.push('healing');
    severity += 0.5;
  }
  if (statusStrength(world, playerId, 'burning') > 0 || statusStrength(world, playerId, 'burn') > 0) {
    needs.push('extinguish');
    severity += 0.6;
  }

  // Cap severity at 1.0
  severity = Math.min(1.0, severity);

  return {
    desperate: severity > 0.7,
    troubled: severity > 0.3 && severity <= 0.7,
    severity,
    needs
  };
}
