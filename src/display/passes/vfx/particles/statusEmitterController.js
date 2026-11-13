import { isGoreDisabled } from "../../../ui/wiring/goreEngine.js";
import { evaluatePattern } from "../../../lighting/sources/temporalPatterns.js";
import { defineExtension } from "../../../../lib/ecs-js/index.js";
import { FountainDried } from "../../../../events/FountainDried.js";
import { FountainRefilled } from "../../../../events/FountainRefilled.js";

const INSTALLED_KEY = Symbol.for("jshack:display:statusEmitters:installed");

/**
 * Display-only controller for continuous status/kind particle emitters.
 * Keeps emitter lifecycle and animated origins out of main.js.
 */
export function createStatusEmitterController({ world, fx }) {
  const burningEmitters = new Set();
  const bleedEmitters = new Set();
  const poisonEmitters = new Set();
  const regenEmitters = new Set();
  const shockEmitters = new Set();
  const frozenEmitters = new Set();
  const cursedEmitters = new Set();
  const blessedEmitters = new Set();
  const agonyEmitters = new Set();
  const blindedEmitters = new Set();
  const confusedEmitters = new Set();
  const fountainEmitters = new Set();
  const furnaceEmitters = new Set();
  const cookFireEmitters = new Set();
  const torchEmitters = new Set();
  const returnPortalEmitters = new Set();
  const riftPortalEmitters = new Set();
  const familiarEmitters = new Set();
  const weaponProfileEmitterKeys = new Set();
  const auraEmitterKeys = new Set();
  const familiarCooldowns = new Set();
  const dryFountains = new Set();
  const seenEmitterKeys = new Set();
  const origins = [];
  const lightProbes = [];
  let _fxTime = 0;

  function computeCarryOrigin(entity, slot, carryAnchor) {
    const dx = Math.sign(Number(entity?.facing?.dx || 0));
    const dy = Math.sign(Number(entity?.facing?.dy || 0));
    const hasFacing = dx !== 0 || dy !== 0;
    const fxv = hasFacing ? dx : 0;
    const fyv = hasFacing ? dy : -1;
    const lx = -fyv;
    const ly = fxv;
    const handSign = String(slot || "weapon").toLowerCase() === "offhand" ? -1 : 1;
    const forward = Number.isFinite(Number(carryAnchor?.forward)) ? Number(carryAnchor.forward) : 0.40;
    const lateral = Number.isFinite(Number(carryAnchor?.lateral)) ? Number(carryAnchor.lateral) : 0.17;
    const vertical = Number.isFinite(Number(carryAnchor?.vertical)) ? Number(carryAnchor.vertical) : -0.02;
    return {
      x: Number(entity?.pos?.x || 0) + (fxv * forward) + (lx * lateral * handSign),
      y: Number(entity?.pos?.y || 0) + (fyv * forward) + (ly * lateral * handSign) + vertical,
    };
  }

  function computeProfileLightFlicker(light, id, fxTime) {
    const flicker = light?.flicker;
    if (!flicker || flicker.mode !== "sin") return 1.0;
    const base = Number.isFinite(Number(flicker.base)) ? Number(flicker.base) : 1.0;
    const amp = Number.isFinite(Number(flicker.amp)) ? Number(flicker.amp) : 0.0;
    const speed = Number.isFinite(Number(flicker.speed)) ? Number(flicker.speed) : 1.0;
    const phase = Number.isFinite(Number(flicker.phase)) ? Number(flicker.phase) : 0.5;
    return Math.max(0.35, base + amp * Math.sin(Number(fxTime || 0) * speed + (Number(id || 0) * phase)));
  }

  /** @type {Record<string, {tracker: Set<number>, prefix: string, cfg: Record<string, any>}>} */
  const TAG_EMITTER_CFG = {
    burning: { tracker: burningEmitters, prefix: "burn", cfg: { rate: 24, angle: -Math.PI / 2, spread: Math.PI / 7, speed: 0.95, speedJitter: 0.32, ax: 0, ay: -0.72, life: 0.95, lifeJitter: 0.28, size: 0.36, sizeEnd: 0.08, color: "#ffb347", alpha0: 0.98, alpha1: 0.0, offsetX: 0, offsetY: -0.18 } },
    bleeding: { tracker: bleedEmitters, prefix: "bleed", cfg: { rate: 34, angle: Math.PI / 2, spread: Math.PI / 5, speed: 0.85, speedJitter: 0.45, ax: 0, ay: 1.4, life: 1.0, lifeJitter: 0.34, size: 0.17, sizeEnd: 0.05, color: "#d21a1a", alpha0: 0.95, alpha1: 0.0 } },
    poisoned: { tracker: poisonEmitters, prefix: "poison", cfg: { rate: 4, angle: 0, spread: Math.PI * 2, speed: 0.15, speedJitter: 0.1, ax: 0, ay: -0.04, life: 1.6, lifeJitter: 0.5, size: 0.08, sizeEnd: 0.03, color: "#33ff55", alpha0: 0.35, alpha1: 0.0 } },
    regen: { tracker: regenEmitters, prefix: "regen", cfg: { rate: 12, angle: -Math.PI / 2, spread: Math.PI / 4, speed: 0.4, speedJitter: 0.15, ax: 0, ay: -0.1, life: 1.0, lifeJitter: 0.4, size: 0.15, sizeEnd: 0.04, color: "#f6faff", alpha0: 0.8, alpha1: 0.0 } },
    shocked: { tracker: shockEmitters, prefix: "shock", cfg: { rate: 30, angle: 0, spread: Math.PI * 2, speed: 1.2, speedJitter: 0.8, ax: 0, ay: 0, life: 0.2, lifeJitter: 0.1, size: 0.1, sizeEnd: 0.02, color: "#00ccff", alpha0: 1.0, alpha1: 0.0 } },
    frozen: { tracker: frozenEmitters, prefix: "frozen", cfg: { rate: 15, angle: 0, spread: Math.PI * 2, speed: 0.22, speedJitter: 0.14, ax: 0, ay: 0.04, life: 1.8, lifeJitter: 0.5, size: 0.12, sizeEnd: 0.04, color: "#aaeeff", alpha0: 0.6, alpha1: 0.0 } },
    cursed: { tracker: cursedEmitters, prefix: "cursed", cfg: { rate: 12, angle: -Math.PI / 2, spread: Math.PI, speed: 0.5, speedJitter: 0.3, ax: 0, ay: -0.25, life: 1.2, lifeJitter: 0.4, size: 0.14, sizeEnd: 0.02, color: "#8822cc", alpha0: 0.7, alpha1: 0.0 } },
    blessed: { tracker: blessedEmitters, prefix: "blessed", cfg: { rate: 10, angle: -Math.PI / 2, spread: Math.PI / 3, speed: 0.6, speedJitter: 0.2, ax: 0, ay: -0.35, life: 1.0, lifeJitter: 0.3, size: 0.09, sizeEnd: 0.02, color: "#ffcc00", alpha0: 0.8, alpha1: 0.0 } },
    agony: { tracker: agonyEmitters, prefix: "agony", cfg: { rate: 14, angle: -Math.PI / 2, spread: Math.PI, speed: 0.55, speedJitter: 0.30, ax: 0, ay: -0.22, life: 1.0, lifeJitter: 0.4, size: 0.18, sizeEnd: 0.05, color: "#bb44ee", alpha0: 0.85, alpha1: 0.0 } },
    blinded: { tracker: blindedEmitters, prefix: "blind", cfg: { rate: 10, angle: -Math.PI / 2, spread: Math.PI * 2, speed: 0.25, speedJitter: 0.15, ax: 0, ay: -0.08, life: 1.4, lifeJitter: 0.5, size: 0.14, sizeEnd: 0.03, color: "#6633aa", alpha0: 0.7, alpha1: 0.0 } },
    confused: { tracker: confusedEmitters, prefix: "confused", cfg: { rate: 8, angle: 0, spread: Math.PI * 2, speed: 0.35, speedJitter: 0.25, ax: 0, ay: -0.12, life: 1.2, lifeJitter: 0.4, size: 0.18, sizeEnd: 0.06, color: "#f0c030", alpha0: 0.85, alpha1: 0.0 } },
    torch: { tracker: torchEmitters, prefix: "torch", cfg: { continuous: true, rate: 10, angle: -Math.PI / 2, spread: Math.PI / 6, speed: 0.5, speedJitter: 0.4, ax: 0, ay: -0.9, life: 0.6, lifeJitter: 0.3, size: 0.22, sizeEnd: 0.03, color: "#ffaa33", alpha0: 0.85, alpha1: 0.0, offsetX: 0, offsetY: -0.2 } },
  };
  const AURA_GLOW_CFG = {
    pack: { rate: 7, angle: -Math.PI / 2, spread: Math.PI * 2, speed: 0.28, speedJitter: 0.12, ax: 0, ay: -0.08, life: 1.0, lifeJitter: 0.35, size: 0.13, sizeEnd: 0.025, color: "#9cff68", alpha0: 0.58, alpha1: 0.0 },
    toxic: { rate: 6, angle: -Math.PI / 2, spread: Math.PI * 2, speed: 0.18, speedJitter: 0.10, ax: 0, ay: -0.06, life: 1.25, lifeJitter: 0.4, size: 0.12, sizeEnd: 0.025, color: "#b5ef62", alpha0: 0.48, alpha1: 0.0 },
    rally: { rate: 9, angle: -Math.PI / 2, spread: Math.PI / 3, speed: 0.42, speedJitter: 0.16, ax: 0, ay: -0.18, life: 0.9, lifeJitter: 0.3, size: 0.10, sizeEnd: 0.02, color: "#ffd36a", alpha0: 0.62, alpha1: 0.0 },
    dread: { rate: 6, angle: Math.PI / 2, spread: Math.PI * 2, speed: 0.20, speedJitter: 0.10, ax: 0, ay: 0.12, life: 1.2, lifeJitter: 0.4, size: 0.13, sizeEnd: 0.025, color: "#c08cff", alpha0: 0.50, alpha1: 0.0 },
    void: { rate: 7, angle: 0, spread: Math.PI * 2, speed: 0.26, speedJitter: 0.14, ax: 0, ay: 0, life: 1.1, lifeJitter: 0.35, size: 0.11, sizeEnd: 0.02, color: "#78b8ff", alpha0: 0.54, alpha1: 0.0 },
    blood: { rate: 8, angle: -Math.PI / 2, spread: Math.PI / 2, speed: 0.35, speedJitter: 0.18, ax: 0, ay: -0.20, life: 0.85, lifeJitter: 0.25, size: 0.12, sizeEnd: 0.025, color: "#ff6f78", alpha0: 0.58, alpha1: 0.0 },
  };
  const AURA_GLOW_STYLE = {
    pack: { color: [156, 255, 104], radius: 0.62, speed: 5.0 },
    toxic: { color: [181, 239, 98], radius: 0.58, speed: 4.0 },
    rally: { color: [255, 211, 106], radius: 0.60, speed: 5.8 },
    dread: { color: [192, 140, 255], radius: 0.62, speed: 3.2 },
    void: { color: [120, 184, 255], radius: 0.64, speed: 4.6 },
    blood: { color: [255, 111, 120], radius: 0.60, speed: 6.2 },
  };
  /** @type {Record<string, {tracker: Set<number>, prefix: string, cfg: Record<string, any>}>} */
  const KIND_EMITTER_CFG = {
    fountain: { tracker: fountainEmitters, prefix: "fountain", cfg: { continuous: true, rate: 16, angle: -Math.PI / 2, spread: Math.PI / 3, speed: 1.4, speedJitter: 0.5, ax: 0, ay: 2.5, life: 1.2, lifeJitter: 0.3, size: 0.35, sizeEnd: 0.08, color: "#66ccff", alpha0: 0.7, alpha1: 0.0, offsetX: 0, offsetY: -0.3 } },
    furnace: { tracker: furnaceEmitters, prefix: "furnace", cfg: { continuous: true, rate: 22, angle: -Math.PI / 2, spread: Math.PI / 5, speed: 0.9, speedJitter: 0.3, ax: 0, ay: -0.1, life: 0.65, lifeJitter: 0.2, size: 0.42, sizeEnd: 0.04, color: "#ff6600", alpha0: 0.88, alpha1: 0.0, offsetX: 0, offsetY: -0.3 } },
    cooking_fire: { tracker: cookFireEmitters, prefix: "cfire", cfg: { continuous: true, rate: 14, angle: -Math.PI / 2, spread: Math.PI / 3, speed: 0.65, speedJitter: 0.3, ax: 0, ay: -0.05, life: 0.9, lifeJitter: 0.3, size: 0.35, sizeEnd: 0.04, color: "#ff8800", alpha0: 0.75, alpha1: 0.0, offsetX: 0, offsetY: 0 } },
    torch: { tracker: torchEmitters, prefix: "torch", cfg: { continuous: true, rate: 10, angle: -Math.PI / 2, spread: Math.PI / 6, speed: 0.5, speedJitter: 0.4, ax: 0, ay: -0.9, life: 0.6, lifeJitter: 0.3, size: 0.22, sizeEnd: 0.03, color: "#ffaa33", alpha0: 0.85, alpha1: 0.0, offsetX: 0, offsetY: -0.2 } },
    familiar: { tracker: familiarEmitters, prefix: "fam", cfg: { continuous: true, rate: 8, angle: -Math.PI / 2, spread: Math.PI / 3, speed: 0.45, speedJitter: 0.25, ax: 0, ay: -0.15, life: 0.55, lifeJitter: 0.2, size: 0.18, sizeEnd: 0.03, color: "#ff6600", alpha0: 0.7, alpha1: 0.0, offsetX: -0.2, offsetY: -0.1 } },
    return_portal: { tracker: returnPortalEmitters, prefix: "portal", cfg: { continuous: true, rate: 5, angle: 0, spread: Math.PI * 2, speed: 0.12, speedJitter: 0.35, ax: 0, ay: -0.03, life: 1.25, lifeJitter: 0.22, size: 0.14, sizeEnd: 0.04, color: "#7bd6ff", alpha0: 0.62, alpha1: 0.0, offsetX: 0, offsetY: 0 } },
    rift_portal: { tracker: riftPortalEmitters, prefix: "rift", cfg: { continuous: true, rate: 7, angle: 0, spread: Math.PI * 2, speed: 0.18, speedJitter: 0.45, ax: 0, ay: -0.05, life: 1.45, lifeJitter: 0.28, size: 0.16, sizeEnd: 0.04, color: "#d16bff", alpha0: 0.72, alpha1: 0.0, offsetX: 0, offsetY: 0 } },
  };

  function installListeners() {
    world.install(defineExtension("jshack:display:statusEmitterEvents", (installedWorld) => {
    installedWorld.on(FountainDried, ({ targetId }) => {
      const id = Number(targetId || 0);
      if (!(id > 0)) return;
      dryFountains.add(id);
      fountainEmitters.delete(id);
      fx.removeEmitter(`fountain:${id}`);
    });
    installedWorld.on("spawned", ({ id, kind }) => {
      if (String(kind || "") !== "fountain") return;
      dryFountains.delete(Number(id || 0));
    });
    installedWorld.on(FountainRefilled, ({ targetId }) => {
      const id = Number(targetId || 0);
      if (!(id > 0)) return;
      dryFountains.delete(id);
    });
    installedWorld.on("familiar:fired", ({ id }) => {
      const fid = Number(id || 0);
      if (!(fid > 0)) return;
      familiarCooldowns.add(fid);
      familiarEmitters.delete(fid);
      fx.removeEmitter(`fam:${fid}`);
    });
    installedWorld.on("familiar:ready", ({ id }) => {
      const fid = Number(id || 0);
      if (!(fid > 0)) return;
      familiarCooldowns.delete(fid);
    });
    }, { key: INSTALLED_KEY }));
  }

  function step(dtSec, view, fxTime) {
    _fxTime = Number(fxTime || 0);
    origins.length = 0;
    lightProbes.length = 0;
    seenEmitterKeys.clear();
    const isVisibleAt = (typeof view?.isVisible === "function") ? view.isVisible : null;
    for (let i = 0; i < view.entities.length; i++) {
      const e = view.entities[i];
      if (isVisibleAt && !isVisibleAt(e.pos.x, e.pos.y)) continue;
      if (
        Array.isArray(e.tags)
        && (e.tags.includes("memory_recent") || e.tags.includes("esp_sensed") || e.tags.includes("thermal_sensed"))
      ) continue;
      if (Array.isArray(e.tags)) {
        for (let t = 0; t < e.tags.length; t++) {
          const tag = e.tags[t];
          const sc = TAG_EMITTER_CFG[tag];
          if (!sc) continue;
          if (tag === "bleeding" && isGoreDisabled()) continue;
          const key = `${sc.prefix}:${e.id}`;
          seenEmitterKeys.add(key);
          const emitter = fx.ensureEmitter(key, { continuous: true, ...sc.cfg });
          if (!sc.tracker.has(e.id)) {
            sc.tracker.add(e.id);
          }
          // Sync torch particles with light flicker intensity
          if (tag === "torch" && emitter) {
            const pattern = evaluatePattern('torch', fxTime, e.id);
            emitter.alphaMultiplier = pattern.intensity;
            emitter.rateMultiplier = pattern.intensity;
            emitter.sizeMultiplier = pattern.intensity;
          }
          const origin = { x: e.pos.x, y: e.pos.y };
          if (tag === "regen") {
            const phase = (fxTime * 3.2) + (e.id * 0.61803398875);
            const orbitX = Math.cos(phase) * 0.32;
            const orbitY = Math.sin(phase) * 0.16;
            const bobY = Math.sin(phase * 0.5) * 0.04;
            if (orbitY >= 0) {
              origins.push({ key, x: e.pos.x + orbitX, y: e.pos.y + 0.24 + orbitY + bobY });
            }
          } else {
            origins.push({ key, x: origin.x, y: origin.y });
          }
          if (tag === "burning") {
            lightProbes.push({ kind: "burning", id: e.id, x: origin.x, y: origin.y });
          }
        }
      }

      for (const aura of Array.isArray(e.auraGlows) ? e.auraGlows : []) {
        const cfg = AURA_GLOW_CFG[String(aura?.key || "")];
        if (!cfg) continue;
        const key = `aura:${aura.key}:${e.id}`;
        seenEmitterKeys.add(key);
        auraEmitterKeys.add(key);
        const emitter = fx.ensureEmitter(key, { continuous: true, ...cfg });
        if (emitter) emitter.alphaMultiplier = Math.min(1.25, 0.75 + Number(aura.strength || 1) * 0.12);
        origins.push({ key, x: e.pos.x, y: e.pos.y - 0.08 });
      }

      if (Array.isArray(e.weaponVfx)) {
        for (let w = 0; w < e.weaponVfx.length; w++) {
          const profile = e.weaponVfx[w];
          if (!profile) continue;
          const slot = String(profile?.slot || "weapon").toLowerCase();
          const profileId = String(profile?.id || "profile").toLowerCase();
          const origin = computeCarryOrigin(e, slot, profile?.carryAnchor || null);
          const emitterCfg = profile?.carryEmitter;
          if (emitterCfg && typeof emitterCfg === "object") {
            const key = `wpvfx:${profileId}:${slot}:${e.id}`;
            seenEmitterKeys.add(key);
            if (!weaponProfileEmitterKeys.has(key)) {
              fx.ensureEmitter(key, { continuous: true, ...emitterCfg });
              weaponProfileEmitterKeys.add(key);
            }
            origins.push({ key, x: origin.x, y: origin.y });
          }
          const lightCfg = profile?.carryLight;
          const lightColor = Array.isArray(lightCfg?.color) ? lightCfg.color : null;
          if (lightColor && Number.isFinite(Number(lightCfg?.radius)) && Number(lightCfg.radius) > 0) {
            lightProbes.push({
              kind: "weapon_profile",
              id: e.id,
              x: origin.x,
              y: origin.y,
              light: lightCfg,
            });
          }
        }
      }

      const kc = KIND_EMITTER_CFG[e.kind];
      if (kc) {
        if (e.kind === "fountain" && dryFountains.has(e.id)) continue;
        if (e.kind === "familiar" && familiarCooldowns.has(e.id)) continue;
        const key = `${kc.prefix}:${e.id}`;
        seenEmitterKeys.add(key);
        const emitter = fx.ensureEmitter(key, kc.cfg);
        if (!kc.tracker.has(e.id)) {
          kc.tracker.add(e.id);
        }
        // Sync torch particles with light flicker intensity
        if (e.kind === "torch" && emitter) {
          const pattern = evaluatePattern('torch', fxTime, e.id);
          emitter.alphaMultiplier = pattern.intensity;
          emitter.rateMultiplier = pattern.intensity;
          emitter.sizeMultiplier = pattern.intensity;
        }
        origins.push({ key, x: e.pos.x, y: e.pos.y });
        if (e.kind === "familiar") {
          lightProbes.push({ kind: "familiar_ready", id: e.id, x: e.pos.x, y: e.pos.y });
        } else if (e.kind === "return_portal") {
          const phase = (fxTime * 0.82) + (e.id * 0.61);
          const wobbleX = Math.sin(phase * 1.2) * 0.04;
          const wobbleY = Math.cos(phase * 1.5) * 0.04;
          lightProbes.push({ kind: "return_portal", id: e.id, x: e.pos.x + wobbleX, y: e.pos.y + wobbleY });
        } else if (e.kind === "rift_portal") {
          const phase = (fxTime * 0.72) + (e.id * 0.73);
          const wobbleX = Math.sin(phase * 1.7) * 0.08;
          const wobbleY = Math.cos(phase * 1.3) * 0.08;
          lightProbes.push({ kind: "rift_portal", id: e.id, x: e.pos.x + wobbleX, y: e.pos.y + wobbleY });
        }
      }
    }

    for (const tag in TAG_EMITTER_CFG) {
      const sc = TAG_EMITTER_CFG[tag];
      if (!sc) continue;
      for (const id of sc.tracker) {
        if (!seenEmitterKeys.has(`${sc.prefix}:${id}`)) {
          fx.removeEmitter(`${sc.prefix}:${id}`);
          sc.tracker.delete(id);
        }
      }
    }
    for (const kind in KIND_EMITTER_CFG) {
      const kc = KIND_EMITTER_CFG[kind];
      if (!kc) continue;
      for (const id of kc.tracker) {
        if (!seenEmitterKeys.has(`${kc.prefix}:${id}`)) {
          fx.removeEmitter(`${kc.prefix}:${id}`);
          kc.tracker.delete(id);
        }
      }
    }
    for (const key of weaponProfileEmitterKeys) {
      if (seenEmitterKeys.has(key)) continue;
      fx.removeEmitter(key);
      weaponProfileEmitterKeys.delete(key);
    }
    for (const key of auraEmitterKeys) {
      if (seenEmitterKeys.has(key)) continue;
      fx.removeEmitter(key);
      auraEmitterKeys.delete(key);
    }
    fx.step(dtSec, origins);
  }

  function drawAuraGlows(ctx, view, fxTime) {
    if (!ctx || !Array.isArray(view?.entities)) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const entity of view.entities) {
      const glows = Array.isArray(entity?.auraGlows) ? entity.auraGlows : [];
      if (!glows.length || !entity?.pos) continue;
      for (const aura of glows) {
        const style = AURA_GLOW_STYLE[String(aura?.key || "")];
        if (!style) continue;
        const pulse = 0.5 + 0.5 * Math.sin(Number(fxTime || 0) * style.speed + (entity.id | 0) * 0.37);
        const strength = Math.max(0.7, Math.min(1.4, Number(aura.strength || 1)));
        const radius = style.radius * (0.92 + 0.10 * pulse) * strength;
        const [r, g, b] = style.color;
        const outer = ctx.createRadialGradient(entity.pos.x, entity.pos.y, 0, entity.pos.x, entity.pos.y, radius);
        outer.addColorStop(0, `rgba(${r},${g},${b},${(0.22 + 0.10 * pulse).toFixed(3)})`);
        outer.addColorStop(0.48, `rgba(${r},${g},${b},${(0.10 + 0.05 * pulse).toFixed(3)})`);
        outer.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.arc(entity.pos.x, entity.pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function getActiveLights() {
    const out = [];
    for (let i = 0; i < lightProbes.length; i++) {
      const p = lightProbes[i];
      if (p.kind === "burning") {
        const f = 1.0;
        out.push({ x: p.x + 0.5, y: p.y + 0.5, radius: 1.9 * f, color: [255, 120, 40], flicker: f });
      } else if (p.kind === "weapon_profile") {
        const light = p.light || null;
        if (!light) continue;
        const f = computeProfileLightFlicker(light, p.id, _fxTime);
        const color = Array.isArray(light.color) ? light.color : [255, 160, 80];
        const radius = Number(light.radius || 1);
        out.push({
          x: p.x + 0.5,
          y: p.y + 0.5,
          radius: radius * f,
          color: [Number(color[0]) || 255, Number(color[1]) || 160, Number(color[2]) || 80],
          flicker: f,
        });
      } else if (p.kind === "familiar_ready") {
        const id = Number(p.id || 0) | 0;
        const f = 0.90 + 0.10 * Math.sin(_fxTime * 6.4 + id * 0.43);
        out.push({ x: p.x + 0.5, y: p.y + 0.5, radius: 1.7 * f, color: [255, 160, 80], flicker: f });
      } else if (p.kind === "return_portal") {
        const id = Number(p.id || 0) | 0;
        const f = 0.88 + 0.10 * Math.sin(_fxTime * 0.82 + id * 0.61)
          + 0.03 * Math.sin(_fxTime * 5.4 + id * 1.04);
        out.push({ x: p.x + 0.5, y: p.y + 0.5, radius: 1.85 * f, color: [112, 214, 255], flicker: f });
      } else if (p.kind === "rift_portal") {
        const id = Number(p.id || 0) | 0;
        const breath = 0.86 + 0.14 * Math.sin(_fxTime * 0.72 + id * 0.73);
        const storm = 0.08 * Math.sin(_fxTime * 9.5 + id * 1.31);
        const f = Math.max(0.68, breath + storm);
        out.push({ x: p.x + 0.5, y: p.y + 0.5, radius: 2.25 * f, color: [190, 105, 255], flicker: f });
      }
    }
    return out;
  }

  return { installListeners, step, drawAuraGlows, getActiveLights };
}
