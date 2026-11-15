// Proc state glyph badges — pulsing disc + unicode glyph rendered in world space above entities.
// Shared by the main render loop (src/main.js) and the visual test runner (tools/test-runner.html).

/** @type {Record<string, {glyph:string, r:number, g:number, b:number}>} */
export const PROC_STATE_VIS = {
	doom_clock:         { glyph: '\u231B',       r: 140, g: 60,  b: 220 },  // ⌛ hourglass — shadow countdown
	cataclysm_mark:     { glyph: '\u2726',       r: 255, g: 120, b: 30  },  // ✦ star — marked for detonation
	echo_strike_memory: { glyph: '\u{1F47B}',    r: 80,  g: 150, b: 255 },  // 👻 ghost — spectral echo stored
	soul_mortgage_debt: { glyph: '\u2696\uFE0F', r: 200, g: 50,  b: 50  },  // ⚖️ scales — debt accruing
	echo_grimoire_memory: { glyph: '\u{1F4DA}',  r: 110, g: 170, b: 255 },  // 📚 repeat-spell memory
	kinetic_battery:    { glyph: '\u26A1',       r: 255, g: 235, b: 100 },  // ⚡ charged momentum
	venom_ledger:       { glyph: '\u2623',       r: 95,  g: 205, b: 95  },  // ☣ poison ledger
	hunger_surge:       { glyph: '\u{1F356}',    r: 245, g: 120, b: 80  },  // 🍖 hunger stacks
	warded_retort:      { glyph: '\u{1F6E1}',    r: 125, g: 210, b: 255 },  // 🛡 retort shield
	bloodsport_combo:   { glyph: '\u{1FA78}',    r: 235, g: 75,  b: 75  },  // 🩸 blood combo
	shadow_parry:       { glyph: '\u2694',       r: 170, g: 135, b: 245 },  // ⚔ shadow counter
	moonfire_phase:     { glyph: '\u263D',       r: 250, g: 200, b: 120 },  // ☽ phase tracker
	kill_tempo:         { glyph: '\u266A',       r: 255, g: 175, b: 95  },  // ♪ kill rhythm
	miss_momentum:      { glyph: '\u21BB',       r: 140, g: 180, b: 255 },  // ↻ miss momentum
	debt_harvest:       { glyph: '\u20BF',       r: 210, g: 80,  b: 60  },  // ₿ debt banking
	cataclysm_guard:    { glyph: '\u26E8',       r: 255, g: 145, b: 75  },  // ⛨ protection mark
	shield_guard:       { glyph: '\u{1F6E1}',    r: 120, g: 205, b: 245 },  // 🛡 active shield guard
	shield_broken:      { glyph: '\u26A0',       r: 255, g: 150, b: 85  },  // ⚠ guard broken
	last_stand:         { glyph: '\u2694',       r: 255, g: 75,  b: 55  },  // ⚔ low-health crit passive
	omen_drive:         { glyph: '\u2727',       r: 255, g: 245, b: 120 },  // ✧ omen charge
	pack_hunter_mark:   { glyph: '\u{1F43A}',    r: 210, g: 175, b: 120 },  // 🐺 pack mark
	hunt_mark:          { glyph: '\u{1F3AF}',    r: 250, g: 140, b: 70  },  // 🎯 hunted
	venom_clock:        { glyph: '\u23F1',       r: 80,  g: 200, b: 90  },  // ⏱ poison countdown
	eternal_hunger:     { glyph: '\u221E',       r: 245, g: 120, b: 85  },  // ∞ hunger cycle
	eclipse_phase:      { glyph: '\u25D0',       r: 180, g: 160, b: 230 },  // ◐ eclipse phase
	arrow_instinct:     { glyph: '\u27B3',       r: 120, g: 210, b: 235 },  // ➳ ready shot
	tollwarden_count:   { glyph: '\u{1F514}',    r: 250, g: 185, b: 100 },  // 🔔 toll count
	serpent_hide:       { glyph: '\u{1F40D}',    r: 100, g: 170, b: 85  },  // 🐍 serpent-hide ward
	serpent_riposte:    { glyph: '\u2694',       r: 145, g: 215, b: 125 },  // ⚔ primed riposte
	serpent_specters:   { glyph: '\u{1F47B}',    r: 125, g: 220, b: 145 },  // 👻 spectral serpents
};

const DEFAULT_PROC_VIS = Object.freeze({ glyph: '\u2736', r: 170, g: 185, b: 220 });
const BADGE_BASE_X = 0.30;
const BADGE_BASE_Y = -0.54;
const BADGE_STEP_X = 0.38;
const BADGE_RADIUS = 0.19;

function stableHash(key) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i) >>> 0;
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h >>> 0;
}

/**
 * @param {string} key
 * @returns {{glyph:string, r:number, g:number, b:number}}
 */
export function getProcStateVisual(key) {
	const normalized = String(key || '').trim();
	if (!normalized) return DEFAULT_PROC_VIS;
	const direct = PROC_STATE_VIS[normalized];
	if (direct) return direct;
	const hash = stableHash(normalized);
	const r = 90 + (hash & 0x3f);
	const g = 120 + ((hash >>> 6) & 0x5f);
	const b = 160 + ((hash >>> 12) & 0x5f);
	return { ...DEFAULT_PROC_VIS, r, g, b };
}

/**
 * @param {number} wx
 * @param {number} wy
 * @param {number} index
 */
export function procBadgeWorldCenter(wx, wy, index) {
	return {
		x: wx + BADGE_BASE_X + (index * BADGE_STEP_X),
		y: wy + BADGE_BASE_Y,
		radius: BADGE_RADIUS,
	};
}

/**
 * Draw proc state badge(s) above a world-space position.
 * The canvas context must already be scaled so that 1 unit = 1 tile.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} wx  world x (tile centre)
 * @param {number} wy  world y (tile centre)
 * @param {Array<{key:string, stacks:number}>} procStates
 * @param {number} fxTime  running time in seconds (for pulse animation)
 * @param {number} [entityId]  used for per-entity phase offset
 */
export function drawProcStateBadges(ctx, wx, wy, procStates, fxTime, entityId = 0) {
	if (!procStates || !procStates.length) return;
	for (let i = 0; i < procStates.length; i++) {
		const { key, stacks } = procStates[i];
		const vis = getProcStateVisual(key);
		const freq  = 2.2 + stacks * 0.9;
		const pulse = 0.72 + 0.28 * Math.sin(fxTime * freq + entityId * 0.91);
		const center = procBadgeWorldCenter(wx, wy, i);
		const bx = center.x;
		const by = center.y;
		const radius = center.radius;
		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		// Drop shadow
		ctx.globalAlpha = 0.55 * pulse;
		ctx.fillStyle = 'rgba(0,0,0,0.6)';
		ctx.beginPath();
		ctx.arc(bx, by, radius + 0.04, 0, Math.PI * 2);
		ctx.fill();
		// Colored disc
		ctx.globalAlpha = 0.88 * pulse;
		ctx.fillStyle = `rgba(${vis.r},${vis.g},${vis.b},0.45)`;
		ctx.beginPath();
		ctx.arc(bx, by, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = `rgba(${vis.r},${vis.g},${vis.b},${(0.9 * pulse).toFixed(2)})`;
		ctx.lineWidth = 0.035;
		ctx.stroke();
		// Unicode glyph
		ctx.globalAlpha = pulse;
		ctx.font = '0.28px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = '#fff';
		ctx.fillText(vis.glyph, bx, by);
		// Stack counter (offset bottom-right if > 1)
		if (stacks > 1) {
			ctx.globalAlpha = 1.0;
			ctx.font = 'bold 0.15px monospace';
			ctx.fillStyle = '#ffdd00';
			ctx.fillText(String(stacks), bx + 0.13, by + 0.13);
		}
		ctx.restore();
	}
}
