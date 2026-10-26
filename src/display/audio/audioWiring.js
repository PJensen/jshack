// Wires ECS world events to audio playback.
// Listens to game events and plays the matching sound from the registry.
//
// Spatial audio: sounds with a known {x,y} source are panned L/R and
// attenuated by distance from the player. Sounds through walls are muffled.

import { play, preload, startLoop, stopLoop, startLoopSequence, stopLoopSequence, setReverbMix } from "./audioEngine.js";
import { resolve, resolveUrls, allUrls } from "./sounds.js";
import {
  planMeleeDeath,
  planShieldBlock,
  planWeaponDeflect,
  planWeaponDrop,
  planWeaponImpact,
  planWeaponReady,
  planWeaponWhoosh,
} from "./combatAudioAdapter.js";
import { combatSoundId } from "./combatPack.js";
import { resolveCombatFamily } from "./combatSoundResolver.js";
import { createAudioWiringExtension } from "./audioWiringExtension.js";
import { defineExtension } from "../../lib/ecs-js/index.js";
import { FountainDrinkResolved } from "../../events/FountainDrinkResolved.js";
import { FountainDipResolved } from "../../events/FountainDipResolved.js";
import { Teleported } from "../../events/Teleported.js";
import { UrnInteractionResolved } from "../../events/UrnInteractionResolved.js";
import { FrostNovaCast } from "../../events/FrostNovaCast.js";
import { RiftOpened } from "../../events/RiftOpened.js";
import { RiftClosed } from "../../events/RiftClosed.js";
export { resolveInteractionSoundId } from "./audioWiringExtension.js";

export const ALERT_SOUND_BY_IDENTITY = Object.freeze({
  snake: "snake:alert",
  cave_snake: "snake:alert",
  pit_viper: "snake:alert",
  spider: "spider:alert",
  cave_spider: "spider:alert",
  phase_spider: "spider:alert",
  grid_bug: "grid_bug:alert",
  centipede: "insect:alert",
  gelatinous_cube: "gelatinous_cube:alert",
  cave_bear: "creature:alert:large_beast",
  boar: "creature:alert:large_beast",
  dragon: "creature:alert:large_beast",
  dragon_whelp: "creature:alert:large_beast",
  rat: "rat:alert",
  ratatoskr: "ambient:squirrel",
  wraith: "spectral:alert",
  carrion_shade: "spectral:alert",
  spectral_snake: "spectral:snake:alert",
});

export const CREATURE_ATTACK_SOUNDS = Object.freeze({
  cave_bear: "cave_bear:attack",
  rat: "rat:attack",
  grid_bug: "insect:attack",
  centipede: "insect:attack",
  spider: "spider:attack",
  cave_spider: "spider:attack",
  phase_spider: "spider:attack",
});

export const CREATURE_VOCALIZE_SOUNDS = Object.freeze({
  chick: "ambient:chick",
  chicken_hen: "ambient:chicken",
  chicken_rooster: "ambient:chicken",
});

export const DEATH_SOUND_BY_IDENTITY = Object.freeze({
  boar: "creature:boar:died",
  skeleton: "creature:skeleton:died",
  skeleton_archer: "creature:skeleton:died",
  skeleton_sharpshooter: "creature:skeleton:died",
});

export const STATUS_SOUND_BY_KIND = Object.freeze({
  deafened: "status:deafened",
  deaf: "status:deafened",
  slimed: "status:slimed",
  slime: "status:slimed",
  frozen: "status:frozen",
  frost: "status:frozen",
  electrocuted: "status:electrocuted",
  electric: "status:electrocuted",
  lightning: "status:electrocuted",
});

export const SEARCH_PING_SOUND_ID = "action:search_ping";
export const SEARCH_FOUND_SOUND_ID = "action:search_found";
export const SECRET_FOUND_SOUND_ID = "action:secret_found";
export const HARVEST_PLANT_SOUND_ID = "action:harvest_plant";
export const BONE_CHIME_SOUND_ID = "ambient:bone_chime";
export const TAMING_SUCCESS_SOUND_ID = "magic:taming";
export const GENOCIDE_SUCCESS_SOUND_ID = "item:scroll:genocide";
export const THROW_SOUND_ID = "action:throw";

let sfxDebugEnabled = false;
let sfxDebugLogger = null;

export function setSfxDebugEnabled(enabled) {
  sfxDebugEnabled = !!enabled;
}

export function isSfxDebugEnabled() {
  return sfxDebugEnabled && typeof sfxDebugLogger === "function";
}

export function setSfxDebugLogger(logger) {
  sfxDebugLogger = typeof logger === "function" ? logger : null;
}

export function reportSfxDebugInvocation(payload) {
  if (!sfxDebugEnabled || typeof sfxDebugLogger !== "function") return;
  try {
    sfxDebugLogger({ ...payload });
  } catch (_) {}
}

// Pet vocalization sound map
const PET_VOCALIZE_SOUNDS = Object.freeze({
  cat: "creature:pet:meow",
  dog: "creature:pet:meow",
  familiar: "creature:pet:meow",
});

// Cooldown tracking for pet vocalizations (Map<id, turnsLeft>)
const _petVocalizationCooldowns = new Map();

// ── Spatial helpers ─────────────────────────────────────────

/** Max tile distance at which a sound is still audible. Beyond this → silent. */
const MAX_HEAR_DIST = 16;
const MIN_ZOOM_GAIN = 0.65;
const MAX_ZOOM_GAIN = 1.35;
const GEM_MIN_VALUE = 0;
const GEM_MAX_VALUE = 5000;
const GEM_MIN_DETUNE_CENTS = 0;
const GEM_MAX_DETUNE_CENTS = 45;
const PLAYER_NEAR_DEATH_RATIO = 0.25;
const DUNGEON_OMEN_EVENT_GAP = 18;
const DUNGEON_OMEN_CHANCE = 12;
const DEAFENED_SOUND_COOLDOWN_MS = 2500;
const PLANT_HARVEST_KINDS = new Set([
  "berries",
  "carrot",
  "corn",
  "ember_root",
  "herbs",
  "moonleaf",
  "mushrooms",
  "thorn_bramble",
  "venom_fern",
  "wheat",
]);

export function isPlantHarvestKind(kind) {
  return PLANT_HARVEST_KINDS.has(String(kind || ""));
}
const CREATURE_ATTACK_SOUND_COOLDOWN_MS = 700;
const CREATURE_ALERT_SOUND_COOLDOWN_MS = 1200;
const KITTY_HAPPY_SOUND_COOLDOWN_MS = 8000;
const SEARCH_REVEAL_MAX_DELAY_MS = 380;
const WARMUP_WEAPON_FAMILIES = Object.freeze([
  "axe_large",
  "axe_small",
  "dagger",
  "flail",
  "hammer_large",
  "mace",
  "spear",
  "sword_large",
  "sword_small",
  "wooden_staff",
]);
const WARMUP_SHIELD_FAMILIES = Object.freeze(["shield_metal", "shield_wood"]);

/**
 * Compute pan (-1…+1) and volume (0…1) from source position relative to player.
 * @param {{ x: number, y: number }} sourcePos
 * @param {{ x: number, y: number }} playerPos
 * @returns {{ pan: number, volume: number }}
 */
function spatialize(sourcePos, playerPos) {
  if (!sourcePos || !playerPos) return { pan: 0, volume: 1 };

  const dx = sourcePos.x - playerPos.x;
  const dy = sourcePos.y - playerPos.y;
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

  if (dist > MAX_HEAR_DIST) return { pan: 0, volume: 0 };

  // Volume: inverse-distance falloff, full at dist<=1, fading to 0.15 at MAX_HEAR_DIST
  const volume = Math.max(0.15, 1.0 - (dist - 1) / MAX_HEAR_DIST);

  // Pan: horizontal offset clamped to -1…+1, scaled so ~8 tiles = full pan
  const pan = Math.max(-1, Math.min(1, dx / 8));

  return { pan, volume };
}

export function computeZoomAudibilityGain(zoomScale, referenceScale) {
  const zoom = Number(zoomScale);
  const reference = Number(referenceScale);
  if (!Number.isFinite(zoom) || !Number.isFinite(reference) || zoom <= 0 || reference <= 0) return 1;
  const gain = Math.sqrt(zoom / reference);
  return Math.max(MIN_ZOOM_GAIN, Math.min(MAX_ZOOM_GAIN, gain));
}

export function computeSearchRevealDelayMs(origin, target, radius) {
  if (!origin || !target) return 120;
  const ox = Number(origin.x);
  const oy = Number(origin.y);
  const tx = Number(target.x);
  const ty = Number(target.y);
  const r = Math.max(1, Number(radius) || 1);
  if (!Number.isFinite(ox) || !Number.isFinite(oy) || !Number.isFinite(tx) || !Number.isFinite(ty)) return 120;
  const dist = Math.hypot(tx - ox, ty - oy);
  return Math.max(60, Math.min(SEARCH_REVEAL_MAX_DELAY_MS, Math.round((dist / r) * SEARCH_REVEAL_MAX_DELAY_MS)));
}

function remapClamped(value, inMin, inMax, outMin, outMax) {
  const v = Number(value);
  if (!Number.isFinite(v)) return outMin;
  const iMin = Number(inMin);
  const iMax = Number(inMax);
  const oMin = Number(outMin);
  const oMax = Number(outMax);
  if (!Number.isFinite(iMin) || !Number.isFinite(iMax) || !Number.isFinite(oMin) || !Number.isFinite(oMax) || iMax <= iMin) {
    return oMin;
  }
  const t = Math.max(0, Math.min(1, (v - iMin) / (iMax - iMin)));
  return oMin + (oMax - oMin) * t;
}

export function gemValueToDropDetuneCents(value, maxGemValue = GEM_MAX_VALUE) {
  return remapClamped(value, GEM_MIN_VALUE, maxGemValue, GEM_MIN_DETUNE_CENTS, GEM_MAX_DETUNE_CENTS);
}

export function resolveStatusSoundId(payload) {
  const raw = payload?.sound || payload?.kind || payload?.effect || payload?.status || payload?.type || "";
  const key = String(raw || "").toLowerCase();
  return STATUS_SOUND_BY_KIND[key] || null;
}

export function resolveAudioPlayKey(payload) {
  return String(payload?.key || payload?.id || payload?.sound || "");
}

function isSpellLikeDamageCause(cause) {
  const value = String(cause || "");
  return value === "spell" || value === "magic" || value.startsWith("spell:") || value.startsWith("familiar:");
}

export function shouldPlayElectrocutionSound(payload) {
  const type = String(payload?.type || "").toLowerCase();
  return type === "electric" || type === "lightning";
}

export function shouldPlayTeleportSound(payload, isPlayerFn) {
  const id = Number(payload?.id || 0) | 0;
  if (!(id > 0)) return false;
  const src = String(payload?.source || "");
  if (src === "ratatoskr") return true;
  if (typeof isPlayerFn !== "function" || !isPlayerFn(id)) return false;
  return src !== "dungeon:teleport-depth";
}

export function shouldPlayCreatureAlertSound(soundId, state, nowMs, cooldownMs = CREATURE_ALERT_SOUND_COOLDOWN_MS) {
  const key = String(soundId || "");
  if (!key) return false;
  const last = state?.get?.(key) ?? -Infinity;
  if (Number(nowMs) - last < cooldownMs) return false;
  state?.set?.(key, Number(nowMs));
  return true;
}

export function shouldPlayKittyHappySound(petId, state, nowMs, cooldownMs = KITTY_HAPPY_SOUND_COOLDOWN_MS) {
  const id = Number(petId || 0) | 0;
  if (!(id > 0)) return false;
  const last = state?.get?.(id) ?? -Infinity;
  if (Number(nowMs) - last < cooldownMs) return false;
  state?.set?.(id, Number(nowMs));
  return true;
}

function audioNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function hashOmenPayload(payload, depth, eventIndex) {
  const at = payload?.at || {};
  const text = [
    payload?.kind,
    payload?.medium,
    payload?.cause,
    payload?.sourceKind,
    payload?.identity,
    depth,
    Number(at.x) | 0,
    Number(at.y) | 0,
    eventIndex,
  ].join(":");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shouldPlayDungeonOmen(payload, state, depth) {
  if (!payload || typeof payload !== "object") return false;
  const currentDepth = Number(depth || 0) | 0;
  if (currentDepth <= 0) return false;

  const at = payload.at || null;
  const x = Number(at?.x);
  const y = Number(at?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const kind = String(payload.kind || payload.identity || payload.sourceKind || "").toLowerCase();
  const cause = String(payload.cause || payload.sourceKind || "").toLowerCase();
  if (!kind && !cause) return false;

  state.eventIndex = (Number(state.eventIndex || 0) | 0) + 1;
  const last = Number(state.lastPlayedEventIndex || -Infinity);
  if (state.eventIndex - last < DUNGEON_OMEN_EVENT_GAP) return false;

  const hash = hashOmenPayload(payload, currentDepth, state.eventIndex);
  if ((hash % DUNGEON_OMEN_CHANCE) !== 0) return false;

  state.lastPlayedEventIndex = state.eventIndex;
  return true;
}

// ── Sound playback helpers ──────────────────────────────────

/** Play a registered sound with optional spatial + overrides. */
// priority defaults to 1 — direct sfx() calls are always player-triggered.
// sfxAt() overrides this via extraOpts based on distance.
function sfx(id, opts) {
  const s = resolve(id);
  if (!s) return;
  const playback = {
    bus: s.bus, maxVoices: s.maxVoices, randomPitch: s.randomPitch,
    volume: s.volume, rate: s.rate, detune: s.detune,
    stopAfter: s.stopAfter, fadeOut: s.fadeOut, segment: s.segment,
    priority: 1,
    ...opts,
  };
  reportSfxDebugInvocation({
    source: playback.pan == null ? "direct" : "spatial",
    id,
    bus: s.bus,
    file: s.file,
    volume: playback.volume,
    pan: playback.pan,
    priority: playback.priority,
  });
  play(s.url, playback);
}

/** Play a registered sound positioned in world space. */
function sfxAt(id, sourcePos, playerPos, extraOpts, zoomGain = 1) {
  const spatial = spatialize(sourcePos, playerPos);
  if (spatial.volume <= 0) return; // too far, don't play
  const sound = resolve(id);
  const baseVolume = Number.isFinite(Number(sound?.volume)) ? Number(sound.volume) : 1;
  const { volume: volumeOverride, ...restOpts } = extraOpts || {};
  const gain = Number.isFinite(Number(volumeOverride)) ? Number(volumeOverride) : baseVolume;
  // Sounds at/adjacent to player (volume >= 0.95) keep priority 1.
  // Everything else is priority 0 and evictable when player acts.
  const priority = spatial.volume >= 0.95 ? 1 : 0;
  sfx(id, { pan: spatial.pan, volume: spatial.volume * gain * zoomGain, priority, ...restOpts });
}

function sfxAtDelay(id, sourcePos, playerPos, extraOpts, zoomGain, delayMs) {
  const delay = Math.max(0, Number(delayMs || 0) | 0);
  if (delay <= 0 || typeof globalThis.setTimeout !== "function") {
    sfxAt(id, sourcePos, playerPos, extraOpts, zoomGain);
    return;
  }
  globalThis.setTimeout(() => sfxAt(id, sourcePos, playerPos, extraOpts, zoomGain), delay);
}

/**
 * Resolve an item entity's type to a sound category.
 */
export function itemCategory(getItemInfo, itemId) {
  const info = getItemInfo(itemId);
  if (!info) return "generic";
  const t = String(info.type || "").toLowerCase();
  const slot = String(info.slot || "").toLowerCase();
  const material = String(info.material || "").toLowerCase();
  const tags = Array.isArray(info.tags) ? info.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  const name = String(info.name || info.id || info.identity || "").toLowerCase();
  if (t === "weapon") return "weapon";
  if (slot === "weapon" || info.damageDice) return "weapon";
  if (t === "armor" || t === "shield" || t === "helmet" || t === "boots" || t === "gloves" || slot === "offhand" && name.includes("shield")) return "armor";
  if (t === "potion") return "potion";
  if (t === "scroll" || t === "book" || t === "learn") return "paper";
  if (material === "paper" || tags.includes("paper")) return "paper";
  if (name.startsWith("scroll_") || name.startsWith("book_")) return "paper";
  if (t === "currency" || t === "gold" || t === "coin") return "gold";
  if (t === "food" || t === "corpse") return "food";
  if (t === "gem") return "gem";
  return "generic";
}

function combatInfoFor(getItemInfo, itemId) {
  const info = getItemInfo(itemId);
  if (!info) return null;
  return { ...info, id: info.id || info.identity || "" };
}

function isShieldCombatFamily(info) {
  return String(resolveCombatFamily(info) || "").startsWith("shield_");
}

function isRangedEquipInfo(info) {
  const slot = String(info?.slot || "").toLowerCase();
  const subtype = String(info?.subtype || "").toLowerCase();
  const text = `${info?.id || ""} ${info?.identity || ""} ${info?.name || ""}`.toLowerCase();
  return slot === "ranged" || subtype === "bow" || subtype === "crossbow" || text.includes("bow");
}

/**
 * Map a spell damage type to an impact sound category.
 */
const SPELL_IMPACT_MAP = {
  fire:      "spell:impact:fire",
  ice:       "spell:impact:ice",
  cold:      "spell:impact:ice",
  electric:  "spell:impact:lightning",
  lightning: "spell:impact:lightning",
  shadow:    "spell:impact:shadow",
  necrotic:  "spell:impact:shadow",
  holy:      "spell:impact:holy",
  radiant:   "spell:impact:holy",
  poison:    "spell:impact:poison",
  acid:      "spell:impact:poison",
};

export const SPELL_CAST_SOUND_EVENTS = Object.freeze([
  'spell:agony',
  'spell:bolt',
  'spell:frost',
  'spell:shadow_bolt',
  'spell:fireball',
  'spell:blizzard',
  'spell:firestorm',
  'spell:blastwave',
  'spell:heal',
  'spell:flash_heal',
  'spell:smite',
  'spell:death_volley',
  'spell:blink',
  'spell:plague_swarm',
  'spell:earthshatter',
  'spell:war_cry',
  'spell:cleave',
  'spell:rampage',
  'spell:phase_strike',
  'spell:shield_bash',
  'spell:wolf_howl',
  'spell:boar_charge',
  'spell:consecrate',
  'spell:divine_shield',
  'spell:purify',
  'spell:bloodthirst',
  'spell:verdant_ward',
  'spell:harmony_ward',
  'spell:shadow_veil',
  'spell:smoke_bomb',
  'spell:poison_blade',
  'spell:lifetap',
  'spell:acid_spit',
  'spell:web_spit',
  'spell:spider_lunge',
  'spell:entangle',
]);

export const CHANNELING_LOOP_SOUND_ID = "spell:channeling";
export const CHANNELING_LOOP_OPTIONS = Object.freeze({
  volume: 0.42,
  fadeIn: 0.12,
  fadeOut: 0.18,
  bus: "spells",
  crossfade: 0.18,
});

export const DUNGEON_LOOP_SOUND_ID = "ambient:dungeon";
export const DUNGEON_LOOP_OPTIONS = Object.freeze({
  volume: 0.22,
  fadeIn: 1.5,
  fadeOut: 1.0,
  bus: "ambient:loop",
  crossfade: 2.0,
});

export const CRAFTING_MENU_LOOP_OPTIONS = Object.freeze({
  volume: 0.26,
  fadeIn: 0.28,
  fadeOut: 0.35,
  bus: "ambient:loop",
  crossfade: 0.6,
});

export const CRAFTING_MENU_LOOP_BY_KIND = Object.freeze({
  cooking: "ambient:cooking_fire",
  alchemy: "ambient:bubbles",
  smithing: "ambient:smithy",
});

export const CRAFTING_RESULT_SOUND_BY_KIND = Object.freeze({
  cooking: "craft:cooking:result",
  alchemy: "item:pickup:potion",
  smithing: "item:pickup:weapon",
});

export const FAMILIAR_FIRE_READY_SOUND_ID = "torch:ignite";
export const FAMILIAR_FIRE_CAST_SOUND_ID = "spell:fireball";
export const FOOD_EAT_SOUND_ID = "item:consume:food";
export const PUSH_STONE_SOUND_ID = "action:move_boulder";
export const PORTAL_CREATED_SOUND_ID = "portal:created";
export const PORTAL_DESTROYED_SOUND_ID = "portal:destroyed";
export const URN_BROKEN_SOUND_ID = "urn:broken";
export const TRAP_SOUND_BY_TYPE = Object.freeze({
  snake: "trap:snake",
  spike: "trap:spike",
});
export const WEAPON_RACK_DROPPED_SOUND_ID = "rack:weapon:dropped";

export function craftingMenuLoopKey(kind) {
  return `ui:crafting:${String(kind || "")}`;
}

export function resolveCraftingResultSoundId(kind) {
  return CRAFTING_RESULT_SOUND_BY_KIND[String(kind || "")] || "item:pickup:generic";
}

/**
 * Install audio event listeners on the ECS world.
 * Call once during display setup.
 *
 * @param {{
 *   world: object,
 *   isPlayer: (id: number) => boolean,
 *   getItemInfo: (id: number) => object|null,
 *   getPlayerPosition: () => { x: number, y: number } | null,
 *   getPosition: (id: number) => { x: number, y: number } | null,
 *   getIdentity?: (id: number) => string | null,
 *   getDepth: () => number,
 *   getZoomScale?: () => number,
 *   getReferenceZoomScale?: () => number,
 * }} deps
 */
function installAudioListeners({ world, isPlayer, getItemInfo, getPlayerPosition, getPosition, getIdentity, getDepth, getZoomScale, getReferenceZoomScale }) {
  const recentSearchPulses = new Map();

  const warmupIds = [
    "item:equip:weapon",
    "item:equip:armor",
    "melee:miss",
    "melee:hit",
    "shield:blocked",
    ...WARMUP_WEAPON_FAMILIES.flatMap((family) => [
      combatSoundId(family, "equip"),
      combatSoundId(family, "unequip"),
      combatSoundId(family, "whoosh_short"),
      combatSoundId(family, "whoosh_long"),
    ]),
    ...WARMUP_SHIELD_FAMILIES.flatMap((family) => [
      combatSoundId(family, "equip"),
      combatSoundId(family, "unequip"),
      combatSoundId(family, "deflect"),
      combatSoundId(family, "whoosh_short"),
      combatSoundId(family, "whoosh_long"),
    ]),
  ];
  preload([...new Set(warmupIds.filter(Boolean).flatMap(resolveUrls))]).catch?.(() => {});

  const channelingLoopUrl = resolve(CHANNELING_LOOP_SOUND_ID)?.url;
  let channelingLoopActive = false;
  const craftingLoopUrlsByKind = new Map(Object.entries(CRAFTING_MENU_LOOP_BY_KIND)
    .map(([kind, soundId]) => [kind, resolveUrls(soundId)]));
  let activeCraftingLoopKind = "";
  const dungeonOmenState = { eventIndex: 0, lastPlayedEventIndex: -Infinity };
  const dungeonOmenEntityIds = new Set();
  const deafenedSoundAt = new Map();
  const creatureAttackSoundAt = new Map();
  const creatureAlertSoundAt = new Map();
  const kittyHappySoundAt = new Map();

  function startChannelingLoop(actor) {
    if (!channelingLoopUrl || !isPlayer(actor) || channelingLoopActive) return;
    channelingLoopActive = true;
    startLoop(channelingLoopUrl, {
      volume: CHANNELING_LOOP_OPTIONS.volume,
      fadeIn: CHANNELING_LOOP_OPTIONS.fadeIn,
      bus: CHANNELING_LOOP_OPTIONS.bus,
      crossfade: CHANNELING_LOOP_OPTIONS.crossfade,
    });
  }

  function stopChannelingLoop(actor) {
    if (!channelingLoopUrl || !channelingLoopActive) return;
    if (actor != null && !isPlayer(actor)) return;
    channelingLoopActive = false;
    stopLoop(channelingLoopUrl, { fadeOut: CHANNELING_LOOP_OPTIONS.fadeOut });
  }

  function stopCraftingMenuLoop(kind = "") {
    const key = String(kind || activeCraftingLoopKind || "");
    if (!key) return;
    stopLoopSequence(craftingMenuLoopKey(key), { fadeOut: CRAFTING_MENU_LOOP_OPTIONS.fadeOut });
    if (activeCraftingLoopKind === key) activeCraftingLoopKind = "";
  }

  function stopAllCraftingMenuLoops() {
    for (const key of Object.keys(CRAFTING_MENU_LOOP_BY_KIND)) {
      stopLoopSequence(craftingMenuLoopKey(key), { fadeOut: CRAFTING_MENU_LOOP_OPTIONS.fadeOut });
    }
    activeCraftingLoopKind = "";
  }

  function startCraftingMenuLoop(kind) {
    const key = String(kind || "");
    const urls = craftingLoopUrlsByKind.get(key) || [];
    if (urls.length <= 0) return;
    if (activeCraftingLoopKind && activeCraftingLoopKind !== key) stopAllCraftingMenuLoops();
    if (activeCraftingLoopKind === key) return;
    activeCraftingLoopKind = key;
    startLoopSequence(craftingMenuLoopKey(key), urls, {
      volume: CRAFTING_MENU_LOOP_OPTIONS.volume,
      fadeIn: CRAFTING_MENU_LOOP_OPTIONS.fadeIn,
      bus: CRAFTING_MENU_LOOP_OPTIONS.bus,
      crossfade: CRAFTING_MENU_LOOP_OPTIONS.crossfade,
    });
  }

  function playCraftingResult(kind, itemId, pos) {
    sfxAt(resolveCraftingResultSoundId(kind), pos || null, pp(), { priority: 1 }, zg());
  }

  /** Shorthand — current player pos for spatial calcs. */
  function pp() { return getPlayerPosition(); }
  function zg() {
    if (typeof getZoomScale !== "function") return 1;
    const reference = typeof getReferenceZoomScale === "function" ? getReferenceZoomScale() : getZoomScale();
    return computeZoomAudibilityGain(getZoomScale(), reference);
  }

  world.install(createAudioWiringExtension({
    getPosition,
    getPlayerPosition: pp,
    getZoomGain: zg,
    playAt: sfxAt,
  }));

  function maybePlayDungeonOmen(payload) {
    const eventEntityId = Number(payload?.hazardId || payload?.cloudId || 0) | 0;
    if (eventEntityId > 0) {
      if (dungeonOmenEntityIds.has(eventEntityId)) return;
      dungeonOmenEntityIds.add(eventEntityId);
      if (dungeonOmenEntityIds.size > 128) dungeonOmenEntityIds.clear();
    }
    if (shouldPlayDungeonOmen(payload, dungeonOmenState, getDepth())) {
      sfxAt("ambient:omen", payload.at, pp(), { priority: 0, volume: 0.55 }, zg());
    }
  }

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("ui:openCookingFire", () => startCraftingMenuLoop("cooking"));
    globalThis.addEventListener("ui:closeCookingFire", () => stopCraftingMenuLoop("cooking"));
    globalThis.addEventListener("ui:openAlchemyBench", () => startCraftingMenuLoop("alchemy"));
    globalThis.addEventListener("ui:closeAlchemyBench", () => stopCraftingMenuLoop("alchemy"));
    globalThis.addEventListener("ui:openAnvil", () => startCraftingMenuLoop("smithing"));
    globalThis.addEventListener("ui:closeAnvil", () => stopCraftingMenuLoop("smithing"));
  }

  function playDeafenedForTarget(target, opts = null) {
    const id = Number(target || 0) | 0;
    if (!isPlayer(id)) return;
    const now = audioNowMs();
    const last = deafenedSoundAt.get(id) || -Infinity;
    if (now - last < DEAFENED_SOUND_COOLDOWN_MS) return;
    deafenedSoundAt.set(id, now);
    sfx("status:deafened", { priority: 1, ...(opts || {}) });
  }

  function playWeaponWhoosh({ weaponId, attacker, at, offhand }) {
    const info = combatInfoFor(getItemInfo, weaponId);
    playCombatLayers(planWeaponWhoosh({ itemInfo: info, offhand }), at || (attacker != null ? getPosition(attacker) : null));
  }

  function combatInfoForEvent(itemId, weaponFamily = "") {
    const info = combatInfoFor(getItemInfo, itemId);
    return weaponFamily ? { ...(info || {}), weaponFamily } : info;
  }

  function playThrownWhoosh(payload = {}) {
    const itemInfo = combatInfoForEvent(payload?.itemId, payload?.weaponFamily);
    const pos = payload?.from || (payload?.actor != null ? getPosition(payload.actor) : null);
    if (resolveCombatFamily(itemInfo)) {
      playCombatLayers(planWeaponWhoosh({ itemInfo, fallbackFamily: null }), pos);
      return;
    }
    sfxAt(THROW_SOUND_ID, pos, pp(), null, zg());
  }

  function playCombatSoftHandling(itemId, at) {
    const info = combatInfoFor(getItemInfo, itemId);
    const layers = planWeaponDrop({ itemInfo: info });
    if (layers.length <= 0) return false;
    playCombatLayers(layers, at);
    return true;
  }

  function playWeaponImpact(payload) {
    const info = combatInfoForEvent(payload?.weaponId, payload?.weaponFamily);
    const pos = payload?.at || (payload?.target != null ? getPosition(payload.target) : null);
    playCombatLayers(planWeaponImpact({
      itemInfo: info,
      type: payload?.type,
      amount: payload?.amount,
      critical: payload?.critical,
      targetKind: payload?.targetKind,
      sizeClass: payload?.sizeClass,
    }), pos);
  }

  function playWeaponDeflect({ weaponId, at, entityId, hard = true, volume = 0.9 }) {
    const info = combatInfoFor(getItemInfo, weaponId);
    playCombatLayers(planWeaponDeflect({ itemInfo: info, hard, volume }), at || (entityId != null ? getPosition(entityId) : null));
  }

  function playShieldBlock({ shieldId, id, at, broken }) {
    const info = combatInfoFor(getItemInfo, shieldId);
    playCombatLayers(planShieldBlock({ shieldInfo: info, broken }), at || (id != null ? getPosition(id) : null));
  }

  function playWeaponEquip(itemId, action) {
    const info = combatInfoFor(getItemInfo, itemId);
    const layers = planWeaponReady({ itemInfo: info, action });
    if (layers.length > 0) {
      playCombatLayers(layers, null, { centered: true, bus: "items" });
      return true;
    }
    return false;
  }

  function playCombatLayers(layers, pos, defaults = null) {
    for (const part of layers || []) {
      const opts = {
        priority: part.priority ?? 1,
        volume: part.volume,
        rate: part.rate,
        bus: defaults?.bus,
      };
      if (defaults?.centered) {
        sfxAtDelay(part.id, null, null, opts, 1, part.delayMs || 0);
      } else {
        sfxAtDelay(part.id, pos, pp(), opts, zg(), part.delayMs || 0);
      }
    }
  }

  // ── Combat ────────────────────────────────────────────────

  world.on('combat:melee:attack', ({ attacker, weaponId, weaponFamily, at, offhand }) => {
    const info = combatInfoForEvent(weaponId, weaponFamily);
    playCombatLayers(planWeaponWhoosh({ itemInfo: info, offhand, fallbackFamily: null }), at || (attacker != null ? getPosition(attacker) : null));
  });

  world.on('combat:melee:miss', ({ attacker, weaponId, weaponFamily, at, offhand }) => {
    const info = combatInfoForEvent(weaponId, weaponFamily);
    playCombatLayers(planWeaponWhoosh({ itemInfo: info, offhand, fallbackFamily: null }), at || (attacker != null ? getPosition(attacker) : null));
  });

  world.on('combat:fumble', ({ attacker, weaponId, at }) => {
    playWeaponDeflect({ weaponId, at, entityId: attacker, hard: false, volume: 0.72 });
  });

  world.on('combat:dodge', ({ attacker, weaponId, weaponFamily, at, offhand }) => {
    const info = combatInfoForEvent(weaponId, weaponFamily);
    playCombatLayers(planWeaponWhoosh({ itemInfo: info, offhand, fallbackFamily: null }), at || (attacker != null ? getPosition(attacker) : null));
  });

  world.on('damaged', ({ cause, critical, type, at, target, source, weaponId, weaponFamily, amount, targetKind, sizeClass }) => {
    const pos = at || (target != null ? getPosition(target) : null);
    // Creature attack vocalizations (roars, squeaks, etc.)
    if ((cause === 'melee' || cause === 'offhand') && source > 0 && typeof getIdentity === "function") {
      const srcIdentity = String(getIdentity(source) || "");
      const creatureAttackId = CREATURE_ATTACK_SOUNDS[srcIdentity];
      if (creatureAttackId) {
        const now = audioNowMs();
        const last = creatureAttackSoundAt.get(creatureAttackId) || -Infinity;
        if (now - last >= CREATURE_ATTACK_SOUND_COOLDOWN_MS) {
          creatureAttackSoundAt.set(creatureAttackId, now);
          const srcPos = source != null ? getPosition(source) : null;
          sfxAt(creatureAttackId, srcPos, pp(), { priority: 0 }, zg());
        }
      }
    }
    // Impact sounds on hit
    if (cause === 'melee' || cause === 'offhand') {
      playWeaponImpact({ cause, critical, type, at: pos, target, source, weaponId, weaponFamily, amount, targetKind, sizeClass });
    }
    // Skip impact sounds for DOT ticks and direct spell casts (no separate impact phase)
    const noImpactKeys = new Set(['agony', 'spell:agony', 'poison', 'bleed', 'burn', 'shock', 'swarm', 'frost', 'spell:smite']);
    if (isSpellLikeDamageCause(cause) && !noImpactKeys.has(cause)) {
      const impactId = SPELL_IMPACT_MAP[type] || "spell:impact:physical";
      sfxAt(impactId, pos, pp(), null, zg());
    }
    // Electrocution sound for any electric/lightning hit, including grid bugs.
    if (shouldPlayElectrocutionSound({ type })) {
      sfxAt("status:electrocuted", pos, pp(), { priority: 1 }, zg());
    }
  });

  world.on('damaged', ({ target, hpBefore, hpAfter, maxHp }) => {
    if (!isPlayer(target)) return;
    const cap = Number(maxHp || 0);
    if (!(cap > 0)) return;
    const beforeRatio = Number(hpBefore || 0) / cap;
    const after = Number(hpAfter || 0);
    const afterRatio = after / cap;
    if (after > 0 && beforeRatio > PLAYER_NEAR_DEATH_RATIO && afterRatio <= PLAYER_NEAR_DEATH_RATIO) {
      sfx("player:near_death", { priority: 1 });
    }
  });

  world.on('hit', (ctx) => {
    if (ctx.missed) {
      const pos = ctx.at || (ctx.target != null ? getPosition(ctx.target) : null);
      playWeaponWhoosh({
        weaponId: ctx.weaponId || 0,
        attacker: ctx.attacker,
        at: pos,
        offhand: !!ctx.offhand,
      });
    }
  });

  world.on('combat:parry', ({ weaponId, attackerWeaponId, at, defender, attacker }) => {
    playWeaponDeflect({ weaponId, at, entityId: defender, hard: true, volume: 0.95 });
    if (attackerWeaponId) {
      sfxAtDelay(
        combatSoundId(resolveCombatFamily(combatInfoFor(getItemInfo, attackerWeaponId)) || "sword_small", "deflect"),
        at || (attacker != null ? getPosition(attacker) : null),
        pp(),
        { priority: 0, volume: 0.42 },
        zg(),
        24,
      );
    }
  });

  world.on('shield:guarded', ({ id, at, shieldId, broken }) => {
    playShieldBlock({ shieldId, id, at, broken });
  });

  world.on('proc:shocked', ({ target, at }) => {
    const pos = at || (target != null ? getPosition(target) : null);
    sfxAt("status:electrocuted", pos, pp(), { priority: 1 }, zg());
  });

  world.on('creature:vocalize', ({ identity, at }) => {
    const soundId = CREATURE_VOCALIZE_SOUNDS[identity];
    if (soundId) {
      sfxAt(soundId, at, pp(), null, zg());
    }
  });

  // Pet vocalization with cooldown gating (called from petBehaviorSystem)
  world.on('pet:vocalize', ({ id, identity, at }) => {
    const petId = Number(id || 0) | 0;
    const cooldown = _petVocalizationCooldowns.get(petId) ?? 0;
    if (cooldown > 0) {
      _petVocalizationCooldowns.set(petId, cooldown - 1);
      return; // Skip this vocalization
    }

    const soundId = PET_VOCALIZE_SOUNDS[identity] || "creature:pet:meow";
    sfxAt(soundId, at, pp(), null, zg());
    _petVocalizationCooldowns.set(petId, 60); // 60-turn cooldown between vocalizations
  });

  function playHappyKitty(petId, at) {
    const id = Number(petId || 0) | 0;
    if (typeof getIdentity !== "function" || String(getIdentity(id) || "") !== "kitty") return;
    if (!shouldPlayKittyHappySound(id, kittyHappySoundAt, audioNowMs())) return;
    sfxAt("creature:kitty:happy", at || getPosition(id), pp(), null, zg());
  }

  world.on('pet:corpse-munch', ({ petId }) => {
    playHappyKitty(petId, petId != null ? getPosition(petId) : null);
  });

  world.on('healed', ({ target, id, hpAfter, maxHp }) => {
    if (!(Number(maxHp) > 0) || Number(hpAfter) < Number(maxHp)) return;
    const petId = Number(target || id || 0) | 0;
    playHappyKitty(petId, getPosition(petId));
  });

  world.on('wisp:harvest', ({ x, y, wispX, wispY }) => {
    sfxAt("spirit:collect", {
      x: Number.isFinite(Number(wispX)) ? Number(wispX) : Number(x),
      y: Number.isFinite(Number(wispY)) ? Number(wispY) : Number(y),
    }, pp(), { priority: 1 }, zg());
  });

  world.on('ranged:shot', ({ attacker, target }) => {
    const pos = attacker != null ? getPosition(attacker) : null;
    sfxAt("ranged:shot", pos, pp(), null, zg());
  });

  world.on('hazard:spawned', ({ cause, at }) => {
    if (String(cause || '').startsWith('bomb_arrows:blast')) {
      sfxAt('ranged:bomb-impact', at, pp(), { priority: 1 }, zg());
    }
  });

  world.on('died', ({ id, critical, amount, weaponId, cause, damageType, sizeClass }) => {
    const pos = getPosition(id);
    if (isPlayer(id)) {
      stopChannelingLoop(id);
      const heavyDeath = critical || (Number(amount) >= 15);
      const deathId = heavyDeath ? "player:death:heavy" : "player:death";
      sfx(deathId); // player death is always full volume center
    } else {
      const creatureId = typeof getIdentity === "function" ? String(getIdentity(id) || "") : "";
      const deathSoundId = DEATH_SOUND_BY_IDENTITY[creatureId] || "death";
      sfxAt(deathSoundId, pos, pp(), null, zg());
      if (cause === "melee" || cause === "offhand") {
        const info = combatInfoFor(getItemInfo, weaponId);
        playCombatLayers(planMeleeDeath({
          itemInfo: info,
          damageType,
          amount,
          critical,
          sizeClass,
        }), pos);
      }
    }
  });

  // ── Items (sound varies by item type) ─────────────────────

  world.on('item:pickup', ({ itemId, itemType, itemX, itemY }) => {
    const pos = (itemX != null && itemY != null) ? { x: itemX, y: itemY } : null;
    if (playCombatSoftHandling(itemId, pos)) return;
    const cat = String(itemType || "").toLowerCase() === "currency"
      ? "gold"
      : itemCategory(getItemInfo, itemId);
    sfxAt(`item:pickup:${cat}`, pos, pp(), null, zg());
  });

  world.on('spirit:spellBoost', ({ targetId }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("magic:spirit-surge", pos, pp(), { priority: 1 }, zg());
  });

  world.on('item:dropped', ({ itemId, at }) => {
    if (playCombatSoftHandling(itemId, at)) return;
    const cat = itemCategory(getItemInfo, itemId);
    let dropId;
    if (cat === "weapon") {
      const material = String(getItemInfo(itemId)?.material || "").toLowerCase();
      if (material === "bone") {
        dropId = "item:drop:bone";
      } else {
        const metallic = material === "iron" || material === "steel" || material === "silver" || material === "gold" || material === "copper" || material === "bronze";
        dropId = metallic ? "item:drop:weapon:metal" : "item:drop:weapon";
      }
    } else if (cat === "armor" || cat === "potion") {
      dropId = `item:drop:${cat}`;
    } else if (cat === "gem") {
      const info = getItemInfo(itemId);
      const mat = info?.material;
      const detune = gemValueToDropDetuneCents(info?.value);
      dropId = mat && mat !== "gemstone" ? `item:drop:gem:${mat}` : "item:drop:gem";
      if (!resolve(dropId)) dropId = "item:drop:gem";
      sfxAt(dropId, at, pp(), { detune }, zg());
      return;
    } else {
      dropId = "item:drop:generic";
    }
    sfxAt(dropId, at, pp(), null, zg());
  });

  world.on('item:thrown', (payload) => {
    playThrownWhoosh(payload);
  });

  world.on('potion:splash', ({ at }) => {
    sfxAt("item:impact:potion", at, pp(), null, zg());
  });

  world.on('potion:splash:dud', ({ at }) => {
    sfxAt("item:impact:potion", at, pp(), null, zg());
  });

  world.on('potion:oil_splash', ({ at }) => {
    sfxAt("item:impact:potion", at, pp(), null, zg());
  });

  world.on('item:equipped', ({ itemId }) => {
    const info = combatInfoFor(getItemInfo, itemId);
    if (isRangedEquipInfo(info)) {
      sfx("item:equip:ranged");
      return;
    }
    if (isShieldCombatFamily(info) && playWeaponEquip(itemId, "equip")) return;
    const cat = itemCategory(getItemInfo, itemId);
    if (cat === "weapon" || cat === "armor") {
      if (playWeaponEquip(itemId, "equip")) return;
      sfx(`item:equip:${cat}`);
      return;
    }
    sfx("item:equip:generic"); // equip is always the player — center, full vol
  });

  world.on('item:unequipped', ({ itemId }) => {
    const info = combatInfoFor(getItemInfo, itemId);
    if (isShieldCombatFamily(info) && playWeaponEquip(itemId, "unequip")) return;
    const cat = itemCategory(getItemInfo, itemId);
    if (cat === "weapon" || cat === "armor") {
      playWeaponEquip(itemId, "unequip");
      return;
    }
    sfx("item:equip:generic", { priority: 1, volume: 0.75 });
  });

  world.on('gem:socketed', ({ actor, weaponId }) => {
    if (!isPlayer(actor)) return;
    const pos = weaponId != null ? getPosition(weaponId) : (actor != null ? getPosition(actor) : null);
    sfxAt("item:socket:gem", pos, pp(), { priority: 1 }, zg());
  });

  world.on('hunger:ate', ({ actor }) => {
    if (!isPlayer(actor)) return;
    const pos = actor != null ? getPosition(actor) : null;
    sfxAt(FOOD_EAT_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on('cooking:cooked', ({ actor, targetId, itemId }) => {
    if (!isPlayer(actor)) return;
    const pos = targetId != null ? getPosition(targetId) : null;
    playCraftingResult("cooking", itemId, pos);
  });

  world.on('alchemy:crafted', ({ actor, targetId, itemIds }) => {
    if (!isPlayer(actor)) return;
    const firstItemId = Array.isArray(itemIds) ? itemIds[0] : 0;
    const pos = targetId != null ? getPosition(targetId) : null;
    playCraftingResult("alchemy", firstItemId, pos);
  });

  world.on('smithy:forged', ({ actor, targetId, itemId }) => {
    if (!isPlayer(actor)) return;
    const pos = targetId != null ? getPosition(targetId) : null;
    playCraftingResult("smithing", itemId, pos);
  });

  world.on('chest:open', ({ targetId }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("chest:open", pos, pp(), null, zg());
  });

  world.on('chest:burst', ({ targetId, origin }) => {
    const pos = origin || (targetId != null ? getPosition(targetId) : null);
    sfxAt("chest:open", pos, pp(), { priority: 1 }, zg());
  });

  world.on('chest:empty', ({ targetId }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("chest:open", pos, pp(), { priority: 1 }, zg());
  });

  world.on(UrnInteractionResolved, ({ targetId, at }) => {
    const pos = at || (targetId != null ? getPosition(targetId) : null);
    sfxAt(URN_BROKEN_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on('harvest:picked', ({ itemId, targetId, kind }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    if (isPlantHarvestKind(kind)) {
      sfxAt(HARVEST_PLANT_SOUND_ID, pos, pp(), null, zg());
    }
    if (!itemId) return;
    const cat = itemCategory(getItemInfo, itemId);
    if (cat !== "gem") return;
    const info = getItemInfo(itemId);
    const mat = info?.material;
    const detune = gemValueToDropDetuneCents(info?.value);
    let dropId = mat && mat !== "gemstone" ? `item:drop:gem:${mat}` : "item:drop:gem";
    if (!resolve(dropId)) dropId = "item:drop:gem";
    sfxAt(dropId, pos, pp(), { detune }, zg());
  });

  world.on('rack:looted', ({ targetId }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt(WEAPON_RACK_DROPPED_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on('search:pulse', ({ actorId, at, radius }) => {
    const origin = at && Number.isFinite(Number(at.x)) && Number.isFinite(Number(at.y))
      ? { x: Number(at.x), y: Number(at.y) }
      : (actorId != null ? getPosition(actorId) : null);
    if (actorId != null && origin) {
      recentSearchPulses.set(actorId, { at: origin, radius: Math.max(1, Number(radius) || 1) });
    }
    sfxAt(SEARCH_PING_SOUND_ID, origin, pp(), { priority: 1 }, zg());
  });

  world.on('search:revealed', ({ actorId, kind, at, entityId }) => {
    const revealKind = String(kind || "");
    if (revealKind !== "secret_door" && revealKind !== "trap") return;
    const pos = at || (entityId != null ? getPosition(entityId) : null);
    const pulse = actorId != null ? recentSearchPulses.get(actorId) : null;
    const delayMs = pulse ? computeSearchRevealDelayMs(pulse.at, pos, pulse.radius) : 120;
    sfxAtDelay(SEARCH_FOUND_SOUND_ID, pos, pp(), { priority: 1 }, zg(), delayMs);
  });

  // ── Environment ───────────────────────────────────────────

  world.on('stair:traverse', ({ direction }) => {
    sfx(direction === 'up' ? "stair:ascend" : "stair:descend");
  });

  world.on(RiftOpened, ({ x, y, portalId }) => {
    const pos = Number.isFinite(Number(x)) && Number.isFinite(Number(y))
      ? { x: Number(x) | 0, y: Number(y) | 0 }
      : (portalId != null ? getPosition(portalId) : null);
    sfxAt(PORTAL_CREATED_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on(RiftClosed, ({ x, y, portalId }) => {
    const pos = x != null && y != null && Number.isFinite(Number(x)) && Number.isFinite(Number(y))
      ? { x: Number(x) | 0, y: Number(y) | 0 }
      : (portalId != null ? getPosition(portalId) : null);
    sfxAt(PORTAL_DESTROYED_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on('portal:spawned', ({ at, portalId }) => {
    const pos = at || (portalId != null ? getPosition(portalId) : null);
    sfxAt(PORTAL_CREATED_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on('shrine:communion', () => {
    sfx("deity:omen");
  });

  // deity:omen is intentionally silent for now. Wrath/anger can emit
  // frequently after severe offenses; add a distinct rate-limited angry-god
  // cue before restoring audio here.

  world.on('hazard:spawned', (payload) => {
    maybePlayDungeonOmen(payload);
  });

  world.on('plasmaCloud:spawned', (payload) => {
    maybePlayDungeonOmen({ kind: "plasma", medium: "air", ...(payload || {}) });
  });

  world.on('bell:rung', ({ targetId }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("church:bell", pos, pp(), { priority: 1 }, zg());
  });

  world.on('boneChime:rung', ({ targetId, at }) => {
    const pos = at || (targetId != null ? getPosition(targetId) : null);
    sfxAt(BONE_CHIME_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on(FountainDrinkResolved, ({ targetId, effect }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("fountain:sip", pos, pp(), null, zg());
    if (effect === "gush") sfxAt("water:magic", pos, pp(), { priority: 1 }, zg());
    if (effect === "teleport") sfx("teleported", { priority: 1 });
  });

  world.on(FountainDipResolved, ({ targetId, effect }) => {
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("fountain:sip", pos, pp(), null, zg());
  });

  world.on('hydraulics:floodgate', ({ targetId, active, tilesChanged }) => {
    if (!active || !(Number(tilesChanged || 0) > 0)) return;
    const pos = targetId != null ? getPosition(targetId) : null;
    sfxAt("water:magic", pos, pp(), { priority: 1 }, zg());
  });

  world.on('trap:triggered', ({ trapId, type }) => {
    const soundId = TRAP_SOUND_BY_TYPE[String(type || "").toLowerCase()];
    if (!soundId) return;
    const pos = trapId != null ? getPosition(trapId) : null;
    sfxAt(soundId, pos, pp(), { priority: 1 }, zg());
  });

  world.on('entity:pushed', ({ target, to }) => {
    const pos = to || (target != null ? getPosition(target) : null);
    sfxAt(PUSH_STONE_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  world.on('tile:dug', ({ x, y }) => {
    sfxAt(PUSH_STONE_SOUND_ID, { x, y }, pp(), { priority: 1 }, zg());
  });

  world.on('status', (payload) => {
    const { id, kind, at } = payload || {};
    if (kind === 'alert') {
      if (!(id > 0) || typeof getIdentity !== "function") return;
      const identity = String(getIdentity(id) || "");
      const soundId = ALERT_SOUND_BY_IDENTITY[identity];
      if (!soundId) return;
      if (!shouldPlayCreatureAlertSound(soundId, creatureAlertSoundAt, audioNowMs())) return;
      const pos = at || getPosition(id);
      sfxAt(soundId, pos, pp(), { priority: 1 }, zg());
      return;
    }

    const soundId = resolveStatusSoundId(payload);
    if (!soundId) return;
    if (soundId === "status:deafened") {
      playDeafenedForTarget(id);
      return;
    }
    if (isPlayer(id)) {
      sfx(soundId, { priority: 1 });
      return;
    }
    const pos = at || (id != null ? getPosition(id) : null);
    sfxAt(soundId, pos, pp(), { priority: 1 }, zg());
  });

  world.on('status:deafened', ({ target, severity }) => {
    if (isPlayer(target) && severity >= 1) {
      playDeafenedForTarget(target, { volume: 0.8 });
    }
  });

  world.on('status:slimed', ({ target, severity }) => {
    if (isPlayer(target) && severity > 0) {
      sfx("status:slimed", { volume: 0.7 });
    }
  });

  world.on('status:frozen', ({ target, at }) => {
    const pos = at || (target != null ? getPosition(target) : null);
    sfxAt("status:frozen", pos, pp(), null, zg());
  });

  const onTeleported = (payload) => {
    const { id, from, to } = payload || {};
    if (!shouldPlayTeleportSound(payload, isPlayer)) return;
    const pos = to || from || (id != null ? getPosition(id) : null);
    sfxAt("teleported", pos, pp(), { priority: 1 }, zg());
  };
  world.on(Teleported, onTeleported);
  world.on('teleported', onTeleported);

  world.on('pet:teleported', ({ petId, id, from, to }) => {
    // Pet catch-up teleports are housekeeping, not a player-facing teleport cast.
  });

  world.on('summon:teleported', ({ id, from, to }) => {
    // Summon catch-up/materialization teleports are intentionally silent.
  });

  // ── Spells (cast / launch sounds) ─────────────────────────
  // Each spell gets its own sound on cast. Impact sounds fire
  // separately via the 'damaged' handler above when the spell
  // actually hits after travel time.

  world.on('channeling:start', ({ actor }) => {
    startChannelingLoop(actor);
  });

  world.on('channeling:complete', ({ actor }) => {
    stopChannelingLoop(actor);
  });

  world.on('channeling:cancelled', ({ actor }) => {
    stopChannelingLoop(actor);
  });

  for (const ev of SPELL_CAST_SOUND_EVENTS) {
    world.on(ev, (payload) => {
      // Spells carry origin info in various fields
      const pos = payload?.at || payload?.origin || payload?.from || null;
      sfxAt(ev, pos, pp(), null, zg());
    });
  }

  world.on(FrostNovaCast, (event) => {
    sfxAt("spell:frost_nova", event.origin, pp(), null, zg());
  });

  // NOTE: this has been silenced since spell:blink has a bespoke sound
  // world.on('spell:blink', (payload) => {
  //   sfxAt("teleported", payload?.to || payload?.at || payload?.from || null, pp(), { priority: 1 }, zg());
  // });

  // NOTE: this has been silenced since adding a bespoke sound
  // world.on('spell:phase_strike', (payload) => {
  //   sfxAt("teleported", payload?.to || payload?.at || payload?.from || null, pp(), { priority: 1 }, zg());
  // });

  world.on('familiar:ready', ({ id }) => {
    const pos = id != null ? getPosition(id) : null;
    sfxAt(FAMILIAR_FIRE_READY_SOUND_ID, pos, pp(), { priority: 1, volume: 0.65 }, zg());
  });

  world.on('familiar:fireball', (payload) => {
    sfxAt(FAMILIAR_FIRE_CAST_SOUND_ID, payload?.from || payload?.at || null, pp(), { priority: 1 }, zg());
  });

  // Meteor should land one impact sound at the resolved strike point,
  // not a cast sound and not one sound per damaged target.
  world.on('spell:meteor', (payload) => {
    const pos = payload?.origin || payload?.at || null;
    sfxAt("spell:impact:meteor", pos, pp(), { priority: 1 }, zg());
  });

  world.on('scroll:taming:vfx', ({ x, y }) => {
    sfxAt(TAMING_SUCCESS_SOUND_ID, { x, y }, pp(), { priority: 1 }, zg());
  });

  world.on('scroll:genocide:success', ({ actor, at }) => {
    const pos = at || (actor != null ? getPosition(actor) : null);
    sfxAt(GENOCIDE_SUCCESS_SOUND_ID, pos, pp(), { priority: 1 }, zg());
  });

  // ── Weather ───────────────────────────────────────────────

  const rainUrl = resolve("rain:loop")?.url;

  world.on('weather:changed', ({ weather }) => {
    if ((weather === 'rain' || weather === 'heavy_rain') && rainUrl) {
      const vol = weather === 'heavy_rain' ? 0.34 : 0.2;
      startLoop(rainUrl, { volume: vol, fadeIn: 2.0, bus: "ambient:loop" });
    } else {
      if (rainUrl) stopLoop(rainUrl, { fadeOut: 3.0 });
    }
  });

  world.on('weather:lightning', ({ x, y }) => {
    const playerPos = pp();
    const spatial = spatialize({ x, y }, playerPos);
    const thunderId = spatial.volume <= 0.45 ? "thunder:distant" : "thunder";
    sfxAt(thunderId, { x, y }, playerPos, null, zg());
  });

  // Floor transitions — stop rain, adjust reverb for environment
  const dungeonLoopUrls = resolveUrls(DUNGEON_LOOP_SOUND_ID);
  let dungeonActive = false;

  world.on('dungeon:transitioned', () => {
    stopChannelingLoop(null);

    if (rainUrl) stopLoop(rainUrl, { fadeOut: 1.0 });

    // Reverb: overworld (depth 0) = dry/open air, dungeon = stone room reverb
    // Deeper floors get slightly more reverb (tighter stone corridors)
    const depth = getDepth();
    if (depth === 0) {
      setReverbMix(0.05);  // outdoors — barely any
      if (dungeonActive) {
        stopLoopSequence(DUNGEON_LOOP_SOUND_ID, { fadeOut: DUNGEON_LOOP_OPTIONS.fadeOut });
        dungeonActive = false;
      }
    } else {
      setReverbMix(Math.min(0.45, 0.15 + depth * 0.05));  // 0.20 at d1, 0.45 cap
      if (dungeonLoopUrls.length > 0 && !dungeonActive) {
        startLoopSequence(DUNGEON_LOOP_SOUND_ID, dungeonLoopUrls, {
          volume: DUNGEON_LOOP_OPTIONS.volume,
          fadeIn: DUNGEON_LOOP_OPTIONS.fadeIn,
          bus: DUNGEON_LOOP_OPTIONS.bus,
          crossfade: DUNGEON_LOOP_OPTIONS.crossfade,
        });
        dungeonActive = true;
      }
    }
  });

  // ── UI ────────────────────────────────────────────────────

  world.on('spell:learned', () => {
    sfx("level:up"); // UI sounds are always center, full vol
  });

  world.on('quest:completed', () => {
    sfx("quest:completed"); // One-shot celebration sound
  });

  world.on('hazard:ignited', ({ at }) => {
    const pos = at || null;
    sfxAt("torch:ignite", pos, pp(), null, zg());
  });

  if (typeof addEventListener === "function") {
    addEventListener("ui:openShop", () => {
      sfx("shop:enter"); // One-time accepted entry chime
    });
  }

  // Generic audio event — play any registered sound by key
  world.on('audio:play', (payload) => {
    const key = resolveAudioPlayKey(payload);
    const x = Number(payload?.x ?? payload?.at?.x);
    const y = Number(payload?.y ?? payload?.at?.y);
    if (!key) return;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sfxAt(key, { x, y }, pp(), null, zg());
    } else {
      sfx(key);
    }
  });
}

const AUDIO_LISTENERS_KEY = Symbol.for("jshack:display:audioListeners");

export function installAudioWiring(deps) {
  const { world } = deps;
  if (!world || typeof world.install !== "function") return;
  world.install(defineExtension("jshack:display:audioListeners", (installedWorld) => {
    installAudioListeners({ ...deps, world: installedWorld });
  }, { key: AUDIO_LISTENERS_KEY }));
}
