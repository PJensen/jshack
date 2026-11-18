// Equipment corner badges — tiny icons drawn at the corners of entity glyphs.
// Bottom-right: melee weapon(s) — stacked when dual-wielding.
// Bottom-left:  ranged weapon or zap (wand).
// Top-left:     shield / non-weapon offhand.
// Uses the equipment palette glyph character and fg color.

const BADGE_SCALE = 0.28;        // relative to tile size
const BADGE_ALPHA = 0.88;
const BADGE_Y_OFFSET = 0.32;     // downward from tile center
const BADGE_X_OFFSET = 0.30;     // horizontal offset from tile center
const BADGE_BG_RADIUS = 0.14;    // dark disc behind glyph for readability
const DUAL_X_NUDGE = 0.10;       // horizontal nudge for tightly-packed dual badges
const SHIELD_Y_OFFSET = -0.32;   // upward from tile center (top-left)

/**
 * Draw equipment corner badges on an entity glyph.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} wx - world x (tile centre)
 * @param {number} wy - world y (tile centre)
 * @param {{ weaponGlyph?:string, weaponColor?:string, offhandGlyph?:string, offhandColor?:string, rangedGlyph?:string, rangedColor?:string, shieldGlyph?:string, shieldColor?:string }|null} badges
 * @param {number} fxTime - running time in seconds (for subtle pulse)
 * @param {number} [entityId=0]
 */
export function drawEquipmentBadges(ctx, wx, wy, badges, fxTime, entityId = 0) {
  if (!badges) return;
  const pulse = 0.92 + 0.08 * Math.sin(fxTime * 1.6 + (entityId | 0) * 0.73);

  // Melee weapon(s) — bottom right
  const rx = wx + BADGE_X_OFFSET;
  if (badges.weaponGlyph && badges.offhandGlyph) {
    // Dual-wield: side-by-side )) tightly packed
    _drawBadge(ctx, rx - DUAL_X_NUDGE, wy + BADGE_Y_OFFSET,
      badges.weaponGlyph, badges.weaponColor || '#cccccc', pulse);
    _drawBadge(ctx, rx + DUAL_X_NUDGE, wy + BADGE_Y_OFFSET,
      badges.offhandGlyph, badges.offhandColor || '#cccccc', pulse);
  } else if (badges.weaponGlyph) {
    _drawBadge(ctx, rx, wy + BADGE_Y_OFFSET,
      badges.weaponGlyph, badges.weaponColor || '#cccccc', pulse);
  }

  // Ranged/zap badge — bottom left
  if (badges.rangedGlyph) {
    _drawBadge(ctx, wx - BADGE_X_OFFSET, wy + BADGE_Y_OFFSET,
      badges.rangedGlyph, badges.rangedColor || '#88bbdd', pulse);
  }

  // Shield badge — top left
  if (badges.shieldGlyph) {
    _drawBadge(ctx, wx - BADGE_X_OFFSET, wy + SHIELD_Y_OFFSET,
      badges.shieldGlyph, badges.shieldColor || '#88bbdd', pulse);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} bx
 * @param {number} by
 * @param {string} glyph
 * @param {string} color
 * @param {number} pulse
 */
function _drawBadge(ctx, bx, by, glyph, color, pulse) {
  ctx.save();
  // Dark backing disc for contrast
  ctx.globalAlpha = 0.55 * pulse;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.arc(bx, by, BADGE_BG_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Glyph character
  ctx.globalAlpha = BADGE_ALPHA * pulse;
  ctx.font = `${BADGE_SCALE}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(glyph, bx, by);
  ctx.restore();
}
