/**
 * deitySystem — effects-phase system that ticks deity mood each world step.
 *
 * Reads Devotion components, ticks associated Deity instances, and emits
 * deity events onto the world event bus for the app layer to handle.
 *
 * The system also listens to world events (kills, heals) and forwards them
 * to the deity as actions.
 */

import { Devotion } from "../components/Devotion.js";
import { Deity } from "../../lib/deity-js/deity.js";
import { DEITY_DEFS, getDeity } from "../data/deities.js";
import { monsterHasTag } from "../data/monsters.js";
import { Player } from "../components/Player.js";
import { Pet } from "../components/Pet.js";
import { Owner } from "../components/Owner.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Vitality } from "../components/Vitality.js";
import { Hunger } from "../components/Hunger.js";
import { Status } from "../components/Status.js";
import { Traits } from "../components/Traits.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Faction } from "../components/Faction.js";
import { Position } from "../components/Position.js";
import { Inventory } from "../components/Inventory.js";
import { Settings } from "../components/Settings.js";
import { Equipment, NON_AMMO_GEAR_SLOTS } from "../components/Equipment.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Beatitude } from "../components/Beatitude.js";
import { PetState } from "../components/PetState.js";
import { dealDamage } from "../utils/dealDamage.js";
import { effectiveMaxHp } from "../utils/passiveBonuses.js";
import { applyHealing } from "../utils/applyHealing.js";
import { hasStatus } from "../utils/statusFacade.js";
import { getSpell } from "../data/spells.js";
import { getHungerLevel } from "../data/food.js";
import { TURNS_PER_DAY } from "../data/calendar.js";
import { findNearestValidTileAround } from "../utils/queries.js";
import { forEachInRadius } from "../utils/spatialIndex.js";
import { materializeDrop } from "../data/lootResolver.js";

/** @type {Map<string, import('../../lib/deity-js/deity.js').Deity>} */
const _deities = new Map();

/** @type {WeakSet<import('../../lib/ecs-js/index.js').World>} */
const _wired = new WeakSet();
const WORLD_EVENTS_INSTALLED = Symbol.for("jshack:deity:worldEvents:installed");
const WRATH_DEBT_KEY = Symbol.for("jshack:deity:wrathDebt");
const WRATH_GRACE_KEY = Symbol.for("jshack:deity:wrathGrace");
const SHRINE_TOUCH_COOLDOWN_KEY = Symbol.for(
  "jshack:deity:shrineTouchCooldown",
);
const ASCETIC_STATE_KEY = Symbol.for("jshack:deity:asceticState");

/** @type {WeakMap<import('../../lib/deity-js/deity.js').Deity, WeakSet<import('../../lib/ecs-js/index.js').World>>} */
const _miraclesWired = new WeakMap();
const PET_KILL_DESECRATE_STACKS = 12;
const PET_CORPSE_DESECRATE_STACKS = 48;
const WRATH_DEBT_CAP = 2.5;
const WRATH_DEBT_DAMAGE_FACTOR = 0.55;
const WRATH_DEBT_MERCY_REDUCTION = 0.02;
const WRATH_DEBT_NO_MERCY_THRESHOLD = 1.25;
const WRATH_DEBT_CONSUME_PER_WRATH = 0.6;
const OFFENSE_WRATH_GRACE_TURNS = 3;
const WRATH_RECOVERY_TURNS = 4;
const WRATH_MIN_CHANCE = 0.01;
const WRATH_MAX_CHANCE = 0.10;
const SHRINE_TOUCH_COOLDOWN_TURNS = 30;
const SHRINE_TOUCH_PROTECT_MAGNITUDE = 0.35;
const SHRINE_TOUCH_PLEA_VALUE = 0.25;
// Fluorite gift: deity manifests a fluorite stone when player kills near a shrine in good standing.
const FLUO_GIFT_SHRINE_RADIUS   = 5;    // Chebyshev distance — same as shrine combat radius
const FLUO_GIFT_STANDING_MIN    = 5;    // requires standing >= 5 out of 8 cap (well-liked)
const FLUO_GIFT_CHANCE          = 0.12; // 12% chance per qualifying kill
const GLUTTONOUS_FOOD_URGENCY_BONUS = 0.12;
const GLUTTONOUS_MIRACLE_FEED_BONUS = 80;
const GLUTTONOUS_FOOD_REACTION_MULT = 1.2;
const ASCETIC_REWARD_SCORE_THRESHOLD = 3;
const ASCETIC_REWARD_COOLDOWN_TURNS = Math.max(1, TURNS_PER_DAY);
const ASCETIC_PENALTY_OVEREAT = 3;
const ASCETIC_PENALTY_PREMATURE = 2;
const ASCETIC_PENALTY_SICKENED = 2;
const ASCETIC_DISCIPLINED_LEVELS = Object.freeze(
  new Set(["hungry", "famished", "starving", "wasting"]),
);
const OFFENSE_SEVERITY_WEIGHTS = Object.freeze({
  minor: 0.15,
  grave: 0.45,
  horrifying: 0.9,
});

function listPantheonDeityIds() {
  return Object.keys(DEITY_DEFS);
}

function devotionUsesPantheon(devotion) {
  return devotion?.pantheon === true;
}

function scoreDeityStanding(deity) {
  const mood = deity?._queryPrecise?.();
  if (!mood) return -999;
  const serenity = Number(mood.serenity || 0);
  const wrath = Number(mood.wrath || 0);
  const hunger = Number(mood.hunger || 0);
  const sorrow = Number(mood.sorrow || 0);
  return (serenity * 1.7) - (wrath * 2.2) - (hunger * 0.25) - (sorrow * 0.1);
}

/** Get (or lazily create) a Deity instance for a given deityId. */
function ensureDeity(deityId, world = null) {
  let deity = _deities.get(deityId) || null;
  if (!deity) {
    const def = getDeity(deityId);
    if (!def) return null;
    deity = new Deity(def);
    _deities.set(deityId, deity);
  }

  // Wire miracles if we have a world reference
  if (world) {
    if (!_miraclesWired.has(deity)) {
      _miraclesWired.set(deity, new WeakSet());
    }
    const wiredWorlds = _miraclesWired.get(deity);
    if (!wiredWorlds.has(world)) {
      wireDeityMiracles(deity, deityId, world);
      wiredWorlds.add(world);
    }
  }

  return deity;
}

/**
 * Resolve all deity contexts relevant to the player.
 * In pantheon mode this returns all known deities so favor can shift with playstyle.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @returns {Array<{ deityId: string, deity: import('../../lib/deity-js/deity.js').Deity }>}
 */
function resolvePlayerDeities(world, playerId) {
  const actor = Number(playerId || 0) | 0;
  if (!(actor > 0) || !world.has(actor, Player)) return [];
  const dev = world.get(actor, Devotion);
  if (!dev) return [];

  const preferred = String(dev?.deityId || "");
  const pantheon = devotionUsesPantheon(dev);
  const ids = pantheon
    ? listPantheonDeityIds()
    : (preferred ? [preferred] : []);

  if (!ids.length) return [];

  /** @type {Array<{ deityId: string, deity: import('../../lib/deity-js/deity.js').Deity }> } */
  const resolved = [];
  for (const deityId of ids) {
    const deity = ensureDeity(deityId, world);
    if (!deity) continue;
    resolved.push({ deityId, deity });
  }
  if (!resolved.length) return [];

  // Keep preferred deity first to preserve stable tie-breaking.
  if (preferred) {
    resolved.sort((a, b) => {
      if (a.deityId === preferred) return -1;
      if (b.deityId === preferred) return 1;
      return 0;
    });
  }
  return resolved;
}

/**
 * Resolve a player's active deity from devotion/pantheon state.
 * In pantheon mode, patron can shift based on current divine standing.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @returns {{ deityId: string, deity: import('../../lib/deity-js/deity.js').Deity }|null}
 */
function resolvePlayerDeity(world, playerId) {
  const actor = Number(playerId || 0) | 0;
  const all = resolvePlayerDeities(world, actor);
  if (!all.length) return null;
  if (all.length === 1) return all[0];

  const dev = world.get(actor, Devotion);
  const currentId = String(dev?.deityId || "");
  let best = all[0];
  let bestScore = scoreDeityStanding(best.deity);

  for (let i = 1; i < all.length; i++) {
    const candidate = all[i];
    const score = scoreDeityStanding(candidate.deity);
    if (score > bestScore + 0.0001) {
      best = candidate;
      bestScore = score;
      continue;
    }
    const nearTie = Math.abs(score - bestScore) <= 0.0001;
    if (nearTie && candidate.deityId === currentId) {
      best = candidate;
      bestScore = score;
    }
  }

  if (dev && devotionUsesPantheon(dev) && best.deityId && currentId !== best.deityId) {
    dev.deityId = best.deityId;
    world.emit?.("deity:patronShift", {
      playerId: actor,
      deityId: best.deityId,
      deityName: best.deity.name,
    });
    world.emit?.("deity:intervention", {
      playerId: actor,
      deityId: best.deityId,
      deityName: best.deity.name,
      kind: "patron_shift",
    });
  }
  return best;
}

/**
 * Apply callback to all relevant deity contexts for a player.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {(resolved: { deityId: string, deity: import('../../lib/deity-js/deity.js').Deity }) => void} fn
 */
function forEachPlayerDeity(world, playerId, fn) {
  const all = resolvePlayerDeities(world, playerId);
  for (const resolved of all) fn(resolved);
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {string} type
 * @param {object} meta
 */
function applyActionToPlayerDeities(world, playerId, type, meta = {}) {
  forEachPlayerDeity(world, playerId, ({ deity }) => {
    deity.action(type, meta);
  });
}

export function applyPetDamageDeityReaction(world, { target, source, amount }) {
  if (!source || !target) return false;
  if (!world.has(source, Player)) return false;
  if (!world.has(target, Pet)) return false;

  const owner = world.get(target, Owner);
  if (!owner || owner.ownerId !== source) return false;

  const magnitude = Math.min(0.3, (amount || 1) * 0.05);
  applyActionToPlayerDeities(world, source, "betray", {
    magnitude,
    target: "companion",
  });
  return true;
}

export function applyHealingDeityReaction(world, { target, cause }) {
  if (!target || String(cause || "").startsWith("divine:")) return false;
  applyActionToPlayerDeities(world, target, "heal", {
    magnitude: 0.3,
    target: "self",
  });
  return true;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {string} type
 * @param {object} meta
 */
function applyOfferToPlayerDeities(world, playerId, type, meta = {}) {
  forEachPlayerDeity(world, playerId, ({ deity }) => {
    deity.offer(type, meta);
  });
}

/**
 * Push repeated desecrate records when an offense is exceptionally taboo.
 * @param {import('../../lib/deity-js/deity.js').Deity} deity
 * @param {number} count
 * @param {string} type
 */
function stackDesecration(deity, count, type) {
  const n = Math.max(0, Number(count || 0) | 0);
  for (let i = 0; i < n; i++) {
    deity.desecrate(type);
  }
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {Map<string, number>}
 */
function ensureWrathDebtStore(world) {
  const current = world[WRATH_DEBT_KEY];
  if (current instanceof Map) return current;
  const created = new Map();
  world[WRATH_DEBT_KEY] = created;
  return created;
}

/**
 * @param {number} playerId
 * @param {string} deityId
 * @returns {string}
 */
function wrathDebtSlot(playerId, deityId) {
  return `${deityId}:${playerId}`;
}

/**
 * Convert offense severity metadata into wrath debt delta.
 * @param {string} severity
 * @param {number} desecrateStacks
 * @returns {number}
 */
function severityToWrathDebt(severity, desecrateStacks) {
  const key = String(severity || "").toLowerCase();
  const base = Number(
    OFFENSE_SEVERITY_WEIGHTS[key] ?? OFFENSE_SEVERITY_WEIGHTS.minor,
  );
  const stacks = Math.max(0, Number(desecrateStacks || 0) | 0);
  const stackBonus = Math.min(0.9, stacks * 0.015);
  return Math.max(0, base + stackBonus);
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{ playerId: number, deityId: string, severity?: string, desecrateStacks?: number }} spec
 * @returns {number} current wrath debt after applying
 */
function addWrathDebt(world, spec) {
  const playerId = Number(spec?.playerId || 0) | 0;
  const deityId = String(spec?.deityId || "");
  if (!(playerId > 0) || !deityId) return 0;

  const delta = severityToWrathDebt(
    spec?.severity || "minor",
    Number(spec?.desecrateStacks || 0),
  );
  if (!(delta > 0)) return 0;

  const store = ensureWrathDebtStore(world);
  const slot = wrathDebtSlot(playerId, deityId);
  const current = Math.max(0, Number(store.get(slot) || 0));
  const next = Math.min(WRATH_DEBT_CAP, current + delta);
  store.set(slot, next);
  return next;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {string} deityId
 * @returns {number}
 */
function getWrathDebt(world, playerId, deityId) {
  const store = ensureWrathDebtStore(world);
  return Math.max(0, Number(store.get(wrathDebtSlot(playerId, deityId)) || 0));
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {Map<string, number>}
 */
function ensureWrathGraceStore(world) {
  const current = world[WRATH_GRACE_KEY];
  if (current instanceof Map) return current;
  const created = new Map();
  world[WRATH_GRACE_KEY] = created;
  return created;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {string} deityId
 * @param {number} graceTurns
 */
function extendWrathGrace(
  world,
  playerId,
  deityId,
  graceTurns = OFFENSE_WRATH_GRACE_TURNS,
) {
  const pid = Number(playerId || 0) | 0;
  const did = String(deityId || "");
  if (!(pid > 0) || !did) return;
  const turns = Math.max(0, Number(graceTurns || 0) | 0);
  if (!(turns > 0)) return;
  const store = ensureWrathGraceStore(world);
  const slot = wrathDebtSlot(pid, did);
  const current = Math.max(0, Number(store.get(slot) || 0));
  const next = Math.max(current, (Number(world.step || 0) | 0) + turns);
  store.set(slot, next);
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {string} deityId
 * @returns {number}
 */
function getWrathGraceUntil(world, playerId, deityId) {
  const store = ensureWrathGraceStore(world);
  return Math.max(0, Number(store.get(wrathDebtSlot(playerId, deityId)) || 0));
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @param {string} deityId
 * @param {number} amount
 */
function spendWrathDebt(world, playerId, deityId, amount) {
  const store = ensureWrathDebtStore(world);
  const slot = wrathDebtSlot(playerId, deityId);
  const current = Math.max(0, Number(store.get(slot) || 0));
  if (!(current > 0)) return;
  const next = Math.max(0, current - Math.max(0, Number(amount || 0)));
  if (next > 0) store.set(slot, next);
  else store.delete(slot);
}

function stripCorpseName(corpseName) {
  const raw = String(corpseName || "Pet");
  const noHalf = raw.replace(/^half-eaten\s+/i, "");
  return noHalf.replace(/\s+corpse$/i, "").trim() || "Pet";
}

function isDeityFavoring(deity) {
  const mood = deity?._queryPrecise?.();
  if (!mood) return false;
  const wrath = Number(mood.wrath || 0);
  const serenity = Number(mood.serenity || 0);
  return wrath < 0.34 && serenity >= wrath;
}

const isReasonableResurrectionStanding = isDeityFavoring;

function resurrectPetFromOffering(world, spec) {
  const actor = Number(spec?.actor || 0) | 0;
  const ownerId = Number(spec?.ownerId || 0) | 0;
  if (!(actor > 0) || ownerId !== actor) return null;

  const actorPos = world.get(actor, Position);
  const basePos = world.get(Number(spec?.targetId || 0) | 0, Position) ||
    actorPos ||
    { x: 0, y: 0 };
  const spawnPos = findNearestValidTileAround(world, basePos, {
    maxDistance: 1,
    exclude: [{ x: basePos.x | 0, y: basePos.y | 0 }],
  }) || { x: basePos.x | 0, y: basePos.y | 0 };

  const petName = stripCorpseName(spec?.itemName || spec?.corpseName || "Pet");
  const petIdentity = String(spec?.itemIdentity || "")
    .replace(/^corpse_/i, "")
    .trim() || "pet";

  const petId = world.create();
  world.add(petId, Pet);
  world.add(petId, Position, { x: spawnPos.x | 0, y: spawnPos.y | 0 });
  world.add(petId, NamedIdentity, { name: petName, identity: petIdentity });
  world.add(petId, Faction, { key: "pet" });
  world.add(petId, Owner, { ownerId: actor });
  world.add(petId, Inventory, { items: [], capacity: 1 });
  world.add(petId, Settings, {
    autoPickup: true,
    autoPickupKinds: ["currency", "potion", "ammo", "scroll", "equip"],
  });
  world.add(petId, Vitality, { maxHp: 30, hp: 30 });
  world.add(petId, Equipment, {
    accuracyDerived: 2,
    damagePowerDerived: 2,
    evadeDerived: 2,
  });
  world.add(petId, PetState, {
    state: "following",
    targetX: null,
    targetY: null,
    targetItemId: 0,
    stateEnteredTurn: world.step,
    lastPlayerX: Number(actorPos?.x ?? spawnPos.x),
    lastPlayerY: Number(actorPos?.y ?? spawnPos.y),
    commandCooldown: 0,
    rangedCooldown: 0,
  });

  return {
    petId,
    petName,
    petIdentity,
    at: { x: spawnPos.x | 0, y: spawnPos.y | 0 },
  };
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {Map<string, number>}
 */
function ensureShrineTouchCooldownStore(world) {
  const current = world[SHRINE_TOUCH_COOLDOWN_KEY];
  if (current instanceof Map) return current;
  const created = new Map();
  world[SHRINE_TOUCH_COOLDOWN_KEY] = created;
  return created;
}

/**
 * @param {number} playerId
 * @param {string} deityId
 * @returns {string}
 */
function shrineTouchCooldownSlot(playerId, deityId) {
  return `${deityId}:${playerId}`;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {Map<number, { score: number, lastRewardTurn: number, lastMealTurn: number, lastLapseTurn: number }>}
 */
function ensureAsceticStateStore(world) {
  const current = world[ASCETIC_STATE_KEY];
  if (current instanceof Map) return current;
  const created = new Map();
  world[ASCETIC_STATE_KEY] = created;
  return created;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{ deityId: string, deity: import('../../lib/deity-js/deity.js').Deity }} resolved
 * @param {number} actorId
 * @param {'ascetic:milestone'|'ascetic:lapse'} hookKey
 */
function applyAsceticHook(world, resolved, actorId, hookKey) {
  const hook = getDeity(resolved.deityId)?.specialHooks?.[hookKey];
  if (!hook) return;
  applyDeityReaction(resolved.deity, hook);
  const msg = String(hook.message || "").replace(
    "{deity}",
    resolved.deity.name,
  );
  if (msg) {
    world.emit?.("deity:nicheEvent", {
      playerId: actorId,
      deityId: resolved.deityId,
      deityName: resolved.deity.name,
      event: hookKey.replace(":", "_"),
      message: msg,
    });
  }
}

// ── Niche deity interaction helpers ───────────────────────────────────
const KILL_STREAK_KEY = Symbol.for("jshack:deity:killStreak");

/**
 * Dispatch a single TagKillReaction / SpellSchoolReaction / specialHook spec
 * onto a deity instance.
 * @param {import('../../lib/deity-js/deity.js').Deity} deity
 * @param {{ type: 'action'|'offer', verb: string, magnitude?: number, target?: string, value?: number, alignment?: string }} spec
 */
function applyDeityReaction(deity, spec) {
  if (spec.type === "offer") {
    deity.offer(spec.verb, {
      value: spec.value ?? 0.3,
      alignment: spec.alignment ?? "neutral",
    });
  } else {
    deity.action(spec.verb, {
      magnitude: spec.magnitude ?? 0.3,
      target: spec.target ?? "",
    });
  }
}

import { isProfane as _isProfane } from "../utils/profanity.js";

/**
 * Install world-event hooks that feed the deity.
 * Called once per world instance.
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
function wireWorldEvents(world) {
  if (world[WORLD_EVENTS_INSTALLED] || _wired.has(world)) return;
  world[WORLD_EVENTS_INSTALLED] = true;
  _wired.add(world);

  // Severity metadata from major offenses accumulates wrath debt.
  world.on(
    "deity:offense",
    ({ playerId, deityId, severity, desecrateStacks }) => {
      const pid = Number(playerId || 0) | 0;
      if (!(pid > 0) || !world.has(pid, Player)) return;
      const did = String(deityId || world.get(pid, Devotion)?.deityId || "");
      if (!did) return;
      extendWrathGrace(world, pid, did);
      addWrathDebt(world, {
        playerId: pid,
        deityId: did,
        severity: String(severity || "minor"),
        desecrateStacks: Number(desecrateStacks || 0),
      });
    },
  );

  // Kill events → deity.action('kill') + optional offering
  world.on("died", ({ id, killer }) => {
    if (!killer) return;
    const resolved = resolvePlayerDeity(world, killer);
    if (!resolved) return;
    const { deityId } = resolved;

    const victim = Number(id || 0) | 0;
    const owner = world.get(victim, Owner);
    const ownerId = Number(owner?.ownerId || 0) | 0;
    const murderedOwnPet = world.has(victim, Pet) && ownerId > 0 &&
      ownerId === (Number(killer || 0) | 0);
    if (murderedOwnPet) {
      const victimName = String(
        world.get(victim, NamedIdentity)?.name || "companion",
      );
      forEachPlayerDeity(world, killer, ({ deity }) => {
        deity.action("betray", { magnitude: 1.0, target: victimName });
        stackDesecration(deity, PET_KILL_DESECRATE_STACKS, "pet_murder");
      });
      world.emit("deity:offense", {
        playerId: Number(killer || 0) | 0,
        deityId,
        deityName: resolved.deity.name,
        offense: "pet_murder",
        severity: "grave",
        victimId: victim,
        victimName,
        desecrateStacks: PET_KILL_DESECRATE_STACKS,
      });
      return;
    }

    // Killing non-hostile NPCs is betrayal — shopkeepers most of all.
    const victimFaction = world.get(victim, Faction)?.key || "";
    if (victimFaction === "shopkeeper") {
      const victimName = String(
        world.get(victim, NamedIdentity)?.name || "merchant",
      );
      applyActionToPlayerDeities(world, killer, "betray", {
        magnitude: 0.8,
        target: victimName,
      });
    } else if (victimFaction === "neutral") {
      const victimName = String(
        world.get(victim, NamedIdentity)?.name || "innocent",
      );
      applyActionToPlayerDeities(world, killer, "betray", {
        magnitude: 0.5,
        target: victimName,
      });
    }

    forEachPlayerDeity(world, killer, ({ deityId: did, deity }) => {
      const def = getDeity(did);
      deity.action("kill", { magnitude: 0.5, target: String(victim) });
      if (def?.killsAreOfferings) {
        deity.offer("blood", {
          value: 0.3,
          alignment: def.alignment ?? "neutral",
        });
      }
    });

    // Fluorite gift — deity manifests a fluorite stone for kills near a shrine in high standing.
    // The stone is already charged by holy light and ready to socket.
    if (world.has(Number(killer) | 0, Player)) {
      const killerPos = world.get(Number(killer) | 0, Position);
      if (killerPos && scoreDeityStanding(resolved.deity) >= FLUO_GIFT_STANDING_MIN
          && world.rand() < FLUO_GIFT_CHANCE) {
        let nearShrine = false;
        forEachInRadius(world, killerPos.x, killerPos.y, FLUO_GIFT_SHRINE_RADIUS, (sid) => {
          if (nearShrine) return;
          if (world.get(sid, NamedIdentity)?.identity === "shrine") nearShrine = true;
        });
        if (nearShrine) {
          const eid = materializeDrop(world, { kind: "gem", params: { gemId: "gem_fluorite" } },
            { x: killerPos.x, y: killerPos.y });
          if (eid) {
            world.emit?.("item:dropped", { itemId: eid, count: 1, at: { x: killerPos.x, y: killerPos.y } });
            world.emit?.("deity:gift:fluorite", {
              playerId: Number(killer) | 0,
              deityId: resolved.deityId,
              deityName: resolved.deity.name,
              at: { x: killerPos.x, y: killerPos.y },
            });
          }
        }
      }
    }
  });

  // Eating pet corpse → deity.desecrate(), with heavy escalation for your own companion.
  world.on("corpse:desecrated", ({ actor, ownerId, corpseName }) => {
    const resolved = resolvePlayerDeity(world, actor);
    if (!resolved) return;
    const { deityId, deity } = resolved;
    const actorId = Number(actor || 0) | 0;
    const ownPetCorpse = (Number(ownerId || 0) | 0) === actorId;
    const label = String(corpseName || "pet_corpse");
    const stacks = ownPetCorpse ? PET_CORPSE_DESECRATE_STACKS : 1;

    forEachPlayerDeity(world, actorId, ({ deity }) => {
      if (ownPetCorpse) {
        deity.action("betray", { magnitude: 1.0, target: label });
      }
      stackDesecration(
        deity,
        stacks,
        ownPetCorpse ? "pet_corpse_desecration" : label,
      );
    });

    if (ownPetCorpse) {
      world.emit("deity:offense", {
        playerId: actorId,
        deityId,
        deityName: deity.name,
        offense: "pet_corpse_desecration",
        severity: "horrifying",
        corpseName: label,
        desecrateStacks: stacks,
      });
    }
  });

  // Altar offerings → deity.offer()
  world.on(
    "altar:offer",
    ({ actor, targetId, itemName, itemIdentity, value, ownerId }) => {
      const resolved = resolvePlayerDeity(world, actor);
      if (!resolved) return;
      const { deity } = resolved;
      applyOfferToPlayerDeities(world, actor, "item", {
        value: value || 0.3,
        alignment: "neutral",
        itemName,
      });
      world.emit?.("altar:offered", {
        actor,
        deityName: deity.name,
        itemName,
        value,
      });

      const petCorpse = String(itemIdentity || "").startsWith("corpse_") &&
        (Number(ownerId || 0) | 0) === (Number(actor || 0) | 0);
      if (!petCorpse) return;

      if (!isReasonableResurrectionStanding(deity)) {
        world.emit?.("altar:resurrectionDenied", {
          actor: Number(actor || 0) | 0,
          targetId: Number(targetId || 0) | 0,
          deityName: deity.name,
          itemName: String(itemName || "pet corpse"),
          reason: "standing",
        });
        return;
      }

      const restored = resurrectPetFromOffering(world, {
        actor,
        targetId,
        ownerId,
        itemName,
        itemIdentity,
      });
      if (!restored) return;

      applyActionToPlayerDeities(world, actor, "protect", {
        magnitude: 0.45,
        target: "pet_resurrection",
      });
      applyOfferToPlayerDeities(world, actor, "mercy", {
        value: 0.35,
        alignment: "neutral",
      });
      world.emit?.("pet:resurrected", {
        actor: Number(actor || 0) | 0,
        targetId: Number(targetId || 0) | 0,
        deityName: deity.name,
        itemName: String(itemName || ""),
        petId: restored.petId,
        petName: restored.petName,
        petIdentity: restored.petIdentity,
        at: restored.at,
      });
    },
  );

  // Shrine touch → prayer + protect action, with anti-spam cooldown.
  world.on("shrine:touch", ({ actor, targetId }) => {
    const actorId = Number(actor || 0) | 0;
    const shrineId = Number(targetId || 0) | 0;
    const resolved = resolvePlayerDeity(world, actorId);
    if (!resolved) {
      world.emit?.("shrine:communion", {
        actor: actorId,
        targetId: shrineId,
        effect: "silent",
      });
      return;
    }

    const { deityId, deity } = resolved;
    const cooldowns = ensureShrineTouchCooldownStore(world);
    const slot = shrineTouchCooldownSlot(actorId, deityId);
    const now = Number(world.step || 0) | 0;
    const last = Number(cooldowns.get(slot) ?? -1e9);
    const elapsed = now - last;
    if (elapsed < SHRINE_TOUCH_COOLDOWN_TURNS) {
      const remaining = Math.max(
        1,
        SHRINE_TOUCH_COOLDOWN_TURNS - Math.max(0, elapsed),
      );
      world.emit?.("shrine:communion", {
        actor: actorId,
        targetId: shrineId,
        deityId,
        deityName: deity.name,
        effect: "cooldown",
        cooldownRemaining: remaining,
      });
      return;
    }

    cooldowns.set(slot, now);
    applyOfferToPlayerDeities(world, actorId, "plea", {
      value: SHRINE_TOUCH_PLEA_VALUE,
      alignment: "neutral",
    });
    applyActionToPlayerDeities(world, actorId, "protect", {
      magnitude: SHRINE_TOUCH_PROTECT_MAGNITUDE,
      target: "shrine",
    });
    forEachPlayerDeity(world, actorId, ({ deity: candidate }) => {
      candidate.pray();
    });
    world.emit?.("shrine:communion", {
      actor: actorId,
      targetId: shrineId,
      deityId,
      deityName: deity.name,
      effect: "blessing",
      cooldownRemaining: 0,
    });
    world.emit?.("deity:intervention", {
      playerId: actorId,
      deityId,
      deityName: deity.name,
      kind: "shrine_blessing",
    });
  });

  // ── Steal ─────────────────────────────────────────────────────────────────
  // Attempted shoplifting — tried to leave after a shop claim was enforced.
  world.on("shop:claim-enforced", ({ actor, decision }) => {
    if (decision?.kind === "credit_extended") return;
    applyActionToPlayerDeities(world, actor, "steal", {
      magnitude: 0.6,
      target: "shopkeeper",
    });
    applyActionToPlayerDeities(world, actor, "betray", {
      magnitude: 0.3,
      target: "shopkeeper",
    });
  });

  // ── Destroy ───────────────────────────────────────────────────────────────
  // Chopping through terrain (trees, vegetation).
  world.on("tile:chopped", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "destroy", {
      magnitude: 0.4,
      target: "terrain",
    });
  });

  // Digging through walls and ground.
  world.on("tile:dug", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "destroy", {
      magnitude: 0.4,
      target: "terrain",
    });
  });

  world.on("tile:burned", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "destroy", {
      magnitude: 0.4,
      target: "terrain",
    });
  });

  // Clearing webs.
  world.on("web:cleared", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "destroy", {
      magnitude: 0.15,
      target: "web",
    });
  });

  // ── Create ────────────────────────────────────────────────────────────────
  // Alchemy — crafting potions and reagents.
  world.on("alchemy:crafted", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "create", {
      magnitude: 0.6,
      target: "potion",
    });
  });

  // Cooking — transforming corpses into sustenance.
  world.on("cooking:cooked", ({ actor }) => {
    forEachPlayerDeity(world, actor, ({ deityId, deity }) => {
      deity.action("create", { magnitude: 0.4, target: "food" });
      const bonusHook = getDeity(deityId)?.specialHooks?.["cooking:cooked:bonus"];
      if (bonusHook) applyDeityReaction(deity, bonusHook);
    });
  });

  // Engraving — leaving a mark on the world.
  // Profane graffiti is vandalism: fires destroy alongside create.
  world.on("engrave", ({ actor, text }) => {
    forEachPlayerDeity(world, actor, ({ deity }) => {
      deity.action("create", { magnitude: 0.15, target: "engraving" });
      if (_isProfane(text)) {
        deity.action("destroy", { magnitude: 0.3, target: "graffiti" });
      }
    });
  });

  // Harvesting — gathering from nature.
  world.on("harvest:picked", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "create", {
      magnitude: 0.2,
      target: "harvest",
    });
  });

  // Eating food is a small positive "create/life" signal.
  world.on("hunger:ate", ({ actor, nutrition }) => {
    const resolved = resolvePlayerDeity(world, actor);
    if (!resolved) return;
    const actorId = Number(actor || 0) | 0;
    const tr = world.get(actorId, Traits);
    const gluttonous = !!tr?.gluttonous;
    const baseMagnitude = 0.08 +
      Math.min(0.2, Math.max(0, Number(nutrition || 0)) / 900);
    const magnitude = gluttonous
      ? Math.min(1, baseMagnitude * GLUTTONOUS_FOOD_REACTION_MULT)
      : baseMagnitude;
    applyActionToPlayerDeities(world, actor, "create", {
      magnitude,
      target: "food",
    });

    const asceticStore = ensureAsceticStateStore(world);
    const now = Number(world.step || 0) | 0;
    const prev = asceticStore.get(actorId);
    const state = prev || {
      score: 0,
      lastRewardTurn: -1_000_000_000,
      lastMealTurn: -1,
      lastLapseTurn: -1,
    };
    const hunger = world.get(actorId, Hunger);
    const level = hunger?.satiation > 0
      ? "satiated"
      : getHungerLevel(Number(hunger?.hunger || 0));

    if (hunger?.satiation > 0) {
      state.score = Math.max(
        0,
        Number(state.score || 0) - ASCETIC_PENALTY_OVEREAT,
      );
      state.lastLapseTurn = now;
      applyAsceticHook(world, resolved, actorId, "ascetic:lapse");
    } else if (!ASCETIC_DISCIPLINED_LEVELS.has(level)) {
      state.score = Math.max(
        0,
        Number(state.score || 0) - ASCETIC_PENALTY_PREMATURE,
      );
      state.lastLapseTurn = now;
      applyAsceticHook(world, resolved, actorId, "ascetic:lapse");
    } else {
      state.score = Math.min(12, Number(state.score || 0) + 1);
      const elapsedSinceReward = now - Number(state.lastRewardTurn || 0);
      if (
        state.score >= ASCETIC_REWARD_SCORE_THRESHOLD &&
        elapsedSinceReward >= ASCETIC_REWARD_COOLDOWN_TURNS
      ) {
        state.lastRewardTurn = now;
        applyAsceticHook(world, resolved, actorId, "ascetic:milestone");
      }
    }
    state.lastMealTurn = now;
    asceticStore.set(actorId, state);
  });

  // Food sickness is a minor offense signal.
  world.on("hunger:sickened", ({ actor, type }) => {
    const resolved = resolvePlayerDeity(world, actor);
    if (!resolved) return;
    const actorId = Number(actor || 0) | 0;
    const tr = world.get(actorId, Traits);
    const gluttonous = !!tr?.gluttonous;
    const baseMagnitude = 0.16;
    const magnitude = gluttonous
      ? Math.min(1, baseMagnitude * GLUTTONOUS_FOOD_REACTION_MULT)
      : baseMagnitude;
    applyActionToPlayerDeities(world, actor, "betray", {
      magnitude,
      target: `food_${String(type || "tainted")}`,
    });

    const asceticStore = ensureAsceticStateStore(world);
    const now = Number(world.step || 0) | 0;
    const prev = asceticStore.get(actorId);
    const state = prev || {
      score: 0,
      lastRewardTurn: -1_000_000_000,
      lastMealTurn: -1,
      lastLapseTurn: -1,
    };
    state.score = Math.max(
      0,
      Number(state.score || 0) - ASCETIC_PENALTY_SICKENED,
    );
    state.lastLapseTurn = now;
    asceticStore.set(actorId, state);
    applyAsceticHook(world, resolved, actorId, "ascetic:lapse");
  });

  // ── Protect ───────────────────────────────────────────────────────────────
  // Disarming traps — making the dungeon safer.
  world.on("trap:disarmed", ({ actor }) => {
    applyActionToPlayerDeities(world, actor, "protect", {
      magnitude: 0.5,
      target: "self",
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // NICHE DEITY INTERACTIONS — clever systemic cross-references
  // ══════════════════════════════════════════════════════════════════════════

  // ── 1. Tag-kill reactions ────────────────────────────────────────────
  // Each deity's tagKillReactions list drives what happens when the player
  // kills a monster with a matching tag (undead, demon, beast, etc.).
  world.on("died", ({ id, killer }) => {
    if (!killer) return;
    const victimIdentity =
      world.get(Number(id || 0) | 0, NamedIdentity)?.identity || "";
    forEachPlayerDeity(world, killer, ({ deityId, deity }) => {
      const def = getDeity(deityId);
      for (const r of (def?.tagKillReactions ?? [])) {
        if (monsterHasTag(victimIdentity, r.tag)) applyDeityReaction(deity, r);
      }
    });
  });

  // ── 2. Trap reactions ───────────────────────────────────────────────
  // When an enemy triggers a trap, any player whose deity has a
  // 'trap:triggered:enemy' specialHook gets the reaction.
  // When the player triggers a trap, their own deity's 'trap:triggered:self'
  // hook fires if present.
  world.on("trap:triggered", ({ victimId }) => {
    const victim = Number(victimId || 0) | 0;
    if (!(victim > 0)) return;
    if (world.has(victim, Player)) return; // player ate the trap — handle below
    for (const [playerId] of world.query(Player, Devotion)) {
      let applied = false;
      forEachPlayerDeity(world, playerId, ({ deityId, deity }) => {
        const hook = getDeity(deityId)?.specialHooks?.["trap:triggered:enemy"];
        if (!hook) return;
        applyDeityReaction(deity, hook);
        applied = true;
      });
      if (!applied) continue;
      break;
    }
  });

  world.on("trap:triggered", ({ victimId }) => {
    const victim = Number(victimId || 0) | 0;
    if (!(victim > 0) || !world.has(victim, Player)) return;
    forEachPlayerDeity(world, victim, ({ deityId, deity }) => {
      const hook = getDeity(deityId)?.specialHooks
        ?.["trap:triggered:self"];
      if (!hook) return;
      applyDeityReaction(deity, hook);
    });
  });

  // ── 3. Kill streaks ──────────────────────────────────────────────────
  // Consecutive kills within a short window can escalate a deity's reaction.
  // Configured via killStreakConfig on the deity definition.
  world.on("died", ({ killer }) => {
    if (!killer) return;
    const killerId = Number(killer || 0) | 0;

    const store = world[KILL_STREAK_KEY] ||
      (world[KILL_STREAK_KEY] = new Map());
    const now = Number(world.step || 0) | 0;

    forEachPlayerDeity(world, killerId, ({ deityId, deity }) => {
      const ksCfg = getDeity(deityId)?.killStreakConfig;
      if (!ksCfg) return;
      const slot = `${deityId}:${killerId}`;
      const prev = store.get(slot);
      const lastTurn = Number(prev?.turn || 0);
      const streak = (now - lastTurn <= ksCfg.window)
        ? (Number(prev?.count || 0) + 1)
        : 1;
      store.set(slot, { turn: now, count: streak });
      if (streak < ksCfg.minStreak) return;
      const bonus = Math.min(ksCfg.maxBonus, streak * ksCfg.bonusPerKill);
      deity.action(ksCfg.killAction, {
        magnitude: bonus,
        target: "streak_" + streak,
      });
      deity.offer(ksCfg.offerType, {
        value: bonus * ksCfg.offerFactor,
        alignment: ksCfg.offerAlignment,
      });
    });
  });

  // ── 4. Cooking bonus ────────────────────────────────────────────────
  // Cooking corpses closes the cycle of life. Some deities (e.g. Gaia) have
  // a specialHook that fires an extra reaction on top of the generic create.
  // (The generic create action is already wired above.)

  // ── 5. Spell school reactions ────────────────────────────────────────
  // All deities react to spell schools universally (healing → heal action,
  // destruction → destroy action). Per-deity extras come from spellSchoolReactions.
  world.on("castSpell", ({ actor, spellId }) => {
    const spell = String(spellId || "");
    const spellDef = getSpell(spell);
    const schools = Array.isArray(spellDef?.schools) ? spellDef.schools : [];

    forEachPlayerDeity(world, actor, ({ deityId, deity }) => {
      const def = getDeity(deityId);
      if (schools.includes("healing")) {
        deity.action("heal", { magnitude: 0.2, target: "spell_heal" });
      }
      if (schools.includes("destruction")) {
        deity.action("destroy", {
          magnitude: 0.2,
          target: "spell_destruction",
        });
      }

      for (const r of (def?.spellSchoolReactions ?? [])) {
        if (!schools.includes(r.school)) continue;
        if (r.spellId && r.spellId !== spell) continue;
        applyDeityReaction(deity, r);
      }
    });
  });

  // ── 6. Blessed/Cursed Offering Resonance ────────────────────────────────
  // The beatitude of items offered at altars modulates their value.
  // Blessed items resonate with divine energy — doubled value.
  // Cursed items carry corruption — negative value (angers deity).
  // Exception: Loki finds cursed offerings amusing rather than offensive.
  world.on("altar:offer", ({ actor, itemId, beatitudeState }) => {
    const offeredItemId = Number(itemId || 0) | 0;
    const beat = offeredItemId > 0 ? world.get(offeredItemId, Beatitude) : null;
    const state = String(beatitudeState || beat?.state || "").toLowerCase();

    forEachPlayerDeity(world, actor, ({ deityId, deity }) => {
      if (state === "blessed") {
        deity.offer("blessed_gift", { value: 0.4, alignment: "lawful" });
        world.emit?.("deity:nicheEvent", {
          playerId: Number(actor || 0) | 0,
          deityId,
          deityName: deity.name,
          event: "blessed_offering",
          message: `${deity.name} is pleased by the sanctified offering!`,
        });
      } else if (state === "cursed") {
        const cursedHook = getDeity(deityId)?.specialHooks
          ?.["altar:offer:cursed"];
        if (cursedHook) {
          applyDeityReaction(deity, cursedHook);
          const msg = String(cursedHook.message || "").replace(
            "{deity}",
            deity.name,
          );
          world.emit?.("deity:nicheEvent", {
            playerId: Number(actor || 0) | 0,
            deityId,
            deityName: deity.name,
            event: "cursed_offering_amused",
            message: msg,
          });
        } else {
          deity.action("betray", { magnitude: 0.25, target: "cursed_offering" });
          world.emit?.("deity:nicheEvent", {
            playerId: Number(actor || 0) | 0,
            deityId,
            deityName: deity.name,
            event: "cursed_offering_angered",
            message: `${deity.name} recoils from the tainted offering!`,
          });
        }
      }
    });
  });
}

/**
 * Wire deity-to-world miracles (deity → player benefits).
 * Called when a deity instance is created.
 * @param {import('../../lib/deity-js/deity.js').Deity} deity
 * @param {string} deityId
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
function wireDeityMiracles(deity, deityId, world) {
  const cooldowns = { demand: 0, utterance: 0, omen: 0 };
  const wrathRollSteps = new Map();
  const wrathRecoveryUntil = new Map();
  const DEITY_COOLDOWN = 120;

  // Wrath is a rare per-turn gamble: 1% just above threshold, up to 10% at
  // maximum wrath. A successful strike grants four committed turns of recovery;
  // missed rolls do not change recovery.
  deity.on("wrath", ({ intensity = 0, tick = 0 }) => {
    const threshold = Number(
      deity?._thresholds?.wrath ?? DEITY_DEFS[deityId]?.thresholds?.wrath ?? 0.4,
    );
    const wrath = Number(intensity || 0);
    if (!(wrath > threshold)) return;
    const normalizedWrath = Math.min(
      1,
      Math.max(0, (wrath - threshold) / Math.max(0.0001, 1 - threshold)),
    );
    const strikeChance = WRATH_MIN_CHANCE +
      (normalizedWrath * (WRATH_MAX_CHANCE - WRATH_MIN_CHANCE));
    const turn = Number(world.step || 0) | 0;
    for (const [playerId] of world.query(Player, Devotion)) {
      const dev = world.get(playerId, Devotion);
      if (dev?.deityId !== deityId) continue;

      const graceUntil = getWrathGraceUntil(world, playerId, deityId);
      if (graceUntil > 0 && turn <= graceUntil) continue;

      const slot = wrathDebtSlot(playerId, deityId);
      const recoveryUntil = Number(wrathRecoveryUntil.get(slot) || 0);
      if (recoveryUntil > 0 && turn <= recoveryUntil) continue;
      if (wrathRollSteps.get(slot) === turn) continue;
      wrathRollSteps.set(slot, turn);
      if (world.rand() >= strikeChance) continue;

      const vit = world.get(playerId, Vitality);
      if (!vit) continue;

      const beforeHp = Math.max(0, Number(vit.hp || 0));
      const wrathDebt = getWrathDebt(world, playerId, deityId);
      const severityScale = 1 + (wrathDebt * WRATH_DEBT_DAMAGE_FACTOR);
      const damagePercent = (0.5 + (Number(intensity || 0) * 0.35)) *
        severityScale;
      const plannedDamage = Math.max(1, Math.floor(beforeHp * damagePercent));
      const mercyRatio = (wrathDebt >= WRATH_DEBT_NO_MERCY_THRESHOLD)
        ? 0
        : Math.max(0, 0.05 - (wrathDebt * WRATH_DEBT_MERCY_REDUCTION));
      const minHp = Math.max(
        0,
        Math.floor(Number(vit.maxHp || 1) * mercyRatio),
      );
      const newHp = Math.max(minHp, beforeHp - plannedDamage);
      const actualDamage = Math.max(0, beforeHp - newHp);

      if (actualDamage > 0) {
        dealDamage(world, {
          target: playerId,
          amount: actualDamage,
          type: "divine",
          cause: "divine_wrath",
          bypassInvuln: true,
          bypassResist: true,
        });

        if (wrathDebt > 0) {
          spendWrathDebt(
            world,
            playerId,
            deityId,
            Math.max(
              0.25,
              WRATH_DEBT_CONSUME_PER_WRATH *
                Math.max(0.5, Number(intensity || 0)),
            ),
          );
        }
      }

      // Lightning strike shocks the player via the ActiveEffects pipeline
      if (actualDamage > 0) {
        const _ae = world.get(playerId, ActiveEffects);
        if (_ae && Array.isArray(_ae.effects)) {
          _ae.effects.push({ key: "shock", turnsLeft: 2, potency: 1 });
        }
      }

      let cursed = false;
      if (Number(intensity || 0) > 0.6) {
        const status = world.get(playerId, Status);
        if (status) {
          const statuses = Array.isArray(status.statuses)
            ? status.statuses
            : [];
          statuses.push({
            type: "weakened",
            duration: Math.round(20 + Number(intensity || 0) * 30),
            potency: Number(intensity || 0),
          });
          if (Number(intensity || 0) > 0.8) {
            statuses.push({
              type: "cursed",
              duration: Math.round(30 + Number(intensity || 0) * 40),
              potency: 1.0,
            });
            cursed = true;
          }
          status.statuses = statuses;
        }
      }
      world.emit("deity:wrath", {
        playerId,
        deityId,
        deityName: deity.name,
        intensity: Number(intensity || 0),
        damage: actualDamage,
        cursed,
        severityScale,
        wrathDebt,
        tick,
      });
      world.emit("deity:intervention", {
        playerId,
        deityId,
        deityName: deity.name,
        kind: "wrath",
        damage: actualDamage,
      });

      if (actualDamage > 0) {
        wrathRecoveryUntil.set(slot, turn + WRATH_RECOVERY_TURNS);
      }
    }
  });

  deity.on("demand", ({ tick = 0 }) => {
    if ((tick - cooldowns.demand) < DEITY_COOLDOWN) return;
    cooldowns.demand = tick;
    world.emit("deity:demand", { deityId, deityName: deity.name, tick });
  });

  deity.on("omen", ({ tick = 0 }) => {
    if ((tick - cooldowns.omen) < DEITY_COOLDOWN) return;
    cooldowns.omen = tick;
    world.emit("deity:omen", { deityId, deityName: deity.name, tick });
  });

  deity.on("moodShift", ({ to }) => {
    world.emit("deity:moodShift", { deityId, deityName: deity.name, to });
  });

  deity.on("utterance", ({ dominant, tick = 0 }) => {
    if ((tick - cooldowns.utterance) < DEITY_COOLDOWN) return;
    cooldowns.utterance = tick;
    world.emit("deity:utterance", {
      deityId,
      deityName: deity.name,
      dominant,
      tick,
    });
  });

  // When deity grants a miracle, help the player based on their needs
  deity.on("miracle", ({ serenity, tick }) => {
    // Find the player who worships this deity
    for (const [playerId] of world.query(Player, Devotion)) {
      const dev = world.get(playerId, Devotion);
      if (!dev) continue;
      if (!devotionUsesPantheon(dev) && dev?.deityId !== deityId) continue;
      if (!isDeityFavoring(deity)) continue;

      const emitMiracle = (payload) => {
        world.emit("deity:miracle", payload);
        world.emit("deity:intervention", {
          playerId,
          deityId,
          deityName: deity.name,
          kind: "miracle",
          effect: String(payload?.effect || ""),
          message: String(payload?.message || ""),
        });
      };

      // Determine what the player needs most
      const needs = assessPlayerNeeds(world, playerId);

      if (needs.length === 0) {
        // Player is fine — grant luck (affix on item or temporary buff)
        let grantedAffix = false;
        const eq = world.get(playerId, Equipment);
        if (eq) {
          for (const slot of NON_AMMO_GEAR_SLOTS) {
            const itemId = eq[slot];
            if (!Number.isInteger(itemId)) continue;
            const info = world.get(itemId, ItemInfo);
            if (!info || !Array.isArray(info.affixes)) continue;
            if (info.affixes.includes("lucky1")) continue;
            info.affixes.push("lucky1");
            grantedAffix = true;
            const itemName = world.get(itemId, NamedIdentity)?.name || "item";
            emitMiracle({
              playerId,
              deityId,
              effect: "lucky_affix",
              message: `${deity.name} blesses your ${itemName} with fortune!`,
            });
            break;
          }
        }
        if (!grantedAffix) {
          // No eligible item — grant 200-turn lucky buff
          const ae = world.get(playerId, ActiveEffects);
          if (ae && Array.isArray(ae.effects)) {
            ae.effects.push({ key: "lucky", turnsLeft: 200, potency: 3 });
          }
          emitMiracle({
            playerId,
            deityId,
            effect: "lucky_buff",
            message: `${deity.name} bestows fortune upon you!`,
          });
        }
        return;
      }

      // Apply miracle based on primary need and deity personality
      const deityDef = getDeity(deityId);
      const primaryNeed = needs[0];

      if (primaryNeed === "healing" && world.has(playerId, Vitality)) {
        // Heal the player
        const vit = world.get(playerId, Vitality);
        const deityCap = effectiveMaxHp(world, playerId, vit);
        const healAmount = Math.floor(
          deityCap * (deityDef?.alignment === "lawful" ? 0.6 : 0.4),
        );
        const applied = applyHealing(world, {
          target: playerId,
          amount: healAmount,
          source: playerId,
          cause: `divine:${deityId}`,
        }).amount;
        emitMiracle({
          playerId,
          deityId,
          effect: "heal",
          amount: applied,
          message: `${deity.name} restores your vitality!`,
        });
      } else if (primaryNeed === "food" && world.has(playerId, Hunger)) {
        // Satiate hunger
        const hunger = world.get(playerId, Hunger);
        const tr = world.get(playerId, Traits);
        const gluttonous = !!tr?.gluttonous;
        const feedAmount = (deityDef?.alignment === "chaotic" ? 300 : 500) +
          (gluttonous ? GLUTTONOUS_MIRACLE_FEED_BONUS : 0);
        hunger.hunger = Math.max(0, hunger.hunger - feedAmount);
        hunger.satiation = (hunger.satiation || 0) + 50;
        emitMiracle({
          playerId,
          deityId,
          effect: "satiate",
          message: `${deity.name} provides sustenance!`,
        });
      } else if (
        (primaryNeed === "cure" || primaryNeed === "blessing") &&
        world.has(playerId, Status)
      ) {
        // Cure harmful status effects
        const status = world.get(playerId, Status);
        const harmful = [
          "disease",
          "poisoned",
          "cursed",
          "bleeding",
          "weakened",
        ];
        const before = status.statuses.length;
        status.statuses = status.statuses.filter((s) =>
          !harmful.includes(s.type)
        );
        const cured = before - status.statuses.length;

        if (cured > 0) {
          emitMiracle({
            playerId,
            deityId,
            effect: "cure",
            count: cured,
            message: `${deity.name} purges your afflictions!`,
          });
        }

        // Also uncurse equipped items when the primary need is blessing
        if (primaryNeed === "blessing") {
          const eqMiracle = world.get(playerId, Equipment);
          if (eqMiracle) {
            for (const slot of NON_AMMO_GEAR_SLOTS) {
              const itemId = eqMiracle[slot];
              if (!Number.isInteger(itemId) || itemId <= 0) continue;
              const beat = world.get(itemId, Beatitude);
              if (beat && beat.state === "cursed") {
                beat.state = "uncursed";
                const itemName = world.get(itemId, NamedIdentity)?.name ||
                  "item";
                emitMiracle({
                  playerId,
                  deityId,
                  effect: "uncurse_equipment",
                  message:
                    `${deity.name} lifts the curse from your ${itemName}!`,
                });
              }
            }
          }
        }
      }
    }
  });
}

/**
 * Determine what the player needs most urgently.
 * @returns {string[]} Array of needs in priority order: 'healing', 'food', 'cure', 'blessing'
 */
function assessPlayerNeeds(world, playerId) {
  const needs = [];
  const tr = world.get(playerId, Traits);
  const gluttonous = !!tr?.gluttonous;

  // Check HP
  if (world.has(playerId, Vitality)) {
    const vit = world.get(playerId, Vitality);
    const hpPercent = vit.hp / vit.maxHp;
    if (hpPercent < 0.5) {
      needs.push({ type: "healing", urgency: 1.0 - hpPercent });
    }
  }

  // Check hunger
  if (world.has(playerId, Hunger)) {
    const hunger = world.get(playerId, Hunger);
    if (hunger?.satiation <= 0) {
      const level = getHungerLevel(Number(hunger?.hunger || 0));
      if (level === "wasting") {
        needs.push({ type: "food", urgency: 1.0 });
      } else if (level === "starving") {
        needs.push({
          type: "food",
          urgency: Math.min(
            1,
            0.9 + (gluttonous ? GLUTTONOUS_FOOD_URGENCY_BONUS : 0),
          ),
        });
      } else if (level === "famished") {
        needs.push({
          type: "food",
          urgency: Math.min(
            1,
            0.7 + (gluttonous ? GLUTTONOUS_FOOD_URGENCY_BONUS : 0),
          ),
        });
      } else if (level === "hungry") {
        needs.push({
          type: "food",
          urgency: Math.min(
            1,
            0.4 + (gluttonous ? GLUTTONOUS_FOOD_URGENCY_BONUS : 0),
          ),
        });
      } else if (level === "peckish") {
        needs.push({
          type: "food",
          urgency: Math.min(
            1,
            0.2 + (gluttonous ? GLUTTONOUS_FOOD_URGENCY_BONUS : 0),
          ),
        });
      }
    }
  }

  // Check status effects (active-effects first).
  let maxUrgency = 0;
  let needsBlessing = false;
  if (hasStatus(world, playerId, "cursed")) {
    needsBlessing = true;
    maxUrgency = Math.max(maxUrgency, 0.8);
  }
  // Detect cursed equipped items
  const eqNeeds = world.get(playerId, Equipment);
  if (eqNeeds) {
    for (const slot of NON_AMMO_GEAR_SLOTS) {
      const eid = eqNeeds[slot];
      if (!Number.isInteger(eid) || eid <= 0) continue;
      const b = world.get(eid, Beatitude);
      if (b && b.state === "cursed") {
        needsBlessing = true;
        maxUrgency = Math.max(maxUrgency, 0.75);
        break;
      }
    }
  }
  if (
    hasStatus(world, playerId, "disease") ||
    hasStatus(world, playerId, "poisoned")
  ) {
    maxUrgency = Math.max(maxUrgency, 0.7);
  }
  if (hasStatus(world, playerId, "bleeding")) {
    maxUrgency = Math.max(maxUrgency, 0.6);
  }

  if (needsBlessing) {
    needs.push({ type: "blessing", urgency: maxUrgency });
  } else if (maxUrgency > 0) {
    needs.push({ type: "cure", urgency: maxUrgency });
  }

  // Sort by urgency descending and return just the types
  return needs.sort((a, b) => b.urgency - a.urgency).map((n) => n.type);
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 */
export function deitySystem(world) {
  wireWorldEvents(world);

  const tickSet = new Set();
  for (const [entity, devotion] of world.query(Devotion)) {
    const pantheon = devotionUsesPantheon(devotion);
    const ids = pantheon
      ? listPantheonDeityIds()
      : [String(devotion?.deityId || "")].filter(Boolean);
    for (const deityId of ids) {
      const deity = ensureDeity(deityId, world);
      if (!deity) continue;
      tickSet.add(deityId);
    }
    // Keep active patron synchronized during regular ticks.
    resolvePlayerDeity(world, entity);
  }

  for (const deityId of tickSet) {
    const deity = ensureDeity(deityId, world);
    if (!deity) continue;
    deity.tick(1);
  }
}

/**
 * Resolve the current active deity for a specific player.
 * Useful for systems like prayer that should respect pantheon patron shifts.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} playerId
 * @returns {{ deityId: string, deity: import('../../lib/deity-js/deity.js').Deity }|null}
 */
export function resolvePlayerActiveDeity(world, playerId) {
  return resolvePlayerDeity(world, playerId);
}

/**
 * Score a deity's current standing from mood state.
 * Higher = more favorable. Returns -999 for invalid/missing deity.
 * @param {import('../../lib/deity-js/deity.js').Deity} deity
 * @returns {number}
 */
export { scoreDeityStanding };

/**
 * Access a deity instance by id (for app-layer event wiring).
 * @param {string} deityId
 */
export function getDeityInstance(deityId) {
  return _deities.get(deityId) ?? null;
}

/**
 * Initialize and register a deity (called from main.js after player creation).
 * @param {string} deityId
 * @param {import('../../lib/ecs-js/index.js').World} world - needed to wire miracles
 * @returns {import('../../lib/deity-js/deity.js').Deity|null}
 */
export function initDeity(deityId, world = null) {
  return ensureDeity(deityId, world);
}

export { isDeityFavoring };
