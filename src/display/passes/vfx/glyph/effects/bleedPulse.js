// Bleed Pulse overlay FX (envelope-aware). Does not render the base glyph.
// Signature: (ctx, glyph, x, y, size, t, dt, seed, baselineY, env)
import { isGoreDisabled } from "../../../../ui/wiring/goreEngine.js";

export function bleedPulse(ctx, glyph, x, y, size, t, dt, seed, baselineY, env) {
  if (isGoreDisabled()) return;
  const a = env ? Math.min(1, env.gain * 1.1) : 1;

  // Heartbeat "lub-dub": two rapid peaks close together, then a long pause
  // One full cardiac cycle every ~1.1s
  const cycle = (t * 0.9 + seed * 0.31) % 1;
  const lub = Math.max(0, 1 - Math.abs(cycle - 0.00) / 0.09);
  const dub = Math.max(0, 1 - Math.abs(cycle - 0.18) / 0.07) * 0.65;
  const beat = Math.max(lub, dub);

  ctx.save();
  ctx.font = size + 'px monospace';
  ctx.textBaseline = 'alphabetic';

  // Crimson glow stroke — pulses on the beat
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = Math.max(1, size * 0.055);
  ctx.strokeStyle = 'rgba(210,25,45,0.90)';
  ctx.shadowColor = 'rgba(255,20,40,1)';
  ctx.shadowBlur = size * (0.10 + 0.32 * beat) * a;
  ctx.globalAlpha = (0.75 + 0.20 * beat) * a;
  ctx.strokeText(glyph, x - size / 2, y);
  ctx.shadowBlur = 0;

  // Dark blood-clot fill for depth
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.22 * a;
  ctx.fillStyle = 'rgba(18,2,5,1)';
  ctx.fillText(glyph, x - size / 2, y);

  // Blood trails — 3 heavy drips, slow and viscous
  ctx.globalCompositeOperation = 'lighter';
  const nDrips = 3;
  for (let i = 0; i < nDrips; i++) {
    const ox = (i - 1) * size * 0.20;
    // Each drip has its own slow phase offset — feels independent, not synchronized
    const phase = t * 1.1 + seed * 2.7 + i * 2.3;
    const dripLen = size * (0.18 + 0.13 * Math.sin(phase));
    const trailAlpha = (0.55 + 0.28 * Math.sin(phase * 0.6)) * a;

    // Trail line — thicker than poison
    ctx.lineWidth = Math.max(1.0, size * 0.042);
    ctx.globalAlpha = trailAlpha;
    ctx.strokeStyle = 'rgba(190,12,28,0.95)';
    ctx.beginPath();
    ctx.moveTo(x + ox, y + size * 0.05);
    ctx.lineTo(x + ox, y + size * 0.05 + dripLen);
    ctx.stroke();

    // Droplet at the tip — grows then falls (size pulses with phase)
    const dropR = Math.max(1.0, size * 0.032 * (0.75 + 0.5 * Math.abs(Math.sin(phase * 0.55))));
    const dropY = y + size * 0.05 + dripLen + dropR;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = trailAlpha * 0.85 * a;
    ctx.fillStyle = 'rgba(160,8,20,0.90)';
    ctx.beginPath();
    // Teardrop: circle with a slight downward point
    ctx.arc(x + ox, dropY, dropR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
  }

  ctx.restore();
}

export default bleedPulse;
