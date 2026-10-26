/**
 * Draw keyboard targeting reticle in world space.
 */
export function drawTargetingReticle({
  bctx,
  targetCursor,
  pendingSpellTargeting,
  pendingRangedTargeting,
  hasPendingSpellTargeting,
  hasPendingThrowTargeting,
  hasPendingEnemyTargeting,
  hasPendingRangedTargeting,
  fxTime,
}) {
  if (!bctx || !targetCursor || (!hasPendingSpellTargeting && !hasPendingThrowTargeting && !hasPendingEnemyTargeting && !hasPendingRangedTargeting)) return;
  bctx.save();
  const cx = targetCursor.x;
  const cy = targetCursor.y;
  const pulse = 0.6 + 0.4 * Math.sin(fxTime * 6.0);

  // Enemy targeting uses a purple/shadow reticle; tile targeting uses gold
  const isEnemy = !!hasPendingEnemyTargeting;
  const circleColor = isEnemy
    ? `rgba(180,60,220,${(0.7 * pulse).toFixed(3)})`
    : hasPendingRangedTargeting
      ? `rgba(80,220,255,${(0.7 * pulse).toFixed(3)})`
      : `rgba(255,220,80,${(0.7 * pulse).toFixed(3)})`;
  const bracketColor = isEnemy
    ? `rgba(220,140,255,${(0.85 * pulse).toFixed(3)})`
    : hasPendingRangedTargeting
      ? `rgba(180,255,255,${(0.85 * pulse).toFixed(3)})`
      : `rgba(255,255,200,${(0.85 * pulse).toFixed(3)})`;
  const spellRadius = hasPendingSpellTargeting
    ? Math.max(0, Number(pendingSpellTargeting?.radius || 0) | 0)
    : 0;

  if (spellRadius > 0) {
    bctx.strokeStyle = isEnemy
      ? `rgba(155,70,220,${(0.22 + 0.12 * pulse).toFixed(3)})`
      : `rgba(255,210,80,${(0.20 + 0.14 * pulse).toFixed(3)})`;
    bctx.lineWidth = 0.045;
    bctx.beginPath();
    bctx.arc(cx, cy, spellRadius + 0.5, 0, Math.PI * 2);
    bctx.stroke();
  }

  bctx.strokeStyle = circleColor;
  bctx.lineWidth = 0.08;
  bctx.beginPath();
  bctx.arc(cx, cy, 0.42, 0, Math.PI * 2);
  bctx.stroke();
  const s = 0.46;
  const l = 0.14;
  bctx.strokeStyle = bracketColor;
  bctx.lineWidth = 0.06;
  bctx.beginPath();
  bctx.moveTo(cx - s, cy - s + l); bctx.lineTo(cx - s, cy - s); bctx.lineTo(cx - s + l, cy - s);
  bctx.moveTo(cx + s, cy - s + l); bctx.lineTo(cx + s, cy - s); bctx.lineTo(cx + s - l, cy - s);
  bctx.moveTo(cx - s, cy + s - l); bctx.lineTo(cx - s, cy + s); bctx.lineTo(cx - s + l, cy + s);
  bctx.moveTo(cx + s, cy + s - l); bctx.lineTo(cx + s, cy + s); bctx.lineTo(cx + s - l, cy + s);
  bctx.stroke();
  bctx.restore();
}
