import { Charges } from "../components/Charges.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { descendantsWith } from "./topology.js";

function readNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, n | 0);
}

function clampCharge(current, max) {
  const resolvedMax = readNonNegativeInt(max, 0);
  const resolvedCurrent = readNonNegativeInt(current, 0);
  return resolvedMax > 0 ? Math.min(resolvedMax, resolvedCurrent) : resolvedCurrent;
}

function findChargeNode(world, ownerId, opts = {}) {
  const filter = typeof opts.filter === "function" ? opts.filter : null;
  for (const [nodeId, charges] of descendantsWith(world, ownerId, Charges)) {
    if (filter && !filter(nodeId, charges)) continue;
    return [nodeId, charges];
  }
  return null;
}

/**
 * Resolve charge state for an entity.
 *
 * Runtime topology wins. Legacy ItemInfo.charges/maxCharges is compatibility
 * fallback while old item data migrates.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} ownerId
 * @param {{ filter?: (nodeId:number, charges:any) => boolean }} [opts]
 * @returns {{ entityId:number, current:number, max:number, source:"topology"|"legacy"|"none" }}
 */
export function resolveCharges(world, ownerId, opts = {}) {
  const owner = Number(ownerId || 0) | 0;
  if (!(owner > 0)) return { entityId: 0, current: 0, max: 0, source: "none" };

  const found = findChargeNode(world, owner, opts);
  if (found) {
    const [entityId, charges] = found;
    const max = readNonNegativeInt(charges?.max, 0);
    const current = clampCharge(charges?.current, max);
    return { entityId, current, max, source: "topology" };
  }

  const info = world.get(owner, ItemInfo);
  if (!info) return { entityId: 0, current: 0, max: 0, source: "none" };
  const max = readNonNegativeInt(info.maxCharges, 0);
  const current = clampCharge(info.charges, max);
  if (!(max > 0) && !(current > 0)) return { entityId: 0, current: 0, max: 0, source: "none" };
  return { entityId: owner, current, max, source: "legacy" };
}

/**
 * Set charge state, preferring existing topology charge nodes.
 *
 * @param {import("../../lib/ecs-js/index.js").World} world
 * @param {number} ownerId
 * @param {number} current
 * @param {number} [max]
 * @param {{ filter?: (nodeId:number, charges:any) => boolean }} [opts]
 * @returns {{ entityId:number, current:number, max:number, source:"topology"|"legacy"|"none" }}
 */
export function setCharges(world, ownerId, current, max = null, opts = {}) {
  const owner = Number(ownerId || 0) | 0;
  if (!(owner > 0)) return { entityId: 0, current: 0, max: 0, source: "none" };

  const before = resolveCharges(world, owner, opts);
  const nextMax = max == null ? before.max : readNonNegativeInt(max, 0);
  const nextCurrent = clampCharge(current, nextMax);

  if (before.source === "topology") {
    world.set(before.entityId, Charges, { current: nextCurrent, max: nextMax });
    const info = world.get(owner, ItemInfo);
    if (info) {
      info.charges = nextCurrent;
      info.maxCharges = nextMax;
    }
    return { entityId: before.entityId, current: nextCurrent, max: nextMax, source: "topology" };
  }

  const info = world.get(owner, ItemInfo);
  if (!info) return { entityId: 0, current: 0, max: 0, source: "none" };
  info.charges = nextCurrent;
  info.maxCharges = nextMax;
  return { entityId: owner, current: nextCurrent, max: nextMax, source: "legacy" };
}

/**
 * Add charge amount, clamped to max when max is positive.
 */
export function addCharges(world, ownerId, amount, opts = {}) {
  const before = resolveCharges(world, ownerId, opts);
  if (before.source === "none") return before;
  return setCharges(world, ownerId, before.current + readNonNegativeInt(amount, 0), before.max, opts);
}

/**
 * Spend charge amount, clamped at zero.
 */
export function spendCharges(world, ownerId, amount, opts = {}) {
  const before = resolveCharges(world, ownerId, opts);
  if (before.source === "none") return before;
  return setCharges(world, ownerId, Math.max(0, before.current - readNonNegativeInt(amount, 0)), before.max, opts);
}
