import { Position } from "../components/Position.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Interactable } from "../components/Interactable.js";
import { DungeonState } from "../components/DungeonState.js";
import { LightEmitter } from "../components/LightEmitter.js";
import { AudioEmitter } from "../components/AudioEmitter.js";
import { RiftPortal } from "../components/RiftPortal.js";
import { RiftQuestLink } from "../components/RiftQuestLink.js";
import { RiftState } from "../components/RiftState.js";
import { playerEntity, findNearestValidTileAround } from "./queries.js";
import { RiftOpened } from "../../events/RiftOpened.js";
import { RiftClosed } from "../../events/RiftClosed.js";
import { attach } from "../../lib/ecs-js/hierarchy.js";

export const RIFT_PORTAL_IDENTITY = "rift_portal";
export const RIFT_PORTAL_ACTION = "riftPortal";

export function riftPlaneId(riftId) {
  const id = String(riftId || "");
  return id ? `rift:${id}` : "";
}

export function activeRiftRecord(world) {
  for (const [id, state] of world.query(RiftState)) {
    if (state?.active) return { id, state };
  }
  return null;
}

export function riftQuestLinkForPortal(world, portalId) {
  const pid = Number(portalId || 0) | 0;
  if (!(pid > 0)) return null;
  for (const [id, link] of world.query(RiftQuestLink)) {
    if (Number(link?.portalId || 0) !== pid) continue;
    return { id, link };
  }
  return null;
}

export function destroyRiftQuestLinks(world, payload = {}) {
  const portalId = Number(payload.portalId || 0) | 0;
  const riftId = String(payload.riftId || "");
  for (const [id, link] of world.query(RiftQuestLink)) {
    if (portalId > 0 && Number(link?.portalId || 0) === portalId) {
      try { world.destroy(id); } catch {}
      continue;
    }
    if (riftId && String(link?.riftId || "") === riftId) {
      try { world.destroy(id); } catch {}
    }
  }
}

export function currentDungeonDepth(world, fallback = 0) {
  for (const [, ds] of world.query(DungeonState)) {
    return Math.max(0, Number(ds?.currentDepth ?? fallback) | 0);
  }
  return Math.max(0, Number(fallback || 0) | 0);
}

export function currentPlaneId(world) {
  for (const [, ds] of world.query(DungeonState)) {
    return String(ds?.activePlaneId || "");
  }
  return "";
}

function nextUnit(world) {
  const rand = world?.rand;
  if (typeof rand !== "function") return 0;
  const n = Number(rand.call(world));
  if (!(n > 0)) return 0;
  if (n >= 1) return 1 - Number.EPSILON;
  return n;
}

function resolveLevelCount(world, requestedLevels) {
  const n = Number(requestedLevels || 0) | 0;
  if (n > 0) return Math.min(16, n);
  return 2 + Math.floor(nextUnit(world) * 4);
}

function resolveSeed(world) {
  const roll = Math.floor(nextUnit(world) * 0xffffffff) >>> 0;
  const base = Number(world?.seed || 0) >>> 0;
  const step = Number(world?.step || 0) >>> 0;
  return (base ^ roll ^ ((step * 0x9e3779b9) >>> 0) ^ 0x52494654) >>> 0;
}

function resolveRiftId(seed, portalId, prefix = "") {
  const p = String(prefix || "").trim();
  const suffix = `${(seed >>> 0).toString(16).padStart(8, "0")}-${Number(portalId || 0) | 0}`;
  return p ? `${p}:${suffix}` : suffix;
}

export function destroyActiveRift(world, payload = {}) {
  const rec = activeRiftRecord(world);
  if (!rec) return null;
  const state = rec.state;
  const riftId = String(payload.riftId || state.riftId || "");
  const portalId = Number(state.portalId || 0) | 0;
  let closedPos = null;

  for (const [id, portal] of world.query(RiftPortal)) {
    if (riftId && String(portal?.riftId || "") !== riftId) continue;
    if (!closedPos) {
      const pos = world.get(id, Position);
      if (pos) closedPos = { x: pos.x | 0, y: pos.y | 0 };
    }
    destroyRiftQuestLinks(world, { portalId: id, riftId });
    try { world.destroy(id); } catch {}
  }
  destroyRiftQuestLinks(world, { portalId, riftId });
  try { world.destroy(rec.id); } catch {}

  world.emit(new RiftClosed({
    actor: Number(payload.actor || 0) | 0,
    riftId,
    portalId,
    reason: String(payload.reason || "closed"),
    x: closedPos?.x,
    y: closedPos?.y,
  }));
  return { riftId, portalId, x: closedPos?.x, y: closedPos?.y };
}

export function createRift(world, spec = {}) {
  if (activeRiftRecord(world)) {
    return { ok: false, error: "A rift is already active. Use close rift first." };
  }

  const pe = playerEntity(world);
  if (!pe) return { ok: false, error: "No player entity found." };
  const originDepth = currentDungeonDepth(world, 0);
  const origin = { x: pe.pos.x | 0, y: pe.pos.y | 0 };
  const requestedPos = Number.isFinite(Number(spec.x)) && Number.isFinite(Number(spec.y))
    ? { x: Number(spec.x) | 0, y: Number(spec.y) | 0 }
    : null;
  const portalPos = requestedPos || findNearestValidTileAround(world, origin, {
    maxDistance: 2,
    exclude: [origin],
  }) || origin;
  const seed = Number.isFinite(Number(spec.seed)) ? (Number(spec.seed) >>> 0) : resolveSeed(world);
  const levels = resolveLevelCount(world, spec.levels);
  const templateId = String(spec.templateId || "");
  const questId = String(spec.questId || "");

  const portalId = world.create();
  const riftId = String(spec.riftId || "") || resolveRiftId(seed, portalId, String(spec.idPrefix || ""));
  world.add(portalId, Position, { x: portalPos.x | 0, y: portalPos.y | 0 });
  world.add(portalId, NamedIdentity, { name: "Rift Portal", identity: RIFT_PORTAL_IDENTITY });
  world.add(portalId, LightEmitter, {
    radius: 4.2,
    shadowSoftness: 3,
    temporalPattern: "rift",
    phaseSeed: seed & 0xffff,
    intensity: 0.92,
    intensityScale: 1,
    colorShiftScale: 0.85,
    voidStrength: null,
    baseColor: [182, 106, 255],
  });
  world.add(portalId, AudioEmitter, {
    emitters: [{ profile: "portal_idle", interior: false }],
  });
  world.add(portalId, Interactable, {
    action: RIFT_PORTAL_ACTION,
    params: { riftId },
  });
  world.add(portalId, RiftPortal, {
    riftId,
    seed,
    levels,
    originDepth,
    originX: origin.x,
    originY: origin.y,
  });
  if (templateId || questId) {
    const linkId = world.create();
    world.add(linkId, RiftQuestLink, { questId, portalId, riftId, templateId });
    attach(world, linkId, portalId);
  }
  for (const [id, ds] of world.query(DungeonState)) {
    const ids = Array.isArray(ds.floorEntityIds) ? ds.floorEntityIds.slice() : [];
    if (!ids.includes(portalId)) ids.push(portalId);
    world.set(id, DungeonState, { ...ds, floorEntityIds: ids });
    break;
  }

  const stateId = world.create();
  world.add(stateId, RiftState, {
    active: true,
    riftId,
    seed,
    levels,
    originDepth,
    originX: origin.x,
    originY: origin.y,
    currentLevel: 0,
    portalId,
    inside: false,
    planeId: riftPlaneId(riftId),
    templateId,
  });

  world.emit(new RiftOpened({
    riftId,
    portalId,
    seed,
    levels,
    originDepth,
    originX: origin.x,
    originY: origin.y,
    x: portalPos.x,
    y: portalPos.y,
  }));

  return {
    ok: true,
    riftId,
    portalId,
    seed,
    levels,
    originDepth,
    originX: origin.x,
    originY: origin.y,
    x: portalPos.x | 0,
    y: portalPos.y | 0,
    templateId,
    questId,
  };
}

export function createDebugRift(world, requestedLevels = 0) {
  return createRift(world, { levels: requestedLevels });
}
