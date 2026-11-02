// display/lighting/sources/index.js
// Collect display-side light sources from a WorldView snapshot.
// Returns LightDef[] compatible with the lighting engine.

/** @typedef {import('../engine.js').LightDef} LightDef */

import { basePalette } from '../../palette/base.js';
import { evaluatePattern, registerPattern } from './temporalPatterns.js';

// Mirror of rules/data/calendar.TURNS_PER_DAY — display layer cannot import
// rules directly.  The bridge (worldView) normalises time into turnInDay so
// this constant is only needed for the sun/moon arc boundaries below.
const TURNS_PER_DAY = 720;

// ---- Palette glow lookup ------------------------------------------------

/** Convert "#rrggbb" or "#rgb" hex to [R, G, B] (0-255). */
function hexToRGB(hex) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  if (h.length === 3) return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

/** Cache palette glow colours as RGB arrays. */
const _glowCache = new Map();
function paletteGlow(kind) {
  if (_glowCache.has(kind)) return _glowCache.get(kind);
  const entry = basePalette[kind];
  const rgb = entry?.glow ? hexToRGB(entry.glow) : null;
  _glowCache.set(kind, rgb);
  return rgb;
}

// ---- Colour palettes for light sources ----------------------------------
// Explicit constants for effects that don't map 1:1 to a palette entry.
// EYE_LIGHT removed — eyesight is a vision mask, not a light source.
const WARM_ORANGE  = [255, 190, 120];   // player torch / generic torch
const LANTERN_GOLD = [255, 210, 140];   // lantern — slightly brighter, warmer
const FIRE_RED     = [255, 120, 40];    // burning entities / fire hazards
const STORM_WHITE  = [200, 210, 255];   // lightning / storm effects
const SOUL_GREEN   = [80, 255, 120];    // soul / nature magic
const REANIMATED_VIOLET = [150, 110, 220]; // reanimation aura
const BLOOD_RED    = [255, 50, 50];     // blood magic
const VENOM_GREEN  = [120, 255, 80];    // venom / poison glow
const HOLY_GOLD    = [255, 240, 180];   // invulnerable / divine
const CAUSTIC_LIME = [180, 255, 60];    // caustic effects
const SHADOW_PURPLE = [160, 80, 220];   // shadow / agony magic
const GAZE_VIOLET   = [220, 80, 255];  // floating eye gaze beam
const CHEST_GOLD    = [255, 230, 140];  // chest reveal bloom

// ---- Blackbody colour temperature → RGB -------------------------------------
// Planckian locus approximation (Tanner Helland algorithm).
// K: correlated colour temperature in Kelvin (valid ~1000–40000).
// Returns [R, G, B] each 0–255.
function kelvinToRGB(K) {
  const t = Math.max(1000, Math.min(40000, K)) / 100;
  let r, g, b;
  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }
  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

// ---- Transient light state (event-driven) --------------------------------

// Floating eye gaze beams — tracked per eye entity ID.
// Each entry stores the eye position and charge progress (0–1).
/** @type {Map<number, {ex:number, ey:number, charge:number, total:number, turn:number}>} */
const _gazeBeams = new Map();

// Chest reveal blooms — brief one-shot flashes.
/** @type {Array<{x:number, y:number, age:number, maxAge:number, color:[number,number,number]}>} */
const _chestBlooms = [];

// Fluorite phosphorescence charges — entity id → charge (0-1).
// Charged by energetic (blue/UV) light sources, decays slowly over ~18s.
// Physically: fluorescence named after this mineral; glows after excitation removed.
/** @type {Map<number, number>} */
const _fluoCharges = new Map();
const FLUO_DECAY       = 0.055;  // per-second — full fade ~18s
const FLUO_CHARGE_RATE = 0.9;    // gain per unit strength — fast charge from lightning

// Holy beams — brief transient light beams (sunsword blinding ray).
/** @type {Array<{fx:number, fy:number, tx:number, ty:number, age:number, maxAge:number}>} */
const _holyBeams = [];
const HOLY_BEAM_COLOR = [255, 245, 200];

function _parseHexToRgb(hex) {
  const s = String(hex || '#ffffff');
  return [
    parseInt(s.slice(1, 3), 16) || 255,
    parseInt(s.slice(3, 5), 16) || 255,
    parseInt(s.slice(5, 7), 16) || 255,
  ];
}

// Content-DSL dynamic lights — set by ctx.light(), expire if not refreshed.
// Keyed by entity ID so each entity has at most one content light.
// `framesLeft` counts down each frame; tick hooks refresh it each turn.
/** @type {Map<number, {x:number, y:number, radius:number, color:[number,number,number], pattern:string, softness:number, framesLeft:number}>} */
const _contentLights = new Map();
const _CONTENT_LIGHT_TTL = 90; // ~1.5 seconds at 60fps — enough to survive between game ticks

// Shrine light states — updated by shrine:communion and shrine:combat:scaling events.
// standing: normalized [-1, +1] (positive = deity favors player, negative = wrath).
// Unknown shrines render at standing=0 (neutral) until an event updates them.
/** @type {Map<number, {standing: number}>} */
const _shrineLightStates = new Map();

// Shrine positions collected this frame — cleared at start of collectLightSources,
// populated during entity scan. Used for fluorite proximity charging.
/** @type {Map<number, {x:number, y:number}>} */
const _shrinePosThisFrame = new Map();

// Last shrine touched per player — stored on shrine:communion so deity:intervention
// (which fires immediately after) knows where to draw the miracle beam from.
/** @type {Map<number, {x:number, y:number}>} */
const _lastShrineTouched = new Map();

/**
 * Map normalized deity standing [-1, +1] to shrine base color [R,G,B] and radius.
 * Blessed shrines burn brighter and warmer; wrath shrines dim and redden.
 * @param {number} s — normalized standing, clamped [-1, +1]
 * @returns {[[number,number,number], number]}
 */
function _shrineLightFromStanding(s) {
  if (s > 0.5)   return [[255, 238, 140], 5.5];   // highly favored: bright warm gold, wide
  if (s > 0.15)  return [[230, 205, 100], 4.8];   // favored: rich gold
  if (s > -0.15) return [[204, 170,  51], 4.0];   // neutral: default palette
  if (s > -0.5)  return [[155, 130,  52], 3.2];   // disfavored: dimmer, cooler
                 return [[185,  72,  40], 2.5];   // wrath: reddish embers, narrow
}

/**
 * Apply a named temporal pattern to a light definition and push it.
 * Evaluates the pattern waveform, applies intensity to radius/flicker,
 * and applies color shift to the base color.
 *
 * @param {LightDef[]} out — array to push into
 * @param {string} pattern — temporal pattern name (e.g. 'torch', 'breathe')
 * @param {number} t — fxTime in seconds
 * @param {number} id — entity id for phase offset
 * @param {number} x @param {number} y
 * @param {number} baseRadius
 * @param {[number,number,number]} baseColor
 * @param {number} softness
 */
function emitPatterned(out, pattern, t, id, x, y, baseRadius, baseColor, softness) {
  const p = evaluatePattern(pattern, t, id);
  const r = Math.max(0, Math.min(255, baseColor[0] * (1 + p.r)));
  const g = Math.max(0, Math.min(255, baseColor[1] * (1 + p.g)));
  const b = Math.max(0, Math.min(255, baseColor[2] * (1 + p.b)));
  out.push({
    x, y,
    radius: baseRadius,
    color: [r, g, b],
    flicker: p.intensity,
    softness,
  });
}

/**
 * Emit a void light — actively devours illumination.
 * The 'void' temporal pattern drives the breathing darkness.
 *
 * @param {LightDef[]} out
 * @param {number} t — fxTime
 * @param {number} id — entity id
 * @param {number} x @param {number} y
 * @param {number} radius — how far the darkness reaches
 * @param {number} strength — 0-1 how aggressively it eats light (1 = full black hole)
 * @param {number} softness
 */
function emitVoid(out, t, id, x, y, radius, strength, softness) {
  const p = evaluatePattern('void', t, id);
  const s = strength * p.intensity;
  out.push({
    x, y,
    radius,
    kind: "void",
    color: [155, 120, 255],
    voidStrength: s,
    softness,
  });
}

function emitAuthoredLight(out, light, t) {
  const id = Number(light?.id || 0) | 0;
  const pos = light?.pos || {};
  const x = Number(pos.x || 0) + 0.5;
  const y = Number(pos.y || 0) + 0.5;
  const radius = Number(light?.radius || 0);
  if (!(radius > 0)) return;
  const baseColor = Array.isArray(light?.baseColor) ? light.baseColor : [255, 255, 255];
  const pattern = String(light?.temporalPattern || 'steady');
  const softness = Number.isFinite(Number(light?.shadowSoftness)) ? Number(light.shadowSoftness) : 6;
  const phaseSeed = Number.isFinite(Number(light?.phaseSeed)) ? Number(light.phaseSeed) : 0;
  const intensity = Number.isFinite(Number(light?.intensity)) ? Math.max(0, Number(light.intensity)) : 1;
  const intensityScale = Number.isFinite(Number(light?.intensityScale)) ? Number(light.intensityScale) : 1;
  const colorShiftScale = Number.isFinite(Number(light?.colorShiftScale)) ? Number(light.colorShiftScale) : 1;
  const patternId = (id + phaseSeed) | 0;
  const voidStrength = light?.voidStrength;
  if (voidStrength !== null && voidStrength !== undefined) {
    const p = evaluatePattern(pattern || 'void', t, patternId);
    out.push({
      x, y,
      radius,
      kind: "void",
      color: baseColor,
      voidStrength: Math.max(0, Math.min(1, Number(voidStrength) || 0)) * p.intensity * intensity * intensityScale,
      softness,
    });
    return;
  }
  const p = evaluatePattern(pattern, t, patternId);
  const r = Math.max(0, Math.min(255, baseColor[0] * (1 + p.r * colorShiftScale)));
  const g = Math.max(0, Math.min(255, baseColor[1] * (1 + p.g * colorShiftScale)));
  const b = Math.max(0, Math.min(255, baseColor[2] * (1 + p.b * colorShiftScale)));
  out.push({
    x, y,
    radius,
    color: [r, g, b],
    flicker: p.intensity * intensity * intensityScale,
    softness,
  });
}

/** Legacy shim — delegates to the 'torch' temporal pattern.  */
function torchFlicker(t, id) {
  return evaluatePattern('torch', t, id).intensity;
}

/**
 * Collect every active light source from the current WorldView.
 *
 * @param {import('../../../bridge/schema/worldView.js').WorldView} view
 * @param {{quality?: string, fxTime?: number}} opts
 * @returns {LightDef[]}
 */
// ---- Smooth eye-light radius (frame-interpolated between turns) ----------
// The rules layer updates visionRange once per turn (integer ticks), so blind
// recovery produces a staircase: 2 → 3 → 4 → ...  We lerp toward the target
// each frame so the lighting circle grows/shrinks smoothly in sub-tile space.
let _eyeRadiusCurrent = -1;   // < 0 = uninitialised
let _eyeRadiusTarget  = 0;
const EYE_LERP_SPEED  = 3.0;  // tiles/sec — fast enough to track, slow enough to read

/** Current smooth eye-light radius (tiles). Used by the tile renderer to
 *  fade glyph alpha near the vision boundary during blind recovery. */
export function getSmoothedEyeRadius() { return _eyeRadiusCurrent < 0 ? 0 : _eyeRadiusCurrent; }

/** @type {import('../engine.js').VisionDef|null} */
let _lastVisionDef = null;

/** Return the current vision mask definition (built during collectLightSources). */
export function getVisionDef() { return _lastVisionDef; }

export function collectLightSources(view, opts = {}) {
  const q     = (opts.quality || 'auto').toLowerCase();
  const base  = q === 'low' ? 6 : (q === 'high' ? 10 : 8);
  const t     = opts.fxTime || 0;
  const dt    = opts.dt || 0.016;   // frame delta (seconds)
  /** @type {LightDef[]} */
  const out   = [];
  const playerId = Number(view.player?.id || 0) | 0;
  _shrinePosThisFrame.clear();

  // ---- Player vision (NOT a light — handled separately as vision mask) ----
  // Smooth the eye radius between frames for blind recovery transitions.
  if (view.player) {
    const px = view.player.pos.x + 0.5, py = view.player.pos.y + 0.5;
    const vr = view.playerVisionRadius || 0;

    _eyeRadiusTarget = vr;
    if (_eyeRadiusCurrent < 0) _eyeRadiusCurrent = vr;
    const diff = _eyeRadiusTarget - _eyeRadiusCurrent;
    if (Math.abs(diff) < 0.01) {
      _eyeRadiusCurrent = _eyeRadiusTarget;
    } else {
      _eyeRadiusCurrent += Math.sign(diff) * Math.min(Math.abs(diff), EYE_LERP_SPEED * dt);
    }

    // Build vision def for the engine (exported via getVisionDef)
    if (_eyeRadiusCurrent > 0) {
      const facing = view.playerFacing;
      const coneDeg = view.playerConeDegrees || 360;
      _lastVisionDef = {
        x: px, y: py,
        radius: _eyeRadiusCurrent + 0.5,
        facingX: facing ? facing.dx : 0,
        facingY: facing ? facing.dy : 0,
        coneDeg: coneDeg,
        penumbraDeg: 25,
      };
    } else {
      _lastVisionDef = null;
    }

    // ---- Torch light (warm, flickering) ----------------------------------
    // Below 25% HP the torch shifts to a heartbeat rhythm and dims red.
    // Below 10% HP the heartbeat slows further.
    if (Array.isArray(view.entities)) {
      for (let i = 0; i < view.entities.length; i++) {
        const e = view.entities[i];
        if ((Number(e.id || 0) | 0) !== playerId) continue;
        if (Array.isArray(e.tags) && e.tags.includes('torch')) {
          const hp = e.hp || 0, maxHp = e.maxHp || 1;
          const hpRatio = hp / maxHp;
          if (hpRatio <= 0.10) {
            // Critical — slow heartbeat, deep red, dimmer
            const CRIT_RED = [255, 60, 30];
            emitPatterned(out, 'heartbeat', t * 0.6, playerId, px, py, base * 0.6, CRIT_RED, 6);
          } else if (hpRatio <= 0.25) {
            // Low HP — heartbeat, orange-red shift, slightly reduced radius
            const LOW_RED = [255, 130, 60];
            emitPatterned(out, 'heartbeat', t, playerId, px, py, base * 0.8, LOW_RED, 7);
          } else {
            emitPatterned(out, 'torch', t, playerId, px, py, base + 0.5, WARM_ORANGE, 8);
          }
        }
        break;
      }
    }
  }

  // ---- Entity-derived lights --------------------------------------------
  // Items with material optical data are deferred here and processed after the loop,
  // so the interaction pass can scan the complete base source list.
  /** @type {Array<{id:number, x:number, y:number, kind:string, opt:object}>} */
  const matInteractors = [];
  const explicitLightEntityIds = new Set();

  if (Array.isArray(view.lightEmitters)) {
    for (let i = 0; i < view.lightEmitters.length; i++) {
      const light = view.lightEmitters[i];
      explicitLightEntityIds.add(Number(light?.id || 0) | 0);
      emitAuthoredLight(out, light, t);
    }
  }

  if (Array.isArray(view.entities)) {
    for (let i = 0; i < view.entities.length; i++) {
      const e = view.entities[i];
      if ((Number(e.id || 0) | 0) === playerId) continue; // player handled above
      const tags = Array.isArray(e.tags) ? e.tags : null;
      // Memory echoes (explored but not currently visible) must not emit light.
      // The player remembers the decoration is there, but it shouldn't illuminate.
      if (tags && (tags.includes('memory_fixed') || tags.includes('memory_recent')
                || tags.includes('memory_esp') || tags.includes('memory_thermal'))) continue;
      const ex = e.pos.x + 0.5, ey = e.pos.y + 0.5;
      const layer = Number.isFinite(e.layer) ? (e.layer | 0) : 300;
      const kind = (typeof e.kind === 'string') ? e.kind.toLowerCase() : '';

      if (explicitLightEntityIds.has(Number(e.id || 0) | 0)) {
        if (e.matOptical) {
          matInteractors.push({ id: e.id, x: ex, y: ey, kind, opt: e.matOptical });
        }
        continue;
      }

      // Placed torches — room features (layer 300) or ground items (layer 250)
      if (kind === 'torch') {
        emitPatterned(out, 'torch', t, e.id, ex, ey, 6, WARM_ORANGE, 8);
        continue;
      }

      // Lit lantern posts (placed world objects)
      if (kind === 'lantern_post') {
        emitPatterned(out, 'candle', t, e.id, ex, ey, 7, LANTERN_GOLD, 10);
        continue;
      }

      // Dungeon furniture — palette-driven atmospheric lighting.
      // Each kind gets a temporal pattern that matches its character.
      {
        // Shrine: standing-reactive color/radius, position tracked for fluorite charging.
        if (kind === 'shrine') {
          _shrinePosThisFrame.set(e.id | 0, { x: ex, y: ey });
          const state = _shrineLightStates.get(e.id | 0);
          const [shrineCol, shrineRadius] = _shrineLightFromStanding(state?.standing ?? 0);
          emitPatterned(out, 'holy', t, e.id, ex, ey, shrineRadius, shrineCol, 4);
          continue;
        }
        const FURNITURE_LIGHT = {
          pressure_plinth: { radius: 2.2, pattern: 'pulse', color: [70, 185, 205], softness: 6 },
          pressure_plinth_pressed: { radius: 3.2, pattern: 'pulse', color: [105, 235, 245], softness: 5 },
        };
        const fl = FURNITURE_LIGHT[kind];
        if (fl) {
          const col = fl.color || paletteGlow(kind) || [160, 170, 190];
          emitPatterned(out, fl.pattern, t, e.id, ex, ey, fl.radius, col, fl.softness || 6);
          continue;
        }
        // State-derived fire furniture stays here until rules toggles component presence.
        if (kind === 'furnace') {
          emitPatterned(out, 'ember', t, e.id, ex, ey, 3, paletteGlow(kind) || FIRE_RED, 8);
          continue;
        }
      }

      // Revealed pit trap — void light: the abyss absorbs surrounding illumination.
      if (kind === 'trap_pit') {
        emitVoid(out, t, e.id, ex, ey, 2.0, 0.5, 4);
        continue;
      }
      if (kind === 'trap_shock' && tags && tags.includes('trap_armed')) {
        emitPatterned(out, 'storm', t, e.id, ex, ey, 2.8, [120, 225, 255], 3);
      }

      if (e.matOptical) {
        matInteractors.push({ id: e.id, x: ex, y: ey, kind, opt: e.matOptical });
      }
      if (!tags) continue;

      // Torch-bearing NPCs/monsters
      if (tags.includes('torch')) {
        emitPatterned(out, 'torch', t, e.id, ex, ey, 3, WARM_ORANGE, 7);
        continue; // torch dominates — skip weaker tags
      }

      // Tag-driven emissive lights — each magical school gets its own pattern.
      if (tags.includes('sunlight')) {
        const hasHolyWeaponVfx = Array.isArray(e.weaponVfx)
          && e.weaponVfx.some((fx) => String(fx?.id || '') === 'holy_weapon');
        emitPatterned(
          out,
          'holy',
          t,
          e.id,
          ex,
          ey,
          hasHolyWeaponVfx ? 2.2 : 4,
          [255, 245, 200],
          hasHolyWeaponVfx ? 6 : 10,
        );
      } else if (tags.includes('stasis')) {
        emitPatterned(out, 'breathe', t, e.id, ex, ey, 3.5, [136, 221, 255], 4);
      } else if (tags.includes('reanimated_glow')) {
        emitPatterned(out, 'breathe', t, e.id, ex, ey, 2.4, REANIMATED_VIOLET, 3);
      } else if (tags.includes('invulnerable')) {
        emitPatterned(out, 'holy', t, e.id, ex, ey, 5, HOLY_GOLD, 5);
      } else if (tags.includes('storm_glowing')) {
        emitPatterned(out, 'storm', t, e.id, ex, ey, 4, STORM_WHITE, 3);
      } else if (tags.includes('soul_glowing')) {
        emitPatterned(out, 'occult', t, e.id, ex, ey, 4, SOUL_GREEN, 4);
      } else if (tags.includes('blood_glowing')) {
        emitPatterned(out, 'heartbeat', t, e.id, ex, ey, 3, BLOOD_RED, 3);
      } else if (tags.includes('venom_glowing')) {
        emitPatterned(out, 'biolum', t, e.id, ex, ey, 3, VENOM_GREEN, 3);
      } else if (tags.includes('caustic_glowing')) {
        emitPatterned(out, 'pulse', t, e.id, ex, ey, 3, CAUSTIC_LIME, 3);
      } else if (tags.includes('agony')) {
        emitPatterned(out, 'occult', t, e.id, ex, ey, 3, SHADOW_PURPLE, 4);
        emitVoid(out, t, e.id, ex, ey, 2.5, 0.35, 5);
      } else if (tags.includes('legendary_glowing')) {
        emitPatterned(out, 'pulse', t, e.id, ex, ey, 5, paletteGlow('legendary_chest') || LANTERN_GOLD, 5);
      } else if (tags.includes('glowing')) {
        // Suppress generic amber for mat-optical items — matOptical.emissive handles their emission instead
        if (!e.matOptical) emitPatterned(out, 'ember', t, e.id, ex, ey, 4, LANTERN_GOLD, 4);
      } else if (tags.includes('epic_glowing')) {
        emitPatterned(out, 'breathe', t, e.id, ex, ey, 4, paletteGlow('epic_chest') || [200, 100, 255], 4);
      } else if (tags.includes('rare_glowing')) {
        emitPatterned(out, 'breathe', t, e.id, ex, ey, 3, paletteGlow('magic_chest') || [100, 160, 255], 3);
      }
      // Potion glow — bioluminescent shimmer
      if (tags.includes('potion_glow')) {
        const col = paletteGlow(kind) || paletteGlow('potion') || [120, 220, 200];
        emitPatterned(out, 'biolum', t, e.id, ex, ey, 2.5, col, 3);
      }
      // Gold glow — gentle pulse
      if (tags.includes('gold_glow')) {
        emitPatterned(out, 'candle', t, e.id, ex, ey, 1.5, [255, 210, 80], 2);
      }
      // Material optical items: pure interaction (or emissive if flagged).
      // Deferred to interaction pass so we can scan the complete base source list.
      // Burning entities — fire light that reads as something on fire
      if (tags.includes('burning')) {
        emitPatterned(out, 'ember', t, e.id, ex, ey, 3.5, FIRE_RED, 6);
      }
      // Void aura — entities that actively devour light.
      // shadow_glowing: shadow creatures, void weapons, dark artifacts
      if (tags.includes('shadow_glowing')) {
        emitVoid(out, t, e.id, ex, ey, 3.5, 0.8, 6);
      }

      // Floating eye gaze beams — directional cone from eye toward player.
      // Tightens as charge builds: wide idle scan → tight focused beam.
      if (_gazeBeams.has((e.id | 0))) {
        const gb = _gazeBeams.get(e.id | 0);
        // Update eye position each frame (it may move)
        gb.ex = ex; gb.ey = ey;
      }
    }
  }

  // ---- Material optical interaction pass ----------------------------------
  // Gems: pure interaction (respond to incoming light only).
  // Emissive materials: inject their own light plus respond to incoming.
  // baseLightCount snapshots the source list before any mat contributions,
  // so mat responses never trigger other mats (no cross-item caustic chains).
  if (matInteractors.length > 0) {
    const baseLightCount  = out.length;
    const MAX_CAUSTICS    = 2;
    const CAUSTIC_DIST_SQ = 8 * 8;
    const GLINT_DIST_SQ   = 5 * 5;
    const ABSORB_DIST_SQ  = 5 * 5;

    for (let gi = 0; gi < matInteractors.length; gi++) {
      const { id, x: gx, y: gy, kind, opt } = matInteractors[gi];
      let causticCount = 0;
      let didAbsorb    = false;

      // Gem palette color — used for caustic so each gem projects its own color.
      // Ruby → red pool. Emerald → green. Diamond → rainbow split.
      const gemCol = paletteGlow(kind) || [200, 180, 255];
      // Opal flag — play-of-color via diffraction, not dispersion. Animated color wheel.
      const isOpal = kind === 'gem_opal' || kind === 'gem_black_opal';
      // Fluorite flag — fluorescence: absorbs energetic (blue/UV) light, re-emits cyan-green.
      // Named literally after this mineral. Glows brilliantly under lightning, barely at all under torch.
      const isFluo = kind === 'gem_fluorite';

      // Temporal pattern — per-material character for refracted effects and emission.
      // Evaluated once per gem (not per source) to avoid redundant calls.
      const pat = evaluatePattern(opt.pattern || 'gem_quartz', t, id);

      // Fluorite phosphorescence — decay existing charge this frame, accumulate during source scan
      let fluoCharge = 0;
      if (isFluo) {
        fluoCharge = Math.max(0, (_fluoCharges.get(id) || 0) - dt * FLUO_DECAY);
        // Shrine holy light is UV-rich (divine energy ≈ energetic radiation).
        // Charges fluorite slowly — ambient saturation, not lightning-fast.
        // Rate designed to reach ~full charge after ~4s standing adjacent.
        if (_shrinePosThisFrame.size > 0) {
          for (const [, sp] of _shrinePosThisFrame) {
            const sdx = gx - sp.x, sdy = gy - sp.y;
            const sdistSq = sdx * sdx + sdy * sdy;
            if (sdistSq <= CAUSTIC_DIST_SQ) {
              const falloff = Math.max(0, 1 - Math.sqrt(sdistSq) / 8);
              fluoCharge = Math.min(1, fluoCharge + falloff * 0.28 * dt * FLUO_CHARGE_RATE);
            }
          }
        }
      }

      // Magical gem base emission — independent of nearby light sources.
      // Dilithium, enchanted gems, legendary gems emit their own patterned light.
      if (opt.emissive) {
        const emitR = opt.dispersion >= 0.20 ? 5.0 : 3.5;
        out.push({
          x: gx, y: gy,
          radius: emitR,
          color: [
            Math.max(0, Math.min(255, gemCol[0] * (1 + pat.r))),
            Math.max(0, Math.min(255, gemCol[1] * (1 + pat.g))),
            Math.max(0, Math.min(255, gemCol[2] * (1 + pat.b))),
          ],
          flicker: pat.intensity,
          softness: 5,
        });
      }
      // Physics-based emission from material colour temperature (non-gem items:
      // aetherium, radiant-alloy, soul-glass, blood-iron, starmetal, ectoplasm…).
      // Uses Planckian locus K→RGB — colour is intrinsic to the material, not palette.
      if (opt.emitK > 0 && opt.emitIntensity > 0) {
        const emitCol = kelvinToRGB(opt.emitK);
        const emitR   = opt.emitIntensity * 5.0 * pat.intensity;
        out.push({
          x: gx, y: gy,
          radius:   emitR,
          color:    emitCol,
          flicker:  pat.intensity,
          softness: 6,
        });
      }

      for (let si = 0; si < baseLightCount; si++) {
        const src = out[si];
        if (!src || src.color[0] < 0) continue; // skip void sources

        const dx = gx - src.x, dy = gy - src.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 0.01) continue;

        // Caustic — light passes through gem, projects on the far side.
        // High-dispersion gems (diamond, zircon) split into RGB rainbow — "fire".
        // Low-dispersion gems project a single colored pool.
        if (opt.lightPass > 0.3 && distSq <= CAUSTIC_DIST_SQ && causticCount < MAX_CAUSTICS) {
          const dist     = Math.sqrt(distSq);
          const srcI     = src.flicker != null ? src.flicker : 1.0;
          const falloff  = Math.max(0, 1 - dist / 9);
          const strength = opt.lightPass * srcI * falloff * pat.intensity;
          if (strength > 0.05) {
            const ndx = dx / dist, ndy = dy / dist;
            const cx  = gx + ndx * 1.8,  cy  = gy + ndy * 1.8;
            const r   = opt.lightPass * 3.5;

            if (isFluo) {
              // Fluorite: charge from energetic sources only — emission handled after scan.
              // "Fluorescence" named after this mineral. Charges fast, fades slow (~18s).
              const srcBlue = src.color[2] || 0;
              const srcRed  = src.color[0] || 1;
              if (srcBlue > srcRed * 1.08) {  // blue-dominant = energetic/UV proxy
                fluoCharge = Math.min(1, fluoCharge + strength * FLUO_CHARGE_RATE);
              }
              causticCount++;
            } else if (isOpal) {
              // Opal: play-of-color via diffraction interference — NOT dispersion.
              // Three caustics whose colors rotate around the color wheel over time.
              // Each opal entity has its own phase offset from id so they don't sync.
              const phase  = t * 0.4 + (id % 256) * 0.41;
              const c1 = [Math.round(128 + 127 * Math.sin(phase)),
                          Math.round(128 + 127 * Math.sin(phase + 2.094)),
                          Math.round(128 + 127 * Math.sin(phase + 4.189))];
              const c2 = [Math.round(128 + 127 * Math.sin(phase + 1.047)),
                          Math.round(128 + 127 * Math.sin(phase + 3.142)),
                          Math.round(128 + 127 * Math.sin(phase + 5.236))];
              const px = -ndy, py = ndx;
              out.push({ x: cx + px * 0.5, y: cy + py * 0.5, radius: r * 0.7, color: c1, softness: 3, flicker: strength * 0.8 });
              out.push({ x: cx - px * 0.5, y: cy - py * 0.5, radius: r * 0.7, color: c2, softness: 3, flicker: strength * 0.8 });
            } else if (opt.dispersion >= 0.20) {
              // Dispersive: three offset caustics — red, green, blue at spread angles.
              // Perpendicular axis (rotated 90° from light direction).
              const px = -ndy, py = ndx;
              const spread = opt.dispersion * 1.2;
              out.push({ x: cx + px * spread, y: cy + py * spread,
                radius: r * 0.8, color: [255, 40,  20 ], softness: 2, flicker: strength * 0.85 });
              out.push({ x: cx,               y: cy,
                radius: r * 0.9, color: [40,  255, 60 ], softness: 2, flicker: strength * 0.75 });
              out.push({ x: cx - px * spread, y: cy - py * spread,
                radius: r * 0.8, color: [60,  80,  255], softness: 2, flicker: strength * 0.85 });
            } else {
              // Non-dispersive: single colored caustic using gem palette color.
              out.push({ x: cx, y: cy, radius: r, color: gemCol, softness: 3, flicker: strength });
            }
            causticCount++;
          }
        }

        // Specular glint — anisotropic streak, not a blob.
        // Real glints are rays: light reflects off surface microstructure (blade edge,
        // grain, facet edge) and spreads along a preferred axis perpendicular to the
        // incoming light direction. As the torch moves, the streak rotates with it.
        // Two arms form a cross: primary (perpendicular) + secondary (along light ray).
        // Cubic distance falloff makes glints pop at close range and vanish quickly —
        // matches the angle-sensitivity of real specular reflection.
        if (opt.lightReflect > 0.06 && distSq <= GLINT_DIST_SQ) {
          const dist  = Math.sqrt(distSq);
          const srcI  = src.flicker != null ? src.flicker : 1.0;
          // Cubic falloff — sharper than linear, realistic angle-sensitivity
          const dFall = Math.max(0, 1 - dist / 3.5);
          const gStr  = opt.lightReflect * srcI * dFall * dFall * dFall * pat.intensity;
          if (gStr > 0.01) {
            const ndx = dx / dist, ndy = dy / dist;
            // Perpendicular axis = primary streak direction (anisotropic specular)
            const px = -ndy, py = ndx;
            // Spacing scales with reflectivity: polished gold > rough iron
            const spacing = 0.28 + opt.lightReflect * 0.18;
            const HALF = 2;  // 5 points: -2 -1 0 +1 +2
            // Primary arm — perpendicular to light, bell-curve falloff along streak
            for (let k = -HALF; k <= HALF; k++) {
              const bell = 1 - (k * k) / ((HALF + 0.8) * (HALF + 0.8));
              out.push({
                x:        gx + px * k * spacing,
                y:        gy + py * k * spacing,
                radius:   0.25,
                color:    [255, 253, 248],
                softness: 0,
                flicker:  Math.min(1, gStr * 2.5 * bell),
              });
            }
            // Secondary arm — along light direction, shorter and dimmer
            // Skip center (k=0) — already covered by primary arm above
            for (let k = -1; k <= 1; k++) {
              if (k === 0) continue;
              out.push({
                x:        gx + ndx * k * spacing * 0.55,
                y:        gy + ndy * k * spacing * 0.55,
                radius:   0.18,
                color:    [255, 253, 248],
                softness: 0,
                flicker:  Math.min(1, gStr * 1.1),
              });
            }
          }
        }

        // Color bleed — transmitted light illuminates the gem face itself.
        // Ruby in torchlight glows red on its tile. Emerald glows green.
        // Only for transmissive gems (lightPass > 0.3). Soft, localised.
        if (opt.lightPass > 0.3 && distSq <= GLINT_DIST_SQ) {
          const srcI    = src.flicker != null ? src.flicker : 1.0;
          const bStr    = opt.lightPass * srcI * Math.max(0, 1 - Math.sqrt(distSq) / 5) * 0.55 * pat.intensity;
          if (bStr > 0.04) {
            out.push({
              x: gx, y: gy,
              radius:   1.4,
              color:    gemCol,
              softness: 8,
              flicker:  bStr,
            });
          }
        }

        // Chatoyancy — chrysoberyl cat's-eye: tight perpendicular band.
        // A bright stripe oriented 90° to the light direction.
        if (kind === 'gem_chrysoberyl' && distSq <= GLINT_DIST_SQ) {
          const dist   = Math.sqrt(distSq);
          const srcI   = src.flicker != null ? src.flicker : 1.0;
          const cStr   = srcI * Math.max(0, 1 - dist / 5);
          if (cStr > 0.05) {
            // Perpendicular axis to incoming light
            const ndx = dx / dist, ndy = dy / dist;
            const px = -ndy, py = ndx;
            // Three tight points along the perpendicular — forms a bright stripe
            for (let si2 = -1; si2 <= 1; si2++) {
              out.push({
                x:        gx + px * si2 * 0.5,
                y:        gy + py * si2 * 0.5,
                radius:   0.35,
                color:    [220, 255, 180],
                softness: 1,
                flicker:  cStr * (si2 === 0 ? 1.0 : 0.6),
              });
            }
          }
        }

        // Absorption shadow — high-absorb gems eat nearby light, once per gem
        if (!didAbsorb && opt.lightAbsorb > 0.5 && distSq <= ABSORB_DIST_SQ) {
          emitVoid(out, t, id, gx, gy, opt.lightAbsorb * 2.0, (opt.lightAbsorb - 0.5) * 0.8, 6);
          didAbsorb = true;
        }
      }

      // Fluorite phosphorescent emission — save charge, emit from accumulated glow.
      // Fires even when no energetic source is currently nearby (the mineral remembers).
      if (isFluo) {
        _fluoCharges.set(id, fluoCharge);
        if (fluoCharge > 0.015) {
          const fluoPhase = t * 1.1 + (id % 256) * 0.37;
          const fluoStr   = fluoCharge * (0.85 + 0.15 * Math.sin(fluoPhase));
          // Core bloom at gem — radius swells with charge
          out.push({ x: gx, y: gy,
            radius: 1.5 + fluoCharge * 2.8,
            color: [40, 230, 180],
            softness: 4,
            flicker: fluoStr,
          });
          // Wider ambient corona when strongly charged (hit by full lightning bolt)
          if (fluoCharge > 0.45) {
            out.push({ x: gx, y: gy,
              radius: fluoCharge * 4.5,
              color: [30, 180, 140],
              softness: 7,
              flicker: fluoStr * 0.45,
            });
          }
        }
      }
    }
  }

  // ---- Floating eye gaze cone lights ------------------------------------
  // Prune beams for eyes no longer visible (dead, LOS broken, off-screen).
  if (_gazeBeams.size > 0) {
    const turn = Number.isFinite(view.turn) ? (view.turn | 0) : -1;
    const visibleIds = new Set();
    if (Array.isArray(view.entities)) {
      for (let i = 0; i < view.entities.length; i++) {
        visibleIds.add(view.entities[i].id | 0);
      }
    }
    for (const [eyeId, gb] of _gazeBeams) {
      if (!visibleIds.has(eyeId) || (turn >= 0 && (gb.turn | 0) !== turn)) _gazeBeams.delete(eyeId);
    }
  }
  if (view.player && _gazeBeams.size > 0) {
    const px = view.player.pos.x + 0.5, py = view.player.pos.y + 0.5;
    for (const [, gb] of _gazeBeams) {
      const progress = Math.min(1, gb.charge / Math.max(1, gb.total));
      // Occult temporal pattern for unsettling rhythm
      const pSeed = (gb.ex * 73 + gb.ey * 37) | 0;
      const p = evaluatePattern('occult', t, pSeed);
      const baseInt = 0.7 + progress * 0.5;
      const intensity = baseInt * p.intensity;

      // Hot source glow at the eye — grows with charge, overdriven
      const eyeRadius = 1.5 + progress * 2.0;
      const eyeCol = [
        Math.min(255, GAZE_VIOLET[0] * intensity * 1.6),
        Math.min(255, GAZE_VIOLET[1] * intensity * 1.6),
        Math.min(255, GAZE_VIOLET[2] * intensity * 1.6),
      ];
      out.push({ x: gb.ex, y: gb.ey, radius: eyeRadius, color: eyeCol, softness: 10 });

      // Light beam — tight half-tile-wide beam, high intensity.
      // Radius 0.5 tiles per sample, spaced every 0.5 tiles so they
      // overlap into a continuous ~½ tile wide laser line.
      const dx = px - gb.ex, dy = py - gb.ey;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.5) continue;  // too close, skip beam
      const nx = dx / dist, ny = dy / dist;
      const spacing = 0.5;
      const steps = Math.min(24, Math.floor(dist / spacing));
      const beamRadius = 0.5;
      for (let s = 1; s <= steps; s++) {
        const frac = (s * spacing) / dist;
        // Barely fades along length — stays hot all the way
        const falloff = 1.0 - frac * 0.15;
        const bInt = intensity * falloff * 1.4;
        // Per-sample shimmer — offset the occult pattern per step
        const sp = evaluatePattern('occult', t, pSeed + s * 17);
        const shimmer = 0.88 + 0.12 * sp.intensity;
        const bi = bInt * shimmer;
        out.push({
          x: gb.ex + nx * s * spacing,
          y: gb.ey + ny * s * spacing,
          radius: beamRadius,
          color: [
            Math.min(255, GAZE_VIOLET[0] * bi),
            Math.min(255, GAZE_VIOLET[1] * bi),
            Math.min(255, GAZE_VIOLET[2] * bi),
          ],
          softness: 4,
        });
      }
    }
  }

  // ---- Holy beams (sunsword blinding ray — brief transient) --------------
  for (let i = _holyBeams.length - 1; i >= 0; i--) {
    const hb = _holyBeams[i];
    hb.age += dt;
    if (hb.age >= hb.maxAge) { _holyBeams.splice(i, 1); continue; }
    const progress = hb.age / hb.maxAge;
    // Fade: bright onset, taper in second half
    const fade = progress < 0.4 ? 1.0 : 1.0 - (progress - 0.4) / 0.6;
    const dx = hb.tx - hb.fx, dy = hb.ty - hb.fy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) continue;
    const nx = dx / dist, ny = dy / dist;
    const spacing = 0.5;
    const steps = Math.min(20, Math.floor(dist / spacing));
    // Source bloom
    out.push({ x: hb.fx, y: hb.fy, radius: 1.6 * fade, color: [
      HOLY_BEAM_COLOR[0] * fade, HOLY_BEAM_COLOR[1] * fade, HOLY_BEAM_COLOR[2] * fade,
    ], softness: 6 });
    // Beam samples
    for (let s = 1; s <= steps; s++) {
      const frac = (s * spacing) / dist;
      const falloff = 1.0 - frac * 0.1;
      const sp = evaluatePattern('holy', t, (hb.fx * 53 + hb.fy * 31 + s * 17) | 0);
      const shimmer = 0.85 + 0.15 * sp.intensity;
      const bi = fade * falloff * shimmer * 1.3;
      out.push({
        x: hb.fx + nx * s * spacing,
        y: hb.fy + ny * s * spacing,
        radius: 0.5,
        color: [
          Math.min(255, HOLY_BEAM_COLOR[0] * bi),
          Math.min(255, HOLY_BEAM_COLOR[1] * bi),
          Math.min(255, HOLY_BEAM_COLOR[2] * bi),
        ],
        softness: 4,
      });
    }
    // Impact bloom
    out.push({ x: hb.tx, y: hb.ty, radius: 1.9 * fade, color: [
      Math.min(255, 255 * fade * 1.2),
      Math.min(255, 245 * fade * 1.2),
      Math.min(255, 180 * fade * 1.2),
    ], softness: 5 });
  }

  // ---- Content DSL dynamic lights (entity-anchored, auto-expire) -----------
  if (_contentLights.size > 0) {
    const expired = [];
    for (const [entId, light] of _contentLights) {
      // Expire if not refreshed by tick hook
      light.framesLeft -= 1;
      if (light.framesLeft <= 0) { expired.push(entId); continue; }

      // Find entity position in current view
      let found = false;
      if (view.entities) {
        for (let i = 0; i < view.entities.length; i++) {
          const e = view.entities[i];
          if ((Number(e.id || 0) | 0) !== entId) continue;
          light.x = (e.pos?.x ?? e.x ?? 0) + 0.5;
          light.y = (e.pos?.y ?? e.y ?? 0) + 0.5;
          found = true;
          break;
        }
      }
      if (!found) continue;
      emitPatterned(out, light.pattern, t, entId, light.x, light.y,
        light.radius, light.color, light.softness);
    }
    for (const id of expired) _contentLights.delete(id);
  }

  // ---- Chest reveal blooms (one-shot fading flashes) --------------------
  for (let i = _chestBlooms.length - 1; i >= 0; i--) {
    const bl = _chestBlooms[i];
    bl.age += dt;
    if (bl.age >= bl.maxAge) {
      _chestBlooms.splice(i, 1);
      continue;
    }
    const life = 1 - bl.age / bl.maxAge;
    const fade = life * life;  // quadratic fade-out
    const baseR = bl.radius || 4;
    out.push({
      x: bl.x, y: bl.y,
      radius: baseR * fade + 1,
      color: [bl.color[0] * fade, bl.color[1] * fade, bl.color[2] * fade],
      softness: 10,
    });
  }

  return out;
}

/**
 * Append transient lights from active spell / FX controllers.
 *
 * @param {LightDef[]} out — array to push into (mutated)
 * @param {object} fxSources — keyed FX controllers with getActiveLights()
 */
export function collectFxLights(out, fxSources) {
  // Query each FX controller for active light sources
  const controllers = [fxSources.boltFx, fxSources.spellAreaFx, fxSources.projectileFx, fxSources.cloudFx, fxSources.surfaceAreaFx, fxSources.statusEmitterFx, fxSources.spiritWispFx, fxSources.sparksFx];
  for (let c = 0; c < controllers.length; c++) {
    const fx = controllers[c];
    if (fx && typeof fx.getActiveLights === 'function') {
      const active = fx.getActiveLights();
      for (let i = 0; i < active.length; i++) out.push(active[i]);
    }
  }
}

/**
 * Install event listeners for transient lighting effects.
 * Call once during display initialization, passing the world event bus
 * and a getPosition callback for entity coordinate lookup.
 *
 * @param {object} world — world with .on() event method
 * @param {(id:number) => {x:number,y:number}|null} getPosition
 */
export function installLightEventListeners(world, getPosition) {
  // Floating eye gaze — track charge build-up per eye entity
  world.on('proc:gaze:charging', ({ actor, target, chargeCount, total, turn }) => {
    const eyeId = Number(actor) | 0;
    const pos = getPosition(eyeId);
    if (!pos) return;
    _gazeBeams.set(eyeId, {
      ex: pos.x + 0.5, ey: pos.y + 0.5,
      charge: chargeCount,
      total: total || 8,
      turn: Number.isFinite(turn) ? (turn | 0) : -1,
    });
  });

  // Gaze stun fires — bright flash then clear the beam
  world.on('proc:gaze:stun', ({ actor }) => {
    const eyeId = Number(actor) | 0;
    const gb = _gazeBeams.get(eyeId);
    if (gb) {
      // One-shot flash bloom at the eye position
      _chestBlooms.push({
        x: gb.ex, y: gb.ey, age: 0, maxAge: 0.3,
        color: [220, 80, 255],
      });
    }
    _gazeBeams.delete(eyeId);
  });

  // Gaze channel interrupted — clear the beam
  world.on('channeling:cancelled', ({ actor, spellId }) => {
    if (String(spellId || '') !== 'gaze_beam') return;
    _gazeBeams.delete(Number(actor) | 0);
  });

  // Content DSL authored temporal pattern: register a custom light waveform
  world.on('content:light:registerPattern', ({ name, speed, sway, wobble, jitter, rShift, gShift, bShift }) => {
    if (!name) return;
    registerPattern(name, (t, id) => {
      const s = speed || 1.0;
      const v = 1.0
        + (sway || 0)   * Math.sin(t * s * 1.4 + id)
        + (wobble || 0)  * Math.sin(t * s * 3.1 + id * 0.7)
        + (jitter || 0)  * (Math.random() - 0.5);
      return {
        intensity: v,
        r: rShift || 0,
        g: gShift || 0,
        b: bShift || 0,
      };
    });
  });

  // Content DSL dynamic light: set/update a point light on an entity.
  // Called by ctx.light() in scripted content. Persists across frames
  // until cleared or entity dies. Radius 0 removes the light.
  world.on('content:light:set', ({ entity, radius, color, pattern, softness }) => {
    const id = Number(entity || 0) | 0;
    if (!id) return;
    if (!radius || radius <= 0) { _contentLights.delete(id); return; }
    const c = Array.isArray(color) ? color
      : typeof color === 'string' ? _parseHexToRgb(color)
      : [255, 245, 200];
    _contentLights.set(id, {
      x: 0, y: 0,
      radius: Math.max(0.5, Math.min(12, Number(radius))),
      color: c,
      pattern: pattern || 'holy',
      softness: softness || 10,
      framesLeft: _CONTENT_LIGHT_TTL,  // refreshed each tick; expires if not
    });
  });
  // Content DSL light pulse: brief one-shot flash (like chest bloom)
  world.on('content:light:pulse', ({ x, y, entity, radius, color, duration }) => {
    let px, py;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      px = Number(x) + 0.5; py = Number(y) + 0.5;
    } else if (entity) {
      // Defer position lookup to next collectLightSources frame
      // For now, try to find entity in view — but we're in an event handler,
      // not in the collection loop. Use _chestBlooms with a flag.
      px = null; py = null;
    }
    if (px == null) return;
    const c = Array.isArray(color) ? color
      : typeof color === 'string' ? _parseHexToRgb(color)
      : [255, 245, 200];
    _chestBlooms.push({
      x: px, y: py,
      age: 0,
      maxAge: duration || 0.4,
      color: c,
      radius: radius || 3,
    });
  });

  world.on('content:light:clear', ({ entity }) => {
    _contentLights.delete(Number(entity || 0) | 0);
  });

  // Content DSL beam: holy lighting beam (used by presentation system)
  world.on('content:beam:vfx', ({ fromX, fromY, toX, toY }) => {
    if (!Number.isFinite(fromX) || !Number.isFinite(fromY)) return;
    _holyBeams.push({
      fx: fromX + 0.5, fy: fromY + 0.5,
      tx: toX + 0.5, ty: toY + 0.5,
      age: 0, maxAge: 0.45,
    });
  });

  // Fluorite discharge — blinding cyan-green phosphorescent blast at target position
  world.on("proc:fluorite:discharge", ({ target, chargesSpent }) => {
    const pos = getPosition(Number(target) | 0);
    if (!pos) return;
    const spent = Math.max(3, Number(chargesSpent || 3));
    // Core blast — bright cyan, size scales with charges spent
    _chestBlooms.push({
      x: pos.x + 0.5, y: pos.y + 0.5,
      age: 0, maxAge: 0.55,
      color: [50, 245, 195],
      radius: 4 + spent * 0.4,
    });
    // Second wider wash — the "phosphorescent" spread
    _chestBlooms.push({
      x: pos.x + 0.5, y: pos.y + 0.5,
      age: 0, maxAge: 0.35,
      color: [30, 200, 160],
      radius: 6 + spent * 0.6,
    });
  });

  // Shrine communion — bloom at shrine on touch, record position for miracle beam
  world.on('shrine:communion', ({ actor, targetId, effect }) => {
    const shrineId = Number(targetId) | 0;
    const actorId  = Number(actor) | 0;
    const shrinePos = getPosition(shrineId);
    if (!shrinePos) return;
    _lastShrineTouched.set(actorId, { x: shrinePos.x, y: shrinePos.y });
    if (effect === 'blessing') {
      // Warm gold bloom — divine acknowledgment
      _chestBlooms.push({ x: shrinePos.x + 0.5, y: shrinePos.y + 0.5, age: 0, maxAge: 0.8, color: [255, 235, 120], radius: 6 });
    } else if (effect === 'cooldown') {
      // Subdued flicker — the shrine remembers you
      _chestBlooms.push({ x: shrinePos.x + 0.5, y: shrinePos.y + 0.5, age: 0, maxAge: 0.3, color: [170, 150, 80], radius: 2.5 });
    }
  });

  // Shrine combat scaling — update standing state, pulse gold (favor) or red (wrath)
  world.on('shrine:combat:scaling', ({ shrineId, shrineX, shrineY, mult, standing }) => {
    const sid = Number(shrineId) | 0;
    if (sid > 0 && Number.isFinite(standing)) {
      _shrineLightStates.set(sid, { standing: Math.max(-1, Math.min(1, standing / 8)) });
    }
    if (!Number.isFinite(shrineX) || !Number.isFinite(shrineY)) return;
    const color = mult > 1
      ? [255, 222, 90]   // divine favor — gold burst
      : [210, 65, 35];   // divine wrath — harsh red
    _chestBlooms.push({ x: shrineX + 0.5, y: shrineY + 0.5, age: 0, maxAge: 0.28, color, radius: 3.5 });
  });

  // Deity shrine blessing miracle — holy beam from shrine to player, radiant bloom at shrine
  world.on('deity:intervention', ({ playerId, kind }) => {
    if (kind !== 'shrine_blessing') return;
    const actorId = Number(playerId) | 0;
    const lastShrine = _lastShrineTouched.get(actorId);
    const playerPos = getPosition(actorId);
    if (!lastShrine || !playerPos) return;
    _holyBeams.push({
      fx: lastShrine.x + 0.5, fy: lastShrine.y + 0.5,
      tx: playerPos.x + 0.5, ty: playerPos.y + 0.5,
      age: 0, maxAge: 0.8,
    });
    _chestBlooms.push({ x: lastShrine.x + 0.5, y: lastShrine.y + 0.5, age: 0, maxAge: 1.0, color: [HOLY_GOLD[0], HOLY_GOLD[1], HOLY_GOLD[2]], radius: 7 });
  });

  // Clear gaze beams on level transition
  world.on('dungeon:transitioned', () => {
    _gazeBeams.clear();
    _chestBlooms.length = 0;
    _holyBeams.length = 0;
    _fluoCharges.clear();
    _shrineLightStates.clear();
    _lastShrineTouched.clear();
  });

  // Chest reveal bloom — brief upward light flash on open
  world.on('chest:open', ({ targetId }) => {
    const pos = getPosition(Number(targetId) | 0);
    if (!pos) return;
    // Color based on chest kind — default warm gold
    _chestBlooms.push({
      x: pos.x + 0.5, y: pos.y + 0.5,
      age: 0, maxAge: 0.45,
      color: [CHEST_GOLD[0], CHEST_GOLD[1], CHEST_GOLD[2]],
    });
  });
}

// ---- Overworld positional sky lights (sun / moon) -----------------------
//
// Both bodies are modelled as infinitely distant directional lights whose
// elevation above the horizon is a sine arc driven by turnInDay.
//
// Sun arc:  rises at SUNRISE (turn 150 / 5 AM), peaks at solar noon,
//           sets at SUNSET (turn 580 / ~7:20 PM).
// Moon arc: rises at SUNSET, peaks at midnight (turn 0 / 720),
//           sets at SUNRISE.  Intensity scaled by lunar phase.
//
// Elevation drives both intensity (sin of elevation angle) and colour
// (low elevation = warm horizon tint, high = neutral white / cool blue).

// Sun / moon arc boundaries (turns within a day)
const SUNRISE = 150;   // 5 AM   — sun clears horizon
const SUNSET  = 580;   // 7:20 PM — sun dips below horizon
const SUN_ARC = SUNSET - SUNRISE;                          // 430 turns of daylight
const MOON_ARC = TURNS_PER_DAY - SUNSET + SUNRISE;         // 290 turns of moonlight

// Colour palettes (linear RGB, 0-1)
const SUN_ZENITH  = [0.82, 0.81, 0.78];   // overhead — soft daylight, desaturated
const SUN_HORIZON = [0.85, 0.55, 0.30];   // low sun  — muted golden (dawn/dusk only)
const MOON_ZENITH = [0.18, 0.20, 0.35];   // overhead — cool blue-white
const MOON_HORIZON = [0.08, 0.08, 0.18];  // low moon — dim indigo

/** Lerp two RGB triplets. */
function lerpRGB(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Compute elevation (0-1) of a celestial body given a sine arc.
 * Returns 0 when below the horizon.
 */
function arcElevation(turnInDay, arcStart, arcLen) {
  // Normalise turnInDay into the arc's local phase (0 → 1)
  let t;
  if (arcStart + arcLen <= TURNS_PER_DAY) {
    // Arc doesn't wrap midnight
    if (turnInDay < arcStart || turnInDay >= arcStart + arcLen) return 0;
    t = (turnInDay - arcStart) / arcLen;
  } else {
    // Arc wraps midnight (moon)
    const end = (arcStart + arcLen) % TURNS_PER_DAY;
    if (turnInDay >= arcStart) {
      t = (turnInDay - arcStart) / arcLen;
    } else if (turnInDay < end) {
      t = (turnInDay + TURNS_PER_DAY - arcStart) / arcLen;
    } else {
      return 0;
    }
  }
  return Math.sin(t * Math.PI);   // 0 at horizon, 1 at zenith
}

/**
 * Compute the overworld ambient sky-light colour from positional sun/moon.
 * Returns `null` when underground (no ambient).
 *
 * @param {import('../../../bridge/schema/worldView.js').WorldView} view
 * @returns {[number,number,number]|null}
 */
export function computeAmbient(view) {
  // Underground — no ambient sky light
  if (!view.isOverworld) return null;

  const tid = view.turnInDay || 0;

  // ---- Sun contribution ------------------------------------------------
  const sunElev = arcElevation(tid, SUNRISE, SUN_ARC);
  let sr = 0, sg = 0, sb = 0;
  if (sunElev > 0) {
    // Horizon tint compressed to low elevations via power curve.
    // At elev 0.3 the blend is already ~90% zenith; midday is pure white.
    const horizonBlend = Math.pow(1 - sunElev, 3);
    const col = lerpRGB(SUN_ZENITH, SUN_HORIZON, horizonBlend);
    sr = col[0] * sunElev;
    sg = col[1] * sunElev;
    sb = col[2] * sunElev;
  }

  // ---- Moon contribution -----------------------------------------------
  const moonElev = arcElevation(tid, SUNSET, MOON_ARC);
  let mr = 0, mg = 0, mb = 0;
  if (moonElev > 0) {
    const brightness = view.moonBrightness || 0.15;
    const horizonBlend = Math.pow(1 - moonElev, 3);
    const col = lerpRGB(MOON_ZENITH, MOON_HORIZON, horizonBlend);
    mr = col[0] * moonElev * brightness;
    mg = col[1] * moonElev * brightness;
    mb = col[2] * moonElev * brightness;
  }

  // Additive blend — during twilight both may contribute briefly
  return [sr + mr, sg + mg, sb + mb];
}
