// src/main/wiring/transitionWiring.js
// Stair, portal, and depth-transition controller.
// Owns pending-transition state and the flush logic called each frame.

import { transitionToDepth } from "../../rules/environment/dungeon/transition.js";
import { DungeonState } from "../../rules/components/DungeonState.js";
import { DungeonEntrance } from "../../rules/components/DungeonEntrance.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { Position } from "../../rules/components/Position.js";
import { Interactable } from "../../rules/components/Interactable.js";
import { LightEmitter } from "../../rules/components/LightEmitter.js";
import { Vitality } from "../../rules/components/Vitality.js";
import { Player } from "../../rules/components/Player.js";
import { Pet } from "../../rules/components/Pet.js";
import { PetState } from "../../rules/components/PetState.js";
import { RiftPortal } from "../../rules/components/RiftPortal.js";
import { RiftState } from "../../rules/components/RiftState.js";
import { getUnderworldRegionTemplate } from "../../rules/environment/dungeon/underworldRegions.js";
import { DoorKey } from "../../rules/components/DoorKey.js";
import { hasItem, inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { defineExtension } from "../../lib/ecs-js/index.js";
import { LockpickPrompted } from "../../events/LockpickPrompted.js";
import { LockpickResolved } from "../../events/LockpickResolved.js";
import { RiftEnterRequested } from "../../events/RiftEnterRequested.js";
import { RiftEntered } from "../../events/RiftEntered.js";
import { RiftCloseRequested } from "../../events/RiftCloseRequested.js";
import { RiftExited } from "../../events/RiftExited.js";
import { destroyActiveRift, activeRiftRecord, riftPlaneId, riftQuestLinkForPortal } from "../../rules/utils/riftRuntime.js";

const RETURN_PORTAL_IDENTITY = 'return_portal';
const STAIR_TRANSITION_COOLDOWN_MS = 220;
const TRANSITION_WIRING_EXTENSION_KEY = Symbol.for("jshack:main:transitionWiring");

export function canTraverseDungeonEntrance(world, actorId, entrance) {
  const lockId = String(entrance?.lockId || "");
  if (!lockId) return true;
  for (const itemId of inventoryItems(world, Number(actorId || 0) | 0)) {
    if (String(world.get(itemId, DoorKey)?.lockId || "") === lockId) return true;
  }
  return false;
}

/**
 * @param {object} deps
 * @param {object} deps.world
 * @param {() => ({id:number, pos:{x:number,y:number}}|null)} deps.playerEntity
 * @param {object} deps.tombstoneRepo
 * @param {() => any[]|null} [deps.getHighscores]
 * @param {() => void} deps.onTransitioned  callback after floor change (invalidate caches)
 */
export function createTransitionController({ world, playerEntity, tombstoneRepo, getHighscores, onTransitioned }) {
  /** @type {object|null} */
  let _pending = null;
  let _inFlight = false;
  let _lockUntilMs = 0;

  function isLocked() { return _inFlight || Date.now() < _lockUntilMs; }
  function armCooldown() { _lockUntilMs = Date.now() + STAIR_TRANSITION_COOLDOWN_MS; }

  function queueStair(direction, stairX = null, stairY = null, entrance = null) {
    const dir = direction === 'up' ? 'up' : (direction === 'down' ? 'down' : null);
    if (!dir) return;
    if (_pending || isLocked()) return;
    const stairPos = (stairX != null && stairY != null) ? { x: stairX, y: stairY } : null;
    _pending = { direction: dir, stairPos, entrance };
  }

  function queueDepth(targetDepth, opts = {}) {
    const depth = Number(targetDepth);
    if (!Number.isFinite(depth)) return;
    if (_pending || isLocked()) return;
    const x = Number(opts?.targetPos?.x);
    const y = Number(opts?.targetPos?.y);
    const targetPos = (Number.isFinite(x) && Number.isFinite(y))
      ? { x: Math.floor(x), y: Math.floor(y) }
      : undefined;
    const sx = Number(opts?.stairPos?.x);
    const sy = Number(opts?.stairPos?.y);
    const stairPos = (Number.isFinite(sx) && Number.isFinite(sy))
      ? { x: Math.floor(sx), y: Math.floor(sy) }
      : undefined;
    const tDepth = Number(opts?.returnTicket?.depth);
    const tx = Number(opts?.returnTicket?.x);
    const ty = Number(opts?.returnTicket?.y);
    const returnTicket = (Number.isFinite(tDepth) && Number.isFinite(tx) && Number.isFinite(ty))
      ? { depth: Math.max(0, Math.floor(tDepth)), x: Math.floor(tx), y: Math.floor(ty) }
      : null;
    _pending = {
      targetDepth: Math.max(0, Math.floor(depth)),
      targetPos,
      stairPos,
      fragActorsAtTarget: opts?.fragActorsAtTarget === true,
      validateTargetPos: opts?.validateTargetPos === true,
      returnTicket,
      homecomingLanding: opts?.homecomingLanding === true,
      source: typeof opts?.source === "string" ? opts.source : "",
      planeId: typeof opts?.planeId === "string" ? opts.planeId : "",
      planeSeed: Number(opts?.planeSeed || 0) >>> 0,
      riftId: typeof opts?.riftId === "string" ? opts.riftId : "",
      riftLevel: Math.max(0, Number(opts?.riftLevel || 0) | 0),
      riftEnter: opts?.riftEnter === true,
      riftExit: opts?.riftExit === true,
      riftClose: opts?.riftClose === true,
      templateId: typeof opts?.templateId === "string" ? opts.templateId : "",
    };
  }

  // ── Floor entity tracking ─────────────────────────────────────────────

  function trackFloorEntity(entityId) {
    const eid = Number(entityId) | 0;
    if (!(eid > 0)) return;
    for (const [id, ds] of world.query(DungeonState)) {
      if (!Array.isArray(ds.floorEntityIds)) ds.floorEntityIds = [];
      if (!ds.floorEntityIds.includes(eid)) ds.floorEntityIds.push(eid);
      try { world.set(id, DungeonState, ds); } catch {}
      break;
    }
  }

  function untrackFloorEntity(entityId) {
    const eid = Number(entityId) | 0;
    if (!(eid > 0)) return;
    for (const [id, ds] of world.query(DungeonState)) {
      if (!Array.isArray(ds.floorEntityIds)) break;
      ds.floorEntityIds = ds.floorEntityIds.filter((v) => (Number(v) | 0) !== eid);
      try { world.set(id, DungeonState, ds); } catch {}
      break;
    }
  }

  function destroyReturnPortals() {
    const ids = [];
    for (const [id, ni] of world.query(NamedIdentity)) {
      if (ni?.identity === RETURN_PORTAL_IDENTITY) ids.push(id);
    }
    for (const id of ids) {
      try { world.destroy(id); } catch {}
      untrackFloorEntity(id);
    }
  }

  function spawnReturnPortal(ticket, atFountain = false) {
    const pe = playerEntity();
    if (!pe) return 0;
    destroyReturnPortals();

    let fountainPos = null;
    let bedPos = null;
    let chestPos = null;
    for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
      if (ni?.identity === 'fountain') fountainPos = { x: pos.x | 0, y: pos.y | 0 };
      else if (ni?.identity === 'bed_home') bedPos = { x: pos.x | 0, y: pos.y | 0 };
      else if (ni?.identity === 'chest') chestPos = { x: pos.x | 0, y: pos.y | 0 };
    }

    let portalPos;
    if (atFountain && fountainPos) {
      portalPos = { x: fountainPos.x, y: fountainPos.y + 1 };
    } else if (bedPos && chestPos) {
      portalPos = { x: Math.floor((bedPos.x + chestPos.x) / 2), y: Math.floor((bedPos.y + chestPos.y) / 2) };
    } else {
      portalPos = { x: pe.pos.x, y: pe.pos.y };
    }

    const portalId = world.create();
    world.add(portalId, Position, { x: portalPos.x, y: portalPos.y });
    world.add(portalId, NamedIdentity, { name: 'Return Portal', identity: RETURN_PORTAL_IDENTITY });
    world.add(portalId, LightEmitter, {
      radius: 3.6,
      shadowSoftness: 4,
      temporalPattern: "portal",
      phaseSeed: ((portalPos.x & 0xffff) << 8) ^ (portalPos.y & 0xffff),
      intensity: 0.88,
      intensityScale: 1,
      colorShiftScale: 0.65,
      voidStrength: null,
      baseColor: [112, 214, 255],
    });
    world.add(portalId, Interactable, {
      action: 'returnPortal',
      params: {
        targetDepth: Math.max(0, Math.floor(Number(ticket?.depth || 0))),
        targetX: Math.floor(Number(ticket?.x || 0)),
        targetY: Math.floor(Number(ticket?.y || 0)),
      },
    });
    trackFloorEntity(portalId);
    try {
      world.emit?.('portal:spawned', {
        portalId,
        at: { x: portalPos.x, y: portalPos.y },
        targetDepth: Math.max(0, Math.floor(Number(ticket?.depth || 0))),
        target: { x: Math.floor(Number(ticket?.x || 0)), y: Math.floor(Number(ticket?.y || 0)) },
      });
    } catch (e) { console.debug('[transition] emit portal:spawned failed:', e); }
    return portalId;
  }

  function fragActorsAt(x, y, excludeId = 0) {
    const tx = Math.floor(Number(x));
    const ty = Math.floor(Number(y));
    let count = 0;
    for (const [id, pos, _vit] of world.query(Position, Vitality)) {
      if (id === excludeId) continue;
      if ((pos.x | 0) !== tx || (pos.y | 0) !== ty) continue;
      try { world.destroy(id); } catch {}
      untrackFloorEntity(id);
      count++;
    }
    if (count > 0) {
      try { world.emit?.('portal:return:fragged', { count, at: { x: tx, y: ty } }); } catch (e) { console.debug('[transition] emit portal:return:fragged failed:', e); }
    }
    return count;
  }

  // ── Flush pending transition (called each frame) ──────────────────────

  async function flush() {
    const pending = _pending;
    if (!pending) return;
    if (isLocked()) return;
    _inFlight = true;
    _pending = null;

    try {
      let currentDepth = 1;
      let currentState = null;
      for (const [, state] of world.query(DungeonState)) {
        currentDepth = state.currentDepth;
        currentState = state;
        break;
      }
      const currentPlaneId = String(currentState?.activePlaneId || "");
      const currentRift = activeRiftRecord(world);

      let newDepth = currentDepth;
      if (Number.isFinite(pending.targetDepth)) {
        newDepth = Math.max(0, Math.floor(Number(pending.targetDepth)));
      } else if (pending.direction === 'down') {
        newDepth = pending.entrance
          ? Math.max(1, Number(pending.entrance.targetDepth || 1) | 0)
          : currentDepth + 1;
      } else if (pending.direction === 'up') {
        newDepth = currentDepth - 1;
      }
      if (
        currentRift?.state?.inside
        && currentPlaneId === currentRift.state.planeId
        && (pending.direction === "down" || pending.direction === "up")
      ) {
        if (pending.direction === "down") {
          if (currentDepth >= Math.max(1, Number(currentRift.state.levels || 1) | 0)) return;
          pending.planeId = currentRift.state.planeId;
          pending.planeSeed = currentRift.state.seed;
          pending.riftId = currentRift.state.riftId;
          pending.riftLevel = newDepth;
          pending.riftEnter = true;
          pending.templateId = String(currentState?.activeTemplateId || "");
        } else if (currentDepth <= 1) {
          newDepth = Math.max(0, Number(currentRift.state.originDepth || 0) | 0);
          pending.targetPos = { x: currentRift.state.originX | 0, y: currentRift.state.originY | 0 };
          pending.planeId = "";
          pending.planeSeed = 0;
          pending.riftId = currentRift.state.riftId;
          pending.riftExit = true;
        } else {
          pending.planeId = currentRift.state.planeId;
          pending.planeSeed = currentRift.state.seed;
          pending.riftId = currentRift.state.riftId;
          pending.riftLevel = newDepth;
          pending.riftEnter = true;
          pending.templateId = String(currentState?.activeTemplateId || "");
        }
      }
      const activeTemplateId = pending.planeId
        ? ""
        : String(pending.entrance?.templateId || currentState?.activeTemplateId || "");
      const activeTemplate = getUnderworldRegionTemplate(activeTemplateId);
      const templateFloors = Math.max(1, Number(activeTemplate?.floors ?? 0) | 0);
      if (pending.direction === 'down' && activeTemplate && currentDepth >= templateFloors) return;
      if (newDepth < 0 || (newDepth === currentDepth && String(pending.planeId || "") === currentPlaneId)) return;

      const hasTargetPos = Number.isFinite(pending.targetPos?.x) && Number.isFinite(pending.targetPos?.y);
      if (hasTargetPos) {
        await transitionToDepth(
          world,
          newDepth,
          { x: pending.targetPos.x | 0, y: pending.targetPos.y | 0 },
          {
            tombstoneRepo,
            getHighscores,
            validateDestination: pending.validateTargetPos === true,
            planeId: pending.planeId,
            planeSeed: pending.planeSeed,
            templateId: pending.templateId,
          },
        );
        if (pending.fragActorsAtTarget) {
          const pe = playerEntity();
          const playerId = pe?.id || 0;
          fragActorsAt(pending.targetPos.x, pending.targetPos.y, playerId);
          if (playerId > 0) {
            world.set(playerId, Position, { x: pending.targetPos.x | 0, y: pending.targetPos.y | 0 });
          }
        }
      } else {
        const direction = newDepth > currentDepth ? 'down' : 'up';
        await transitionToDepth(world, newDepth, { x: 0, y: 0 }, {
          direction,
          stairPos: pending.stairPos || null,
          tombstoneRepo,
          getHighscores,
          templateId: activeTemplateId,
          anchorX: activeTemplateId ? (Number(pending.entrance?.anchorX ?? currentState?.regionAnchorX ?? pending.stairPos?.x ?? 0) | 0) : undefined,
          anchorY: activeTemplateId ? (Number(pending.entrance?.anchorY ?? currentState?.regionAnchorY ?? pending.stairPos?.y ?? 0) | 0) : undefined,
          planeId: pending.planeId,
          planeSeed: pending.planeSeed,
          templateId: pending.templateId,
        });
      }

      // Homecoming landing: reposition player at the town fountain
      if (newDepth === 0 && pending.homecomingLanding) {
        let fountainPos = null;
        for (const [, pos, ni] of world.query(Position, NamedIdentity)) {
          if (ni?.identity === 'fountain') { fountainPos = { x: pos.x | 0, y: pos.y | 0 }; break; }
        }
        if (fountainPos) {
          for (const [id] of world.query(Player)) { world.set(id, Position, { x: fountainPos.x, y: fountainPos.y }); break; }
          for (const [id] of world.query(Pet, PetState)) { world.set(id, Position, { x: fountainPos.x, y: fountainPos.y }); }
        }
      }

      if (newDepth === 0 && pending.returnTicket && pending.returnTicket.depth > 0) {
        spawnReturnPortal(pending.returnTicket, pending.homecomingLanding);
      }

      onTransitioned();
      if (pending.riftEnter && pending.riftId) {
        for (const [id, state] of world.query(RiftState)) {
          if (String(state?.riftId || "") !== pending.riftId) continue;
          world.set(id, RiftState, {
            ...state,
            inside: true,
            currentLevel: pending.riftLevel || newDepth,
            planeId: pending.planeId,
          });
          world.emit(new RiftEntered({
            actor: playerEntity()?.id || 0,
            riftId: pending.riftId,
            level: pending.riftLevel || newDepth,
            levels: state.levels,
            seed: state.seed,
          }));
          break;
        }
      }
      if (pending.riftExit && pending.riftId) {
        for (const [id, state] of world.query(RiftState)) {
          if (String(state?.riftId || "") !== pending.riftId) continue;
          world.set(id, RiftState, {
            ...state,
            inside: false,
            currentLevel: 0,
          });
          world.emit(new RiftExited({
            actor: playerEntity()?.id || 0,
            riftId: pending.riftId,
            originDepth: state.originDepth,
            originX: state.originX,
            originY: state.originY,
          }));
          break;
        }
      }
      if (pending.riftClose && pending.riftId) {
        const rec = activeRiftRecord(world);
        if (rec?.state && String(rec.state.riftId || "") === pending.riftId) {
          world.emit(new RiftExited({
            actor: playerEntity()?.id || 0,
            riftId: pending.riftId,
            originDepth: rec.state.originDepth,
            originX: rec.state.originX,
            originY: rec.state.originY,
          }));
        }
        destroyActiveRift(world, {
          actor: playerEntity()?.id || 0,
          riftId: pending.riftId,
          reason: "closed",
        });
      }
      if (pending.source) {
        const pe = playerEntity();
        try {
          world.emit?.('teleported', {
            id: pe?.id || 0,
            to: pe?.pos || null,
            source: pending.source,
            depth: newDepth,
          });
        } catch (e) { console.debug('[transition] emit teleported failed:', e); }
      }
    } finally {
      _inFlight = false;
      armCooldown();
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────

  const extension = defineExtension("jshack:main:transitionWiring", (installedWorld) => {
    const offStair = installedWorld.on('stair:traverse', ({ actor, direction, targetId }) => {
      const sid = Number(targetId) | 0;
      if (!(sid > 0)) return;
      const stairPos = world.get(sid, Position);
      if (!stairPos) return;
      const actorId = Number(actor) | 0;
      const actorPos = actorId > 0 ? world.get(actorId, Position) : null;
      if (!actorPos) return;
      if ((actorPos.x | 0) !== (stairPos.x | 0) || (actorPos.y | 0) !== (stairPos.y | 0)) return;
      const entrance = world.get(sid, DungeonEntrance) || null;
      if (!canTraverseDungeonEntrance(world, actorId, entrance)) {
        world.emit("message", {
          text: "The dungeon entrance is locked.",
          type: "system",
        });
        if (hasItem(world, actorId, "lockpick")) {
          world.emit(new LockpickPrompted({
            actor: actorId,
            targetId: sid,
            pins: 6,
            difficulty: String(entrance?.lockDifficulty || "hard"),
          }));
        }
        return;
      }
      queueStair(direction, stairPos.x | 0, stairPos.y | 0, entrance);
    });

    const offEntranceLockpick = installedWorld.on(LockpickResolved, (event) => {
      if (!event.success) return;
      const entrance = world.get(event.targetId, DungeonEntrance);
      const stairPos = world.get(event.targetId, Position);
      const actorPos = world.get(event.actor, Position);
      if (!entrance || !stairPos || !actorPos) return;
      if ((actorPos.x | 0) !== (stairPos.x | 0) || (actorPos.y | 0) !== (stairPos.y | 0)) return;
      queueStair("down", stairPos.x | 0, stairPos.y | 0, entrance);
    });

    const offDepth = installedWorld.on('dungeon:teleport-depth', ({ targetDepth, source, returnTicket }) => {
      const normalizedSource = String(source || '');
      const isHomecoming = normalizedSource === 'scroll_homecoming'
        || normalizedSource === 'hearthstone'
        || normalizedSource === 'resurrection';
      queueDepth(targetDepth, {
        source: normalizedSource || 'dungeon:teleport-depth',
        returnTicket: isHomecoming ? returnTicket : null,
        homecomingLanding: isHomecoming,
      });
    });

    const offPortal = installedWorld.on('portal:return', ({ portalId }) => {
      const pid = Number(portalId) | 0;
      if (!(pid > 0)) return;
      if (world.has(pid, RiftPortal)) return;
      const ni = world.get(pid, NamedIdentity);
      if (ni?.identity !== RETURN_PORTAL_IDENTITY) return;
      const inter = world.get(pid, Interactable);
      const targetDepth = Number(inter?.params?.targetDepth);
      const targetX = Number(inter?.params?.targetX);
      const targetY = Number(inter?.params?.targetY);
      if (!Number.isFinite(targetDepth) || !Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
      try { world.destroy(pid); } catch {}
      untrackFloorEntity(pid);
      queueDepth(targetDepth, { targetPos: { x: targetX, y: targetY }, fragActorsAtTarget: true, source: 'portal:return' });
    });

    const offPit = installedWorld.on('trap:pit:fall', ({ targetId, x, y }) => {
      const pe = playerEntity();
      if (!pe || pe.id !== (Number(targetId) | 0)) return;
      let currentDepth = 1;
      for (const [, ds] of world.query(DungeonState)) { currentDepth = ds.currentDepth; break; }
      queueDepth(currentDepth + 1, { targetPos: { x: x | 0, y: y | 0 }, validateTargetPos: true });
    });

    const offRiftEnter = installedWorld.on(RiftEnterRequested, (event) => {
      const portalId = Number(event.portalId || 0) | 0;
      if (!(portalId > 0)) return;
      const portal = world.get(portalId, RiftPortal);
      if (!portal) return;
      const riftId = String(event.riftId || portal.riftId || "");
      if (!riftId || riftId !== String(portal.riftId || "")) return;
      const rec = activeRiftRecord(world);
      if (!rec?.state || String(rec.state.riftId || "") !== riftId) return;
      if (rec.state.inside) return;
      const link = riftQuestLinkForPortal(world, portalId)?.link || null;
      const portalPos = world.get(portalId, Position);
      queueDepth(1, {
        planeId: riftPlaneId(riftId),
        planeSeed: portal.seed,
        riftId,
        riftLevel: 1,
        riftEnter: true,
        stairPos: portalPos ? { x: portalPos.x | 0, y: portalPos.y | 0 } : null,
        templateId: String(link?.templateId || ""),
        source: "rift:enter",
      });
    });

    const offRiftClose = installedWorld.on(RiftCloseRequested, (event) => {
      const rec = activeRiftRecord(world);
      if (!rec?.state) return;
      const riftId = String(event.riftId || rec.state.riftId || "");
      if (riftId !== String(rec.state.riftId || "")) return;
      if (!rec.state.inside) {
        destroyActiveRift(world, {
          actor: event.actor,
          riftId,
          reason: "closed",
        });
        return;
      }
      queueDepth(rec.state.originDepth, {
        targetPos: { x: rec.state.originX | 0, y: rec.state.originY | 0 },
        fragActorsAtTarget: true,
        source: "rift:close",
        riftId,
        riftClose: true,
      });
    });

    const offTransitioned = installedWorld.on("dungeon:transitioned", () => {
      destroyReturnPortals();
    });

    return () => {
      offStair();
      offEntranceLockpick();
      offDepth();
      offPortal();
      offPit();
      offRiftEnter();
      offRiftClose();
      offTransitioned();
    };
  }, { key: TRANSITION_WIRING_EXTENSION_KEY });

  function install() {
    world.install(extension);
  }

  return {
    flush,
    install,
    queueStair,
    queueDepth,
    trackFloorEntity,
    untrackFloorEntity,
    isLocked,
    RETURN_PORTAL_IDENTITY,
  };
}
