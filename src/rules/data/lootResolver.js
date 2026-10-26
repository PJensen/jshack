// rules/data/lootResolver.js
// Loot table resolution engine.
// Resolves table IDs into drop descriptors, then materializes them as ECS entities.

import { LOOT_TABLES } from './lootTables.js';
import { affixSupportsSlot, getAffixWeight, listAffixEntries } from './affixes.js';
import { getCatalogItem, isCatalogEquipment } from './itemCatalog.js';
import { getGem, pickGem, buildGemItemParams } from './gems.js';
import { createFrom } from '../../lib/ecs-js/archetype.js';
import { buildCatalogItem } from './itemCatalogLoader.js';
import { GoldStack, HealthPotion, ArrowsStack, FireArrowsStack, PiercingArrowsStack, BodkinArrowsStack, BluntHeadArrowsStack, BombArrowsStack, ScrollOfMapping, GemItem, Bone, Ashes } from '../archetypes/Items.js';
import { Ration, IronRation, WildBerries, WildHerbs } from '../archetypes/Food.js';
import { Position } from '../components/Position.js';
import { ItemInfo } from '../components/ItemInfo.js';
import { Brain } from '../components/Brain.js';
import { Player } from '../components/Player.js';
import { Inventory } from '../components/Inventory.js';
import { inventoryItems } from '../utils/inventoryFacade.js';
import { NamedIdentity } from '../components/NamedIdentity.js';
import { getEquippedLootBiases } from '../utils/ammoAffinities.js';

const MAX_NESTING = 5;
const TOUCHSTONE_IDENTITY = 'stone_touchstone';
const TOUCHSTONE_OWNED_KEY = Symbol.for('jshack:touchstone:owned');

/** @type {Record<string, any> | null} */
let _ARCHETYPE_MAP = null;

function getArchetypeMap() {
  // Lazily resolve to avoid module-init TDZ in rare circular import paths.
  if (_ARCHETYPE_MAP) return _ARCHETYPE_MAP;
  _ARCHETYPE_MAP = {
    HealthPotion,
    GoldStack,
    ArrowsStack,
    FireArrowsStack,
    PiercingArrowsStack,
    BodkinArrowsStack,
    BluntHeadArrowsStack,
    BombArrowsStack,
    ScrollOfMapping,
    Bone,
    Ashes,
    Ration,
    IronRation,
    WildBerries,
    WildHerbs,
  };
  return _ARCHETYPE_MAP;
}

// ── Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a loot table into an array of abstract drop descriptors.
 * @param {string} tableId
 * @param {Object} rng - createRng() instance
 * @param {number} depth - current dungeon depth
 * @param {number} [nest=0] - recursion guard
 * @param {Object} [opts] - optional context
 * @param {ReadonlySet<string>} [opts.knownSpells] - spells the player already knows (weight → 0)
 * @returns {Array<{kind:string, params:Object}>}
 */
export function resolveLootTable(tableId, rng, depth, nest = 0, opts) {
  if (nest >= MAX_NESTING) return [];
  const table = LOOT_TABLES[tableId];
  if (!table) return [];

  const results = [];
  const rollCount = rng.int(table.rolls.min, table.rolls.max);
  
  // Chest tables enforce max 1 weapon rule globally (including nested table calls)
  const isChest = tableId.startsWith("chest:");
  // Share a mutable counter object across nested resolveLootTable calls so the
  // weapon cap is respected even when the weapon comes from a sub-table.
  const weaponRef = isChest ? { count: 0 } : (opts?._weaponRef || null);

  for (let r = 0; r < rollCount; r++) {
    const entry = weightedPick(table.entries, rng, opts);
    if (!entry) continue;

    switch (entry.type) {
      case "nothing":
        break;

      case "gold": {
        const base = (entry.count.base || 0) + depth * (entry.count.perDepth || 0);
        const count = Math.max(1, Math.round(base * (0.8 + rng.float(0, 0.4))));
        results.push({ kind: "gold", params: { count } });
        break;
      }

      case "archetype":
        results.push({ kind: "archetype", params: { archetype: entry.archetype } });
        break;

      case "equip": {
        const basePool = Array.isArray(entry.pool) ? entry.pool : [];
        const eligiblePool = basePool.filter((equipId) => {
          const def = getCatalogItem(String(equipId || ""));
          return passesDropRequirement(def, opts);
        });
        const pickPool = eligiblePool.length > 0 ? eligiblePool : basePool;
        const equipId = rng.choice(pickPool);
        if (!equipId) break;
        
        // Check weapon limit for chests (including when called from a nested table)
        if (weaponRef) {
          const def = getCatalogItem(equipId);
          if (def && def.slot === "weapon") {
            if (weaponRef.count >= 1) break; // Skip this weapon
            weaponRef.count++;
          }
        }
        
        const affixes = rollAffixes(rng, equipId, entry.affixChance || 0, entry.affixCountMax || 1);
        results.push({ kind: "equip", params: { equipId, affixes } });
        break;
      }

      case "item":
        results.push({ kind: "item", params: { itemId: entry.itemId } });
        break;

      case "gem": {
        const gem = entry.gemId ? getGem(entry.gemId) : pickGem(rng, entry.materials ? { materials: entry.materials } : {});
        if (gem) results.push({ kind: "gem", params: { gemId: gem.id } });
        break;
      }

      case "table": {
        const nestedOpts = weaponRef ? { ...(opts || {}), _weaponRef: weaponRef } : opts;
        const nested = resolveLootTable(entry.tableId, rng, depth, nest + 1, nestedOpts);
        results.push(...nested);
        break;
      }
    }
  }

  return results;
}

/**
 * Return effective weight for an entry, accounting for:
 * - known-spell suppression (spellbook entries)
 * - on_loot_roll catalog hooks (e.g. scroll_homecoming suppressed when player has hearthstone)
 * @param {Object} entry
 * @param {any} [opts]
 * @returns {number}
 */
function effectiveWeight(entry, opts) {
  const w = entry.weight || 0;
  if (w <= 0) return 0;
  if (entry.type === "equip") {
    const pool = Array.isArray(entry.pool) ? entry.pool : [];
    return hasEligibleEquipPool(pool, opts) ? w : 0;
  }
  if (entry.type === "archetype") {
    return w * Number(opts?.lootBiases?.[entry.archetype] || 1);
  }
  if (entry.type !== "item") return w;
  const id = String(entry.itemId || "");
  const def = getCatalogItem(id);
  if (!passesDropRequirement(def, opts)) return 0;

  // Spellbook suppression: books for already-known spells weight → 0
  if (opts?.knownSpells && id.startsWith("book_")) {
    const spellId = id.slice(5); // strip "book_" prefix
    if (opts.knownSpells.has(spellId)) return 0;
  }

  // on_loot_roll hook: catalog item may veto its own appearance
  if (opts?.playerItemIds) {
    const hook = def?.hooks?.on_loot_roll;
    if (typeof hook === "function") {
      try {
        const result = hook({
          playerItemIds: opts.playerItemIds,
          knownSpells: opts?.knownSpells || null,
        }, { itemId: id });
        if (result?.cancel) return 0;
      } catch { /* ignore hook errors */ }
    }
  }

  return w * Number(opts?.lootBiases?.[id] || 1);
}

function passesDropRequirement(def, opts) {
  if (!def || typeof def !== "object") return true;
  const requirement = def.dropRequirement;
  if (typeof requirement === "function") {
    try {
      return !!requirement({
        knownSpells: opts?.knownSpells || null,
        playerItemIds: opts?.playerItemIds || null,
      });
    } catch {
      return false;
    }
  }
  return true;
}

function hasEligibleEquipPool(pool, opts) {
  if (!Array.isArray(pool) || pool.length <= 0) return false;
  for (let i = 0; i < pool.length; i++) {
    const id = String(pool[i] || "");
    if (!id) continue;
    const def = getCatalogItem(id);
    if (passesDropRequirement(def, opts)) return true;
  }
  return false;
}

/**
 * Weighted random pick from entries.
 * @param {Array} entries
 * @param {Object} rng
 * @param {Object} [opts] - passed to effectiveWeight for known-spell filtering
 * @returns {Object|null}
 */
function weightedPick(entries, rng, opts) {
  const total = entries.reduce((s, e) => s + effectiveWeight(e, opts), 0);
  if (total <= 0) return null;
  let roll = rng.float(0, total);
  for (const entry of entries) {
    roll -= effectiveWeight(entry, opts);
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

// ── Affix rolling ───────────────────────────────────────────────────

/**
 * Roll affixes for equipment. Filters by slot and uses affix registry weights,
 * no duplicate affixes per item.
 * @param {Object} rng
 * @param {string} equipId
 * @param {number} affixChance - 0.0 to 1.0
 * @param {number} maxCount
 * @returns {string[]} affix IDs
 */
function rollAffixes(rng, equipId, affixChance, maxCount) {
  if (rng.next() >= affixChance) return [];

  const def = getCatalogItem(equipId);
  if (!def || !isCatalogEquipment(def)) return [];

  // Map equipment slot to affix slot: offhand/shield -> armor for affix purposes
  const rawSlot = def.slot === 'shield' ? 'offhand' : def.slot;
  const slot = rawSlot === 'offhand' ? 'armor' : rawSlot;

  const eligible = listAffixEntries()
    .filter(({ id }) => affixSupportsSlot(id, slot))
    .map(({ id }) => ({ id, weight: getAffixWeight(id) }));

  if (eligible.length === 0) return [];

  const count = rng.int(1, Math.min(maxCount, eligible.length));
  const selected = [];
  const remaining = [...eligible];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    const total = remaining.reduce((s, e) => s + e.weight, 0);
    let roll = rng.float(0, total);
    let idx = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      roll -= remaining[j].weight;
      if (roll <= 0) { idx = j; break; }
    }
    selected.push(remaining[idx].id);
    remaining.splice(idx, 1);
  }

  return selected;
}

// ── Materialization ─────────────────────────────────────────────────

/**
 * Create an ECS entity from a drop descriptor at a position.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{kind:string, params:Object}} drop
 * @param {{x:number, y:number}} pos
 * @returns {number|null} entity ID
 */
export function materializeDrop(world, drop, pos) {
  switch (drop.kind) {
    case "gold": {
      const id = createFrom(world, GoldStack, {});
      world.add(id, Position, { x: pos.x, y: pos.y });
      world.mutate(id, ItemInfo, r => { r.count = drop.params.count; });
      return id;
    }

    case "archetype": {
      const arch = getArchetypeMap()[drop.params.archetype];
      if (!arch) return null;
      const id = createFrom(world, arch, {});
      if (!(id > 0)) return null;
      world.add(id, Position, { x: pos.x, y: pos.y });
      return id;
    }

    case "equip": {
      let id = null;
      try { id = buildCatalogItem(world, drop.params.equipId, { affixes: drop.params.affixes || [] }); } catch { return null; }
      if (!(id > 0)) return null;
      world.add(id, Position, { x: pos.x, y: pos.y });
      return id;
    }

    case "gem": {
      const gem = getGem(drop.params.gemId);
      if (!gem) return null;
      const params = buildGemItemParams(gem);
      if (!params) return null;
      const id = createFrom(world, GemItem, params);
      world.add(id, Position, { x: pos.x, y: pos.y });
      return id;
    }

    case "item": {
      if (String(drop?.params?.itemId || '') === TOUCHSTONE_IDENTITY && shouldSuppressTouchstoneDrop(world)) {
        return null;
      }
      let id = null;
      try { id = buildCatalogItem(world, drop.params.itemId); } catch { return null; }
      if (!(id > 0)) return null;
      world.add(id, Position, { x: pos.x, y: pos.y });
      return id;
    }

    default:
      return null;
  }
}

/**
 * Touchstone uniqueness gate:
 * - Once the player has had one, no future touchstones should materialize.
 * - Also suppress if any touchstone entity currently exists in the world.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {boolean}
 */
function shouldSuppressTouchstoneDrop(world) {
  if (!world) return false;
  if (world[TOUCHSTONE_OWNED_KEY] === true) return true;

  let playerHasTouchstone = false;
  for (const [id] of world.query(Player)) {
    for (const itemEid of inventoryItems(world, id)) {
      const ni = world.get(itemEid, NamedIdentity);
      if (String(ni?.identity || '') === TOUCHSTONE_IDENTITY) {
        playerHasTouchstone = true;
        break;
      }
    }
    if (playerHasTouchstone) break;
  }
  if (playerHasTouchstone) {
    world[TOUCHSTONE_OWNED_KEY] = true;
    return true;
  }

  for (const [, ni] of world.query(NamedIdentity)) {
    if (String(ni?.identity || '') === TOUCHSTONE_IDENTITY) return true;
  }
  return false;
}

/**
 * Build a Set of item identities the player currently carries.
 * Used to suppress loot rolls via on_loot_roll hooks.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {Set<string>|null}
 */
function getPlayerItemIdentities(world) {
  for (const [id] of world.query(Player)) {
    const ids = new Set();
    for (const itemEid of inventoryItems(world, id)) {
      const info = /** @type {any} */ (world.get(itemEid, ItemInfo));
      if (info?.identity) ids.add(String(info.identity));
    }
    return ids;
  }
  return null;
}

/**
 * Build a Set of spell IDs the player currently knows.
 * Returns null if no player or no Brain component is found.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {Set<string>|null}
 */
function getPlayerKnownSpells(world) {
  for (const [id] of world.query(Player)) {
    const brain = world.get(id, Brain);
    if (brain && Array.isArray(brain.learnedSpellIds) && brain.learnedSpellIds.length > 0) {
      const known = new Set();
      for (let i = 0; i < brain.learnedSpellIds.length; i++) {
        const spellId = String(brain.learnedSpellIds[i] || "").trim().replace(/^spell:/, "");
        if (spellId) known.add(spellId);
      }
      return known;
    }
    return null;
  }
  return null;
}

/**
 * Convenience: resolve a table and materialize all drops at a position.
 * Known spells are automatically suppressed from spellbook drops.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {string} tableId
 * @param {Object} rng - createRng() instance
 * @param {number} depth
 * @param {{x:number, y:number}} pos
 * @param {{actor?:number, source?:string, origin?:{x:number,y:number}, impulse?:{dx:number,dy:number,force?:number,critical?:boolean}}|undefined} [meta]
 * @returns {number[]} entity IDs created
 */
export function dropLoot(world, tableId, rng, depth, pos, meta) {
  const knownSpells = getPlayerKnownSpells(world);
  const playerItemIds = getPlayerItemIdentities(world);
  let lootBiases = null;
  for (const [playerId] of world.query(Player)) {
    lootBiases = getEquippedLootBiases(world, playerId);
    if (lootBiases) break;
  }
  const opts = (knownSpells || playerItemIds || lootBiases) ? {
    knownSpells: knownSpells ?? undefined,
    playerItemIds: playerItemIds ?? undefined,
    lootBiases: lootBiases ?? undefined,
  } : undefined;
  const drops = resolveLootTable(tableId, rng, depth, 0, opts);
  const ids = [];
  const extra = {};
  if (meta?.actor) extra.actor = meta.actor;
  if (meta?.source) extra.source = meta.source;
  if (meta?.origin) extra.origin = meta.origin;
  if (meta?.impulse) extra.impulse = meta.impulse;
  for (const drop of drops) {
    const eid = materializeDrop(world, drop, pos);
    if (eid != null) {
      ids.push(eid);
      world.emit('item:dropped', { itemId: eid, count: 1, at: { x: pos.x, y: pos.y }, ...extra });
    }
  }
  return ids;
}
