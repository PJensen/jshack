// bridge/schema/worldView.js
// Build a minimal, stable WorldView DTO for display.

import { Position } from "../../rules/components/Position.js";
import { Player } from "../../rules/components/Player.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { DoorState } from "../../rules/components/DoorState.js";
import { SecretDoor } from "../../rules/components/SecretDoor.js";
import { Collider } from "../../rules/components/Collider.js";
import { Status } from "../../rules/components/Status.js";
import { Equipment } from "../../rules/components/Equipment.js";
import { ItemInfo } from "../../rules/components/ItemInfo.js";
import { ObjectState } from "../../rules/components/ObjectState.js";
import { getTile, forEachTileInRect, forEachLoadedTile, isRoofed, roofedVersion } from '../../rules/environment/dungeon/tileMap.js';
import { TILE_DOOR, TILE_FLOOR, TILE_STAIR_DOWN, TILE_WALL } from "../../rules/environment/dungeon/constants.js";
import { buildBlocksVisionMap, blockedCallback } from '../../rules/utils/vision.js';
import { updateFOV, isVisible, isExplored } from '../../rules/environment/dungeon/exploredMap.js';
import { forEachInRect, ensureSpatialIndex } from '../../rules/utils/spatialIndex.js';
import { Engraving } from '../../rules/components/Engraving.js';
import { PlasmaCloud } from "../../rules/components/PlasmaCloud.js";
import { HazardArea } from "../../rules/components/HazardArea.js";
import { Trap } from "../../rules/components/Trap.js";
import { Vitality } from '../../rules/components/Vitality.js';
import { Faction } from '../../rules/components/Faction.js';
import { Pet } from '../../rules/components/Pet.js';
import { PetState } from '../../rules/components/PetState.js';
import { areFactionsHostile } from '../../rules/utils/factionHostility.js';
import { effectiveMaxHp } from '../../rules/utils/passiveBonuses.js';
import { getMonsterTags, getMonster } from '../../rules/data/monsters.js';
import { Flying } from '../../rules/components/Flying.js';
import { hasOverworldAerialLOS } from '../../rules/utils/flyingEligibility.js';
import { DungeonState } from "../../rules/components/DungeonState.js";
import { DungeonEntrance } from "../../rules/components/DungeonEntrance.js";
import { TURNS_PER_DAY, PHASE_BOUNDS, DAYS_PER_MONTH, getMoonPhase } from "../../rules/data/calendar.js";
import { QuestBindings } from "../../rules/components/QuestBindings.js";
import { QuestState } from "../../rules/components/QuestState.js";
import { WeatherState } from "../../rules/components/WeatherState.js";
import { Burned } from "../../rules/components/Burned.js";
import { getDestroyedTileLedger } from "../../rules/utils/destroyedTiles.js";
import { getEffectiveVisionRange } from "../../rules/utils/blind.js";
import { ActiveEffects } from "../../rules/components/ActiveEffects.js";
import { DistrictProfile } from "../../rules/components/DistrictProfile.js";
import { EntranceProfile } from "../../rules/components/EntranceProfile.js";
import { GroundStackOrder } from "../../rules/components/GroundStackOrder.js";
import { Facing } from "../../rules/components/Facing.js";
import { AggroState } from "../../rules/components/AggroState.js";
import { FountainState } from "../../rules/components/FountainState.js";
import { AltarOfferingState } from "../../rules/components/AltarOfferingState.js";
import { isAltarOfferingActive } from "../../rules/utils/altarOfferingState.js";
import { AudioEmitter } from "../../rules/components/AudioEmitter.js";
import { TownfolkJob, TOWNFOLK_ROLES, TOWNFOLK_STATES } from "../../rules/components/TownfolkJob.js";
import { LightEmitter } from "../../rules/components/LightEmitter.js";
import { HarvestNode } from "../../rules/components/HarvestNode.js";
import { canonicalStatusKey } from "../../rules/utils/effectSemantics.js";
import { isAsleep, SLEEP_DISPLAY_TAG } from "../../rules/utils/sleep.js";
import { listProcPackages } from "../../rules/data/procPackages.js";
import {
	getEntityFovConeDegrees,
	getNormalizedEntityFacing,
	isPointInFacingCone,
	FACING_CONE_GRID_BIAS_DEG,
} from "../../rules/utils/facing.js";
import { readPlayerPerceptionState } from "../../rules/utils/perceptionState.js";
import { statusStrength } from "../../rules/utils/statusFacade.js";
import { chebyshevDistance, hasMindForEsp, isFixedDecorationEntity, isPerceptionMonster } from "../../rules/utils/perceptionChannels.js";
import { PERCEPTION_TUNING } from "../../rules/environment/dungeon/perceptionTuning.js";
import { BaseStats } from "../../rules/components/BaseStats.js";
import { Physiology } from "../../rules/components/Physiology.js";
import { resolveEquippedWeaponVfx } from "./weaponVfxResolver.js";
import { getMaterialIntrinsic } from '../../rules/data/materials.js';
import { Material } from '../../rules/components/Material.js';
import { getGem } from '../../rules/data/gems.js';
import {
	clearPerceptionMemory,
	listPerceptionKinds,
	projectPerceptionContact,
	rememberPerceptionContact,
} from "../../rules/environment/dungeon/perceptionMemory.js";

// Reuse view/record objects across frames to reduce allocations/GC churn.
/** @typedef {{ id:number, kind:string, pos:{x:number,y:number}, tags:string[], layer:number, hp:number, maxHp:number, isPet:boolean, isNpc?:boolean, displayName?:string, showHealthBar:boolean, showNameLabel?:boolean, facing:{dx:number,dy:number}|null, aggroLevel:string, aggroTargetId:number, aggroTargetReason:string, threatState:string, targetLocked:boolean, weaponVfx:any[]|null, itemScale:number, rotation:number, visualOff:{dx:number,dy:number}, entranceBadge?:{level:number,floors:number,color:string} }} EntityView */
/** @typedef {{ id:number, x:number, y:number }} SolidView */
/** @typedef {{ x:number, y:number, kind:string, alpha:number, burning?:boolean, smoking?:boolean }} RoofTileView */
/** @typedef {{ id:number, profile:string, pos:{x:number,y:number}, interior:boolean }} AudioEmitterView */
/** @typedef {{ id:number, pos:{x:number,y:number}, radius:number, shadowSoftness:number, temporalPattern:string, phaseSeed:number, intensity:number, intensityScale:number, colorShiftScale:number, voidStrength:number|null, baseColor:[number,number,number] }} LightEmitterView */
/** @typedef {{ turn:number, seed:number, player: { id:number, pos:{x:number,y:number} } | null, entities: EntityView[], solids: SolidView[], emissives: any[], audioEmitters: AudioEmitterView[], lightEmitters: LightEmitterView[], roofs: RoofTileView[], fisheries: any[], tileGrid: any, isVisible: ((x:number,y:number)=>boolean)|null, isExplored: ((x:number,y:number)=>boolean)|null, currentDepth?: number }} WorldView */

/** @typedef {{ id:number, text:string, profane:boolean, pos:{x:number,y:number} }} EngravingView */

/** @type {WorldView} */
const _view = { turn: 0, seed: 0, player: null, entities: [], solids: [], emissives: [], audioEmitters: [], lightEmitters: [], roofs: [], fisheries: [], engravings: [], tileGrid: null, isVisible: null, isExplored: null, isBlockedVision: null, weather: "clear", playerSheltered: false, nightAlpha: 0, dawnAlpha: 0, duskAlpha: 0, isOverworld: false, currentDepth: 0, turnInDay: 0, moonBrightness: 0, playerVisionRadius: 0, playerFacing: null, playerConeDegrees: 360, perceptionState: null };
let _lastPerceptionWorld = null;
/** @type {Map<number, EntityView>} */
const _entityRecs = new Map();   // id -> { id, kind, pos:{x,y}, tags:[] }
const _zeroOff = Object.freeze({ dx: 0, dy: 0 });
const ENTRANCE_BADGE_COLORS = Object.freeze(["#70d6ff", "#a7f070", "#ffd166", "#ef476f", "#b995ff"]);

function projectDungeonEntranceBadge(world, id, rec) {
	const entrance = /** @type {any} */ (world.get(id, DungeonEntrance));
	if (!entrance) {
		rec.entranceBadge = null;
		return;
	}
	const targetDepth = Math.max(1, Number(entrance.targetDepth || 1) | 0);
	const floors = Math.max(1, Number(entrance.floors || 1) | 0);
	const color = ENTRANCE_BADGE_COLORS[(targetDepth - 1) % ENTRANCE_BADGE_COLORS.length] || ENTRANCE_BADGE_COLORS[0];
	rec.entranceBadge = { level: targetDepth, floors, color };
	if (!rec.tags.includes("dungeon_entrance")) rec.tags.push("dungeon_entrance");
}
const _questGiverIds = new Set(); // entity IDs that are active quest givers
/** @type {Map<number, SolidView>} */
const _solidRecs = new Map();    // id -> { id, x, y }

const DISPLAY_STATUS_TAGS = new Set([
	'invulnerable',
	'stunned',
	'rooted',
	'poisoned',
	'burning',
	'regen',
	'thorns',
	'disease',
	'bleeding',
	'shocked',
	'frozen',
	'confused',
	'fear',
	'weakened',
	'cursed',
	'blessed',
	'mindwiped',
	'stoneskin',
	'energized',
	'taunted',
	'hallucinating',
	'intoxicated',
	'satiated',
	'peckish',
	'hungry',
	'famished',
	'starving',
	'wasting',
	'agony',
	'blinded',
	'invisible',
	'phase_shift',
	'shadow_cloak',
	'resist_fire',
	'resist_poison',
	'resist_electric',
	'resist_acid',
	'stasis',
]);
const PROC_STATE_INFO_BY_KEY = (() => {
	/** @type {Map<string, {name:string, description:string}>} */
	const out = new Map();
	const specs = listProcPackages();
	for (const spec of specs) {
		const stateKeys = Array.isArray(spec?.stateKeys) ? spec.stateKeys : [];
		for (const stateKey of stateKeys) {
			const key = String(stateKey || "").trim();
			if (!key || out.has(key)) continue;
			out.set(key, {
				name: String(spec?.name || key),
				description: String(spec?.summary || "").trim(),
			});
		}
	}
	return out;
})();

// Proc state effect keys that should be projected onto entity views for proc glyph affordance.
const ENTITY_PROC_STATE_KEYS = new Set(PROC_STATE_INFO_BY_KEY.keys());

const VENOM_GLOW_ITEM_KINDS = new Set(['nightfang_dagger', 'venomfang_dagger', 'nightfang', 'venomfang']);
const POTION_GLOW_DISABLED_KINDS = new Set();

/** @type {EntityView[]} reusable temp buffer for entity collection before FOV filter */
const _allEntities = [];
function xyKey(x, y) {
	return `${x},${y}`;
}

function keyToXY(key) {
	const [x, y] = key.split(",").map(Number);
	return { x, y };
}

const CARDINAL_STEPS = Object.freeze([
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
]);
/** How many turns after burning a tile still smolders (emits smoke). */
const SMOLDER_TURNS = 30;
const MEMORY_TTL_TURNS = PERCEPTION_TUNING.memoryTtlTurns;
const THERMAL_BASE_RANGE = PERCEPTION_TUNING.thermalBaseRange;
const ESP_BASE_RANGE = PERCEPTION_TUNING.espBaseRange;
const TOUCH_RESOLVE_RANGE = PERCEPTION_TUNING.touchResolveRange;

/**
 * @param {EntityView} src
 * @param {string[]} extraTags
 * @param {{ x:number, y:number }} at
 * @param {string} [kindOverride]
 * @returns {EntityView}
 */
function makePerceptionEcho(src, extraTags, at, kindOverride = undefined) {
	const tags = [];
	for (let i = 0; i < extraTags.length; i++) {
		if (!tags.includes(extraTags[i])) tags.push(extraTags[i]);
	}
	return {
		id: src.id,
		kind: kindOverride || src.kind,
		pos: { x: at.x | 0, y: at.y | 0 },
		tags,
		layer: Number(src.layer || 300) | 0,
		hp: 0,
		maxHp: 0,
		isPet: false,
		showHealthBar: false,
		showNameLabel: false,
		facing: null,
		weaponVfx: null,
	};
}

/**
 * Project interactable-only display tags that the presentation layer needs to
 * react to immediately on first world sync.
 * @param {any} world
 * @param {number} id
 * @param {string} kind
 * @param {EntityView} rec
 */
function projectInteractableDisplayTags(world, id, kind, rec) {
	if (String(kind || "").toLowerCase() !== "fountain") return;
	const charges = Number(world.get(id, FountainState)?.chargesRemaining);
	if (Number.isFinite(charges) && charges <= 0 && !rec.tags.includes("inactive")) {
		rec.tags.push("inactive");
	}
}

function projectTrapDisplayTags(world, id, rec) {
	const trap = world.get(id, Trap);
	if (!trap || trap.revealed !== true) return;
	const type = String(trap.type || "").toLowerCase();
	if (type && !rec.tags.includes(`trap_${type}`)) rec.tags.push(`trap_${type}`);
	if (trap.armed === true && !rec.tags.includes("trap_armed")) rec.tags.push("trap_armed");
	if (trap.armed !== true && !rec.tags.includes("trap_disarmed")) rec.tags.push("trap_disarmed");
}

function isRoofBearingTile(tile) {
	return tile === TILE_FLOOR || tile === TILE_WALL || tile === TILE_DOOR || tile === TILE_STAIR_DOWN;
}

/**
 * @param {string} key
 * @param {Set<string>} candidates
 * @param {number} radius
 */
function keyWithinRadius(key, candidates, radius = 1) {
	if (!candidates?.size) return false;
	const { x, y } = keyToXY(key);
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) {
			if (candidates.has(xyKey(x + dx, y + dy))) return true;
		}
	}
	return false;
}

// ── Roof bitmap + BFS component cache ────────────────────────────────
// The roofed bitmap (Set of "x,y" keys) and its BFS-derived connected
// components only change when tileMap roofed state changes (generation time).
// Cache them behind roofedVersion() and skip the expensive forEachLoadedTile +
// flood-fill on every tick.
let _roofBitmapCache = null;       // Set<string> of roofed tile keys
let _roofComponentsCache = null;   // Array<{ keys: Set<string>, renderKeys: string[], minY, maxY, shadowCutoff }>
let _roofCacheVersion = -1;

function _ensureRoofCache() {
	const ver = roofedVersion();
	if (_roofCacheVersion === ver && _roofBitmapCache) return;
	_roofCacheVersion = ver;

	// 1. Build bitmap Set from all loaded tiles (only runs when version changes)
	const bitmapKeys = new Set();
	forEachLoadedTile((x, y) => {
		if (isRoofed(x, y)) bitmapKeys.add(xyKey(x, y));
	});
	_roofBitmapCache = bitmapKeys;

	// 2. BFS flood-fill to find connected components
	const components = [];
	const used = new Set();
	for (const startKey of bitmapKeys) {
		if (used.has(startKey)) continue;
		const comp = new Set();
		const q = [startKey];
		comp.add(startKey);
		for (let i = 0; i < q.length; i++) {
			const { x, y } = keyToXY(q[i]);
			for (let j = 0; j < CARDINAL_STEPS.length; j++) {
				const nk = xyKey(x + CARDINAL_STEPS[j][0], y + CARDINAL_STEPS[j][1]);
				if (!comp.has(nk) && bitmapKeys.has(nk)) { comp.add(nk); q.push(nk); }
			}
		}
		for (const k of comp) used.add(k);

		const renderKeys = [];
		let minY = Infinity;
		let maxY = -Infinity;
		for (const key of comp) {
			const { x, y } = keyToXY(key);
			if (!isRoofBearingTile(getTile(x, y))) continue;
			renderKeys.push(key);
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
		if (!renderKeys.length) continue;
		const shadowCutoff = minY + Math.floor((maxY - minY) * 0.5);
		components.push({ keys: comp, renderKeys, minY, maxY, shadowCutoff });
	}
	_roofComponentsCache = components;
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {{ x:number, y:number } | null} playerPos
 */
function collectOverworldRoofs(world, playerPos) {
	let isOverworld = false;
	for (const [, ds] of world.query(DungeonState)) {
		isOverworld = ds.currentDepth === 0 || ds.profileType === "overworld";
		break;
	}
	if (!isOverworld) return [];
	if (!playerPos) return [];

	// Ensure cached bitmap + BFS components are up to date
	_ensureRoofCache();

	// Per-tick volatile state: destroyed tiles, fire positions, smoldering
	const destroyedTiles = getDestroyedTileLedger(world);
	const activeFireKeys = new Set();
	for (const [, pos, hazard] of world.query(Position, HazardArea)) {
		if (!pos || !hazard) continue;
		if (String(hazard.kind || "").toLowerCase() !== "fire") continue;
		if (String(hazard.medium || "air").toLowerCase() !== "floor") continue;
		activeFireKeys.add(xyKey(pos.x, pos.y));
	}
	const playerKey = xyKey(playerPos.x, playerPos.y);
	const destroyedTileKeys = new Set();
	const smolderingRoofKeys = new Set();
	for (const [key, rec] of Object.entries(destroyedTiles || {})) {
		destroyedTileKeys.add(key);
		const age = Math.max(1, (_view.turn | 0) - (Number(rec?.destroyedAtTurn || 0) | 0) + 1);
		if (age <= SMOLDER_TURNS) {
			smolderingRoofKeys.add(key);
		}
	}

	const roofs = [];
	const components = _roofComponentsCache;
	for (let ci = 0; ci < components.length; ci++) {
		const { keys: comp, renderKeys, shadowCutoff } = components[ci];

		// Player inside this building — determine shelter, skip drawing this component
		if (comp.has(playerKey)) {
			const playerTile = getTile(playerPos.x, playerPos.y);
			const nearDestroyed = keyWithinRadius(playerKey, destroyedTileKeys, 1);
			const nearFire = keyWithinRadius(playerKey, activeFireKeys, 1);
			_view.playerSheltered = isRoofBearingTile(playerTile) && !nearDestroyed && !nearFire;
			continue;
		}

		for (let ri = 0; ri < renderKeys.length; ri++) {
			const key = renderKeys[ri];
			const { x, y } = keyToXY(key);
			const tile = getTile(x, y);
			const destroyedHere = destroyedTileKeys.has(key);
			const nearFire = keyWithinRadius(key, activeFireKeys, 1);
			const singed = keyWithinRadius(key, destroyedTileKeys, 1);
			if (tile === TILE_FLOOR) {
				let exposed = false;
				let adjacentDestroyed = false;
				for (let j = 0; j < CARDINAL_STEPS.length; j++) {
					const nx = x + CARDINAL_STEPS[j][0];
					const ny = y + CARDINAL_STEPS[j][1];
					if (destroyedTileKeys.has(xyKey(nx, ny))) adjacentDestroyed = true;
					if (!comp.has(xyKey(nx, ny))) continue;
					if (!isRoofBearingTile(getTile(nx, ny))) {
						exposed = true;
						break;
					}
				}
				if (exposed || ((destroyedHere || adjacentDestroyed) && !nearFire)) continue;
			}
			const isDoor = tile === TILE_DOOR;
			let kind = y <= shadowCutoff ? "roof_thatch_shadow" : "roof_thatch_lit";
			let alpha = isDoor ? 0.4 : 1.0;
			let burning = false;
			let smoking = false;
			if (singed) {
				kind += "_charred";
				if (nearFire) {
					burning = true;
				} else {
					alpha *= 0.45;
					smoking = keyWithinRadius(key, smolderingRoofKeys, 1);
				}
			} else if (nearFire) {
				burning = true;
			}
			roofs.push({ x, y, kind, alpha, burning, smoking });
		}
	}

	return roofs;
}

/**
 * @param {string} rawType
 */
function normalizeDisplayStatusType(rawType) {
	const type = String(rawType || '').toLowerCase();
	switch (type) {
		case 'poison': return 'poisoned';
		case 'burn': return 'burning';
		case 'bleed': return 'bleeding';
		case 'shock': return 'shocked';
		case 'frost': return 'frozen';
		case 'confuse': return 'confused';
		case 'bless': return 'blessed';
		case 'curse': return 'cursed';
		default: return type;
	}
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {EntityView} rec
 */
function projectDisplayTags(world, id, rec) {
	/** @type {any} */ const stat = /** @type any */ (world.get(id, Status));
	if (stat && Array.isArray(stat.statuses)) {
		for (let i = 0; i < stat.statuses.length; i++) {
			const s = stat.statuses[i];
			const t = normalizeDisplayStatusType(s?.type);
			if (!t || !DISPLAY_STATUS_TAGS.has(t)) continue;
			if (!rec.tags.includes(t)) rec.tags.push(t);
		}
	}
	if (statusStrength(world, id, 'stasis') > 0 && !rec.tags.includes('stasis')) {
		rec.tags.push('stasis');
	}

	/** @type {any} */ const ae = /** @type any */ (world.get(id, ActiveEffects));
	// Stash on rec so projectProcStateTags can reuse without a second world.get
	rec._ae = ae;

	// Entities with effective visionRange 0 are blinded regardless of source.
	// Gate behind a cheap check: only call the expensive getEffectiveVisionRange
	// (which resolves all equipment passives) when the entity has a
	// vision-affecting envelope or already has a blinding status/effect.
	if (!rec.tags.includes('blinded')) {
		let maybeBlinded = false;
		if (ae && Array.isArray(ae.effects)) {
			for (let i = 0; i < ae.effects.length; i++) {
				const e = ae.effects[i];
				if (e && e.key === 'stat_envelope' && e.stat === 'visionRange') {
					maybeBlinded = true; break;
				}
			}
		}
		if (maybeBlinded && getEffectiveVisionRange(world, id) <= 0) {
			rec.tags.push('blinded');
		}
	}

	if (!ae || !Array.isArray(ae.effects)) return;
	for (let i = 0; i < ae.effects.length; i++) {
		const e = ae.effects[i];
		if (!e || (Number(e.turnsLeft || 0) | 0) <= 0) continue;
		if ((Number(e.onsetLeft || 0) | 0) > 0) continue;
		const t = normalizeDisplayStatusType(canonicalStatusKey(e.key));
		if (t === 'stasis') continue;
		if (!t || !DISPLAY_STATUS_TAGS.has(t)) continue;
		if (!rec.tags.includes(t)) rec.tags.push(t);
	}
}

/**
 * Project display-relevant tags from equipped items carried by an entity.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {EntityView} rec
 */
function projectEquipmentDisplayTags(world, id, rec) {
	rec.weaponVfx = null;
	rec.equipBadges = null;
	/** @type {any} */ const eq = /** @type any */ (world.get(id, Equipment));
	if (!eq) return;
	const offhandId = Number(eq.offhand || 0) | 0;
	if (offhandId > 0) {
		const offhandIdentity = String(world.get(offhandId, NamedIdentity)?.identity || "").toLowerCase();
		if (offhandIdentity === "torch" && !rec.tags.includes("torch")) {
			rec.tags.push("torch");
		}
	}
	// Sunlight-tagged weapons emit holy light when wielded.
	const weaponSlotId = Number(eq.weapon || 0) | 0;
	if (weaponSlotId > 0) {
		const wInfo = /** @type any */ (world.get(weaponSlotId, ItemInfo));
		if (wInfo && Array.isArray(wInfo.tags) && wInfo.tags.includes("sunlight") && !rec.tags.includes("sunlight")) {
			rec.tags.push("sunlight");
		}
	}
	const resolved = resolveEquippedWeaponVfx(world, id, { slots: ["weapon", "offhand"], _eq: eq });
	if (resolved.length > 0) rec.weaponVfx = resolved;

	// Equipment corner badges — right: melee weapon(s), bottom-left: ranged/zap, top-left: shield
	const weaponId = Number(eq.weapon || 0) | 0;
	const rangedId = Number(eq.ranged || 0) | 0;
	let weaponIdentity = null;
	let offhandIdentity = null;
	let rangedIdentity = null;
	let shieldIdentity = null;
	if (weaponId > 0 && world.isAlive(weaponId)) {
		weaponIdentity = String(world.get(weaponId, NamedIdentity)?.identity || "").toLowerCase() || null;
	}
	// Offhand: dual-wield weapon (right side) or shield (top-left)
	if (offhandId > 0 && world.isAlive(offhandId)) {
		const offInfo = /** @type any */ (world.get(offhandId, ItemInfo));
		const offIdentity = String(world.get(offhandId, NamedIdentity)?.identity || "").toLowerCase() || null;
		if (offInfo?.damageDice) {
			offhandIdentity = offIdentity;
		} else {
			shieldIdentity = offIdentity;
		}
	}
	// Ranged/zap: bottom-left
	if (rangedId > 0 && world.isAlive(rangedId)) {
		rangedIdentity = String(world.get(rangedId, NamedIdentity)?.identity || "").toLowerCase() || null;
	}
	if (weaponIdentity || offhandIdentity || rangedIdentity || shieldIdentity) {
		rec.equipBadges = { weaponIdentity, offhandIdentity, rangedIdentity, shieldIdentity };
	}
}

/**
 * Project display-relevant tags from the monster definition onto the entity record.
 * @param {string} kind - entity identity (matches monster id)
 * @param {EntityView} rec
 */
function projectMonsterDefTags(kind, rec) {
	const defTags = getMonsterTags(kind);
	for (let i = 0; i < defTags.length; i++) {
		const t = defTags[i];
		if (!rec.tags.includes(t)) rec.tags.push(t);
	}
}

// ── Item visual presentation (scale + offset) ─────────────────────────
// Gold scale tiers based on coin count.
const GOLD_SCALE_TIERS = [
	[10,  0.55],
	[30,  0.65],
	[60,  0.78],
	[100, 0.88],
];
const GOLD_SCALE_DEFAULT = 1.0;

// Corpse scale derived from monster size class.
const CORPSE_SIZE_SCALE = { XS: 0.55, S: 0.72, M: 0.88, L: 1.0, XL: 1.12 };
const _corpseSizeCache = new Map(); // monsterKind -> scale

function corpseScaleForKind(kind) {
	if (!kind || !kind.startsWith('corpse_')) return 1;
	const monsterKind = kind.slice(7); // strip "corpse_"
	let s = _corpseSizeCache.get(monsterKind);
	if (s !== undefined) return s;
	const def = getMonster(monsterKind);
	s = (def && CORPSE_SIZE_SCALE[def.sizeClass]) || 0.88;
	_corpseSizeCache.set(monsterKind, s);
	return s;
}

/**
 * Compute display scale for an item entity.
 * Gold scales by count; corpses scale by monster size; others default to 1.
 * @param {any} itemInfo
 * @param {string} kind
 * @returns {number}
 */
function computeItemScale(itemInfo, kind) {
	if (!itemInfo) return 1;
	if (String(itemInfo.type || '').toLowerCase() === 'currency') {
		const count = (itemInfo.count | 0) || 1;
		for (let i = 0; i < GOLD_SCALE_TIERS.length; i++) {
			if (count <= GOLD_SCALE_TIERS[i][0]) return GOLD_SCALE_TIERS[i][1];
		}
		return GOLD_SCALE_DEFAULT;
	}
	if (kind && kind.startsWith('corpse_')) return corpseScaleForKind(kind);
	return 1;
}

/**
 * Deterministic visual sub-tile offset for ground items.
 * Uses entity ID to produce a stable jitter so items don't sit dead-centre.
 * @param {number} id
 * @returns {{ dx: number, dy: number }}
 */
function computeVisualOffset(id) {
	// Simple hash from entity ID — produces values in [-0.15, +0.15]
	const h1 = ((id * 2654435761) >>> 0) / 0xFFFFFFFF;
	const h2 = ((id * 340573321)  >>> 0) / 0xFFFFFFFF;
	return { dx: (h1 - 0.5) * 0.3, dy: (h2 - 0.5) * 0.3 };
}

// Material → temporal pattern for gem base emission (magical gems only, future use)
const MATERIAL_PATTERN = {
	diamond:     'gem_diamond',
	corundum:    'gem_corundum',
	beryl:       'gem_quartz',    // low-key, emerald/aqua cool tones
	zircon:      'gem_zircon',
	topaz:       'gem_amber',     // warm drift suits topaz
	chrysoberyl: 'gem_quartz',    // subtle base; chatoyancy is the star
	opal:        'gem_opal',
	fluorite:    'gem_fluorite',
	garnet:      'gem_garnet',
	turquoise:   'gem_quartz',    // opaque, minimal flicker
	amber:       'gem_amber',
	quartz:      'gem_quartz',
	glass:       'gem_quartz',    // plain glass — barely there
};

// Material → RGB tint multipliers for caustic/interaction color filtering.
// Applied over the source light color when projecting caustics through the gem.
const MATERIAL_LIGHT_TINT = {
	diamond:     [0.95, 0.97, 1.00],  // cold white
	corundum:    [1.00, 0.90, 0.90],  // warm red (ruby/sapphire rely on palette)
	beryl:       [0.90, 1.00, 0.92],  // green-cool
	zircon:      [1.00, 0.95, 0.85],  // warm gold
	topaz:       [1.00, 0.95, 0.80],  // warm yellow
	chrysoberyl: [0.95, 1.00, 0.85],  // cat's-eye green-gold
	opal:        [1.00, 1.00, 1.00],  // identity — color from palette
	fluorite:    [0.85, 0.95, 1.00],  // cool blue-green
	garnet:      [1.00, 0.80, 0.80],  // deep red
	turquoise:   [0.85, 1.00, 0.95],  // teal
	amber:       [1.00, 0.85, 0.60],  // deep warm orange
	quartz:      [1.00, 1.00, 1.00],  // neutral
	glass:       [1.00, 1.00, 1.00],  // neutral
};

/**
 * @param {string} kind
 * @param {any} itemInfo
 * @param {EntityView} rec
 * @param {string|null} matKind  — Material.kind from the ECS component, if present
 */
function projectItemAffixDisplayTags(kind, itemInfo, rec, matKind) {
	if (itemInfo && String(itemInfo.type || '').toLowerCase() === 'potion' && !POTION_GLOW_DISABLED_KINDS.has(String(kind || ''))) {
		if (!rec.tags.includes('potion_glow')) rec.tags.push('potion_glow');
	}
	if (itemInfo && String(itemInfo.type || '').toLowerCase() === 'currency') {
		if (!rec.tags.includes('gold_glow')) rec.tags.push('gold_glow');
	}
	if (itemInfo && String(itemInfo.type || '').toLowerCase() === 'gem') {
		// Voidstone: magical darkness aura — intrinsic, not optical physics.
		if (String(kind || '').toLowerCase() === 'gem_voidstone') {
			if (!rec.tags.includes('shadow_glowing')) rec.tags.push('shadow_glowing');
		} else {
			const gemDef = getGem(String(kind || ''));
			if (gemDef?.material === 'gemstone') {
				// Dilithium crystal — inherently magical; emits its own light like a power source.
				rec.matOptical = {
					lightPass: 0.85, lightReflect: 0.7, lightAbsorb: 0.0,
					dispersion: 0.35, tint: [0.92, 0.96, 1.0],
					pattern: 'gem_diamond', emissive: true,
					emitK: 0, emitIntensity: 0,
				};
			} else {
				// Natural gems: no intrinsic emission. Attach matOptical for interaction-only rendering.
				// Gem in darkness = invisible. Gem in torchlight = alive.
				// Magical affixes (glowing, rarity glow) set emissive=true later in this function.
				const mat = getMaterialIntrinsic(gemDef?.material || 'quartz');
				if (mat) {
					rec.matOptical = {
						lightPass:    mat.lightPass,
						lightReflect: mat.lightReflect,
						lightAbsorb:  mat.lightAbsorb,
						dispersion:   mat.dispersion || 0.0,
						tint:         MATERIAL_LIGHT_TINT[mat.kind] || [1.0, 1.0, 1.0],
						pattern:      MATERIAL_PATTERN[mat.kind] || 'gem_quartz',
						emissive:     false,
						emitK:        0,
						emitIntensity: 0,
					};
				}
			}
		}
	}
	// Non-gem materials on visible world objects can still participate in display
	// lighting. This is derived from Material facts, not extra lighting state.
	if (!rec.matOptical && matKind) {
		const mat = getMaterialIntrinsic(matKind);
		if (mat && (mat.lightReflect > 0.15 || mat.lightEmit > 0 || mat.lightAbsorb > 0.5)) {
			rec.matOptical = {
				lightPass:     mat.lightPass    || 0,
				lightReflect:  mat.lightReflect || 0,
				lightAbsorb:   mat.lightAbsorb  || 0,
				dispersion:    0.0,
				tint:          [1.0, 1.0, 1.0],
				pattern:       mat.lightEmit > 0 ? 'breathe' : 'gem_quartz',
				emissive:      false,
				emitK:         mat.glowColorTempK || 0,
				emitIntensity: mat.lightEmit      || 0,
			};
		}
	}
	if (!itemInfo || !Array.isArray(itemInfo.affixes)) return;
	const affixes = itemInfo.affixes;
	const hasAffix = (key) => affixes.includes(key) || affixes.includes(`affix:${key}`);

	if ((hasAffix('flaming') || hasAffix('firestorm1')) && !rec.tags.includes('glowing')) {
		rec.tags.push('glowing');
	}
	if (hasAffix('venomous1') || VENOM_GLOW_ITEM_KINDS.has(String(kind || ''))) {
		if (!rec.tags.includes('venom_glowing')) rec.tags.push('venom_glowing');
	}
	if ((hasAffix('chainLightning1') || hasAffix('capacitive1')) && !rec.tags.includes('storm_glowing')) {
		rec.tags.push('storm_glowing');
	}
	if (hasAffix('frostbite1') && !rec.tags.includes('frost_glowing')) {
		rec.tags.push('frost_glowing');
	}
	if (hasAffix('soulDrain1') && !rec.tags.includes('soul_glowing')) {
		rec.tags.push('soul_glowing');
	}
	if ((hasAffix('hemorrhage1') || hasAffix('berserk1')) && !rec.tags.includes('blood_glowing')) {
		rec.tags.push('blood_glowing');
	}
	if (hasAffix('caustic1') && !rec.tags.includes('caustic_glowing')) {
		rec.tags.push('caustic_glowing');
	}

	// Rarity-based glow fallback — only if no specialized glow already present
	const rn = String(itemInfo.rarityName || '').toLowerCase();
	if (rn === 'legendary' || rn === 'epic' || rn === 'rare') {
		const hasSpecialGlow = rec.tags.includes('glowing') || rec.tags.includes('venom_glowing') ||
			rec.tags.includes('frost_glowing') || rec.tags.includes('storm_glowing') ||
			rec.tags.includes('soul_glowing') || rec.tags.includes('blood_glowing') ||
			rec.tags.includes('caustic_glowing') || rec.tags.includes('potion_glow');
		if (!hasSpecialGlow) {
			if (rn === 'legendary' && !rec.tags.includes('legendary_glowing')) rec.tags.push('legendary_glowing');
			else if (rn === 'epic' && !rec.tags.includes('epic_glowing')) rec.tags.push('epic_glowing');
			else if (rn === 'rare' && !rec.tags.includes('rare_glowing')) rec.tags.push('rare_glowing');
		}
	}
	// Enchanted gem: upgrade to emissive so the display layer uses gem-specific patterns.
	// The generic 'glowing' (amber/ember) tag is suppressed in sources/index.js for gems;
	// the mat interaction pass owns both refracted effects and emitted light.
	if (rec.matOptical && !rec.matOptical.emissive) {
		const EMIT_TAGS = ['glowing', 'legendary_glowing', 'epic_glowing', 'rare_glowing',
		                   'storm_glowing', 'soul_glowing', 'blood_glowing', 'venom_glowing', 'caustic_glowing'];
		if (EMIT_TAGS.some(tag => rec.tags.includes(tag))) {
			rec.matOptical.emissive = true;
		}
	}
}

/**
 * Project display-only combat HUD data onto the entity record.
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {EntityView} rec
 * @param {string} playerFactionKey
 */
function projectCombatUi(world, id, rec, playerFactionKey) {
	rec.hp = 0;
	rec.maxHp = 0;
	rec.isPet = false;
	rec.isNpc = false;
	rec.displayName = String(world.get(id, NamedIdentity)?.name || "").trim();
	rec.showHealthBar = false;
	rec.showNameLabel = rec.tags.includes("nameplate");

	/** @type {any} */ const vit = /** @type any */ (world.get(id, Vitality));
	if (!vit) return;

	const maxHp = Math.max(1, effectiveMaxHp(world, id, vit));
	const hp = Math.max(0, Math.min(maxHp, vit.hp | 0));
	rec.hp = hp;
	rec.maxHp = maxHp;

	const factionKey = String(world.get(id, Faction)?.key || '').trim().toLowerCase();
	const isPet = world.has(id, Pet) || factionKey === 'pet';
	rec.isPet = isPet;
	rec.isNpc = factionKey === 'townfolk';
	if (isPet) {
		rec.showHealthBar = true;
		return;
	}
	if (!playerFactionKey || !factionKey) return;
	rec.showHealthBar = areFactionsHostile(playerFactionKey, factionKey);
}

function projectAggroUi(world, id, rec) {
	const aggro = world.get(id, AggroState);
	rec.aggroLevel = aggro ? String(aggro.alertLevel || "") : "";
	rec.aggroTargetId = aggro ? (Number(aggro.targetId || 0) | 0) : 0;
	rec.aggroTargetReason = aggro ? String(aggro.targetReason || "") : "";
	rec.threatState = aggro ? String(aggro.threatState || "") : "";
	rec.targetLocked = aggro ? ((Number(aggro.forcedUntilTurn || 0) | 0) > (Number(world.step || 0) | 0)) : false;
}

/** Populate rec.procStates with any active proc state effects on the entity (enemy-side). */
function projectProcStateTags(world, id, rec) {
	// Reuse ActiveEffects already fetched by projectDisplayTags when available
	const ae = /** @type any */ (rec._ae !== undefined ? rec._ae : world.get(id, ActiveEffects));
	rec._ae = undefined; // clean up transient field
	if (!ae || !Array.isArray(ae.effects)) return;
	for (const e of ae.effects) {
		const key = String(e?.key || '');
		if (!ENTITY_PROC_STATE_KEYS.has(key)) continue;
		const stacks = Math.max(1, Number(e?.stacks || 1));
		const turnsLeft = Math.max(0, Number(e?.turnsLeft || 0) | 0);
		const potency = Number.isFinite(Number(e?.potency)) ? Number(e?.potency) : 1;
		const info = PROC_STATE_INFO_BY_KEY.get(key);
		if (!rec.procStates) rec.procStates = [];
		rec.procStates.push({
			key,
			stacks,
			turnsLeft,
			potency,
			name: String(info?.name || ""),
			description: String(info?.description || ""),
		});
	}
}

function projectAltarOfferingOverlays(world, out) {
	for (const [altarId, state, pos] of world.query(AltarOfferingState, Position)) {
		if (!isAltarOfferingActive(world, altarId)) continue;
		let base = null;
		for (let i = 0; i < out.length; i++) {
			if ((Number(out[i]?.id || 0) | 0) === (altarId | 0)) {
				base = out[i];
				break;
			}
		}
		if (!base) continue;
		const kind = String(state?.offeredItemKind || "");
		if (!kind) continue;
		const tags = ["altar_offering"];
		const beatitude = String(state?.beatitudeState || "").toLowerCase();
		const value = Math.max(0, Math.min(1, Number(state?.value || 0)));
		if (beatitude === "blessed") {
			tags.push("sunlight", "legendary_glowing");
		} else if (beatitude === "cursed") {
			tags.push("shadow_glowing");
		} else if (value >= 0.75) {
			tags.push("epic_glowing");
		} else if (value >= 0.35) {
			tags.push("rare_glowing");
		} else {
			tags.push("glowing");
		}
		out.push({
			id: -Math.abs(altarId | 0),
			kind,
			pos: { x: pos.x, y: pos.y - 0.22 },
			tags,
			layer: Math.max(0, (Number(base.layer || 300) | 0) + 1),
			hp: 0,
			maxHp: 0,
			isPet: false,
			showHealthBar: false,
			aggroLevel: "",
			aggroTargetId: 0,
			aggroTargetReason: "",
			threatState: "",
			targetLocked: false,
			procStates: null,
			equipBadges: null,
			stackSeq: 0,
			facing: null,
			weaponVfx: null,
			sizeClass: "",
			itemScale: 0.72,
			rotation: 0,
			visualOff: _zeroOff,
			offeredItemName: String(state?.offeredItemName || ""),
		});
	}
}

/**
 * Project actor-facing for display-only overlays (directional marker, etc.).
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @param {number} id
 * @param {EntityView} rec
 */
function projectFacing(world, id, rec) {
	const f = /** @type any */ (world.get(id, Facing));
	if (!f) {
		rec.facing = null;
		return;
	}
	const dx = Math.sign(Number(f.dx || 0));
	const dy = Math.sign(Number(f.dy || 0));
	rec.facing = (dx === 0 && dy === 0) ? null : { dx, dy };
}

function normalizeLightColor(color) {
	if (Array.isArray(color)) {
		const r = Math.max(0, Math.min(255, Number(color[0]) || 0));
		const g = Math.max(0, Math.min(255, Number(color[1]) || 0));
		const b = Math.max(0, Math.min(255, Number(color[2]) || 0));
		return [r, g, b];
	}
	if (typeof color === "string" && /^#[0-9a-fA-F]{3}$/.test(color)) {
		const expand = (digit) => parseInt(digit, 16) * 17;
		return [
			expand(color[1]),
			expand(color[2]),
			expand(color[3]),
		];
	}
	if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
		return [
			parseInt(color.slice(1, 3), 16),
			parseInt(color.slice(3, 5), 16),
			parseInt(color.slice(5, 7), 16),
		];
	}
	return [255, 255, 255];
}

/**
 * @param {import('../../lib/ecs-js/index.js').World} world
 * @returns {WorldView}
 */
export function buildWorldView(world) {
	if (_lastPerceptionWorld !== world) {
		clearPerceptionMemory();
		_lastPerceptionWorld = world;
	}
	_view.turn = world.step | 0;
	_view.seed = world.seed >>> 0;
	_view.player = null;
	_view.playerEntity = null;
	_view.entities.length = 0;
	_view.solids.length = 0;
	_view.emissives.length = 0;
	_view.audioEmitters.length = 0;
	_view.lightEmitters.length = 0;
	_view.roofs.length = 0;
	_view.fisheries.length = 0;
	_view.engravings.length = 0;
	_view.weather = "clear";
	_view.playerSheltered = false;
	_view.isOverworld = false;
	_allEntities.length = 0;
	const collectedIds = new Set();

	// Read weather state (singleton on overworld)
	let _isOverworld = false;
	let currentDepth = 0;
	for (const [, ds] of world.query(DungeonState)) {
		currentDepth = Number(ds.currentDepth || 0) | 0;
		_isOverworld = (ds.currentDepth === 0 || ds.profileType === "overworld");
		break;
	}
	_view.isOverworld = _isOverworld;
	_view.currentDepth = currentDepth;
	if (_isOverworld) {
		for (const [, ws] of world.query(WeatherState)) {
			_view.weather = ws.current || "clear";
			break;
		}
	}

	// Compute night darkness (overworld only, derived from PHASE_BOUNDS)
	// sleep→dark, breakfast→dawn, work→bright, pub→dusk, home→dark
	_view.nightAlpha = 0;
	_view.dawnAlpha  = 0;
	_view.duskAlpha  = 0;
	_view.turnInDay  = 0;
	_view.moonBrightness = 0;
	if (_isOverworld) {
		const turnInDay = world.step % TURNS_PER_DAY;
		_view.turnInDay = turnInDay;
		const breakfast = PHASE_BOUNDS[1]; // dawn transition
		const pub       = PHASE_BOUNDS[3]; // dusk transition
		if (turnInDay < breakfast.start || turnInDay >= pub.end) {
			_view.nightAlpha = 1;
		} else if (turnInDay < breakfast.end) {
			_view.nightAlpha = 1 - (turnInDay - breakfast.start) / (breakfast.end - breakfast.start);
			// Warm golden tint peaks at mid-dawn
			const t = (turnInDay - breakfast.start) / (breakfast.end - breakfast.start);
			_view.dawnAlpha = Math.sin(Math.PI * t);
		} else if (turnInDay < pub.start) {
			_view.nightAlpha = 0;
		} else {
			_view.nightAlpha = (turnInDay - pub.start) / (pub.end - pub.start);
			// Warm orange-red tint peaks at mid-dusk
			const t = (turnInDay - pub.start) / (pub.end - pub.start);
			_view.duskAlpha = Math.sin(Math.PI * t);
		}

		// Moon brightness from lunar phase (full=1.0, new=0.15)
		const dayTotal = Math.floor(Math.max(0, world.step) / TURNS_PER_DAY);
		const dayOfMonth = dayTotal % DAYS_PER_MONTH;
		const moon = getMoonPhase(dayOfMonth);
		// Map phase key to brightness: full brightest, new dimmest
		const MOON_BRIGHT = { new: 0.15, waxing_crescent: 0.30, first_quarter: 0.50, waxing_gibbous: 0.75, full: 1.0, waning_gibbous: 0.75, last_quarter: 0.50, waning_crescent: 0.30 };
		_view.moonBrightness = MOON_BRIGHT[moon.key] ?? 0.15;
	}

	// Collect active quest giver entity IDs for display tag projection.
	_questGiverIds.clear();
	for (const [, state, bind] of world.query(QuestState, QuestBindings)) {
		if (state.status === 'active' && bind.giver > 0) _questGiverIds.add(bind.giver);
	}

	// Expose tile grid functions for direct grid-based rendering
	_view.tileGrid = { getTile, forEachTileInRect };
	let playerVisionRadius = 0;

	for (const [id, _p, pos] of world.query(Player, Position)) {
		_view.player = { id, pos: { x: pos.x, y: pos.y } };
		break;
	}

	// Compute FOV (once per turn, idempotent via step check in updateFOV)
	if (_view.player) {
		const radius = getEffectiveVisionRange(world, _view.player.id);
		playerVisionRadius = radius;
		const facing = getNormalizedEntityFacing(world, _view.player.id);
		const coneDegrees = getEntityFovConeDegrees(world, _view.player.id);
		const pad = 2;
		const bounds = {
			x0: _view.player.pos.x - radius - pad,
			y0: _view.player.pos.y - radius - pad,
			x1: _view.player.pos.x + radius + pad,
			y1: _view.player.pos.y + radius + pad,
		};
		const blockedMap = buildBlocksVisionMap(world, bounds);
		const isBlocked = blockedCallback(blockedMap);
		updateFOV(_view.turn, _view.player.pos.x, _view.player.pos.y, radius, isBlocked, {
			facingDx: facing?.dx || 0,
			facingDy: facing?.dy || 0,
			coneDegrees,
			coneBiasDeg: FACING_CONE_GRID_BIAS_DEG,
		});
		_view.isBlockedVision = isBlocked;
	} else {
		_view.isBlockedVision = null;
	}

	_view.isVisible = isVisible;
	_view.isExplored = isExplored;
	for (const [id, pos, node] of world.query(Position, HarvestNode)) {
		if (String(node?.kind || "") !== "fishing_spot") continue;
		if (typeof isVisible === "function" && !isVisible(pos.x, pos.y)) continue;
		const pressure = Math.max(0, Number(node.fishingPressure || 0) | 0);
		_view.fisheries.push({
			id,
			x: pos.x | 0,
			y: pos.y | 0,
			ready: node.ready === true,
			overfished: node.overfished === true || pressure >= 4,
			pressure,
		});
	}
	const playerFactionKey = _view.player ? String(world.get(_view.player.id, Faction)?.key || "player").trim().toLowerCase() : "";
	const perceptionState = _view.player
		? readPlayerPerceptionState(world, _view.player.id)
		: { thermalSense: 0, espSense: 0, memoryTamper: 0 };
	const thermalSenseStrength = perceptionState.thermalSense;
	const espSenseStrength = perceptionState.espSense;
	const memoryTamperStrength = perceptionState.memoryTamper;
	const playerFacingForAwareness = _view.player
		? getNormalizedEntityFacing(world, _view.player.id)
		: null;
	const awarenessConeDegrees = _view.player
		? (() => {
			return getEntityFovConeDegrees(world, _view.player.id);
		})()
		: 360;

	// Expose vision/perception data for the lighting engine
	_view.playerVisionRadius = playerVisionRadius;
	_view.playerFacing = playerFacingForAwareness;
	_view.playerConeDegrees = awarenessConeDegrees;
	_view.perceptionState = perceptionState;

	for (const [id, pos, audio] of world.query(Position, AudioEmitter)) {
		const emitters = Array.isArray(audio?.emitters) ? audio.emitters : [];
		for (let i = 0; i < emitters.length; i++) {
			const spec = emitters[i];
			const profile = String(spec?.profile || "").trim();
			if (!profile) continue;
			_view.audioEmitters.push({
				id,
				profile,
				pos: { x: pos.x | 0, y: pos.y | 0 },
				interior: spec?.interior === true,
			});
		}
	}

	for (const [id, pos, job] of world.query(Position, TownfolkJob)) {
		if (job.role !== TOWNFOLK_ROLES.woodcutter) continue;
		if (job.state !== TOWNFOLK_STATES.working || job.workSiteKind !== "chop") continue;
		_view.audioEmitters.push({
			id,
			profile: "woodcutter",
			pos: { x: pos.x | 0, y: pos.y | 0 },
			interior: false,
		});
	}

	for (const [id, pos, light] of world.query(Position, LightEmitter)) {
		if (_view.player && typeof isVisible === "function" && !isVisible(pos.x, pos.y)) continue;
		const radius = Number(light?.radius || 0);
		if (!(radius > 0)) continue;
		const voidStrengthRaw = light?.voidStrength;
		_view.lightEmitters.push({
			id,
			pos: { x: pos.x | 0, y: pos.y | 0 },
			radius,
			shadowSoftness: Number.isFinite(Number(light?.shadowSoftness)) ? Number(light.shadowSoftness) : 6,
			temporalPattern: String(light?.temporalPattern || "steady").trim() || "steady",
			phaseSeed: Number.isFinite(Number(light?.phaseSeed)) ? Number(light.phaseSeed) : 0,
			intensity: Number.isFinite(Number(light?.intensity)) ? Number(light.intensity) : 1,
			intensityScale: Number.isFinite(Number(light?.intensityScale)) ? Number(light.intensityScale) : 1,
			colorShiftScale: Number.isFinite(Number(light?.colorShiftScale)) ? Number(light.colorShiftScale) : 1,
			voidStrength: voidStrengthRaw === null || voidStrengthRaw === undefined
				? null
				: Math.max(0, Math.min(1, Number(voidStrengthRaw) || 0)),
			baseColor: normalizeLightColor(light?.baseColor),
		});
	}

	// Collect entity records near the player (or all if no player).
	if (_view.player) {
		ensureSpatialIndex(world);
		const radius = getEffectiveVisionRange(world, _view.player.id);
		playerVisionRadius = radius;
		const thermalRange = thermalSenseStrength > 0
			? (Math.max(radius, THERMAL_BASE_RANGE) + Math.min(6, (thermalSenseStrength | 0) * 2))
			: 0;
		const espRange = espSenseStrength > 0
			? (Math.max(radius, ESP_BASE_RANGE) + 6)
			: 0;
		const viewR = Math.max(radius | 0, thermalRange | 0, espRange | 0) + 4;
		const x0 = _view.player.pos.x - viewR;
		const y0 = _view.player.pos.y - viewR;
		const x1 = _view.player.pos.x + viewR;
		const y1 = _view.player.pos.y + viewR;
		forEachInRect(world, x0, y0, x1, y1, (id, pos) => {
			if (world.has(id, PlasmaCloud) || world.has(id, HazardArea)) return;
			if (world.has(id, Burned)) return;
			if (world.has(id, DistrictProfile) || world.has(id, EntranceProfile)) return;
			// Hide unrevealed traps — completely invisible until triggered
			/** @type {any} */ const trap = /** @type any */ (world.get(id, Trap));
			if (trap && !trap.revealed) return;
			const isPlayer = _view.player && id === _view.player.id;
			/** @type {any} */ const secretDoor = /** @type any */ (world.get(id, SecretDoor));
			if (secretDoor && !secretDoor.revealed) return;
			/** @type {any} */ const ident = /** @type any */ (world.get(id, NamedIdentity));
			/** @type {any} */ const door = /** @type any */ (world.get(id, DoorState));
			/** @type {any} */ const objState = /** @type any */ (world.get(id, ObjectState));
			/** @type {any} */ const col = /** @type any */ (world.get(id, Collider));
			/** @type {any} */ const itemInfo = /** @type any */ (world.get(id, ItemInfo));

			let kind = "default";
			if (door) {
				kind = door.open ? "door_open" : "door_closed";
			} else if (objState && ident?.identity === "furnace") {
				kind = objState.state === "lit" ? "furnace" : "furnace_unlit";
			} else if (objState && ident?.identity === "millstone") {
				kind = objState.state === "working" ? "millstone_active" : "millstone";
			} else if (objState && ident?.identity === "anvil") {
				kind = objState.state === "working" ? "anvil_active" : "anvil";
			} else if (objState && ident?.identity === "lantern_post") {
				kind = objState.state === "lit" ? "lantern_post" : "lantern_post_unlit";
			} else if (objState && ident?.identity === "portcullis") {
				kind = objState.state === "raised" ? "portcullis_raised" : "portcullis";
			} else if (objState && ident?.identity === "pressure_plinth") {
				kind = objState.state === "pressed" ? "pressure_plinth_pressed" : "pressure_plinth";
			} else if (objState && ident?.identity === "mailbox") {
				kind = objState.state === "checking" ? "mailbox_checking"
					: objState.state === "has_mail" ? "mailbox_has_mail"
					: objState.state === "sent" ? "mailbox_sent"
					: "mailbox";
			} else if (isPlayer) {
				kind = ident?.identity || "player";
			} else {
				kind = ident?.identity || ident?.name || "default";
			}
			const harvestNode = /** @type {any} */ (world.get(id, HarvestNode));
			if (harvestNode && String(harvestNode.kind || "") === "fishing_spot" && harvestNode.ready !== true) {
				kind = "fishing_spot_depleted";
			}
			if (harvestNode && harvestNode.ready !== true && Number(harvestNode.regrowCountdown || 0) > 0) {
				const _hk = String(harvestNode.kind || "");
				if (_hk === "iron_ore") kind = "ore_vein_iron_exhausted";
				else if (_hk === "coal_ore") kind = "ore_vein_coal_exhausted";
				else if (_hk === "stone") kind = "ore_vein_stone_exhausted";
				else if (_hk === "berries" || _hk === "herbs" || _hk === "thorn_bramble" ||
				         _hk === "venom_fern" || _hk === "moonleaf" || _hk === "ember_root") kind = "harvest_node_bare";
			}

			let layer = 300; // actors
			if (itemInfo) layer = 250; // items/ground (above doors/stairs, below actors)
			else if (door) layer = 200; // doors/walls-like entities
			else if (isPlayer) layer = 400; // player on top
			else if (harvestNode && String(harvestNode.kind || "") === "fishing_spot") layer = 210; // water harvest marker

			/** @type {EntityView|null} */
			const stackSeq = Number(world.get(id, GroundStackOrder)?.seq || 0) | 0;
			let rec = /** @type any */ (_entityRecs.get(id) || null);
			const physSizeClass = /** @type {string} */ (world.get(id, Physiology)?.sizeClass || '');
			const iScale = itemInfo ? computeItemScale(itemInfo, kind) : 1;
			const vOff = itemInfo ? computeVisualOffset(id) : _zeroOff;
			if (!rec) {
				rec = { id, kind, pos: { x: pos.x, y: pos.y }, tags: [], layer, hp: 0, maxHp: 0, isPet: false, showHealthBar: false, showNameLabel: false, aggroLevel: "", aggroTargetId: 0, aggroTargetReason: "", threatState: "", targetLocked: false, procStates: null, equipBadges: null, stackSeq, facing: null, weaponVfx: null, sizeClass: physSizeClass, itemScale: iScale, rotation: 0, visualOff: vOff };
				_entityRecs.set(id, rec);
			} else {
				rec.kind = kind;
				rec.layer = layer;
				rec.pos.x = pos.x; rec.pos.y = pos.y;
				rec.tags.length = 0;
				rec.procStates = null;
				rec.equipBadges = null;
				rec.stackSeq = stackSeq;
				rec.facing = null;
				rec.aggroLevel = "";
				rec.aggroTargetId = 0;
				rec.aggroTargetReason = "";
				rec.weaponVfx = null;
				rec.matOptical = null;
				rec.sizeClass = physSizeClass;
				rec.itemScale = iScale;
				rec.rotation = 0;
				rec.visualOff = vOff;
				rec.entranceBadge = null;
			}

			// Project select status types into tags for display-only logic.
			projectDisplayTags(world, id, rec);
			projectEquipmentDisplayTags(world, id, rec);
			projectInteractableDisplayTags(world, id, kind, rec);
			projectTrapDisplayTags(world, id, rec);
			projectMonsterDefTags(kind, rec);
			projectItemAffixDisplayTags(kind, itemInfo, rec, world.get(id, Material)?.kind ?? null);
			projectCombatUi(world, id, rec, playerFactionKey);
			projectAggroUi(world, id, rec);
			projectProcStateTags(world, id, rec);
			projectDungeonEntranceBadge(world, id, rec);
			// Placed torches get the torch tag for particle/light sync
			if (kind === 'torch' && !rec.tags.includes('torch')) {
				rec.tags.push('torch');
			}
			projectFacing(world, id, rec);
			const petState = /** @type {any} */ (world.get(id, PetState));
			const isFamiliar = String(rec.kind || "").toLowerCase() === "familiar";
			if (isFamiliar && petState && petState.rangedCooldown === 0 && !rec.tags.includes("pet_ready_glow")) {
				rec.tags.push("pet_ready_glow");
			}
			if (isAsleep(world, id) && !rec.tags.includes(SLEEP_DISPLAY_TAG)) rec.tags.push(SLEEP_DISPLAY_TAG);
			if (world.has(id, Flying) && !rec.tags.includes('flying')) rec.tags.push('flying');
			if ((kind === "bell" || kind === "tavern_sign") && !rec.tags.includes('above_roof')) rec.tags.push('above_roof');
			if (_questGiverIds.has(id) && !rec.tags.includes('quest_giver')) rec.tags.push('quest_giver');
			if (kind === 'legendary_chest') rec.tags.push('legendary_glowing');
			if (kind === 'epic_chest') rec.tags.push('epic_glowing');
			if (harvestNode && String(harvestNode.kind || "") === "fishing_spot") {
				rec.tags.push(harvestNode.ready === true ? "fishing_spot_ready" : "fishing_spot_depleted");
				const pressure = Math.max(0, Number(harvestNode.fishingPressure || 0) | 0);
				if (harvestNode.ready === true) {
					if (pressure >= 4 || harvestNode.overfished === true) rec.tags.push("fishing_pressure_overfished");
					else if (pressure >= 2) rec.tags.push("fishing_pressure_medium");
					else rec.tags.push("fishing_pressure_low");
				}
			}

			_allEntities.push(rec);
			collectedIds.add(id);
			if (isPlayer) _view.playerEntity = rec;

			// solids list for display/collision readers (entity-based only: doors)
			if (col && col.solid) {
				let srec = _solidRecs.get(id);
				if (!srec) { srec = { id, x: pos.x, y: pos.y }; _solidRecs.set(id, srec); }
				else { srec.x = pos.x; srec.y = pos.y; }
				_view.solids.push(srec);
			}
		});
	} else {
		for (const [id, pos] of world.query(Position)) {
			if (world.has(id, PlasmaCloud) || world.has(id, HazardArea)) continue;
			if (world.has(id, Burned)) continue;
			if (world.has(id, DistrictProfile) || world.has(id, EntranceProfile)) continue;
			// Hide unrevealed traps — completely invisible until triggered
			/** @type {any} */ const trap2 = /** @type any */ (world.get(id, Trap));
			if (trap2 && !trap2.revealed) continue;
			const isPlayer = world.has(id, Player);
			/** @type {any} */ const ident = /** @type any */ (world.get(id, NamedIdentity));
			/** @type {any} */ const door = /** @type any */ (world.get(id, DoorState));
			/** @type {any} */ const objState = /** @type any */ (world.get(id, ObjectState));
			/** @type {any} */ const col = /** @type any */ (world.get(id, Collider));
			/** @type {any} */ const itemInfo = /** @type any */ (world.get(id, ItemInfo));

			let kind = "default";
			if (door) {
				kind = door.open ? "door_open" : "door_closed";
			} else if (objState && ident?.identity === "furnace") {
				kind = objState.state === "lit" ? "furnace" : "furnace_unlit";
			} else if (objState && ident?.identity === "millstone") {
				kind = objState.state === "working" ? "millstone_active" : "millstone";
			} else if (objState && ident?.identity === "anvil") {
				kind = objState.state === "working" ? "anvil_active" : "anvil";
			} else if (objState && ident?.identity === "lantern_post") {
				kind = objState.state === "lit" ? "lantern_post" : "lantern_post_unlit";
			} else if (objState && ident?.identity === "portcullis") {
				kind = objState.state === "raised" ? "portcullis_raised" : "portcullis";
			} else if (objState && ident?.identity === "pressure_plinth") {
				kind = objState.state === "pressed" ? "pressure_plinth_pressed" : "pressure_plinth";
			} else if (objState && ident?.identity === "mailbox") {
				kind = objState.state === "checking" ? "mailbox_checking"
					: objState.state === "has_mail" ? "mailbox_has_mail"
					: objState.state === "sent" ? "mailbox_sent"
					: "mailbox";
			} else if (isPlayer) {
				kind = ident?.identity || "player";
			} else {
				kind = ident?.identity || ident?.name || "default";
			}
			const harvestNode2 = /** @type {any} */ (world.get(id, HarvestNode));
			if (harvestNode2 && String(harvestNode2.kind || "") === "fishing_spot" && harvestNode2.ready !== true) {
				kind = "fishing_spot_depleted";
			}
			if (harvestNode2 && harvestNode2.ready !== true && Number(harvestNode2.regrowCountdown || 0) > 0) {
				const _hk2 = String(harvestNode2.kind || "");
				if (_hk2 === "iron_ore") kind = "ore_vein_iron_exhausted";
				else if (_hk2 === "coal_ore") kind = "ore_vein_coal_exhausted";
				else if (_hk2 === "stone") kind = "ore_vein_stone_exhausted";
				else if (_hk2 === "berries" || _hk2 === "herbs" || _hk2 === "thorn_bramble" ||
				         _hk2 === "venom_fern" || _hk2 === "moonleaf" || _hk2 === "ember_root") kind = "harvest_node_bare";
			}

			let layer = 300; // actors
			if (itemInfo) layer = 250; // items/ground (above doors/stairs, below actors)
			else if (door) layer = 200; // doors/walls-like entities
			else if (isPlayer) layer = 400; // player on top
			else if (harvestNode2 && String(harvestNode2.kind || "") === "fishing_spot") layer = 210; // water harvest marker

			const stackSeq2 = Number(world.get(id, GroundStackOrder)?.seq || 0) | 0;
			const physSizeClass2 = /** @type {string} */ (world.get(id, Physiology)?.sizeClass || '');
			const iScale2 = itemInfo ? computeItemScale(itemInfo, kind) : 1;
			const vOff2 = itemInfo ? computeVisualOffset(id) : _zeroOff;
			/** @type {EntityView|null} */
			let rec = /** @type any */ (_entityRecs.get(id) || null);
			if (!rec) {
				rec = { id, kind, pos: { x: pos.x, y: pos.y }, tags: [], layer, hp: 0, maxHp: 0, isPet: false, showHealthBar: false, showNameLabel: false, aggroLevel: "", aggroTargetId: 0, aggroTargetReason: "", threatState: "", targetLocked: false, procStates: null, stackSeq: stackSeq2, facing: null, weaponVfx: null, sizeClass: physSizeClass2, itemScale: iScale2, rotation: 0, visualOff: vOff2 };
				_entityRecs.set(id, rec);
			} else {
				rec.kind = kind;
				rec.layer = layer;
				rec.pos.x = pos.x; rec.pos.y = pos.y;
				rec.tags.length = 0;
				rec.procStates = null;
				rec.equipBadges = null;
				rec.stackSeq = stackSeq2;
				rec.facing = null;
				rec.aggroLevel = "";
				rec.aggroTargetId = 0;
				rec.aggroTargetReason = "";
				rec.weaponVfx = null;
				rec.matOptical = null;
				rec.sizeClass = physSizeClass2;
				rec.itemScale = iScale2;
				rec.rotation = 0;
				rec.visualOff = vOff2;
				rec.entranceBadge = null;
			}

			// Project select status types into tags for display-only logic.
			projectDisplayTags(world, id, rec);
			projectEquipmentDisplayTags(world, id, rec);
			projectInteractableDisplayTags(world, id, kind, rec);
			projectTrapDisplayTags(world, id, rec);
			projectMonsterDefTags(kind, rec);
			projectItemAffixDisplayTags(kind, itemInfo, rec, world.get(id, Material)?.kind ?? null);
			projectCombatUi(world, id, rec, '');
			projectAggroUi(world, id, rec);
			projectProcStateTags(world, id, rec);
			projectDungeonEntranceBadge(world, id, rec);
			projectFacing(world, id, rec);
			const petState2 = /** @type {any} */ (world.get(id, PetState));
			const isFamiliar2 = String(rec.kind || "").toLowerCase() === "familiar";
			if (isFamiliar2 && petState2 && petState2.rangedCooldown === 0 && !rec.tags.includes("pet_ready_glow")) {
				rec.tags.push("pet_ready_glow");
			}
			if (isAsleep(world, id) && !rec.tags.includes(SLEEP_DISPLAY_TAG)) rec.tags.push(SLEEP_DISPLAY_TAG);
			if (world.has(id, Flying) && !rec.tags.includes('flying')) rec.tags.push('flying');
			if ((kind === "bell" || kind === "tavern_sign") && !rec.tags.includes('above_roof')) rec.tags.push('above_roof');
			if (_questGiverIds.has(id) && !rec.tags.includes('quest_giver')) rec.tags.push('quest_giver');
			if (kind === 'legendary_chest') rec.tags.push('legendary_glowing');
			if (kind === 'epic_chest') rec.tags.push('epic_glowing');
			if (harvestNode2 && String(harvestNode2.kind || "") === "fishing_spot") {
				rec.tags.push(harvestNode2.ready === true ? "fishing_spot_ready" : "fishing_spot_depleted");
				const pressure = Math.max(0, Number(harvestNode2.fishingPressure || 0) | 0);
				if (harvestNode2.ready === true) {
					if (pressure >= 4 || harvestNode2.overfished === true) rec.tags.push("fishing_pressure_overfished");
					else if (pressure >= 2) rec.tags.push("fishing_pressure_medium");
					else rec.tags.push("fishing_pressure_low");
				}
			}

			_allEntities.push(rec);
			collectedIds.add(id);
			if (isPlayer) {
				if (!_view.player) _view.player = { id, pos: { x: pos.x, y: pos.y } };
				else { _view.player.id = id; _view.player.pos.x = pos.x; _view.player.pos.y = pos.y; }
				_view.playerEntity = rec;
			}

			// solids list for display/collision readers (entity-based only: doors)
			if (col && col.solid) {
				let srec = _solidRecs.get(id);
				if (!srec) { srec = { id, x: pos.x, y: pos.y }; _solidRecs.set(id, srec); }
				else { srec.x = pos.x; srec.y = pos.y; }
				_view.solids.push(srec);
			}
		}

		}

		// Pets are always tracked even outside the player-centric view query.
		for (const [id, _pet, pos] of world.query(Pet, Position)) {
			if (collectedIds.has(id)) continue;
			if (!world.isAlive(id)) continue;
			/** @type {any} */ const ident = /** @type any */ (world.get(id, NamedIdentity));
			/** @type {any} */ const col = /** @type any */ (world.get(id, Collider));
			const kind = ident?.identity || ident?.name || "default";
			const stackSeq = Number(world.get(id, GroundStackOrder)?.seq || 0) | 0;
			const petPhysSizeClass = /** @type {string} */ (world.get(id, Physiology)?.sizeClass || '');
			let rec = /** @type any */ (_entityRecs.get(id) || null);
			if (!rec) {
				rec = { id, kind, pos: { x: pos.x, y: pos.y }, tags: [], layer: 300, hp: 0, maxHp: 0, isPet: false, showHealthBar: false, showNameLabel: false, aggroLevel: "", aggroTargetId: 0, aggroTargetReason: "", threatState: "", targetLocked: false, procStates: null, equipBadges: null, stackSeq, facing: null, weaponVfx: null, sizeClass: petPhysSizeClass, itemScale: 1, rotation: 0, visualOff: _zeroOff };
				_entityRecs.set(id, rec);
			} else {
				rec.kind = kind;
				rec.layer = 300;
				rec.pos.x = pos.x; rec.pos.y = pos.y;
				rec.tags.length = 0;
				rec.procStates = null;
				rec.equipBadges = null;
				rec.stackSeq = stackSeq;
				rec.facing = null;
				rec.aggroLevel = "";
				rec.aggroTargetId = 0;
				rec.aggroTargetReason = "";
				rec.weaponVfx = null;
				rec.matOptical = null;
				rec.sizeClass = petPhysSizeClass;
				rec.itemScale = 1;
				rec.rotation = 0;
				rec.visualOff = _zeroOff;
			}

			projectDisplayTags(world, id, rec);
			projectEquipmentDisplayTags(world, id, rec);
			projectMonsterDefTags(kind, rec);
			projectCombatUi(world, id, rec, playerFactionKey);
			projectAggroUi(world, id, rec);
			projectProcStateTags(world, id, rec);
			projectFacing(world, id, rec);
			if (world.has(id, Flying) && !rec.tags.includes("flying")) rec.tags.push("flying");
			if (_questGiverIds.has(id) && !rec.tags.includes("quest_giver")) rec.tags.push("quest_giver");
			// Familiar ready-to-fire glow
			const petState = /** @type {any} */ (world.get(id, PetState));
			const isFamiliar = String(rec.kind || "").toLowerCase() === "familiar";
			if (isFamiliar && petState && petState.rangedCooldown === 0 && !rec.tags.includes("pet_ready_glow")) {
				rec.tags.push("pet_ready_glow");
			}

			_allEntities.push(rec);
			collectedIds.add(id);

			if (col && col.solid) {
				let srec = _solidRecs.get(id);
				if (!srec) { srec = { id, x: pos.x, y: pos.y }; _solidRecs.set(id, srec); }
				else { srec.x = pos.x; srec.y = pos.y; }
				_view.solids.push(srec);
			}
		}

		const thermalSenseRange = thermalSenseStrength > 0
			? (Math.max(playerVisionRadius, THERMAL_BASE_RANGE) + Math.min(6, (thermalSenseStrength | 0) * 2))
		: 0;
	const espSenseRange = espSenseStrength > 0
		? (Math.max(playerVisionRadius, ESP_BASE_RANGE) + 6)
		: 0;

	/** @type {Map<number, boolean>} */
	const visibleById = new Map();
	for (let i = 0; i < _allEntities.length; i++) {
		const rec = _allEntities[i];
		let directVisible = false;
		if (_view.player && rec.id === _view.player.id) {
			directVisible = true;
		} else if (_view.player) {
			directVisible = !!isVisible(rec.pos.x, rec.pos.y);
			if (!directVisible) {
				directVisible = !!hasOverworldAerialLOS(world, {
					sourceId: _view.player.id,
					targetId: rec.id,
					sourcePos: _view.player.pos,
					targetPos: rec.pos,
					range: playerVisionRadius,
				});
			}
			if (
				directVisible
				&& playerFacingForAwareness
				&& awarenessConeDegrees < 360
				&& isPerceptionMonster(world, rec.id, playerFactionKey)
				&& !isPointInFacingCone(
					_view.player.pos.x,
					_view.player.pos.y,
					rec.pos.x,
					rec.pos.y,
					playerFacingForAwareness.dx,
					playerFacingForAwareness.dy,
					awarenessConeDegrees + FACING_CONE_GRID_BIAS_DEG,
				)
			) {
				directVisible = false;
			}
		}
		visibleById.set(rec.id, directVisible);
		if (!directVisible || !_view.player) continue;
		if (!isPerceptionMonster(world, rec.id, playerFactionKey)) continue;
		rememberPerceptionContact(currentDepth, rec.id, {
			x: rec.pos.x,
			y: rec.pos.y,
			kind: rec.kind,
			layer: rec.layer,
			lastSeenTurn: _view.turn,
		});
	}

	const memoryKindPool = memoryTamperStrength > 0
		? listPerceptionKinds(currentDepth, _view.turn, { ttl: MEMORY_TTL_TURNS })
		: [];

	// Filter entities by direct vision and fall back to memory/sense channels.
	for (let i = 0; i < _allEntities.length; i++) {
		const rec = _allEntities[i];
		if (_view.player && rec.id === _view.player.id) {
			_view.entities.push(rec);
			continue;
		}
		if (rec.isPet) {
			_view.entities.push(rec);
			continue;
		}

		if (visibleById.get(rec.id) === true) {
			_view.entities.push(rec);
			continue;
		}
		if (!_view.player) continue;
		if (isFixedDecorationEntity(world, rec.id) && isExplored(rec.pos.x, rec.pos.y)) {
			_view.entities.push(makePerceptionEcho(rec, ["memory_recent", "memory_fixed"], rec.pos));
			continue;
		}
		if (world.has(rec.id, ItemInfo) && isExplored(rec.pos.x, rec.pos.y)) {
			_view.entities.push(makePerceptionEcho(rec, ["memory_recent", "memory_fixed"], rec.pos));
			continue;
		}
		if (!isPerceptionMonster(world, rec.id, playerFactionKey)) continue;

		const dist = chebyshevDistance(_view.player.pos, rec.pos);
		if (dist <= TOUCH_RESOLVE_RANGE) {
			rememberPerceptionContact(currentDepth, rec.id, {
				x: rec.pos.x,
				y: rec.pos.y,
				kind: rec.kind,
				layer: rec.layer,
				lastSeenTurn: _view.turn,
			});
			_view.entities.push(rec);
			continue;
		}
		const memory = projectPerceptionContact(currentDepth, rec.id, _view.turn, {
			ttl: MEMORY_TTL_TURNS,
			seed: _view.seed,
			tamperStrength: memoryTamperStrength,
			kindPool: memoryKindPool,
		});
		if (memory) {
			const tags = memory.tampered
				? ["memory_recent", "memory_tampered"]
				: ["memory_recent"];
			_view.entities.push(makePerceptionEcho(rec, tags, { x: memory.x, y: memory.y }, memory.kind));
			continue;
		}

		if (espSenseStrength > 0 && dist <= espSenseRange && hasMindForEsp(world, rec.id)) {
			_view.entities.push(makePerceptionEcho(rec, ["esp_sensed"], rec.pos));
			continue;
		}

		if (thermalSenseStrength > 0 && dist <= thermalSenseRange) {
			_view.entities.push(makePerceptionEcho(rec, ["thermal_sensed"], rec.pos));
		}
	}
	projectAltarOfferingOverlays(world, _view.entities);

	_view.entities.sort((a, b) => (
		(a.layer - b.layer) ||
		(a.pos.y - b.pos.y) ||
		(a.pos.x - b.pos.x) ||
		(a.id - b.id)
	));

	// Collect engravings (visible or explored tiles)
	for (const [id, eng, pos] of world.query(Engraving, Position)) {
		if (isVisible(pos.x, pos.y) || isExplored(pos.x, pos.y)) {
			_view.engravings.push({ id, text: eng.text, profane: !!eng.profane, pos: { x: pos.x, y: pos.y } });
		}
	}

	const roofTiles = collectOverworldRoofs(world, _view.player?.pos || null);
	for (let i = 0; i < roofTiles.length; i++) {
		_view.roofs.push(roofTiles[i]);
	}

	return _view;
}
