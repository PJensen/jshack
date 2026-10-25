/**
 * inventoryFacade.js — authoritative inventory/root/item helpers.
 *
 * Canonical layout:
 *   owner -> InventoryRoot -> item
 *
 * Legacy direct-child inventories are tolerated for reads and are migrated to
 * an InventoryRoot on the next mutating operation.
 */

import { Inventory } from "../components/Inventory.js";
import { InventoryRoot } from "../components/InventoryRoot.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Position } from "../components/Position.js";
import { Unpaid } from "../components/Unpaid.js";
import { Weight } from "../components/Weight.js";
import { Charges } from "../components/Charges.js";
import { ScriptState } from "../components/ScriptState.js";
import { resolveEquipmentView } from "./equipmentTopology.js";
import {
  attach,
  children,
  destroySubtree,
  detach,
  getParent,
  Parent,
  reparent,
  Sibling,
} from "../../lib/ecs-js/hierarchy.js";

const EXCLUDED_CLONE_KEYS = new Set([
  Parent.key,
  Sibling.key,
  Position.key,
  Weight.key,
]);

function clonePlain(value) {
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clonePlain);
  const out = {};
  for (const key of Object.keys(value)) out[key] = clonePlain(value[key]);
  return out;
}

function addImmediate(world, id, Comp, data) {
  return world.add(id, Comp, data);
}

function setImmediate(world, id, Comp, data) {
  return world.set(id, Comp, data);
}

function removeImmediate(world, id, Comp) {
  if (world.has(id, Comp)) world.removeImmediate(id, Comp);
}

function directItemChildren(world, ownerId) {
  const out = [];
  for (const cid of children(world, ownerId)) {
    if (world.has(cid, InventoryRoot)) continue;
    if (world.has(cid, ItemInfo)) out.push(cid);
  }
  return out;
}

function resolveContainerReadOnly(world, ownerId) {
  const rootId = findInventoryRoot(world, ownerId);
  if (rootId > 0) return rootId;
  return directItemChildren(world, ownerId).length > 0 ? ownerId : 0;
}

function ensureWeightRecord(world, itemId) {
  if (!(itemId > 0) || !world.isAlive(itemId)) return null;
  const info = world.get(itemId, ItemInfo);
  const self = info
    ? (Number(info.weight) || 0) * Math.max(1, Number(info.count || 0) | 0)
    : 0;
  const payload = { self, total: self };
  if (world.has(itemId, Weight)) return setImmediate(world, itemId, Weight, payload);
  return addImmediate(world, itemId, Weight, payload);
}

function readCurrencyCount(world, itemId, fallback = 0) {
  const info = world.get(itemId, ItemInfo);
  if (!info || String(info.type || "") !== "currency") return 0;
  const count = Number(info.count ?? fallback);
  return Math.max(1, Number.isFinite(count) ? (count | 0) : 1);
}

function emitCurrencyAdded(world, ownerId, itemId, count, merged = false) {
  const qty = Math.max(0, Number(count || 0) | 0);
  if (qty <= 0) return;
  world.emit("inventory:gold-gained", { ownerId, itemId, count: qty, delta: qty, merged: !!merged });
}

function capacityStackKey(world, itemId) {
  if (!(itemId > 0) || !world.isAlive(itemId)) return `__dead_${itemId}`;
  const ni = world.get(itemId, NamedIdentity);
  const base = ni?.identity ? String(ni.identity) : `__entity_${itemId}`;
  // Stateful artifacts own independent charge pools and script state.
  if (world.has(itemId, Charges) || world.has(itemId, ScriptState)) return `${base}::entity:${itemId}`;
  const unpaid = world.get(itemId, Unpaid);
  if (!unpaid) return base;
  const shopkeeperId = Number(unpaid.shopkeeperId || 0) | 0;
  const price = Number(unpaid.price || 0);
  return `${base}::unpaid:${shopkeeperId}:${price}`;
}

function capacityCompatible(world, leftId, rightId) {
  return capacityStackKey(world, leftId) === capacityStackKey(world, rightId);
}

function migrateLegacyDirectItemsToRoot(world, ownerId, rootId) {
  const legacyIds = directItemChildren(world, ownerId);
  for (const itemId of legacyIds) {
    ensureWeightRecord(world, itemId);
    reparent(world, itemId, rootId);
    removeImmediate(world, itemId, Position);
  }
}

/**
 * Find the hidden inventory root child for an inventory owner, or 0 if absent.
 */
export function findInventoryRoot(world, ownerId) {
  for (const cid of children(world, ownerId)) {
    if (world.has(cid, InventoryRoot)) return cid;
  }
  return 0;
}

/**
 * Find or lazily create the hidden inventory root for an inventory owner.
 * Legacy direct-child inventories are migrated into the root.
 */
export function getOrCreateInventoryRoot(world, ownerId) {
  if (!world.has(ownerId, Inventory)) return 0;

  let rootId = findInventoryRoot(world, ownerId);
  if (rootId <= 0) {
    rootId = world.create();
    addImmediate(world, rootId, InventoryRoot);
    addImmediate(world, rootId, Weight, { self: 0, total: 0 });
    attach(world, rootId, ownerId);
  } else if (!world.has(rootId, Weight)) {
    addImmediate(world, rootId, Weight, { self: 0, total: 0 });
  }

  migrateLegacyDirectItemsToRoot(world, ownerId, rootId);
  return rootId;
}

/**
 * Remove the hidden inventory root subtree for an owner, if present.
 */
export function destroyInventoryRoot(world, ownerId) {
  const rootId = findInventoryRoot(world, ownerId);
  if (rootId > 0 && world.isAlive(rootId)) destroySubtree(world, rootId);
}

/**
 * Return an array of all direct item entity ids in the owner's inventory.
 */
export function inventoryItems(world, ownerId) {
  const containerId = resolveContainerReadOnly(world, ownerId);
  if (!containerId) return [];

  const result = [];
  for (const cid of children(world, containerId)) {
    if (world.has(cid, InventoryRoot)) continue;
    if (world.has(cid, ItemInfo)) result.push(cid);
  }
  return result;
}

/**
 * Check if a specific item entity is currently in the owner's inventory.
 */
export function inventoryContains(world, ownerId, itemId) {
  const containerId = resolveContainerReadOnly(world, ownerId);
  if (!containerId) return false;
  return getParent(world, itemId) === containerId;
}

/**
 * Count distinct capacity stacks in the owner's inventory.
 */
export function inventoryStackCount(world, ownerId) {
  const keys = new Set();
  for (const itemId of inventoryItems(world, ownerId)) keys.add(capacityStackKey(world, itemId));
  return keys.size;
}

/**
 * Does the owner have room for at least one more capacity stack?
 */
export function hasCapacity(world, ownerId) {
  const inv = world.get(ownerId, Inventory);
  if (!inv) return false;
  if (inv.capacity == null) return true;
  return inventoryStackCount(world, ownerId) < inv.capacity;
}

/**
 * Does the owner have room for this item, accounting for compatible stacks?
 */
export function hasCapacityForItem(world, ownerId, itemId) {
  const inv = world.get(ownerId, Inventory);
  if (!inv) return false;
  if (inv.capacity == null) return true;
  if (inventoryContains(world, ownerId, itemId)) return true;

  for (const existingId of inventoryItems(world, ownerId)) {
    if (existingId === itemId) continue;
    if (capacityCompatible(world, existingId, itemId)) return true;
  }
  return inventoryStackCount(world, ownerId) < inv.capacity;
}

/**
 * Iterate direct inventory items without allocating an intermediate array.
 * Return false from the callback to stop early.
 */
export function forEachItem(world, ownerId, callback) {
  const containerId = resolveContainerReadOnly(world, ownerId);
  if (!containerId) return;
  for (const cid of children(world, containerId)) {
    if (world.has(cid, InventoryRoot) || !world.has(cid, ItemInfo)) continue;
    if (callback(cid) === false) break;
  }
}

/**
 * Add an item entity to the owner's inventory root.
 * @param {object} [opts]
 * @param {boolean} [opts.silent] - suppress inventory:added event
 * @param {boolean} [opts.mergeCompatible] - merge into an existing compatible stack instead of attaching a new entity
 */
export function addToInventory(world, ownerId, itemId, opts) {
  if (!(itemId > 0) || !world.isAlive(itemId)) return false;
  const rootId = getOrCreateInventoryRoot(world, ownerId);
  if (!(rootId > 0)) return false;

  const mergeCompatible = opts?.mergeCompatible !== false;
  if (mergeCompatible) {
    const incomingInfo = world.get(itemId, ItemInfo);
    if (incomingInfo) {
      const incomingCount = Math.max(1, Number(incomingInfo.count || 0) | 0);
      for (const existingId of inventoryItems(world, ownerId)) {
        if (existingId === itemId || !world.isAlive(existingId)) continue;
        if (!capacityCompatible(world, existingId, itemId)) continue;
        world.mutate(existingId, ItemInfo, (rec) => {
          rec.count = Math.max(1, Number(rec.count || 0) | 0) + incomingCount;
        });
        ensureWeightRecord(world, existingId);
        world.destroy(itemId);
        const currencyCount = readCurrencyCount(world, existingId, incomingCount);
        if (currencyCount > 0) emitCurrencyAdded(world, ownerId, existingId, incomingCount, true);
        if (!opts?.silent) world.emit('inventory:added', { ownerId, itemId: existingId, merged: true, count: incomingCount });
        return true;
      }
    }
  }

  ensureWeightRecord(world, itemId);
  attach(world, itemId, rootId);
  removeImmediate(world, itemId, Position);
  const currencyCount = readCurrencyCount(world, itemId);
  if (currencyCount > 0) emitCurrencyAdded(world, ownerId, itemId, currencyCount, false);
  if (!opts?.silent) world.emit('inventory:added', { ownerId, itemId });
  return true;
}

function isAmmoEntity(world, itemId) {
  const info = world.get(itemId, ItemInfo);
  return !!info && info.type === "ammo";
}

/**
 * Place an item on a ground tile, optionally merging compatible ammo stacks
 * already at that tile.
 *
 * Returns the entity id present on the tile after placement.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} itemId
 * @param {number} x
 * @param {number} y
 * @param {{ mergeCompatibleAmmo?: boolean }} [opts]
 * @returns {{ itemId: number, merged: boolean, movedCount: number }}
 */
export function placeOnGround(world, itemId, x, y, opts = {}) {
  if (!(itemId > 0) || !world.isAlive(itemId)) return { itemId: 0, merged: false, movedCount: 0 };
  const info = world.get(itemId, ItemInfo);
  const movedCount = Math.max(1, Number(info?.count || 0) | 0);

  if (opts.mergeCompatibleAmmo !== false && isAmmoEntity(world, itemId)) {
    for (const [existingId, pos] of world.query(Position)) {
      if (existingId === itemId) continue;
      if (!pos || pos.x !== x || pos.y !== y) continue;
      if (!isAmmoEntity(world, existingId)) continue;
      if (!capacityCompatible(world, existingId, itemId)) continue;

      world.mutate(existingId, ItemInfo, (rec) => {
        rec.count = Math.max(1, Number(rec.count || 0) | 0) + movedCount;
      });
      ensureWeightRecord(world, existingId);
      world.destroy(itemId);
      return { itemId: existingId, merged: true, movedCount };
    }
  }

  if (world.has(itemId, Position)) setImmediate(world, itemId, Position, { x, y });
  else addImmediate(world, itemId, Position, { x, y });
  return { itemId, merged: false, movedCount };
}

/**
 * Remove an item entity from the owner's inventory without placing it.
 */
export function removeFromInventory(world, ownerId, itemId) {
  const containerId = resolveContainerReadOnly(world, ownerId);
  if (!containerId || getParent(world, itemId) !== containerId) return false;
  detach(world, itemId, { remove: true });
  return true;
}

/**
 * Detach all items from the owner's inventory.
 */
export function clearInventory(world, ownerId) {
  const items = inventoryItems(world, ownerId);
  for (const itemId of items) detach(world, itemId, { remove: true });
}

/**
 * Move a single item between two inventory owners.
 * @param {object} [opts]
 * @param {boolean} [opts.silent] - suppress inventory:added event
 */
export function transferItem(world, itemId, fromId, toId, opts) {
  const fromContainerId = resolveContainerReadOnly(world, fromId);
  if (!fromContainerId || getParent(world, itemId) !== fromContainerId) return false;
  const toRootId = getOrCreateInventoryRoot(world, toId);
  if (!(toRootId > 0)) return false;
  reparent(world, itemId, toRootId);
  removeImmediate(world, itemId, Position);
  const currencyCount = readCurrencyCount(world, itemId);
  if (currencyCount > 0) emitCurrencyAdded(world, toId, itemId, currencyCount, false);
  if (!opts?.silent) world.emit('inventory:added', { ownerId: toId, itemId });
  return true;
}

/**
 * Clone an item entity, preserving all item behavior/state components except
 * containment, position, and derived weight.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} sourceId
 * @param {{ itemInfo?: Record<string, any> }} [opts]
 * @returns {number}
 */
export function cloneItemEntity(world, sourceId, opts = {}) {
  const copyId = world.create();
  const itemInfoPatch = (opts.itemInfo && typeof opts.itemInfo === "object")
    ? opts.itemInfo
    : null;

  for (const Comp of world._components.values()) {
    if (!Comp || !world.has(sourceId, Comp) || EXCLUDED_CLONE_KEYS.has(Comp.key)) continue;
    const rec = world.get(sourceId, Comp);
    if (Comp.isTag) addImmediate(world, copyId, Comp);
    else addImmediate(world, copyId, Comp, clonePlain(rec));
  }

  if (itemInfoPatch) {
    const current = world.get(copyId, ItemInfo) || {};
    setImmediate(world, copyId, ItemInfo, { ...current, ...clonePlain(itemInfoPatch) });
  }

  ensureWeightRecord(world, copyId);
  return copyId;
}

/**
 * Split `count` units from an item stack into a new entity.
 *
 * The source entity keeps the remainder. The returned entity is detached and
 * carries the full item state of the split-off units.
 *
 * @returns {number}
 */
export function splitItemStack(world, itemId, count) {
  const info = world.get(itemId, ItemInfo);
  const total = Math.max(1, Number(info?.count || 0) | 0);
  const takeCount = Math.max(1, Math.min(total - 1, Number(count || 0) | 0));
  if (!(takeCount > 0) || takeCount >= total) return 0;

  world.mutate(itemId, ItemInfo, (rec) => {
    rec.count = Math.max(1, (Number(rec.count || 0) | 0) - takeCount);
  });
  ensureWeightRecord(world, itemId);
  return cloneItemEntity(world, itemId, { itemInfo: { count: takeCount } });
}

/**
 * Build a grouped stack view keyed by capacity-compatible stack key.
 *
 * Returns Map<stackKey, { key, identity, ids, totalCount, unpaid }>
 */
export function getStackView(world, ownerId) {
  const groups = new Map();
  for (const itemId of inventoryItems(world, ownerId)) {
    const info = world.get(itemId, ItemInfo);
    if (!info) continue;
    const ni = world.get(itemId, NamedIdentity);
    const unpaid = world.get(itemId, Unpaid);
    const key = capacityStackKey(world, itemId);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        identity: ni?.identity ? String(ni.identity) : null,
        ids: [],
        totalCount: 0,
        unpaid: unpaid ? { shopkeeperId: Number(unpaid.shopkeeperId || 0) | 0, price: Number(unpaid.price || 0) } : null,
      };
      groups.set(key, group);
    }
    group.ids.push(itemId);
    group.totalCount += Math.max(1, Number(info.count || 0) | 0);
  }
  return groups;
}

/**
 * Get the total count for a raw item identity across the owner's inventory.
 */
export function getStackCount(world, ownerId, identity) {
  if (!identity) return 0;
  let total = 0;
  for (const itemId of inventoryItems(world, ownerId)) {
    const ni = world.get(itemId, NamedIdentity);
    if (ni?.identity === identity) {
      const info = world.get(itemId, ItemInfo);
      total += Math.max(1, Number(info?.count || 0) | 0);
    }
  }
  return total;
}

/**
 * Return true when the owner carries at least one item with the raw identity.
 */
export function hasItem(world, ownerId, identity) {
  return getStackCount(world, ownerId, identity) > 0;
}

/**
 * Consume up to `count` units across all entities matching a raw identity.
 *
 * Returns detached entity ids representing the consumed units.
 */
export function consumeFromStack(world, ownerId, identity, count) {
  const result = { consumed: 0, entities: [] };
  const remainingNeeded = Math.max(0, Number(count || 0) | 0);
  if (!identity || remainingNeeded <= 0) return result;

  let remaining = remainingNeeded;
  const candidates = [];
  for (const itemId of inventoryItems(world, ownerId)) {
    const ni = world.get(itemId, NamedIdentity);
    if (ni?.identity !== identity) continue;
    const info = world.get(itemId, ItemInfo);
    candidates.push({ id: itemId, count: Math.max(1, Number(info?.count || 0) | 0) });
  }

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (candidate.count <= remaining) {
      removeFromInventory(world, ownerId, candidate.id);
      result.entities.push(candidate.id);
      result.consumed += candidate.count;
      remaining -= candidate.count;
      continue;
    }

    const detachedId = splitItemStack(world, candidate.id, remaining);
    if (detachedId > 0) {
      result.entities.push(detachedId);
      result.consumed += remaining;
      remaining = 0;
    }
  }

  return result;
}

/**
 * Read the authoritative carried weight for an inventory owner.
 */
export function getCarriedWeight(world, ownerId) {
  let total = 0;
  const carried = new Set(inventoryItems(world, ownerId));
  const equipment = resolveEquipmentView(world, ownerId);
  for (const itemId of Object.values(equipment)) {
    if ((Number(itemId) | 0) > 0) carried.add(Number(itemId) | 0);
  }
  for (const itemId of carried) {
    const info = world.get(itemId, ItemInfo);
    total += (Number(info?.weight) || 0) * Math.max(1, Number(info?.count || 0) | 0);
  }
  return total;
}
