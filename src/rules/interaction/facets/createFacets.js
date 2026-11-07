import { Inventory } from "../../components/Inventory.js";
import { ItemInfo } from "../../components/ItemInfo.js";
import { Beatitude } from "../../components/Beatitude.js";
import { Equipment } from "../../components/Equipment.js";
import { Material } from "../../components/Material.js";
import { NamedIdentity } from "../../components/NamedIdentity.js";
import { Position } from "../../components/Position.js";
import { Vitality } from "../../components/Vitality.js";
import { Brain } from "../../components/Brain.js";
import { runSpellScript } from "../../scripts/spells.js";
import { Channeling } from "../../components/Channeling.js";
import { runScript } from "../../scripting.js";
import { combatSeed, mulberry32 } from "../../utils/rng.js";
import { createCombatStatFacade } from "../../utils/resolveCombatSnapshot.js";
import { createStatusFacade } from "../../utils/statusFacade.js";
import { getEffectiveVisionRange } from "../../utils/blind.js";
import { isIdentified } from "../../data/identification.js";
import { inventoryContains } from "../../utils/inventoryFacade.js";
import { inventoryItems } from "../../utils/inventoryFacade.js";
import { findNearestValidTileAround } from "../../utils/queries.js";
import { forEachLoadedTile, getTile, isWalkable } from "../../environment/dungeon/tileMap.js";

/**
 * @param {string} text
 * @returns {number}
 */
function hashText32(text) {
  let h = 0x811c9dc5;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * @param {number} seed
 */
function createDeterministicRng(seed) {
  const nextFn = mulberry32(seed >>> 0);
  return Object.freeze({
    next() {
      return nextFn();
    },
    float(min = 0, max = 1) {
      const lo = Math.min(Number(min), Number(max));
      const hi = Math.max(Number(min), Number(max));
      return lo + nextFn() * (hi - lo);
    },
    int(min, max) {
      const lo = Math.min(min | 0, max | 0);
      const hi = Math.max(min | 0, max | 0);
      return lo + Math.floor(nextFn() * (hi - lo + 1));
    },
    choice(values) {
      if (!Array.isArray(values) || values.length <= 0) return undefined;
      return values[Math.floor(nextFn() * values.length)];
    },
    chance(pct) {
      const n = Number(pct || 0);
      if (!(n > 0)) return false;
      return nextFn() * 100 < n;
    },
    fork(salt = 0) {
      const forkSeed = ((seed >>> 0) ^ (Number(salt) >>> 0)) >>> 0;
      return createDeterministicRng(forkSeed);
    },
  });
}

/**
 * @param {string} expr
 * @returns {{ count: number, sides: number, mod: number } | null}
 */
function parseDiceExpression(expr) {
  const src = String(expr || "").trim().toLowerCase();
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(src);
  if (!match) return null;
  const count = Math.max(1, Number(match[1]) | 0);
  const sides = Math.max(1, Number(match[2]) | 0);
  const mod = Number(match[3] || 0) | 0;
  return { count, sides, mod };
}

/**
 * @param {string} expr
 * @param {{ int: (min: number, max: number) => number }} localRng
 */
function rollDiceExpression(expr, localRng) {
  const parsed = parseDiceExpression(expr);
  if (!parsed) return 0;
  let total = parsed.mod;
  for (let i = 0; i < parsed.count; i++) {
    total += localRng.int(1, parsed.sides);
  }
  return total;
}

/**
 * @param {number} probability
 */
function normalizeChanceInput(probability) {
  const p = Number(probability || 0);
  if (!(p > 0)) return 0;
  if (p <= 1) return p * 100;
  return p;
}

/**
 * @param {{
 *   world: import("../../../lib/ecs-js/index.js").World,
 *   tx: import("../../utils/actionContexts.js").RuleActionContext,
 *   actor: number,
 *   primary: number,
 *   target: number,
 *   verb: string,
 *   eventBuffer: Array<{ event: string, payload: Record<string, unknown> }>,
 *   breadcrumbs: Array<{ step: string, data?: unknown }>,
 *   warnings: Array<{ code: string, detail?: unknown }>,
 * }} init
 */
export function createFacets(init) {
  const { world, tx, actor, primary, target, verb, eventBuffer, breadcrumbs, warnings } = init;
  const rngSeed = combatSeed(world.seed >>> 0, world.step | 0, actor | 0, primary | 0, (target | 0) ^ hashText32(verb));
  const rng = createDeterministicRng(rngSeed);
  const stats = createCombatStatFacade(world, {
    actor: () => actor,
    primary: () => primary,
    target: () => target,
  });
  const status = createStatusFacade(world, {
    actor: () => actor,
    primary: () => primary,
    target: () => target,
  });

  const query = Object.freeze({
    alive(entityId) {
      return world.isAlive(entityId | 0);
    },
    has(entityId, Comp) {
      return world.has(entityId | 0, Comp);
    },
    worldStep() {
      return world.step | 0;
    },
    get(entityId, Comp) {
      return world.get(entityId | 0, Comp);
    },
    first(Comp) {
      for (const [id, value] of world.query(Comp)) return { id, value };
      return null;
    },
    inventory(entityId) {
      return /** @type any */ (world.get(entityId | 0, Inventory));
    },
    inventoryItems(entityId) {
      return inventoryItems(world, entityId | 0);
    },
    itemInfo(entityId) {
      return /** @type any */ (world.get(entityId | 0, ItemInfo));
    },
    beatitude(entityId) {
      return /** @type any */ (world.get(entityId | 0, Beatitude))?.state || "";
    },
    equipment(entityId) {
      return /** @type any */ (world.get(entityId | 0, Equipment));
    },
    material(entityId) {
      return /** @type any */ (world.get(entityId | 0, Material))?.kind || "";
    },
    identity(entityId) {
      const ni = /** @type any */ (world.get(entityId | 0, NamedIdentity));
      return String(ni?.identity || "");
    },
    isIdentified(identity) {
      return isIdentified(String(identity || "").toLowerCase());
    },
    name(entityId) {
      const ni = /** @type any */ (world.get(entityId | 0, NamedIdentity));
      return String(ni?.name || "");
    },
    brain(entityId) {
      return /** @type any */ (world.get(entityId | 0, Brain));
    },
    effectiveVisionRange(entityId) {
      return getEffectiveVisionRange(world, entityId | 0);
    },
    combatSnapshot(entityId, mode = "melee") {
      return stats.snapshot(entityId | 0, mode);
    },
    combatStat(entityId, key, mode = "melee") {
      return stats.value(entityId | 0, key, mode);
    },
    resolveDamage(entityId, rawAmount, type = "physical") {
      return stats.resolveDamage(entityId | 0, rawAmount, type);
    },
    mitigation(entityId, rawAmount, type = "physical") {
      return stats.mitigation(entityId | 0, rawAmount, type);
    },
    statusSnapshot(entityId) {
      return status.snapshot(entityId | 0);
    },
    statusStrength(entityId, statusType) {
      return status.statusStrength(entityId | 0, statusType);
    },
    hasStatus(entityId, statusType) {
      return status.hasStatus(entityId | 0, statusType);
    },
    hasAnyStatus(entityId, statusTypes) {
      return status.hasAnyStatus(entityId | 0, statusTypes);
    },
    effectStrength(entityId, effectKey) {
      return status.effectStrength(entityId | 0, effectKey);
    },
    hasEffect(entityId, effectKey) {
      return status.hasEffect(entityId | 0, effectKey);
    },
    hasCapability(entityId, capability) {
      return status.hasCapability(entityId | 0, capability);
    },
    capabilityStrength(entityId, capability) {
      return status.capabilityStrength(entityId | 0, capability);
    },
    capabilitySources(entityId, capability) {
      return status.capabilitySources(entityId | 0, capability);
    },
    livingAt(x, y, opts = {}) {
      const tx = Number(x) | 0;
      const ty = Number(y) | 0;
      const exclude = new Set(
        Array.isArray(opts.exclude)
          ? opts.exclude.map((id) => Number(id || 0) | 0)
          : [],
      );
      const ids = [];
      for (const [id, pos, vit] of world.query(Position, Vitality)) {
        const eid = Number(id || 0) | 0;
        if (exclude.has(eid)) continue;
        if (!pos || (pos.x | 0) !== tx || (pos.y | 0) !== ty) continue;
        if (!vit || (vit.hp | 0) <= 0) continue;
        ids.push(eid);
      }
      ids.sort((a, b) => a - b);
      return ids;
    },
    nearestValidTileAround(entityId, maxDistance = 2) {
      const pos = world.get(entityId | 0, Position);
      if (!pos) return null;
      return findNearestValidTileAround(world, pos, { maxDistance: Math.max(1, Number(maxDistance) | 0) });
    },
    loadedWalkableTiles() {
      const tiles = [];
      forEachLoadedTile((x, y) => {
        if (isWalkable(x, y)) tiles.push({ x: x | 0, y: y | 0 });
      });
      return tiles;
    },
    tile(x, y) {
      return getTile(Number(x) | 0, Number(y) | 0);
    },
    isWalkable(x, y) {
      return isWalkable(Number(x) | 0, Number(y) | 0);
    },
  });

  const mutate = Object.freeze({
    damage(entityId, amount, source = "interaction") {
      return tx.damage(entityId | 0, amount | 0, source);
    },
    heal(entityId, amount) {
      return tx.heal(entityId | 0, amount | 0);
    },
    pushEffect(entityId, effect) {
      return tx.pushEffect(entityId | 0, effect);
    },
    consume(itemId, ownerId) {
      return tx.queueMutation({
        type: "consume",
        entityId: itemId | 0,
        inventoryOwnerId: ownerId | 0,
      });
    },
    appendDamageChannels(entityId, channels) {
      return tx.queueMutation({
        type: "appendDamageChannels",
        entityId: entityId | 0,
        channels: Array.isArray(channels) ? channels.map((c) => ({ ...c })) : [],
      });
    },
    upsertTimedEffect(entityId, effect) {
      return tx.queueMutation({
        type: "upsertTimedEffect",
        entityId: entityId | 0,
        effect: { ...effect },
      });
    },
    patchItemInfo(entityId, patch) {
      return tx.queueMutation({
        type: "patchItemInfo",
        entityId: entityId | 0,
        patch: (patch && typeof patch === "object") ? { ...patch } : {},
      });
    },
    attachEnchantment(entityId, def) {
      return tx.queueMutation({
        type: "attachEnchantment",
        entityId: entityId | 0,
        def: (def && typeof def === "object") ? { ...def } : {},
      });
    },
    setBeatitude(entityId, state) {
      return tx.queueMutation({
        type: "setBeatitude",
        entityId: entityId | 0,
        state: String(state || "").toLowerCase(),
      });
    },
    removeTimedEffectsByKey(entityId, keys) {
      return tx.queueMutation({
        type: "removeTimedEffectsByKey",
        entityId: entityId | 0,
        keys: Array.isArray(keys) ? keys.map((k) => String(k || "")) : [],
      });
    },
    setMaterial(entityId, kind) {
      return tx.queueMutation({
        type: "setMaterial",
        entityId: entityId | 0,
        kind: String(kind || ""),
      });
    },
    spawnItem(itemId, x, y, opts = {}) {
      const options = (opts && typeof opts === "object") ? opts : {};
      return tx.queueMutation({
        type: "spawnItem",
        itemId: String(itemId || ""),
        x: Number(x),
        y: Number(y),
        count: Number(options.count || 0) | 0,
        affixes: Array.isArray(options.affixes) ? options.affixes.slice() : [],
        ownerId: Number(options.ownerId || 0) | 0,
        material: String(options.material || ""),
        patchItemInfo: (options.patchItemInfo && typeof options.patchItemInfo === "object")
          ? { ...options.patchItemInfo }
          : {},
        emitEvent: options.emitEvent !== false,
      });
    },
    spawnMonster(monsterId, x, y, opts = {}) {
      const options = (opts && typeof opts === "object") ? opts : {};
      return tx.queueMutation({
        type: "spawnMonster",
        monsterId: String(monsterId || ""),
        x: Number(x),
        y: Number(y),
        name: String(options.name || ""),
        faction: String(options.faction || "enemy"),
        maxHp: Number(options.maxHp),
        accuracyDerived: Number(options.accuracyDerived),
        damagePowerDerived: Number(options.damagePowerDerived),
        evadeDerived: Number(options.evadeDerived),
        naturalDamageDice: String(options.naturalDamageDice || ""),
        sizeClass: String(options.sizeClass || ""),
        massKg: Number(options.massKg),
        resistances: (options.resistances && typeof options.resistances === "object")
          ? { ...options.resistances }
          : null,
        speed: Number(options.speed),
        tauntMessage: String(options.tauntMessage || ""),
        emitEvent: options.emitEvent !== false,
      });
    },
    spawnHazard(spec = {}) {
      const rec = (spec && typeof spec === "object") ? { ...spec } : {};
      return tx.queueMutation({
        type: "spawnHazard",
        spec: rec,
      });
    },
    materializeSpawn(spawn = {}, opts = {}) {
      const rec = (spawn && typeof spawn === "object") ? spawn : {};
      const options = (opts && typeof opts === "object") ? opts : {};
      return tx.queueMutation({
        type: "materializeSpawn",
        spawn: {
          ...rec,
          kind: String(rec.kind || ""),
          x: Number(rec.x),
          y: Number(rec.y),
          params: (rec.params && typeof rec.params === "object") ? { ...rec.params } : {},
        },
        emitEvent: options.emitEvent !== false,
      });
    },
    learnSpell(entityId, spellId) {
      return tx.queueMutation({
        type: "learnSpell",
        entityId: entityId | 0,
        spellId: String(spellId || ""),
      });
    },
    destroy(entityId) {
      return tx.queueMutation({ type: "destroy", entityId: entityId | 0 });
    },
    patchComponent(entityId, Component, patch) {
      return tx.queueMutation({
        type: "patchComponent",
        entityId: entityId | 0,
        Component,
        patch: (patch && typeof patch === "object") ? { ...patch } : {},
      });
    },
    removeComponent(entityId, Component) {
      return tx.queueMutation({
        type: "removeComponent",
        entityId: entityId | 0,
        Component,
      });
    },
    ensureInventory(entityId, capacity = 20) {
      return tx.queueMutation({
        type: "ensureInventory",
        entityId: entityId | 0,
        capacity: Number(capacity || 20) | 0,
      });
    },
    setPosition(entityId, point) {
      return tx.queueMutation({
        type: "setPosition",
        entityId: entityId | 0,
        x: Number(point?.x),
        y: Number(point?.y),
      });
    },
    setTiles(changes) {
      return tx.queueMutation({
        type: "setTiles",
        changes: Array.isArray(changes) ? changes.map((change) => ({ ...change })) : [],
      });
    },
    record(Component, data) {
      const receipt = {};
      tx.queueMutation({
        type: "recordFact",
        Component,
        data: (data && typeof data === "object") ? { ...data } : {},
        receipt,
      });
      return receipt;
    },
    waterExposure(entityId, options = {}) {
      const receipt = {};
      tx.queueMutation({
        type: "waterExposure",
        entityId: entityId | 0,
        actorId: Number(options.actorId || actor) | 0,
        sourceId: Number(options.sourceId || target) | 0,
        waterType: String(options.waterType || "plain"),
        receipt,
      });
      return receipt;
    },
    spawnGold(at, count) {
      const receipt = {};
      tx.queueMutation({
        type: "spawnGold",
        x: Number(at?.x),
        y: Number(at?.y),
        count: Number(count || 1) | 0,
        receipt,
      });
      return receipt;
    },
    materializeDrop(drop, at) {
      const receipt = {};
      tx.queueMutation({
        type: "materializeDrop",
        drop,
        x: Number(at?.x),
        y: Number(at?.y),
        receipt,
      });
      return receipt;
    },
    materializeDropToInventory(drop, ownerId, at, options = {}) {
      const receipt = {};
      const opts = (options && typeof options === "object") ? options : {};
      tx.queueMutation({
        type: "materializeDropToInventory",
        drop,
        ownerId: ownerId | 0,
        x: Number(at?.x),
        y: Number(at?.y),
        capacity: Number(opts.capacity || 20) | 0,
        receipt,
      });
      return receipt;
    },
    queue(op) {
      return tx.queueMutation(op);
    },
  });

  const io = Object.freeze({
    emit(event, payload = {}) {
      if (event && typeof event === "object") {
        eventBuffer.push({ instance: event });
        return true;
      }
      eventBuffer.push({
        event: String(event || ""),
        payload: /** @type any */ ({ ...payload }),
      });
      return true;
    },
    emitAfter(factory) {
      if (typeof factory !== "function") throw new Error("emitAfter requires a factory");
      eventBuffer.push({ factory });
      return true;
    },
    message(text, type = "system") {
      eventBuffer.push({
        event: "message",
        payload: { text: String(text || ""), type: String(type || "system") },
      });
      return true;
    },
  });

  const audit = Object.freeze({
    breadcrumb(step, data) {
      breadcrumbs.push({ step: String(step || "step"), data });
      return true;
    },
    warn(code, detail) {
      warnings.push({ code: String(code || "warning"), detail });
      return true;
    },
  });

  const rules = Object.freeze({
    hasItemInInventory(ownerId, itemId) {
      return inventoryContains(world, ownerId | 0, itemId | 0);
    },
    resolveTarget(defaultId) {
      const preferred = target | 0;
      if (preferred > 0 && world.isAlive(preferred)) return preferred;
      return defaultId | 0;
    },
    runScript(ref, scriptVerb, context = {}) {
      return runScript(
        ref,
        String(scriptVerb || ""),
        world,
        (context && typeof context === "object") ? { ...context } : {},
      );
    },
    runSpell(actorId, spell, intent = {}) {
      const castTime = Number(spell?.castTime || 0) | 0;
      if (castTime > 0) {
        const safeIntent = (intent && typeof intent === "object") ? intent : {};
        const casterPos = world.get(actorId | 0, Position);
        try {
          world.add(actorId | 0, Channeling, {
            turnsRemaining: castTime,
            turnsTotal: castTime,
            spellId: String(spell.id || ""),
            targetId: safeIntent.targetId ? (Number(safeIntent.targetId) | 0) : (actorId | 0),
            x: safeIntent.x != null ? (Number(safeIntent.x) | 0) : null,
            y: safeIntent.y != null ? (Number(safeIntent.y) | 0) : null,
            breakOnNoLos: !!spell?.breakOnNoLos,
            breakOnMove: !!spell?.breakOnMove,
            anchorX: casterPos ? (casterPos.x | 0) : null,
            anchorY: casterPos ? (casterPos.y | 0) : null,
          });
        } catch {}
        world.emit('channeling:start', { actor: actorId | 0, spellId: spell.id, castTime });
        return true;
      }
      runSpellScript(
        world,
        actorId | 0,
        spell,
        (intent && typeof intent === "object") ? { ...intent } : {},
      );
      return true;
    },
  });

  const fx = Object.freeze({
    chance(probability) {
      return rng.chance(normalizeChanceInput(probability));
    },
    int(min, max) {
      return rng.int(min, max);
    },
    roll(diceExpr) {
      return rollDiceExpression(String(diceExpr || ""), rng);
    },
    combatSnapshot(entityId = actor, mode = "melee") {
      return stats.snapshot(entityId | 0, mode);
    },
    armorClass(entityId = actor, mode = "melee") {
      return stats.armorClass(entityId | 0, mode);
    },
    attackBonus(entityId = actor, mode = "melee") {
      return stats.attackBonus(entityId | 0, mode);
    },
    combatStat(entityId = actor, key = "armorClass", mode = "melee") {
      return stats.value(entityId | 0, String(key || ""), mode);
    },
    resolveDamage(entityId = actor, rawAmount = 0, type = "physical") {
      return stats.resolveDamage(entityId | 0, rawAmount, type);
    },
    mitigation(entityId = actor, rawAmount = 0, type = "physical") {
      return stats.mitigation(entityId | 0, rawAmount, type);
    },
    statusSnapshot(entityId = actor) {
      return status.snapshot(entityId | 0);
    },
    statusStrength(entityId = actor, statusType = "") {
      return status.statusStrength(entityId | 0, statusType);
    },
    hasStatus(entityId = actor, statusType = "") {
      return status.hasStatus(entityId | 0, statusType);
    },
    hasAnyStatus(entityId = actor, statusTypes = []) {
      return status.hasAnyStatus(entityId | 0, statusTypes);
    },
    effectStrength(entityId = actor, effectKey = "") {
      return status.effectStrength(entityId | 0, effectKey);
    },
    hasEffect(entityId = actor, effectKey = "") {
      return status.hasEffect(entityId | 0, effectKey);
    },
    hasCapability(entityId = actor, capability = "") {
      return status.hasCapability(entityId | 0, capability);
    },
    capabilityStrength(entityId = actor, capability = "") {
      return status.capabilityStrength(entityId | 0, capability);
    },
    capabilitySources(entityId = actor, capability = "") {
      return status.capabilitySources(entityId | 0, capability);
    },
    pick(values, fallback = null) {
      if (!Array.isArray(values) || values.length <= 0) return fallback;
      return values[rng.int(0, values.length - 1)];
    },
    pickWeighted(entries, fallback = null) {
      if (!Array.isArray(entries) || entries.length <= 0) return fallback;
      let total = 0;
      for (let i = 0; i < entries.length; i++) {
        total += Math.max(0, Number(entries[i]?.weight || 0));
      }
      if (!(total > 0)) return fallback;
      let n = rng.next() * total;
      for (let i = 0; i < entries.length; i++) {
        const w = Math.max(0, Number(entries[i]?.weight || 0));
        if (w <= 0) continue;
        n -= w;
        if (n <= 0) return entries[i]?.value ?? fallback;
      }
      return entries[entries.length - 1]?.value ?? fallback;
    },
    damage(entityId, amount, source = "interaction") {
      return mutate.damage(entityId, amount, source);
    },
    heal(entityId, amount) {
      return mutate.heal(entityId, amount);
    },
    addEffect(entityId, effect) {
      return mutate.upsertTimedEffect(entityId, effect);
    },
    patchItemInfo(entityId, patch) {
      return mutate.patchItemInfo(entityId, patch);
    },
    attachEnchantment(entityId, def) {
      return mutate.attachEnchantment(entityId, def);
    },
    setBeatitude(entityId, state) {
      return mutate.setBeatitude(entityId, state);
    },
    setMaterial(entityId, kind) {
      return mutate.setMaterial(entityId, kind);
    },
    clearEffects(entityId = actor, keys = []) {
      return mutate.removeTimedEffectsByKey(entityId | 0, keys);
    },
    consume(itemId = primary, ownerId = actor) {
      return mutate.consume(itemId, ownerId);
    },
    adjacentPoint(entityId = actor) {
      const pos = query.get(entityId | 0, Position) || { x: 0, y: 0 };
      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      const dir = dirs[rng.int(0, dirs.length - 1)];
      return { x: (pos.x | 0) + dir.x, y: (pos.y | 0) + dir.y };
    },
    spawnItem(itemId, at = null, opts = {}) {
      const fallback = query.get(actor, Position) || { x: 0, y: 0 };
      const point = (at && typeof at === "object")
        ? { x: Number(at.x), y: Number(at.y) }
        : { x: Number.NaN, y: Number.NaN };
      const x = Number.isFinite(point.x) ? (point.x | 0) : (fallback.x | 0);
      const y = Number.isFinite(point.y) ? (point.y | 0) : (fallback.y | 0);
      return mutate.spawnItem(itemId, x, y, opts);
    },
    spawnMonster(monsterId, at = null, opts = {}) {
      const fallback = query.get(actor, Position) || { x: 0, y: 0 };
      const point = (at && typeof at === "object")
        ? { x: Number(at.x), y: Number(at.y) }
        : { x: Number.NaN, y: Number.NaN };
      const x = Number.isFinite(point.x) ? (point.x | 0) : (fallback.x | 0);
      const y = Number.isFinite(point.y) ? (point.y | 0) : (fallback.y | 0);
      return mutate.spawnMonster(monsterId, x, y, opts);
    },
    hazardSpawn(spec = {}, at = null) {
      const rec = (spec && typeof spec === "object") ? { ...spec } : {};
      const fallback = query.get(actor, Position) || { x: 0, y: 0 };
      const point = (at && typeof at === "object")
        ? { x: Number(at.x), y: Number(at.y) }
        : { x: Number(rec.x), y: Number(rec.y) };
      rec.x = Number.isFinite(point.x) ? (point.x | 0) : (fallback.x | 0);
      rec.y = Number.isFinite(point.y) ? (point.y | 0) : (fallback.y | 0);
      return mutate.spawnHazard(rec);
    },
    materializeSpawn(spawn = {}, at = null, opts = {}) {
      const rec = (spawn && typeof spawn === "object") ? { ...spawn } : {};
      const fallback = query.get(actor, Position) || { x: 0, y: 0 };
      const point = (at && typeof at === "object")
        ? { x: Number(at.x), y: Number(at.y) }
        : { x: Number(rec.x), y: Number(rec.y) };
      rec.x = Number.isFinite(point.x) ? (point.x | 0) : (fallback.x | 0);
      rec.y = Number.isFinite(point.y) ? (point.y | 0) : (fallback.y | 0);
      return mutate.materializeSpawn(rec, opts);
    },
    emit(event, payload = {}) {
      return io.emit(event, payload);
    },
    message(text, type = "system") {
      return io.message(text, type);
    },
    warn(code, detail) {
      return audit.warn(code, detail);
    },
    queue(op) {
      return mutate.queue(op);
    },
  });

  return { world, query, mutate, io, audit, rules, rng, fx, stats, status };
}
