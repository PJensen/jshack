import { children } from "../../lib/ecs-js/index.js";
import { destroySubtree } from "../../lib/ecs-js/hierarchy.js";
import { ActiveEffects } from "../components/ActiveEffects.js";
import { Charges } from "../components/Charges.js";
import { Faction } from "../components/Faction.js";
import { ItemInfo } from "../components/ItemInfo.js";
import { Lifespan } from "../components/Lifespan.js";
import { NamedIdentity } from "../components/NamedIdentity.js";
import { Owner } from "../components/Owner.js";
import { PetState } from "../components/PetState.js";
import { Position } from "../components/Position.js";
import { ProcPackageNode } from "../components/ProcPackageNode.js";
import { ScriptState } from "../components/ScriptState.js";
import { Vitality } from "../components/Vitality.js";
import { isOpaque } from "../environment/dungeon/tileMap.js";
import { registerScript, getScriptHandlers, ScriptVerb } from "../scripting.js";
import { ensureActiveEffects } from "../utils/effects.js";
import { upsertTimedEffect } from "../utils/effectSemantics.js";
import { areFactionsHostile } from "../utils/factionHostility.js";
import { chebyshevScalar } from "../utils/distance.js";
import { findNearestValidTileAround } from "../utils/queries.js";
import { leaveBreadcrumb } from "../utils/breadcrumbs.js";
import { getCatalogItem } from "./itemCatalog.js";
import { spawnMonsterEntity } from "../utils/spawnMonsterEntity.js";
import {
  addAttachedComponent,
  attachDerivedExpression,
  attachProcNode,
  exprAddConst,
  gateChance,
  gateEventKind,
  gateHasActionTag,
} from "../utils/statProcAuthoring.js";

export const PROC_PACKAGE_KEYS = Object.freeze({
  EchoStrike: "procPackage:echoStrike",
  RicochetTheology: "procPackage:ricochetTheology",
  DoomClock: "procPackage:doomClock",
  SoulMortgage: "procPackage:soulMortgage",
  CataclysmChain: "procPackage:cataclysmChain",
  BloodTithe: "procPackage:bloodTithe",
  FoolsErrand: "procPackage:foolsErrand",
  VenomClock: "procPackage:venomClock",
  HollowTide: "procPackage:hollowTide",
  DeathAscendant: "procPackage:deathAscendant",
  ThunderGod: "procPackage:thunderGod",
  BloodCovenant: "procPackage:bloodCovenant",
  PredatorMark: "procPackage:predatorMark",
  SoulAscendant: "procPackage:soulAscendant",
  EternalHunger: "procPackage:eternalHunger",
  EclipseHammer: "procPackage:eclipseHammer",
  GlacierSigil: "procPackage:glacierSigil",
  ConductionLens: "procPackage:conductionLens",
  EchoGrimoire: "procPackage:echoGrimoire",
  SerpentBoundBreeches: "procPackage:serpentBoundBreeches",
  BreadcrumbBoots: "procPackage:breadcrumbBoots",
  Dawnbreaker: "procPackage:dawnbreaker",
  SunVessel: "procPackage:sunVessel",
  PatientThunder: "procPackage:patientThunder",
});

function getEffect(world, entityId, key) {
  const activeEffects = world.get(entityId, ActiveEffects);
  if (!activeEffects || !Array.isArray(activeEffects.effects)) return null;
  return activeEffects.effects.find((entry) => entry?.key === key) || null;
}

registerScript(PROC_PACKAGE_KEYS.BreadcrumbBoots, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onStep") return;
    const source = Number(ctx?.source || 0) | 0;
    const item = Number(ctx?.item || 0) | 0;
    if (!(source > 0) || !(item > 0) || !world.isAlive?.(source) || !world.isAlive?.(item)) return;

    const state = world.get(item, ScriptState);
    if (!state) return;
    const identity = world.get(item, NamedIdentity)?.identity || '';
    const breadcrumbConfig = getCatalogItem(identity)?._contentMeta?.breadcrumb || {};
    const stepInterval = Math.max(1, Number(breadcrumbConfig.stepInterval || 4) | 0);
    const lifespanTurns = Math.max(1, Number(breadcrumbConfig.lifespanTurns || 8) | 0);
    const nextStep = (Number(state.data?.stepsTowardCrumb || 0) | 0) + 1;
    if (nextStep < stepInterval) {
      world.set(item, ScriptState, { data: { ...state.data, stepsTowardCrumb: nextStep } });
      return;
    }

    world.set(item, ScriptState, { data: { ...state.data, stepsTowardCrumb: 0 } });
    leaveBreadcrumb(world, {
      actorId: source,
      itemId: item,
      x: Number(ctx?.from?.x || 0) | 0,
      y: Number(ctx?.from?.y || 0) | 0,
      lifespanTurns,
    });

    const charges = world.get(item, Charges);
    if (charges && charges.current < charges.max) {
      world.set(item, Charges, { ...charges, current: charges.current + 1 });
    }
  },
});

registerScript(PROC_PACKAGE_KEYS.Dawnbreaker, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const kind = String(ctx?.kind || "");
    const source = Number(ctx?.source || 0) | 0;
    const item = Number(ctx?.item || 0) | 0;
    if (kind === "onTurnWhileEquipped") {
      if (!(source > 0) || !(item > 0)) return;
      const state = ctx.proc.getState();
      if (Number(state.radiance || 0) <= 0) {
        ctx.proc.light(source, 0);
        return;
      }
      const radiance = Number(state.radiance || 0);
      const ratio = radiance / Math.max(1, Number(state.maxRad || 10));
      ctx.proc.light(source, 1.0 + ratio * 3.0, {
        color: state.awakened ? "#ffe577" : "#f0c040",
        pattern: state.awakened ? "holy" : "breathe",
      });
      if (state.awakened) {
        const undead = ctx.proc.entitiesInRadius(source, 2, { tag: "undead" });
        for (let i = 0; i < undead.length; i++) {
          ctx.proc.dealDamage(undead[i], 1, "radiant", { source, cause: "procPackage:dawnbreaker" });
        }
        if (undead.length > 0) ctx.proc.present("aura_sear", { target: source });
        ctx.proc.present("aura_glow", { target: source });
      }
      if ((typeof world.rand === "function" ? world.rand() : 0) < 0.16) {
        const nextRadiance = Math.max(0, radiance - 1);
        ctx.proc.setState({ radiance: nextRadiance });
        if (state.awakened && nextRadiance < 4) {
          ctx.proc.setState({ awakened: false });
          ctx.proc.message("Dawnbreaker’s glow fades — the blade sleeps.", "system");
          ctx.proc.present("dormant", { target: source });
        }
      }
      return;
    }
    if (kind !== "onHit") return;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0) || !(item > 0)) return;

    const state = ctx.proc.getState();
    let gain = ctx.proc.hasTag(target, "undead") ? 3 : 1;
    if (ctx.damage?.crit) gain += 1;
    const newRadiance = Math.min(Number(state.maxRad || 10), Number(state.radiance || 0) + gain);
    ctx.proc.setState({ radiance: newRadiance });

    if (!state.awakened && newRadiance >= 7) {
      ctx.proc.setState({ awakened: true });
      ctx.proc.message("Dawnbreaker flares to life — the blade blazes white!");
      ctx.proc.present("awaken", { target: source });
    }

    if (state.awakened) {
      const bonus = ctx.proc.roll(4) + Math.floor(newRadiance / 3);
      ctx.proc.dealDamage(target, bonus, "radiant", {
        source,
        cause: "procPackage:dawnbreaker",
      });
      ctx.proc.present("radiant_strike", { target, bonus });
    }

    if (!state.awakened && gain >= 2) {
      ctx.proc.present("radiance_gain", { target: source, radiance: newRadiance });
    }
  },
});

registerScript(PROC_PACKAGE_KEYS.SunVessel, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onTurnWhileCarried") return;
    const source = Number(ctx?.source || 0) | 0;
    const item = Number(ctx?.item || 0) | 0;
    if (!(source > 0) || !(item > 0)) return;
    const state = ctx.proc.getState();
    const charge = Number(state.charge || 0);
    const maxCharge = Math.max(1, Number(state.maxCharge || 8));
    if (charge <= 0) {
      ctx.proc.light(source, 0);
      return;
    }

    const stability = Number(state.stability ?? 10);
    const undead = ctx.proc.entitiesInRadius(source, 4, { tag: "undead" });
    const threat = Math.min(undead.length / 3, 1.0);
    const chargeRatio = charge / maxCharge;
    const stabilityRatio = stability / 10;
    ctx.proc.light(source, state.cracked ? 2.0 + chargeRatio * 3.5 : 1.5 + chargeRatio * 2.5, {
      color: state.cracked ? "#ff9933" : threat > 0.5 ? "#f5b840" : stabilityRatio < 0.5 ? "#f0c040" : "#f6d365",
      temporal: {
        speed: 0.6 + (1 - stabilityRatio) * 1.2 + threat * 0.8,
        sway: 0.04 + threat * 0.12,
        wobble: 0.02 + (1 - stabilityRatio) * 0.10,
        jitter: state.cracked ? 0.08 + (1 - chargeRatio) * 0.06 : 0.01,
        rShift: state.cracked ? 0.06 : threat * 0.03,
        gShift: state.cracked ? -0.04 : 0,
        bShift: -threat * 0.03,
      },
    });
    if (undead.length === 0) {
      if (stability < 10) ctx.proc.setState({ stability: Math.min(10, stability + 1) });
      return;
    }

    const drain = Math.min(undead.length, 3);
    const nextStability = Math.max(0, stability - drain);
    ctx.proc.setState({ stability: nextStability });
    ctx.proc.present("pulse", { target: source, intensity: drain });
    if (nextStability <= 0 && !state.cracked) {
      ctx.proc.setState({ cracked: true });
      ctx.proc.message("The Sun-Vessel shudders — hairline fractures race across the glass.", "danger");
      ctx.proc.present("crack", { target: source });
    }
    if (state.cracked) {
      for (let i = 0; i < undead.length; i++) {
        ctx.proc.dealDamage(undead[i], ctx.proc.roll(4), "radiant", { source, cause: "procPackage:sunVessel" });
      }
      ctx.proc.setState({ charge: Math.max(0, charge - 1) });
      ctx.proc.present("leak", { target: source });
      if (charge - 1 <= 0) ctx.proc.message("The last light drains from the Sun-Vessel.", "system");
    }
  },
});

registerScript(PROC_PACKAGE_KEYS.PatientThunder, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const kind = String(ctx?.kind || "");
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0)) return;
    const state = ctx.proc.getState();
    const maxPatience = Math.max(1, Number(state.maxPatience || 3));
    if (kind === "onTurnWhileEquipped") {
      if (Number(state.patience || 0) < maxPatience) {
        ctx.proc.setState({ patience: Number(state.patience || 0) + 1 });
      }
      return;
    }
    if (kind !== "onHit") return;
    const patience = Math.max(0, Number(state.patience || 0));
    if (patience <= 0) return;
    const target = Number(ctx?.target || 0) | 0;
    ctx.proc.dealDamage(target, patience * 2, "electric", {
      source,
      cause: "procPackage:patientThunder",
      noTrigger: true,
    });
    ctx.proc.setState({ patience: 0 });
    ctx.proc.present("discharge", { target, patience });
    ctx.proc.message("Patient Thunder finally answers.", "good");
  },
});

function removeEffect(world, entityId, key) {
  const activeEffects = world.get(entityId, ActiveEffects);
  if (!activeEffects || !Array.isArray(activeEffects.effects)) return false;
  const index = activeEffects.effects.findIndex((entry) => entry?.key === key);
  if (index < 0) return false;
  activeEffects.effects.splice(index, 1);
  return true;
}

function emit(world, name, payload) {
  try {
    world.emit?.(name, payload);
  } catch {
    // package scripts should remain harmless until a real host wires them in
  }
}

function spawnSpectralSnakes(world, ownerId, count = 3, turnsLeft = 10, anchors = [], targetId = 0) {
  const origin = world.get(ownerId, Position);
  if (!origin) return 0;
  const placed = [];
  const excluded = [{ x: origin.x | 0, y: origin.y | 0 }];
  const searchOrigins = [];

  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i];
    if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) continue;
    searchOrigins.push({ x: Number(anchor.x) | 0, y: Number(anchor.y) | 0 });
  }
  searchOrigins.push({ x: origin.x | 0, y: origin.y | 0 });

  const resolvedTargetId = Number(targetId || 0) | 0;
  const targetPos = resolvedTargetId > 0 ? world.get(resolvedTargetId, Position) : null;

  for (let i = 0; i < count; i += 1) {
    let tile = null;
    for (let j = 0; j < searchOrigins.length; j += 1) {
      tile = findNearestValidTileAround(world, searchOrigins[j], { maxDistance: 8, exclude: excluded });
      if (tile) break;
    }
    if (!tile) break;
    excluded.push(tile);

    const id = spawnMonsterEntity(world, {
      identity: "spectral_snake",
      x: tile.x | 0,
      y: tile.y | 0,
      faction: "summoned",
    });
    if (!(id > 0)) continue;

    try {
      world.add(id, Owner, { ownerId });
    } catch {}
    try {
      world.add(id, PetState, {
        state: "aggressive",
        targetX: targetPos ? targetPos.x | 0 : null,
        targetY: targetPos ? targetPos.y | 0 : null,
        targetItemId: 0,
        stateEnteredTurn: world.step | 0,
        lastPlayerX: targetPos ? targetPos.x | 0 : origin.x | 0,
        lastPlayerY: targetPos ? targetPos.y | 0 : origin.y | 0,
        commandCooldown: 0,
        rangedCooldown: 0,
      });
    } catch {}
    try {
      world.add(id, Lifespan, { turnsLeft: Math.max(1, Number(turnsLeft || 10) | 0), onExpiry: "remove", expiryEvent: "" });
    } catch {}
    placed.push(id);
  }

  return placed.length;
}

function normalizedVector(from, to) {
  const dx = (Number(to?.x || 0) | 0) - (Number(from?.x || 0) | 0);
  const dy = (Number(to?.y || 0) | 0) - (Number(from?.y || 0) | 0);
  return {
    dx: Math.sign(dx),
    dy: Math.sign(dy),
  };
}

const NEAR_EPSILON = 1e-6;

function isNear(a, b, range = 1, epsilon = NEAR_EPSILON) {
  if (!a || !b) return false;
  const r = Math.max(0, Number(range || 0)) + Math.max(0, Number(epsilon || 0));
  const dx = Math.abs((Number(a.x) || 0) - (Number(b.x) || 0));
  const dy = Math.abs((Number(a.y) || 0) - (Number(b.y) || 0));
  return Math.max(dx, dy) <= r;
}

function hasTag(ctx, tag) {
  return !!ctx?.tags?.has?.(String(tag || ""));
}

function isSanctuaryIdentity(identity) {
  const id = String(identity || "").toLowerCase();
  return id === "shrine" || id === "altar" || id === "church_altar";
}

function isNearSanctuary(world, source, radius = 2) {
  const pos = world.get(source, Position);
  if (!pos) return false;
  for (const [id, at, named] of world.query(Position, NamedIdentity)) {
    if (!(id > 0) || !at || !named) continue;
    if (!isSanctuaryIdentity(named.identity)) continue;
    if (isNear(pos, at, radius)) return true;
  }
  return false;
}

function isHostileNear(world, source, origin, nearId, radius = 2) {
  if (!(nearId > 0) || nearId === source || !world.isAlive?.(nearId)) return false;
  const nearPos = world.get(nearId, Position);
  if (!nearPos) return false;
  return isNear(origin, nearPos, radius);
}

function compareRicochetTargets(a, b) {
  return a.distance - b.distance
    || b.forward - a.forward
    || a.lateral - b.lateral
    || a.pos.y - b.pos.y
    || a.pos.x - b.pos.x
    || a.id - b.id;
}

function getRicochetDirection(world, source, target) {
  const sourcePos = world.get(source, Position);
  const targetPos = world.get(target, Position);
  if (!sourcePos || !targetPos) return null;
  const dx = Math.sign((targetPos.x | 0) - (sourcePos.x | 0));
  const dy = Math.sign((targetPos.y | 0) - (sourcePos.y | 0));
  if (dx === 0 && dy === 0) return null;
  return { dx, dy };
}

function scoreRicochetCandidate(direction, origin, candidatePos) {
  if (!direction || !candidatePos) return null;
  const rx = (candidatePos.x | 0) - (origin.x | 0);
  const ry = (candidatePos.y | 0) - (origin.y | 0);
  const forward = rx * direction.dx + ry * direction.dy;
  if (forward <= 0) return null;

  const lateral = Math.abs(rx * direction.dy - ry * direction.dx);
  if (lateral > forward) return null;

  return {
    forward,
    lateral,
    distance: chebyshevScalar(candidatePos.x | 0, candidatePos.y | 0, origin.x | 0, origin.y | 0),
  };
}

registerScript(PROC_PACKAGE_KEYS.EchoStrike, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0) || !(target > 0)) return;

    if (kind === "onBeforeHit") {
      const stored = getEffect(world, source, "echo_strike_memory");
      const potency = Math.max(0, Number(stored?.potency || 0));
      if (potency > 0) {
        ctx.proc.addBonusDamage(Math.max(1, Math.floor(potency * 0.35)), undefined, "spectral");
        removeEffect(world, source, "echo_strike_memory");
        emit(world, "proc:echoStrike:release", { actor: source, target, potency });
      }
      return;
    }

    if (kind === "onHit") {
      const amount = Math.max(0, Number(ctx?.damage?.amount || 0));
      if (amount <= 0) return;
      const activeEffects = ensureActiveEffects(world, source);
      if (!activeEffects) return;
      upsertTimedEffect(activeEffects.effects, {
        key: "echo_strike_memory",
        turnsLeft: 3,
        potency: amount,
        stacks: 1,
      });
      emit(world, "proc:echoStrike:store", { actor: source, target, amount });
    }
  },
});

registerScript(PROC_PACKAGE_KEYS.RicochetTheology, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    if (!ctx?.tags?.has?.("ranged") || !ctx?.tags?.has?.("projectile")) return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const pos = world.get(target, Position);
    if (!(source > 0) || !(target > 0) || !pos) return;

    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let hasWall = !!ctx?.tags?.has?.("wallRicochet");
    for (let i = 0; i < neighbors.length && !hasWall; i++) {
      const nx = (pos.x | 0) + neighbors[i][0];
      const ny = (pos.y | 0) + neighbors[i][1];
      if (isOpaque(nx, ny)) hasWall = true;
    }
    if (!hasWall) return;

    const direction = getRicochetDirection(world, source, target);
    if (!direction) return;
    const ricochetTargets = [];
    for (const [nearId] of world.query(Position)) {
      if (!(nearId > 0) || nearId === source || nearId === target || !world.isAlive?.(nearId)) continue;
      const nearPos = world.get(nearId, Position);
      if (!nearPos) continue;
      const scoring = scoreRicochetCandidate(direction, pos, nearPos);
      if (!scoring || scoring.distance > 2) continue;
      ricochetTargets.push({
        id: nearId,
        pos: nearPos,
        distance: scoring.distance,
        forward: scoring.forward,
        lateral: scoring.lateral,
      });
    }

    ricochetTargets.sort(compareRicochetTargets);
    const bounceCount = Math.min(2, ricochetTargets.length);
    for (let i = 0; i < bounceCount; i++) {
      const rebound = ricochetTargets[i];
      ctx.proc.dealDamage(rebound.id, Math.max(1, Math.floor(Number(ctx?.damage?.amount || 0) * 0.4)), "electric", {
        source,
        cause: "procPackage:ricochetTheology",
        noTrigger: true,
        nonLethal: true,
      });
      emit(world, "projectile:spawn", {
        kind: "ricochet",
        style: "ricochet_theology",
        actor: source,
        sourceId: target,
        targetId: rebound.id,
        from: { x: pos.x | 0, y: pos.y | 0 },
        to: { x: rebound.pos.x | 0, y: rebound.pos.y | 0 },
        speed: 14,
      });
      emit(world, "proc:ricochetTheology", {
        actor: source,
        from: target,
        to: rebound.id,
        bounceIndex: i,
        bounceCount,
        fromPos: { x: pos.x | 0, y: pos.y | 0 },
        toPos: { x: rebound.pos.x | 0, y: rebound.pos.y | 0 },
      });
    }
  },
});

registerScript(PROC_PACKAGE_KEYS.DoomClock, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const activeEffects = ensureActiveEffects(world, target);
    if (!activeEffects) return;

    const existing = getEffect(world, target, "doom_clock");
    const nextStacks = Math.max(1, Number(existing?.stacks || 0) + 1);
    if (existing) {
      existing.turnsLeft = 9;
      existing.potency = nextStacks;
      existing.stacks = nextStacks;
    } else {
      activeEffects.effects.push({
        key: "doom_clock",
        turnsLeft: 9,
        potency: nextStacks,
        stacks: nextStacks,
      });
    }

    if (nextStacks >= 3) {
      removeEffect(world, target, "doom_clock");
      ctx.proc.dealDamage(target, Math.max(4, Math.floor(Number(ctx?.damage?.amount || 0) * 0.5)), "shadow", {
        source,
        cause: "procPackage:doomClock",
        noTrigger: true,
      });
      ctx.proc.applyStatus(target, "stun", 1, 1);
      ctx.proc.message("The doom clock tolls.");
      emit(world, "proc:doomClock", { actor: source, target });
      return;
    }

    emit(world, "proc:doomClock:tick", { actor: source, target, stacks: nextStacks });
  },
});

registerScript(PROC_PACKAGE_KEYS.SoulMortgage, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0)) return;
    const activeEffects = ensureActiveEffects(world, source);
    if (!activeEffects) return;
    const existing = getEffect(world, source, "soul_mortgage_debt");
    const nextDebt = Math.max(1, Number(existing?.stacks || 0) + 1);
    upsertTimedEffect(activeEffects.effects, {
      key: "soul_mortgage_debt",
      turnsLeft: 99,
      potency: nextDebt,
      stacks: nextDebt,
    });
    emit(world, "proc:soulMortgage:debt", { actor: source, target, debt: nextDebt });
  },
});

registerScript(PROC_PACKAGE_KEYS.CataclysmChain, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const kind = String(ctx?.kind || "");
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;

    if (kind === "onCritKill") {
      const pos = world.get(target, Position);
      if (!pos) return;
      ctx.proc.spawnEntity("cataclysm_hazard", 1, "target");
      ctx.proc.message("Cataclysm breaks outward.");
      emit(world, "proc:cataclysmChain:knockbackWave", { actor: source, target, at: { x: pos.x, y: pos.y } });

      const sourceFaction = world.get(source, Faction)?.key || "";
      for (const [nearId] of world.query(Position)) {
        if (!isHostileNear(world, source, pos, nearId, 2) || nearId === target) continue;
        const targetFaction = world.get(nearId, Faction)?.key || "";
        if (!areFactionsHostile(sourceFaction, targetFaction)) continue;
        ctx.proc.applyStatus(nearId, "cataclysm_mark", 4, 1);
      }
      return;
    }

    if (kind === "onBeforeHit") {
      const mark = getEffect(world, target, "cataclysm_mark");
      if (!mark) return;
      ctx.proc.addCritChance(1);
      removeEffect(world, target, "cataclysm_mark");
      emit(world, "proc:cataclysmChain:prime", { actor: source, target });
      return;
    }

    if (kind === "onHit") {
      if (!ctx?.tags?.has?.("cataclysmDetonate")) return;
      const pos = world.get(target, Position);
      if (!pos) return;
      for (const [nearId] of world.query(Position)) {
        if (!isHostileNear(world, source, pos, nearId, 1)) continue;
        ctx.proc.dealDamage(nearId, Math.max(2, Math.floor(Number(ctx?.damage?.amount || 0) * 0.3)), "void", {
          source,
          cause: "procPackage:cataclysmChain",
          noTrigger: true,
          nonLethal: nearId !== target,
        });
      }
      emit(world, "proc:cataclysmChain:detonate", { actor: source, target });
    }
  },
});

// ── Blood Tithe ───────────────────────────────────────────────────────────
// OnHit: bank 10% of dealt damage as blood_tithe_debt stacks on self (max 20).
// OnDamaged: detonate all stacks as a burst heal, then clear.
registerScript(PROC_PACKAGE_KEYS.BloodTithe, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;

    if (kind === "onHit") {
      if (!(target > 0)) return;
      const amount = Math.max(0, Number(ctx?.damage?.amount || 0));
      if (amount <= 0) return;
      const tithe = Math.max(1, Math.floor(amount * 0.1));
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const existing = getEffect(world, source, "blood_tithe_debt");
      const next = Math.min(20, Math.max(1, Number(existing?.stacks || 0) + tithe));
      upsertTimedEffect(ae.effects, {
        key: "blood_tithe_debt",
        turnsLeft: 99,
        potency: next,
        stacks: next,
      });
      emit(world, "proc:bloodTithe:bank", { actor: source, target, banked: tithe, total: next });
      return;
    }

    if (kind === "onDamaged") {
      const debt = getEffect(world, source, "blood_tithe_debt");
      const stacks = Math.max(0, Number(debt?.stacks || 0));
      if (stacks <= 0) return;
      removeEffect(world, source, "blood_tithe_debt");
      ctx.proc.heal(source, stacks);
      ctx.proc.message("Blood debt repaid.");
      emit(world, "proc:bloodTithe:burst", { actor: source, healed: stacks });
      return;
    }
  },
});

// ── Fool's Errand ─────────────────────────────────────────────────────────
// OnMiss (30% chance): apply confuse (2 turns) to both attacker AND defender.
// With luck ≥ 5 only the defender is confused.
registerScript(PROC_PACKAGE_KEYS.FoolsErrand, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onMiss") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;

    // Luck-based mercy: if source has luck >= 5, only confuse defender
    const vit = world.get(source, Vitality);
    const luckyEnough = Number(vit?.luck || 0) >= 5;

    ctx.proc.applyStatus(target, "confused", 2, 1);
    if (!luckyEnough) {
      ctx.proc.applyStatus(source, "confused", 2, 1);
    }
    ctx.proc.message(luckyEnough
      ? "Your wild miss bewilders the enemy!"
      : "Such a spectacular miss — everyone is bewildered!");
    emit(world, "proc:foolsErrand:bewildered", {
      actor: source,
      target,
      selfConfused: !luckyEnough,
    });
  },
});

// ── Venom Clock ───────────────────────────────────────────────────────────
// OnHit: stack venom_clock on the target (max 3, 6t timer). On the third hit
// the clock detonates: shadow burst, virulent poison (4t p2), and disease (3t p1).
// The timer resets if the target goes untouched for 6 turns.
registerScript(PROC_PACKAGE_KEYS.VenomClock, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const ae = ensureActiveEffects(world, target);
    if (!ae) return;

    const existing = getEffect(world, target, "venom_clock");
    const nextStacks = Math.max(1, Number(existing?.stacks || 0) + 1);
    if (existing) {
      existing.turnsLeft = 6;
      existing.stacks = nextStacks;
      existing.potency = nextStacks;
    } else {
      ae.effects.push({ key: "venom_clock", turnsLeft: 6, stacks: nextStacks, potency: nextStacks });
    }

    if (nextStacks >= 3) {
      removeEffect(world, target, "venom_clock");
      ctx.proc.dealDamage(target, Math.max(5, Math.floor(Number(ctx?.damage?.amount || 0) * 0.6)), "shadow", {
        source,
        cause: "procPackage:venomClock",
        noTrigger: true,
      });
      ctx.proc.applyStatus(target, "poison", 4, 2);
      ctx.proc.applyStatus(target, "disease", 3, 1);
      ctx.proc.message("The venom clock detonates.");
      emit(world, "proc:venomClock:detonate", { actor: source, target });
      return;
    }
    emit(world, "proc:venomClock:tick", { actor: source, target, stacks: nextStacks });
  },
});

// ── Hollow Tide ───────────────────────────────────────────────────────────
// OnBeforeHit: bonus damage scales with how low the wielder's HP is.
// Below 75% HP: +1. Below 50%: +3. Below 25%: +6 and weakens the target.
// The closer to death, the more dangerous.
registerScript(PROC_PACKAGE_KEYS.HollowTide, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onBeforeHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const vit = world.get(source, Vitality);
    if (!vit || !(Number(vit.maxHp) > 0)) return;
    const hpPct = Number(vit.hp) / Number(vit.maxHp);
    if (hpPct < 0.25) {
      ctx.proc.addBonusDamage(6, 6, "physical");
      ctx.proc.applyStatus(target, "weaken", 3, 1);
      emit(world, "proc:hollowTide:surge", { actor: source, target, tier: 3 });
    } else if (hpPct < 0.50) {
      ctx.proc.addBonusDamage(3, 3, "physical");
      emit(world, "proc:hollowTide:surge", { actor: source, target, tier: 2 });
    } else if (hpPct < 0.75) {
      ctx.proc.addBonusDamage(1, 1, "physical");
      emit(world, "proc:hollowTide:surge", { actor: source, target, tier: 1 });
    }
  },
});

// ── Death Ascendant ───────────────────────────────────────────────────────
// OnKill: immediately grant the wielder invulnerability (2t), berserk rage (4t),
// and a burst of 10 stamina. Killing fuels the ascent.
registerScript(PROC_PACKAGE_KEYS.DeathAscendant, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onKill") return;
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0)) return;
    ctx.proc.applyStatus(source, "invuln", 2, 1);
    ctx.proc.applyStatus(source, "berserk", 4, 1);
    ctx.proc.restoreResource(source, "stamina", 10);
    ctx.proc.message("Death feeds the ascent.");
    emit(world, "proc:deathAscendant:surge", { actor: source, target: ctx?.target });
  },
});

// ── Thunder God ───────────────────────────────────────────────────────────
// OnHit (crit only): arc 3 electric damage to every hostile in radius 2 of the
// target and apply shock (2t) to each. The gods answer the critical blow.
registerScript(PROC_PACKAGE_KEYS.ThunderGod, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    if (!ctx?.damage?.crit) return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const pos = world.get(target, Position);
    if (!pos) return;
    const srcFac = world.get(source, Faction)?.key || "";
    let struck = 0;
    for (const [nearId] of world.query(Position)) {
      if (!isHostileNear(world, source, pos, nearId, 2)) continue;
      const nearFac = world.get(nearId, Faction)?.key || "";
      if (!areFactionsHostile(srcFac, nearFac)) continue;
      ctx.proc.dealDamage(nearId, 3, "electric", {
        source,
        cause: "procPackage:thunderGod",
        noTrigger: true,
        nonLethal: nearId !== target,
      });
      ctx.proc.applyStatus(nearId, "shock", 2, 1);
      struck++;
    }
    if (struck > 0) {
      ctx.proc.message("Thunder answers the blow.");
      emit(world, "proc:thunderGod:strike", { actor: source, target, struck });
    }
  },
});

// ── Blood Covenant ────────────────────────────────────────────────────────
// OnBeforeHit: spend 8% max HP (minimum 1, never fatal) to add +5 fire bonus
// damage to the swing. The blade drinks from you first.
registerScript(PROC_PACKAGE_KEYS.BloodCovenant, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onBeforeHit") return;
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0)) return;
    const vit = world.get(source, Vitality);
    if (!vit || !(Number(vit.maxHp) > 0)) return;
    const cost = Math.max(1, Math.floor(Number(vit.maxHp) * 0.08));
    if (Number(vit.hp) - cost < 2) return; // refuse if it would drop us to 1 HP
    ctx.proc.dealDamage(source, cost, "physical", {
      source,
      cause: "procPackage:bloodCovenant:tithe",
      noTrigger: true,
      nonLethal: true,
    });
    ctx.proc.addBonusDamage(5, 5, "fire");
    emit(world, "proc:bloodCovenant:tithe", { actor: source, cost });
  },
});

// ── Predator Mark ─────────────────────────────────────────────────────────
// OnHit: accumulate hunt_mark stacks on the target (max 5, timer 4t). Each
// stack grants +1 bonus damage on every subsequent hit against that target.
// The longer the hunt, the deadlier each strike.
registerScript(PROC_PACKAGE_KEYS.PredatorMark, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const ae = ensureActiveEffects(world, target);
    if (!ae) return;

    const existing = getEffect(world, target, "hunt_mark");
    const nextStacks = Math.min(5, Math.max(1, Number(existing?.stacks || 0) + 1));
    if (existing) {
      existing.turnsLeft = 4;
      existing.potency = nextStacks;
      existing.stacks = nextStacks;
    } else {
      ae.effects.push({ key: "hunt_mark", turnsLeft: 4, potency: nextStacks, stacks: nextStacks });
    }

    if (nextStacks > 1) {
      ctx.proc.addBonusDamage(nextStacks - 1);
    }
    emit(world, "proc:predatorMark:stack", { actor: source, target, stacks: nextStacks });
  },
});

// ── Soul Ascendant ────────────────────────────────────────────────────────
// OnKill: burst-heal 8 HP, apply regen (4t, p2), and stoneskin (3t, p2).
// Each soul consumed leaves the wielder fuller and harder.
registerScript(PROC_PACKAGE_KEYS.SoulAscendant, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onKill") return;
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0)) return;
    ctx.proc.heal(source, 8);
    ctx.proc.applyStatus(source, "regen", 4, 2);
    ctx.proc.applyStatus(source, "stoneskin", 3, 2);
    ctx.proc.message("The soul mends the wielder.");
    emit(world, "proc:soulAscendant:harvest", { actor: source, target: ctx?.target });
  },
});

// ── Eternal Hunger ────────────────────────────────────────────────────────
// OnKill: push eternal_hunger stacks (max 10, 12t). Stacks decay 1/turn
// naturally via the effect timer. OnBeforeHit: spend stacks as flat bonus
// damage (floor(stacks/2)). The hunger can never be sated.
registerScript(PROC_PACKAGE_KEYS.EternalHunger, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const kind = String(ctx?.kind || "");
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0)) return;

    if (kind === "onKill") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const existing = getEffect(world, source, "eternal_hunger");
      const nextStacks = Math.min(10, Math.max(1, Number(existing?.stacks || 0) + 1));
      if (existing) {
        existing.turnsLeft = 12;
        existing.stacks = nextStacks;
        existing.potency = nextStacks;
      } else {
        ae.effects.push({ key: "eternal_hunger", turnsLeft: 12, stacks: nextStacks, potency: nextStacks });
      }
      ctx.proc.message("The hunger grows.");
      emit(world, "proc:eternalHunger:feed", { actor: source, target: ctx?.target, stacks: nextStacks });
      return;
    }

    if (kind === "onBeforeHit") {
      const stacks = Math.max(0, Number(getEffect(world, source, "eternal_hunger")?.stacks || 0));
      if (stacks > 0) {
        ctx.proc.addBonusDamage(Math.floor(stacks / 2));
      }
    }
  },
});

// ── Eclipse Hammer ────────────────────────────────────────────────────────
// OnHit: alternates between Sun phase (fire AoE + burning to adjacent foes)
// and Moon phase (cold AoE + frost to adjacent foes). Light and dark answer in turn.
registerScript(PROC_PACKAGE_KEYS.EclipseHammer, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const ae = ensureActiveEffects(world, source);
    if (!ae) return;
    const pos = world.get(target, Position);
    if (!pos) return;

    const phase = getEffect(world, source, "eclipse_phase");
    const isSun = !phase || Number(phase?.stacks || 0) === 0;
    const srcFac = world.get(source, Faction)?.key || "";

    for (const [nearId] of world.query(Position)) {
      if (!isHostileNear(world, source, pos, nearId, 1)) continue;
      const nearFac = world.get(nearId, Faction)?.key || "";
      if (!areFactionsHostile(srcFac, nearFac)) continue;
      if (isSun) {
        ctx.proc.dealDamage(nearId, 2, "fire", {
          source, cause: "procPackage:eclipseHammer", noTrigger: true, nonLethal: nearId !== target,
        });
        ctx.proc.applyStatus(nearId, "burning", 2, 1);
      } else {
        ctx.proc.dealDamage(nearId, 2, "cold", {
          source, cause: "procPackage:eclipseHammer", noTrigger: true, nonLethal: nearId !== target,
        });
        ctx.proc.applyStatus(nearId, "frost", 2, 1);
      }
    }

    emit(world, isSun ? "proc:eclipseHammer:sun" : "proc:eclipseHammer:moon", { actor: source, target });
    upsertTimedEffect(ae.effects, {
      key: "eclipse_phase",
      turnsLeft: 99,
      stacks: isSun ? 1 : 0,
      potency: 1,
    });
  },
});

// Spell-proc gear hooks are evaluated in the spell pipeline itself.
// These registrations keep package script references valid for topology tools.
registerScript(PROC_PACKAGE_KEYS.GlacierSigil, {
  [ScriptVerb.ProcEvaluate]: () => {},
});

registerScript(PROC_PACKAGE_KEYS.ConductionLens, {
  [ScriptVerb.ProcEvaluate]: () => {},
});

registerScript(PROC_PACKAGE_KEYS.EchoGrimoire, {
  [ScriptVerb.ProcEvaluate]: () => {},
});

registerScript("procPackage:arrowInstinct", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const kind = String(ctx?.kind || "");
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0)) return;
    if (kind === "onDamaged") {
      if (!hasTag(ctx, "ranged") && !hasTag(ctx, "projectile")) return;
      if (getEffect(world, source, "arrow_instinct")) return;
      if (world.rand() >= 0.5) return;
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      ae.effects.push({ key: "arrow_instinct", turnsLeft: 20, stacks: 1, potency: 1 });
      emit(world, "proc:arrowInstinct:gain", { actor: source });
      return;
    }
    if (kind === "onBeforeHit" && getEffect(world, source, "arrow_instinct")) {
      ctx.proc.addCritChance(0.08);
      ctx.proc.addBonusDamage(1, 2, "pierce");
    }
  },
});

registerScript("procPackage:shrineBreaker", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onBeforeHit") return;
    const source = Number(ctx?.source || 0) | 0;
    if (!(source > 0) || !isNearSanctuary(world, source, 2)) return;
    ctx.proc.addBonusDamage(1, 1, "physical");
    ctx.proc.addCritChance(0.03);
    emit(world, "proc:shrineBreaker", { actor: source });
  },
});

registerScript("procPackage:tollwarden", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0) || !(target > 0)) return;
    if (kind === "onBeforeHit") {
      const toll = getEffect(world, target, "tollwarden_count");
      if (Number(toll?.stacks || 0) >= 2) ctx.proc.addCritChance(0.05);
      return;
    }
    if (kind !== "onHit") return;
    const ae = ensureActiveEffects(world, target);
    if (!ae) return;
    const existing = getEffect(world, target, "tollwarden_count");
    const stacks = Math.min(3, Math.max(1, Number(existing?.stacks || 0) + 1));
    upsertTimedEffect(ae.effects, { key: "tollwarden_count", turnsLeft: 10, stacks, potency: stacks });
    if (stacks < 3) return;
    removeEffect(world, target, "tollwarden_count");
    ctx.proc.dealDamage(target, 4, "shadow", { source, cause: "procPackage:tollwarden", noTrigger: true });
    ctx.proc.applyStatus(target, "stun", 1, 1);
    emit(world, "proc:tollwarden:detonate", { actor: source, target });
  },
});

registerScript("procPackage:kineticBattery", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onDamaged") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(5, Math.max(1, Number(getEffect(world, source, "kinetic_battery")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "kinetic_battery", turnsLeft: 12, stacks: next, potency: next });
      return;
    }
    if (kind !== "onBeforeHit") return;
    const battery = getEffect(world, source, "kinetic_battery");
    const spend = Math.min(2, Math.max(0, Number(battery?.stacks || 0)));
    if (spend <= 0) return;
    battery.stacks -= spend;
    battery.potency = battery.stacks;
    if (battery.stacks <= 0) removeEffect(world, source, "kinetic_battery");
    ctx.proc.addBonusDamage(spend * 2, spend * 2, "electric");
    ctx.proc.restoreResource(source, "mana", spend);
  },
});

registerScript("procPackage:venomLedger", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onHit") {
      if (!(target > 0)) return;
      if (world.rand() < 0.3) ctx.proc.applyStatus(target, "poison", 3, 1);
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(4, Math.max(1, Number(getEffect(world, source, "venom_ledger")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "venom_ledger", turnsLeft: 10, stacks: next, potency: next });
      return;
    }
    if (kind !== "onKill") return;
    const stacks = Math.max(0, Number(getEffect(world, source, "venom_ledger")?.stacks || 0));
    if (stacks <= 0) return;
    ctx.proc.heal(source, stacks);
    removeEffect(world, source, "venom_ledger");
  },
});

registerScript("procPackage:hungerSurge", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onKill") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(8, Math.max(1, Number(getEffect(world, source, "hunger_surge")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "hunger_surge", turnsLeft: 16, stacks: next, potency: next });
      return;
    }
    if (kind !== "onBeforeHit") return;
    const hunger = getEffect(world, source, "hunger_surge");
    const stacks = Math.max(0, Number(hunger?.stacks || 0));
    if (stacks <= 0) return;
    ctx.proc.addBonusDamage(Math.floor(stacks / 2));
    hunger.stacks = Math.max(0, stacks - 1);
    hunger.potency = hunger.stacks;
    if (hunger.stacks <= 0) removeEffect(world, source, "hunger_surge");
  },
});

registerScript("procPackage:ritualOverdraw", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onBeforeHit") {
      const vit = world.get(source, Vitality);
      if (!vit || Number(vit.hp || 0) <= 3) return;
      ctx.proc.dealDamage(source, 2, "physical", { source, cause: "procPackage:ritualOverdraw", nonLethal: true, noTrigger: true });
      ctx.proc.addBonusDamage(4, 4, "fire");
      ctx.proc.restoreResource(source, "mana", 2);
      return;
    }
    if (kind === "onKill") ctx.proc.heal(source, 2);
  },
});

registerScript("procPackage:executionRipple", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0) || !(target > 0)) return;
    if (kind === "onCritKill") {
      const pos = world.get(target, Position);
      if (!pos) return;
      const srcFaction = world.get(source, Faction)?.key || "";
      for (const [nearId] of world.query(Position)) {
        if (!isHostileNear(world, source, pos, nearId, 2) || nearId === target) continue;
        const nearFaction = world.get(nearId, Faction)?.key || "";
        if (!areFactionsHostile(srcFaction, nearFaction)) continue;
        ctx.proc.applyStatus(nearId, "cataclysm_mark", 4, 1);
      }
      return;
    }
    if (kind === "onBeforeHit") {
      if (!getEffect(world, target, "cataclysm_mark")) return;
      ctx.proc.addCritChance(0.12);
      ctx.proc.addBonusDamage(2, 2, "void");
      removeEffect(world, target, "cataclysm_mark");
    }
  },
});

registerScript("procPackage:wardedRetort", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onDamaged") {
      if ((target > 0) && world.rand() < 0.35) ctx.proc.applyStatus(target, "weaken", 2, 1);
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      upsertTimedEffect(ae.effects, { key: "warded_retort", turnsLeft: 3, stacks: 1, potency: 1 });
      return;
    }
    if (kind !== "onBeforeHit" || !getEffect(world, source, "warded_retort")) return;
    ctx.proc.addBonusDamage(2, 2, "acid");
    removeEffect(world, source, "warded_retort");
  },
});

registerScript("procPackage:bloodsport", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onHit") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(5, Math.max(1, Number(getEffect(world, source, "bloodsport_combo")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "bloodsport_combo", turnsLeft: 8, stacks: next, potency: next });
      return;
    }
    const stacks = Math.max(0, Number(getEffect(world, source, "bloodsport_combo")?.stacks || 0));
    if (stacks <= 0) return;
    if (kind === "onBeforeHit") ctx.proc.addBonusDamage(Math.floor(stacks / 2));
    if (kind === "onDamaged") ctx.proc.heal(source, Math.max(1, Math.floor(stacks / 2)));
  },
});

registerScript("procPackage:shadowParry", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onMiss") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      upsertTimedEffect(ae.effects, { key: "shadow_parry", turnsLeft: 1, stacks: 1, potency: 1 });
      return;
    }
    if (kind !== "onDamaged" || !(target > 0) || !getEffect(world, source, "shadow_parry")) return;
    ctx.proc.dealDamage(target, 2, "shadow", { source, cause: "procPackage:shadowParry", noTrigger: true, nonLethal: true });
    removeEffect(world, source, "shadow_parry");
  },
});

registerScript("procPackage:moonfireCycle", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    if (String(ctx?.kind || "") !== "onHit") return;
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    if (!(source > 0) || !(target > 0)) return;
    const ae = ensureActiveEffects(world, source);
    if (!ae) return;
    const phase = getEffect(world, source, "moonfire_phase");
    const sun = !phase || Number(phase.stacks || 0) === 0;
    upsertTimedEffect(ae.effects, { key: "moonfire_phase", turnsLeft: 99, stacks: sun ? 1 : 0, potency: 1 });
    if (sun) {
      ctx.proc.dealDamage(target, 2, "fire", { source, cause: "procPackage:moonfireCycle", noTrigger: true, nonLethal: true });
      ctx.proc.applyStatus(target, "burning", 2, 1);
      return;
    }
    ctx.proc.dealDamage(target, 2, "cold", { source, cause: "procPackage:moonfireCycle", noTrigger: true, nonLethal: true });
    ctx.proc.applyStatus(target, "frost", 2, 1);
  },
});

registerScript("procPackage:killTempo", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onKill") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(3, Math.max(1, Number(getEffect(world, source, "kill_tempo")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "kill_tempo", turnsLeft: 6, stacks: next, potency: next });
      ctx.proc.restoreResource(source, "stamina", 5);
      return;
    }
    if (kind !== "onBeforeHit") return;
    const stacks = Math.max(0, Number(getEffect(world, source, "kill_tempo")?.stacks || 0));
    if (stacks <= 0) return;
    ctx.proc.addCritChance(stacks * 0.04);
    ctx.proc.addBonusDamage(stacks, stacks, "physical");
  },
});

registerScript("procPackage:missMomentum", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onMiss") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(3, Math.max(1, Number(getEffect(world, source, "miss_momentum")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "miss_momentum", turnsLeft: 5, stacks: next, potency: next });
      return;
    }
    if (kind !== "onBeforeHit") return;
    const stacks = Math.max(0, Number(getEffect(world, source, "miss_momentum")?.stacks || 0));
    if (stacks <= 0) return;
    ctx.proc.addBonusDamage(stacks * 2, stacks * 2, "physical");
    ctx.proc.addCritChance(stacks * 0.03);
    removeEffect(world, source, "miss_momentum");
  },
});

registerScript("procPackage:debtHarvest", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onHit") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(10, Math.max(1, Number(getEffect(world, source, "debt_harvest")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "debt_harvest", turnsLeft: 99, stacks: next, potency: next });
      return;
    }
    const stacks = Math.max(0, Number(getEffect(world, source, "debt_harvest")?.stacks || 0));
    if (kind === "onDamaged" && stacks >= 5) {
      ctx.proc.restoreResource(source, "stamina", 4);
      ctx.proc.restoreResource(source, "mana", 4);
      const debt = getEffect(world, source, "debt_harvest");
      debt.stacks = Math.max(0, stacks - 3);
      debt.potency = debt.stacks;
      if (debt.stacks <= 0) removeEffect(world, source, "debt_harvest");
      return;
    }
    if (kind === "onKill" && stacks > 0) {
      ctx.proc.heal(source, Math.min(8, stacks));
      removeEffect(world, source, "debt_harvest");
    }
  },
});

registerScript("procPackage:cataclysmGuard", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onDamaged") {
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      upsertTimedEffect(ae.effects, { key: "cataclysm_guard", turnsLeft: 4, stacks: 1, potency: 1 });
      return;
    }
    if (kind === "onBeforeHit" && getEffect(world, source, "cataclysm_guard")) {
      ctx.proc.addBonusDamage(3, 3, "void");
      removeEffect(world, source, "cataclysm_guard");
      return;
    }
    if (kind === "onKill" && getEffect(world, source, "cataclysm_guard")) {
      ctx.proc.applyStatus(source, "invuln", 1, 1);
    }
  },
});

registerScript("procPackage:omenDrive", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0)) return;
    if (kind === "onDamaged") {
      if (!hasTag(ctx, "ranged") && !hasTag(ctx, "projectile")) return;
      const ae = ensureActiveEffects(world, source);
      if (!ae) return;
      const next = Math.min(4, Math.max(1, Number(getEffect(world, source, "omen_drive")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "omen_drive", turnsLeft: 12, stacks: next, potency: next });
      return;
    }
    if (kind !== "onBeforeHit") return;
    const omen = getEffect(world, source, "omen_drive");
    const stacks = Math.max(0, Number(omen?.stacks || 0));
    if (stacks <= 0) return;
    ctx.proc.addBonusDamage(stacks * 2, stacks * 2, "shadow");
    if ((target > 0) && stacks >= 2) ctx.proc.applyStatus(target, "blind", 1, 1);
    removeEffect(world, source, "omen_drive");
  },
});

registerScript("procPackage:packHunter", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const target = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0) || !(target > 0)) return;
    if (kind === "onHit") {
      const ae = ensureActiveEffects(world, target);
      if (!ae) return;
      const next = Math.min(4, Math.max(1, Number(getEffect(world, target, "pack_hunter_mark")?.stacks || 0) + 1));
      upsertTimedEffect(ae.effects, { key: "pack_hunter_mark", turnsLeft: 6, stacks: next, potency: next });
      return;
    }
    if (kind !== "onBeforeHit") return;
    const marked = getEffect(world, target, "pack_hunter_mark");
    const stacks = Math.max(0, Number(marked?.stacks || 0));
    if (stacks <= 0) return;
    ctx.proc.addBonusDamage(stacks, stacks, "pierce");
    ctx.proc.addCritChance(stacks * 0.02);
  },
});

registerScript("procPackage:graveCurrent", {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const source = Number(ctx?.source || 0) | 0;
    const item = Number(ctx?.item || 0) | 0;
    const kind = String(ctx?.kind || "");
    if (!(source > 0) || !(item > 0) || kind !== "onKill") return;
    const info = world.get(item, ItemInfo);
    if (!info) return;
    const maxCharges = Math.max(0, Number(info.maxCharges || 0));
    const current = Math.max(0, Number(info.charges || 0));
    if (!(maxCharges > 0) || current >= maxCharges) return;
    info.charges = Math.min(maxCharges, current + 1);
    emit(world, "proc:graveCurrent:charge", { actor: source, item, charges: info.charges, maxCharges });
  },
});

registerScript(PROC_PACKAGE_KEYS.SerpentBoundBreeches, {
  [ScriptVerb.ProcEvaluate]: (world, ctx) => {
    const wearer = Number(ctx?.source || 0) | 0;
    const other = Number(ctx?.target || 0) | 0;
    const kind = String(ctx?.kind || '');

    if (!(wearer > 0)) return;

    if (kind === 'onHit') {
      if (world.rand() >= 0.28) return;

      const ae = ensureActiveEffects(world, wearer);
      if (!ae) return;

      upsertTimedEffect(ae.effects, { key: 'serpent_hide', turnsLeft: 8, stacks: 1, potency: 1 });

      emit(world, 'proc:serpentBound:coat', { actor: wearer, turns: 8 });
      return;
    }

    if (kind === 'onMiss') {
      if (!(hasTag(ctx, 'dodged') || hasTag(ctx, 'parried'))) return;

      const ae = ensureActiveEffects(world, wearer);
      if (!ae) return;

      upsertTimedEffect(ae.effects, { key: 'serpent_riposte', turnsLeft: 4, stacks: 1, potency: 1 });
      emit(world, 'proc:serpentBound:riposteReady', { actor: wearer, turns: 4 });
      return;
    }

    if (kind === 'onBeforeHit') {
      if (!getEffect(world, wearer, 'serpent_riposte')) return;

      ctx.proc.addBonusDamage(3, 5, 'nature');
      if (other > 0 && world.rand() < 0.35) {
        ctx.proc.applyStatus(other, 'slowed', 4, 1);
      }

      removeEffect(world, wearer, 'serpent_riposte');
      emit(world, 'proc:serpentBound:riposteSpent', { actor: wearer, target: other });
      return;
    }

    if (kind === 'onDamaged') {
      const attacker = other;
      if (!(attacker > 0)) return;

      if (getEffect(world, wearer, 'serpent_hide') && world.rand() < 0.5) {
        ctx.proc.dealDamage(attacker, 2, 'nature', {
          source: wearer,
          cause: 'procPackage:serpentBoundBreeches',
          noTrigger: true,
          nonLethal: true,
        });
      }
    }
  },
});

// ── Loðbrók's Serpent-Bound Breeches: ability event → spawn ─────────
// Listen for ability activation and spawn snakes directly (not via proc)
const _lodbrokSpawnInstalled = Symbol.for('jshack:proc:lodbrok:spawn:installed');

export function installLodbrokSpawnWiring(world) {
  if (/** @type {any} */ (world)[_lodbrokSpawnInstalled]) return;
  /** @type {any} */ (world)[_lodbrokSpawnInstalled] = true;

  world.on?.('lodbrok:laugh_at_pit', ({ actor, serpentCount, serpentTurns }) => {
    const actorId = Number(actor || 0) | 0;
    if (!(actorId > 0)) return;

    const spawned = spawnSpectralSnakes(
      world,
      actorId,
      Math.max(1, Number(serpentCount || 3) | 0),
      Math.max(1, Number(serpentTurns || 10) | 0),
      [],
    );
    if (spawned > 0) {
      const actorPos = world.get(actorId, Position);
      if (actorPos) {
        emit(world, 'proc:serpentBound:spectralSnakes', {
          actor: actorId,
          target: 0,
          turns: Math.max(1, Number(serpentTurns || 10) | 0),
          spawned,
          from: { x: actorPos.x | 0, y: actorPos.y | 0 },
          to: { x: actorPos.x | 0, y: actorPos.y | 0 },
          direction: { dx: 0, dy: 0 },
        });
      }
    }
  });
}

const PROC_PACKAGE_SPECS = Object.freeze([
  Object.freeze({
    id: "sunVessel",
    name: "Sun-Vessel",
    summary: "A carried reliquary whose radiance responds to nearby undead and eventually cracks under pressure.",
    stateKeys: Object.freeze(["charge", "maxCharge", "stability", "cracked"]),
    hostIdeas: Object.freeze(["holy vessels", "volatile reliquaries", "undead detectors"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onTurnWhileCarried", script: PROC_PACKAGE_KEYS.SunVessel, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "dawnbreaker",
    name: "Dawnbreaker",
    summary: "Stores radiance through combat, awakens at seven charges, and adds radiant force to awakened strikes.",
    stateKeys: Object.freeze(["radiance", "maxRad", "awakened", "killStreak"]),
    hostIdeas: Object.freeze(["sun blades", "holy weapons", "radiant relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.Dawnbreaker, priority: 10 }),
      Object.freeze({ trigger: "onTurnWhileEquipped", script: PROC_PACKAGE_KEYS.Dawnbreaker, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "patientThunder",
    name: "Patient Thunder",
    summary: "A patient storm weapon that gathers charge while equipped and discharges it on a later hit.",
    stateKeys: Object.freeze(["patience", "maxPatience"]),
    hostIdeas: Object.freeze(["storm weapons", "waiting rods", "thunder relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onTurnWhileEquipped", script: PROC_PACKAGE_KEYS.PatientThunder, priority: 10 }),
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.PatientThunder, priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "breadcrumbBoots",
    name: "Breadcrumb Boots",
    summary: "Leaves an investigating trail every fourth genuine step and stores a Scatter charge.",
    stateKeys: Object.freeze(["stepsTowardCrumb"]),
    hostIdeas: Object.freeze(["trail boots", "investigation lures", "decoy gear"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onStep", script: PROC_PACKAGE_KEYS.BreadcrumbBoots, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "echoStrike",
    name: "Echo Strike",
    summary: "Stores the last landed hit and replays part of it as spectral force on the next swing.",
    stateKeys: Object.freeze(["echo_strike_memory"]),
    hostIdeas: Object.freeze(["duelist blades", "memory gems", "echoing relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onBeforeHit", script: PROC_PACKAGE_KEYS.EchoStrike, priority: 10 }),
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.EchoStrike, priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "ricochetTheology",
    name: "Ricochet Theology",
    summary: "Wall-adjacent hits refract into a nearby hostile as arcane backlash.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["sanctified bucklers", "mirror bows", "cathedral hammers"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({
        trigger: "onHit",
        script: PROC_PACKAGE_KEYS.RicochetTheology,
        priority: 10,
        gates: Object.freeze([gateHasActionTag("ranged"), gateHasActionTag("projectile")]),
      }),
    ]),
  }),
  Object.freeze({
    id: "doomClock",
    name: "Doom Clock",
    summary: "Repeated hits build a visible countdown that detonates into shadow punishment on the third toll.",
    stateKeys: Object.freeze(["doom_clock"]),
    hostIdeas: Object.freeze(["cursed rings", "oracular pendants", "judgment blades"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.DoomClock, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "soulMortgage",
    name: "Soul Mortgage",
    summary: "Front-loads obscene crit power and quietly accrues soul debt for later divine reckoning.",
    stateKeys: Object.freeze(["soul_mortgage_debt"]),
    deferredHooks: Object.freeze(["onDeath", "onShrineInteract"]),
    hostIdeas: Object.freeze(["cursed early weapons", "warlock heirlooms", "shrine bargains"]),
    passiveExpressions: Object.freeze([
      Object.freeze(exprAddConst("critChance", 0.12, { stage: "derived", priority: 10 })),
      Object.freeze(exprAddConst("critMultiplier", 0.75, { stage: "derived", priority: 10 })),
      Object.freeze(exprAddConst("baseDamageMin", 2, { stage: "base", priority: 10 })),
      Object.freeze(exprAddConst("baseDamageMax", 4, { stage: "base", priority: 10 })),
    ]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.SoulMortgage, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "cataclysmChain",
    name: "Cataclysm Chain",
    summary: "Crit kills fork into local combat weather: hazard, wave, marks, and detonation follow-through.",
    stateKeys: Object.freeze(["cataclysm_mark"]),
    hostIdeas: Object.freeze(["apocalypse relics", "boss artifacts", "doomsday gems"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onCritKill", script: PROC_PACKAGE_KEYS.CataclysmChain, priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: PROC_PACKAGE_KEYS.CataclysmChain, priority: 20 }),
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.CataclysmChain, priority: 30 }),
    ]),
  }),
  Object.freeze({
    id: "bloodTithe",
    name: "Blood Tithe",
    summary: "Banks a fraction of every wound you deal; when you take a hit the debt is repaid as healing.",
    stateKeys: Object.freeze(["blood_tithe_debt"]),
    hostIdeas: Object.freeze(["sanguine rings", "leech blades", "blood-pact talismans"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.BloodTithe, priority: 10 }),
      Object.freeze({ trigger: "onDamaged", script: PROC_PACKAGE_KEYS.BloodTithe, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "foolsErrand",
    name: "Fool's Errand",
    summary: "Whiffed attacks have a chance to confuse everyone involved — you included.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["jester bells", "chaos wands", "drunken-master wraps"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({
        trigger: "onMiss",
        script: PROC_PACKAGE_KEYS.FoolsErrand,
        priority: 10,
        gates: Object.freeze([gateChance(0.3)]),
      }),
    ]),
  }),
  Object.freeze({
    id: "venomClock",
    name: "Venom Clock",
    summary: "Three consecutive hits on a target detonate a burst of shadow damage, virulent poison, and disease. The clock resets if the target goes untouched for 6 turns.",
    stateKeys: Object.freeze(["venom_clock"]),
    hostIdeas: Object.freeze(["plague daggers", "assassin relics", "corrupted fangs"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.VenomClock, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "hollowTide",
    name: "Hollow Tide",
    summary: "Bonus damage scales inversely with the wielder's remaining HP. Below 75% HP: +1. Below 50%: +3. Below 25%: +6 and weakens the target. The closer to death, the more dangerous.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["berserker blades", "death-wish hammers", "last-stand relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onBeforeHit", script: PROC_PACKAGE_KEYS.HollowTide, priority: 5 }),
    ]),
  }),
  Object.freeze({
    id: "deathAscendant",
    name: "Death Ascendant",
    summary: "Each kill grants invulnerability (2t), berserk rage (4t), and 10 stamina. Killing fuels the ascent.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["death-knight swords", "executioner blades", "slaughter relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onKill", script: PROC_PACKAGE_KEYS.DeathAscendant, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "thunderGod",
    name: "Thunder God",
    summary: "Critical hits arc 3 electric damage + shock to every hostile within radius 2 of the target. The gods answer the critical blow.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["storm hammers", "lightning spears", "thunder relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.ThunderGod, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "bloodCovenant",
    name: "Blood Covenant",
    summary: "Each attack spends 8% max HP to add +5 fire bonus damage. The blade drinks from you first.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["blood-pact swords", "sacrifice daggers", "covenant blades"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onBeforeHit", script: PROC_PACKAGE_KEYS.BloodCovenant, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "predatorMark",
    name: "Predator Mark",
    summary: "Each consecutive hit stacks hunt_mark on the target (max 5, 4t). Stacks add flat bonus damage. The longer the hunt, the deadlier each strike.",
    stateKeys: Object.freeze(["hunt_mark"]),
    hostIdeas: Object.freeze(["hunter daggers", "stalker blades", "predator rings"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.PredatorMark, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "soulAscendant",
    name: "Soul Ascendant",
    summary: "Each kill heals 8 HP, applies regen (4t p2), and stoneskin (3t p2). Each soul consumed leaves the wielder fuller and harder.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["soul-drinking scythes", "harvest staves", "reaper relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onKill", script: PROC_PACKAGE_KEYS.SoulAscendant, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "eternalHunger",
    name: "Eternal Hunger",
    summary: "Kills stack eternal_hunger (max 10, 12t decay). Stacks convert to flat bonus damage on each hit (floor(stacks/2)). The hunger can never be sated.",
    stateKeys: Object.freeze(["eternal_hunger"]),
    hostIdeas: Object.freeze(["hunger blades", "insatiable axes", "void-touched cleavers"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onKill", script: PROC_PACKAGE_KEYS.EternalHunger, priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: PROC_PACKAGE_KEYS.EternalHunger, priority: 5 }),
    ]),
  }),
  Object.freeze({
    id: "eclipseHammer",
    name: "Eclipse Hammer",
    summary: "Alternates between Sun phase (fire AoE + burning) and Moon phase (cold AoE + frost) on every hit. Light and dark answer in turn.",
    stateKeys: Object.freeze(["eclipse_phase"]),
    hostIdeas: Object.freeze(["eclipse mauls", "celestial hammers", "dual-aspected relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.EclipseHammer, priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "arrowInstinct",
    name: "Arrow Instinct",
    summary: "When struck by a projectile, 50% chance to gain a 20-turn dexterity-like combat focus (non-stacking).",
    stateKeys: Object.freeze(["arrow_instinct"]),
    hostIdeas: Object.freeze(["hunter bows", "ranger cowls"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onDamaged", script: "procPackage:arrowInstinct", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:arrowInstinct", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "shrineBreaker",
    name: "Shrine Breaker",
    summary: "While fighting near shrines or altars, gain a small strength-like strike bonus.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["sacred hunt gear", "pilgrim relics"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:shrineBreaker", priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "tollwarden",
    name: "Tollwarden",
    summary: "Hits ring up a 3-count meter on the target, then discharge with shadow damage and stun.",
    stateKeys: Object.freeze(["tollwarden_count"]),
    hostIdeas: Object.freeze(["judgment crossbows", "execution pendants"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:tollwarden", priority: 10 }),
      Object.freeze({ trigger: "onHit", script: "procPackage:tollwarden", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "kineticBattery",
    name: "Kinetic Battery",
    summary: "Taking hits stores battery stacks; next attacks spend them for electric damage and mana return.",
    stateKeys: Object.freeze(["kinetic_battery"]),
    hostIdeas: Object.freeze(["storm robes", "resonant staves"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onDamaged", script: "procPackage:kineticBattery", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:kineticBattery", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "venomLedger",
    name: "Venom Ledger",
    summary: "Landed hits build toxin debt; kill while debt is active to cash out healing.",
    stateKeys: Object.freeze(["venom_ledger"]),
    hostIdeas: Object.freeze(["plague leathers", "toxin knives"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: "procPackage:venomLedger", priority: 10 }),
      Object.freeze({ trigger: "onKill", script: "procPackage:venomLedger", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "hungerSurge",
    name: "Hunger Surge",
    summary: "Kills stack hunger; attacks consume stacks for immediate extra damage.",
    stateKeys: Object.freeze(["hunger_surge"]),
    hostIdeas: Object.freeze(["hunger crowns", "warclubs"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onKill", script: "procPackage:hungerSurge", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:hungerSurge", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "ritualOverdraw",
    name: "Ritual Overdraw",
    summary: "Spend a small amount of life before each hit for fire damage and mana, then recover on kill.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["blood rapiers", "blood orbs"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:ritualOverdraw", priority: 10 }),
      Object.freeze({ trigger: "onKill", script: "procPackage:ritualOverdraw", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "executionRipple",
    name: "Execution Ripple",
    summary: "Critical kills propagate marks to nearby hostiles; marked foes are easier to finish.",
    stateKeys: Object.freeze(["cataclysm_mark"]),
    hostIdeas: Object.freeze(["warspears", "war greaves"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onCritKill", script: "procPackage:executionRipple", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:executionRipple", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "wardedRetort",
    name: "Warded Retort",
    summary: "Being hit arms a short retort window; your next strike carries acid backlash.",
    stateKeys: Object.freeze(["warded_retort"]),
    hostIdeas: Object.freeze(["reactive armor", "counter-set gear"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onDamaged", script: "procPackage:wardedRetort", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:wardedRetort", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "bloodsport",
    name: "Bloodsport",
    summary: "Sustained combat builds combo pressure that amplifies attacks and drip-heals when hit.",
    stateKeys: Object.freeze(["bloodsport_combo"]),
    hostIdeas: Object.freeze(["brawling wraps", "berserker plate"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: "procPackage:bloodsport", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:bloodsport", priority: 20 }),
      Object.freeze({ trigger: "onDamaged", script: "procPackage:bloodsport", priority: 30 }),
    ]),
  }),
  Object.freeze({
    id: "shadowParry",
    name: "Shadow Parry",
    summary: "Misses prime a one-beat shadow counter that lashes back when you are struck.",
    stateKeys: Object.freeze(["shadow_parry"]),
    hostIdeas: Object.freeze(["duelist cords", "echo ringmail"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onMiss", script: "procPackage:shadowParry", priority: 10 }),
      Object.freeze({ trigger: "onDamaged", script: "procPackage:shadowParry", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "serpentBoundBreeches",
    name: "Serpent-Bound Breeches",
    summary: "On hit, chance to coat in serpent-hide and thorns. Dodges/parries prime a nature riposte that can slow. Spectral-serpent windows poison melee attackers.",
    stateKeys: Object.freeze(["serpent_hide", "serpent_riposte", "serpent_specters"]),
    hostIdeas: Object.freeze(["survivalist legguards", "mail hunter kits", "raider serpenthide"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: PROC_PACKAGE_KEYS.SerpentBoundBreeches, priority: 10 }),
      Object.freeze({ trigger: "onMiss", script: PROC_PACKAGE_KEYS.SerpentBoundBreeches, priority: 20 }),
      Object.freeze({ trigger: "onBeforeHit", script: PROC_PACKAGE_KEYS.SerpentBoundBreeches, priority: 30 }),
      Object.freeze({ trigger: "onDamaged", script: PROC_PACKAGE_KEYS.SerpentBoundBreeches, priority: 40 }),
    ]),
  }),
  Object.freeze({
    id: "moonfireCycle",
    name: "Moonfire Cycle",
    summary: "Each hit alternates sun and moon strikes: fire+burning, then cold+frost.",
    stateKeys: Object.freeze(["moonfire_phase"]),
    hostIdeas: Object.freeze(["eclipse torcs", "dual-phase gauntlets"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: "procPackage:moonfireCycle", priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "killTempo",
    name: "Kill Tempo",
    summary: "Kills build short-lived tempo stacks that boost next attacks and refill stamina.",
    stateKeys: Object.freeze(["kill_tempo"]),
    hostIdeas: Object.freeze(["ascendant belts", "tempo kill kits"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onKill", script: "procPackage:killTempo", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:killTempo", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "missMomentum",
    name: "Miss Momentum",
    summary: "Misses are banked into momentum and spent in one burst on a later hit.",
    stateKeys: Object.freeze(["miss_momentum"]),
    hostIdeas: Object.freeze(["duelist belts", "risk-reward kits"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onMiss", script: "procPackage:missMomentum", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:missMomentum", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "debtHarvest",
    name: "Debt Harvest",
    summary: "Hits accrue debt; taking damage cashes partial resources, kills cash full healing.",
    stateKeys: Object.freeze(["debt_harvest"]),
    hostIdeas: Object.freeze(["soul-debt gauntlets", "mortgage treads"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: "procPackage:debtHarvest", priority: 10 }),
      Object.freeze({ trigger: "onDamaged", script: "procPackage:debtHarvest", priority: 20 }),
      Object.freeze({ trigger: "onKill", script: "procPackage:debtHarvest", priority: 30 }),
    ]),
  }),
  Object.freeze({
    id: "cataclysmGuard",
    name: "Cataclysm Guard",
    summary: "Taking damage primes a void-charged counterstrike; secure a kill while primed for brief invulnerability.",
    stateKeys: Object.freeze(["cataclysm_guard"]),
    hostIdeas: Object.freeze(["cataclysm shields", "warboots"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onDamaged", script: "procPackage:cataclysmGuard", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:cataclysmGuard", priority: 20 }),
      Object.freeze({ trigger: "onKill", script: "procPackage:cataclysmGuard", priority: 30 }),
    ]),
  }),
  Object.freeze({
    id: "omenDrive",
    name: "Omen Drive",
    summary: "Projectile hits charge an omen battery that detonates into shadow damage and blinds.",
    stateKeys: Object.freeze(["omen_drive"]),
    hostIdeas: Object.freeze(["portent focuses", "counter-ranged kits"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onDamaged", script: "procPackage:omenDrive", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:omenDrive", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "packHunter",
    name: "Pack Hunter",
    summary: "Consecutive hits tag prey and amplify follow-ups with precision pressure.",
    stateKeys: Object.freeze(["pack_hunter_mark"]),
    hostIdeas: Object.freeze(["predator cowls", "stalker blades"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onHit", script: "procPackage:packHunter", priority: 10 }),
      Object.freeze({ trigger: "onBeforeHit", script: "procPackage:packHunter", priority: 20 }),
    ]),
  }),
  Object.freeze({
    id: "graveCurrent",
    name: "Grave Current",
    summary: "Wand-like foci recharge 1 charge on kill, up to their item cap.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["kill-charging wands", "grave foci"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onKill", script: "procPackage:graveCurrent", priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "glacierSigil",
    name: "Glacier Sigil",
    summary: "Frost casts lock struck enemies in place for a turn.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["cryomancer offhands", "control-heavy caster kits"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onSpellHit", script: "procPackage:glacierSigil", priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "shieldGuardState",
    name: "Shield Guard",
    summary: "The equipped shield can still absorb frontal blows.",
    stateKeys: Object.freeze(["shield_guard"]),
    hostIdeas: Object.freeze(["offhand shields", "frontline defenders"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([]),
  }),
  Object.freeze({
    id: "shieldBrokenState",
    name: "Shield Broken",
    summary: "The shield is cracked and cannot mitigate until it recovers.",
    stateKeys: Object.freeze(["shield_broken"]),
    hostIdeas: Object.freeze(["guard-break pressure", "anti-tank windows"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([]),
  }),
  Object.freeze({
    id: "conductionLens",
    name: "Conduction Lens",
    summary: "Lightning jumps to one extra foe, with reduced spill damage.",
    stateKeys: Object.freeze([]),
    hostIdeas: Object.freeze(["storm foci", "chain-lightning supports"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onSpellCast", script: "procPackage:conductionLens", priority: 10 }),
    ]),
  }),
  Object.freeze({
    id: "echoGrimoire",
    name: "Echo Grimoire",
    summary: "Repeat a spell within 3 turns to cast it free at reduced power.",
    stateKeys: Object.freeze(["echo_grimoire_memory"]),
    hostIdeas: Object.freeze(["cadence casting", "mana-compression loadouts"]),
    passiveExpressions: Object.freeze([]),
    procTrees: Object.freeze([
      Object.freeze({ trigger: "onSpellCast", script: "procPackage:echoGrimoire", priority: 10 }),
    ]),
  }),
]);

const PROC_PACKAGE_REGISTRY = new Map(PROC_PACKAGE_SPECS.map((spec) => [spec.id, spec]));

export function getProcPackage(id) {
  return PROC_PACKAGE_REGISTRY.get(String(id || "")) || null;
}

export function listProcPackages() {
  return Array.from(PROC_PACKAGE_REGISTRY.values());
}

export function listProcPackageIds() {
  return Array.from(PROC_PACKAGE_REGISTRY.keys());
}

export function attachProcPackage(world, parentId, packageId) {
  const spec = getProcPackage(packageId);
  const resolvedParentId = Number(parentId || 0) | 0;
  if (!spec || !(resolvedParentId > 0) || !world?.isAlive?.(resolvedParentId)) return 0;

  const packageNodeId = addAttachedComponent(world, resolvedParentId, ProcPackageNode, {
    packageId: spec.id,
  });

  for (let i = 0; i < spec.passiveExpressions.length; i++) {
    attachDerivedExpression(world, packageNodeId, { ...spec.passiveExpressions[i] });
  }

  for (let i = 0; i < spec.procTrees.length; i++) {
    const tree = spec.procTrees[i];
    attachProcNode(world, packageNodeId, {
      priority: Number(tree.priority || 0),
      gates: [gateEventKind(tree.trigger), ...(Array.isArray(tree.gates) ? tree.gates : [])],
      script: tree.script,
    });
  }

  return packageNodeId;
}

export function detachProcPackages(world, parentId, packageId = "") {
  const resolvedParentId = Number(parentId || 0) | 0;
  const wanted = String(packageId || "");
  if (!(resolvedParentId > 0) || !world?.isAlive?.(resolvedParentId)) return 0;

  let removed = 0;
  for (const childId of children(world, resolvedParentId)) {
    const marker = world.get(childId, ProcPackageNode);
    if (!marker) continue;
    if (wanted && String(marker.packageId || "") !== wanted) continue;
    destroySubtree(world, childId);
    removed += 1;
  }
  return removed;
}

export function hasProcPackageScript(id) {
  return !!getScriptHandlers(id);
}
