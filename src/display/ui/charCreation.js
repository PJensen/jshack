// display/ui/charCreation.js
// Character creation screen. Pure presentation — no rules/ imports (shared/ is OK).
// Data is passed in by main.js via showCharCreation(opts).
import { versionLoaded, getVersionState } from '../../shared/version.js';
import { pickRandomCharacterName } from '../../shared/utils/characterNames.js';
import { getHighscoreVersionLabel, getHighscores } from '../../cloud/tombstones/client.js';
import { ORACULAR_MESSAGES, formatOracularMessageHtml } from '../../shared/data/hints.js';
import { play, preload, startLoop, stopLoop } from '../audio/audioEngine.js';
import { CLASS_ICON_ATLAS, CLASS_NORMAL_MAP_URL } from './atlasIcons.js';

/**
 * @param {{
 *   classes: Array<{ id: string, name: string, icon?: string, iconAtlas?: string, iconId?: string, description: string, deityName: string, deityAlignment: string }>,
 *   defaultSeed?: number,
 *   onConfirm: (result: { name: string, classId: string, seed: number, difficulty: string, onProgress?: (progress: any) => void }, fadeSoundscape: () => void) => Promise<boolean>,
 * }} opts
 * @returns {{ dispose: () => void }}
 */
const SAVED_NAME_KEY = 'jshack.playerName';
function readSavedName() {
  try { return localStorage.getItem(SAVED_NAME_KEY) || ''; } catch { return ''; }
}
function writeSavedName(name) {
  try { localStorage.setItem(SAVED_NAME_KEY, name); } catch {}
}

const UI = Object.freeze({
  panelBg: 'rgba(7, 8, 10, 0.72)',
  text: '#dde2e8',
  muted: '#a29686',
  low: '#918678',
  accent: '#c5d4e3',
  accentMuted: '#ad9f8d',
  inputBg: '#171412',
  inputBorder: '#5b4f44',
  inputFocus: '#9db1c7',
  cardBorder: '#4f443a',
  cardSelectedBorder: '#8f9fb2',
});

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

const CLASS_LIGHT_AMBIENT = 0.2;
const CLASS_LIGHT_DIFFUSE = 1.65;
const CLASS_LIGHT_RADIUS = 66;
const CLASS_LIGHT_SHADOW_FLOOR = 0.12;
const CLASS_LIGHT_HIGHLIGHT_CEILING = 1.85;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      reject(new Error('image loading is unavailable'));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load ${url}`));
    image.src = url;
  });
}

/** Parse the seed input — accepts hex (0x...) or plain integers. Returns null if invalid. */
function parseSeed(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10) >>> 0;
  return null;
}

export function showCharCreation({ classes, defaultSeed = 0xC0FFEE, onConfirm }) {
  let classIndex = Math.floor(Math.random() * classes.length);
  let classIconRafId = null;
  let spiritSwapAnim = null;
  let classIconPauseUntil = 0;
  let spiritX = 42;
  let spiritY = 42;
  let spiritVx = 0;
  let spiritVy = 0;
  let spiritTargetX = 42;
  let spiritTargetY = 42;
  let spiritLastNow = 0;
  let spiritReady = false;
  const classIconStates = [];
  const classIconMaps = Promise.all([
    loadImage(CLASS_ICON_ATLAS.sheetUrl),
    loadImage(CLASS_NORMAL_MAP_URL),
  ]);
  let oracleTimer = null;
  const savedName = readSavedName();
  const fallbackName = savedName || pickRandomCharacterName();
  preload([
    './assets/audio/soundscape.mp3',
    './assets/audio/enter_world.mp3',
    './assets/audio/character_select.mp3',
  ]).catch(() => {});

  // ---- full-viewport container ----
  const panel = document.createElement('div');
  panel.id = 'char-creation';
  Object.assign(panel.style, {
    position: 'fixed', inset: '0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'auto',
    fontFamily: 'monospace', zIndex: '1400',
    color: UI.text,
    overflow: 'hidden',
  });

  // ---- background particle canvas (FULL VIEWPORT, behind everything) ----
  const bgCanvas = document.createElement('canvas');
  Object.assign(bgCanvas.style, {
    position: 'absolute', inset: '0',
    width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '0',
  });
  const bgCtx = bgCanvas.getContext('2d');
  let bgRafId = null;
  let bgLastT = 0;

  // ---- entropy-driven seed (mouse/touch/keyboard/accelerometer → RNG seed) ----
  const entropyPool = [];
  let entropyHash = 0x811C9DC5; // FNV-1a offset basis
  const ENTROPY_TARGET = 64;
  let runeFlash = 0;
  let spiritFlash = 0;
  let spiritFlashTriggered = false;
  let runeRotation = 0;

  function feedEntropy(rawVal) {
    if (entropyPool.length >= ENTROPY_TARGET) return;
    const val = (rawVal ^ (Date.now() & 0xFFFF)) >>> 0;
    entropyPool.push(val);
    for (let shift = 0; shift < 32; shift += 8) {
      entropyHash ^= (val >>> shift) & 0xFF;
      entropyHash = Math.imul(entropyHash, 0x01000193) >>> 0;
    }
    const segs = Math.min(16, Math.floor(entropyPool.length / (ENTROPY_TARGET / 16)));
    const prevSegs = Math.min(16, Math.floor((entropyPool.length - 1) / (ENTROPY_TARGET / 16)));
    if (segs > prevSegs) {
      try { navigator.vibrate?.(segs >= 16 ? [12, 40, 12] : 6); } catch {}
    }
    runeFlash = 1.0;
  }

  // rune canvas (created here so bgLoop can draw; appended to DOM later)
  const runeSize = 80;
  const runeCanvas = document.createElement('canvas');
  runeCanvas.width = runeSize * 2;
  runeCanvas.height = runeSize * 2;
  Object.assign(runeCanvas.style, {
    width: runeSize + 'px', height: runeSize + 'px',
    display: 'block', margin: '0 auto',
  });
  const runeCtx = runeCanvas.getContext('2d');

  function resizeBgCanvas() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  }
  resizeBgCanvas();
  window.addEventListener('resize', resizeBgCanvas);

  // ---- particle arrays ----
  const smoke = [];
  const embers = [];
  const ash = [];
  const hazeBands = [];
  const stars = [];
  const spellMotes = [];

  for (let i = 0; i < 10; i++) {
    smoke.push({
      x: Math.random() * window.innerWidth,
      y: window.innerHeight * (0.35 + Math.random() * 0.8),
      vy: -(2 + Math.random() * 6),
      sway: (Math.random() - 0.5) * 14,
      phase: Math.random() * Math.PI * 2,
      radius: 80 + Math.random() * 170,
      alpha: 0.07 + Math.random() * 0.11,
    });
  }
  for (let i = 0; i < 28; i++) {
    embers.push({
      x: Math.random() * window.innerWidth,
      y: window.innerHeight * (0.55 + Math.random() * 0.5),
      vx: (Math.random() - 0.5) * 10,
      vy: -(8 + Math.random() * 22),
      life: Math.random(),
      size: 0.8 + Math.random() * 2.6,
      heat: 0.3 + Math.random() * 0.7,
      flicker: Math.random() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 50; i++) {
    ash.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: -6 + Math.random() * 12,
      vy: -(2 + Math.random() * 10),
      size: 0.7 + Math.random() * 1.5,
      alpha: 0.08 + Math.random() * 0.13,
      phase: Math.random() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 3; i++) {
    hazeBands.push({
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + i * 0.08,
      alpha: 0.12 + i * 0.05,
      height: 0.24 + i * 0.1,
      tilt: (Math.random() - 0.5) * 0.12,
    });
  }
  for (let i = 0; i < 24; i++) {
    stars.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * (window.innerHeight * 0.48),
      size: 0.6 + Math.random() * 1.4,
      alpha: 0.10 + Math.random() * 0.24,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 0.85,
    });
  }
  for (let i = 0; i < 14; i++) {
    spellMotes.push({
      x: Math.random() * window.innerWidth,
      y: window.innerHeight * (0.36 + Math.random() * 0.6),
      vx: (Math.random() - 0.5) * 8,
      vy: -(8 + Math.random() * 22),
      size: 1 + Math.random() * 2.5,
      alpha: 0.08 + Math.random() * 0.18,
      hue: Math.random() > 0.5 ? 198 : 214,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function resetEmber(p, w, h) {
    p.x = Math.random() * w;
    p.y = h * (0.75 + Math.random() * 0.3);
    p.vx = (Math.random() - 0.5) * 10;
    p.vy = -(8 + Math.random() * 22);
    p.life = 0;
    p.size = 0.8 + Math.random() * 2.6;
    p.heat = 0.3 + Math.random() * 0.7;
    p.flicker = Math.random() * Math.PI * 2;
  }

  function bgLoop(now = 0) {
    bgRafId = requestAnimationFrame(bgLoop);
    const w = bgCanvas.width;
    const h = bgCanvas.height;
    const dt = Math.min(0.05, Math.max(0.008, (now - bgLastT) / 1000 || 0.016));
    bgLastT = now;

    bgCtx.clearRect(0, 0, w, h);

    // dark base
    const baseGrad = bgCtx.createLinearGradient(0, 0, 0, h);
    baseGrad.addColorStop(0, 'rgba(8, 6, 6, 0.92)');
    baseGrad.addColorStop(0.45, 'rgba(20, 10, 8, 0.7)');
    baseGrad.addColorStop(1, 'rgba(30, 12, 9, 0.92)');
    bgCtx.fillStyle = baseGrad;
    bgCtx.fillRect(0, 0, w, h);

    // fire bed — intensified
    const fireBed = bgCtx.createRadialGradient(
      w * 0.5, h * 1.05, Math.min(w, h) * 0.05,
      w * 0.5, h * 1.05, Math.max(w, h) * 0.7,
    );
    fireBed.addColorStop(0, 'rgba(255, 130, 48, 0.34)');
    fireBed.addColorStop(0.35, 'rgba(255, 95, 34, 0.20)');
    fireBed.addColorStop(0.65, 'rgba(255, 74, 24, 0.08)');
    fireBed.addColorStop(1, 'rgba(255, 74, 24, 0)');
    bgCtx.fillStyle = fireBed;
    bgCtx.fillRect(0, 0, w, h);

    // stars
    for (const s of stars) {
      s.phase += dt * s.speed;
      const twinkle = 0.58 + Math.sin(s.phase * 2.2) * 0.42;
      bgCtx.globalAlpha = s.alpha * twinkle;
      bgCtx.fillStyle = '#c9d0dc';
      bgCtx.beginPath();
      bgCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      bgCtx.fill();
      bgCtx.globalAlpha = 1;
    }

    // spell motes
    for (const m of spellMotes) {
      m.phase += dt * 1.6;
      m.x += (m.vx + Math.sin(m.phase * 1.9) * 5) * dt;
      m.y += m.vy * dt;
      if (m.y < -18 || m.x < -20 || m.x > w + 20) {
        m.x = Math.random() * w;
        m.y = h * (0.7 + Math.random() * 0.4);
      }
      const glow = bgCtx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.size * 7);
      glow.addColorStop(0, `hsla(${m.hue}, 88%, 74%, ${m.alpha * 0.9})`);
      glow.addColorStop(0.45, `hsla(${m.hue}, 90%, 61%, ${m.alpha * 0.45})`);
      glow.addColorStop(1, `hsla(${m.hue}, 88%, 48%, 0)`);
      bgCtx.fillStyle = glow;
      bgCtx.beginPath();
      bgCtx.arc(m.x, m.y, m.size * 7, 0, Math.PI * 2);
      bgCtx.fill();
    }

    // smoke
    for (const p of smoke) {
      p.phase += dt * 0.75;
      p.x += (p.sway + Math.sin(p.phase) * 16) * dt;
      p.y += p.vy * dt;
      if (p.y + p.radius < -20) {
        p.y = h + p.radius * (0.4 + Math.random() * 0.8);
        p.x = Math.random() * w;
        p.radius = 80 + Math.random() * 170;
        p.alpha = 0.07 + Math.random() * 0.11;
      }
      const g = bgCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      g.addColorStop(0, `rgba(56, 46, 42, ${p.alpha})`);
      g.addColorStop(0.65, `rgba(37, 30, 28, ${p.alpha * 0.55})`);
      g.addColorStop(1, 'rgba(20, 15, 14, 0)');
      bgCtx.fillStyle = g;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      bgCtx.fill();
    }

    // ash
    for (const p of ash) {
      p.phase += dt * 1.4;
      p.x += (p.vx + Math.sin(p.phase) * 5.5) * dt;
      p.y += p.vy * dt;
      if (p.y < -8 || p.x < -10 || p.x > w + 10) {
        p.x = Math.random() * w;
        p.y = h + Math.random() * 40;
      }
      bgCtx.globalAlpha = p.alpha;
      bgCtx.fillStyle = '#6f5f56';
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      bgCtx.fill();
      bgCtx.globalAlpha = 1;
    }

    // embers
    for (const p of embers) {
      p.life += dt * (0.28 + p.heat * 0.45);
      p.flicker += dt * (1.4 + p.heat * 1.8);
      p.x += (p.vx + Math.sin(p.flicker) * 7) * dt;
      p.y += p.vy * dt;

      const fade = 1 - clamp01(p.life);
      const pulse = 0.55 + Math.sin(p.flicker * 1.8) * 0.45;
      const alpha = clamp01(fade * (0.4 + pulse * 0.8));

      if (p.life >= 1 || p.y < -30 || p.x < -20 || p.x > w + 20) {
        resetEmber(p, w, h);
        continue;
      }

      const size = p.size * (0.75 + p.heat * 0.8) * (0.8 + pulse * 0.4);
      const glow = bgCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 6);
      glow.addColorStop(0, `rgba(255, 240, 196, ${alpha * 0.34})`);
      glow.addColorStop(0.2, `rgba(255, 148, 56, ${alpha * 0.30})`);
      glow.addColorStop(0.58, `rgba(255, 88, 24, ${alpha * 0.16})`);
      glow.addColorStop(1, 'rgba(255, 60, 18, 0)');
      bgCtx.fillStyle = glow;
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, size * 6, 0, Math.PI * 2);
      bgCtx.fill();
    }

    // haze bands
    for (const band of hazeBands) {
      band.phase += dt * band.speed;
      const driftX = Math.sin(band.phase * 1.3 + band.tilt) * w * 0.12;
      const y = h * (0.08 + band.height);
      const grad = bgCtx.createLinearGradient(0, y - 30, w, y + 60);
      grad.addColorStop(0, `rgba(18, 14, 13, ${band.alpha * 0.25})`);
      grad.addColorStop(0.5, `rgba(22, 17, 15, ${band.alpha})`);
      grad.addColorStop(1, `rgba(15, 12, 11, ${band.alpha * 0.25})`);
      bgCtx.save();
      bgCtx.translate(driftX, 0);
      bgCtx.fillStyle = grad;
      bgCtx.fillRect(-w * 0.2, y - 70, w * 1.4, 180);
      bgCtx.restore();
    }

    // atmospheric overlays
    const hazeTop = bgCtx.createLinearGradient(0, 0, 0, h);
    hazeTop.addColorStop(0, 'rgba(8,6,6,0.22)');
    hazeTop.addColorStop(0.36, 'rgba(9,7,7,0.06)');
    hazeTop.addColorStop(1, 'rgba(8,6,6,0.28)');
    bgCtx.fillStyle = hazeTop;
    bgCtx.fillRect(0, 0, w, h);

    const bogMist = bgCtx.createRadialGradient(
      w * 0.17, h * 1.02, Math.min(w, h) * 0.06,
      w * 0.17, h * 1.02, Math.max(w, h) * 0.46,
    );
    bogMist.addColorStop(0, 'rgba(94, 128, 83, 0.18)');
    bogMist.addColorStop(0.48, 'rgba(64, 90, 55, 0.10)');
    bogMist.addColorStop(1, 'rgba(35, 46, 33, 0)');
    bgCtx.fillStyle = bogMist;
    bgCtx.fillRect(0, 0, w, h);

    const rustBand = bgCtx.createLinearGradient(0, h * 0.72, 0, h);
    rustBand.addColorStop(0, 'rgba(96, 50, 36, 0)');
    rustBand.addColorStop(1, 'rgba(96, 50, 36, 0.16)');
    bgCtx.fillStyle = rustBand;
    bgCtx.fillRect(0, h * 0.72, w, h * 0.28);

    const steelSheen = bgCtx.createLinearGradient(0, h * 0.12, w, h * 0.20);
    steelSheen.addColorStop(0, 'rgba(178, 191, 205, 0)');
    steelSheen.addColorStop(0.5, `rgba(178, 191, 205, ${0.04 + (Math.sin(now * 0.00055) + 1) * 0.01})`);
    steelSheen.addColorStop(1, 'rgba(178, 191, 205, 0)');
    bgCtx.fillStyle = steelSheen;
    bgCtx.fillRect(0, 0, w, h * 0.42);

    // vignette
    const vignette = bgCtx.createRadialGradient(
      w * 0.5, h * 0.45, Math.min(w, h) * 0.1,
      w * 0.5, h * 0.45, Math.max(w, h) * 0.68,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.8, 'rgba(0,0,0,0.42)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.74)');
    bgCtx.fillStyle = vignette;
    bgCtx.fillRect(0, 0, w, h);

    // ---- draw entropy rune ----
    const rc = runeCtx;
    const rs = runeSize * 2;
    const rcx = rs / 2, rcy = rs / 2;
    rc.clearRect(0, 0, rs, rs);

    const progress = clamp01(entropyPool.length / ENTROPY_TARGET);
    const litSegs = Math.min(16, Math.floor(progress * 16));
    runeRotation += dt * (0.035 + progress * 0.075);
    runeFlash = Math.max(0, runeFlash - dt * 3.5);
    spiritFlash = Math.max(0, spiritFlash - dt * 1.8);

    // color lerp: steel-blue → amber
    const runeHue = 210 - progress * 172;
    const runeSat = 30 + progress * 50;
    const runeLit = 45 + progress * 20;
    const activeCol = `hsl(${runeHue}, ${runeSat}%, ${runeLit}%)`;
    const dimCol = `hsla(210, 20%, 35%, 0.3)`;
    const glowCol = `hsla(${runeHue}, ${runeSat + 10}%, ${runeLit + 15}%, ${0.15 + runeFlash * 0.4})`;

    // outer glow
    if (progress > 0) {
      const rGlow = rc.createRadialGradient(rcx, rcy, 20, rcx, rcy, rs / 2);
      rGlow.addColorStop(0, glowCol);
      rGlow.addColorStop(1, 'transparent');
      rc.fillStyle = rGlow;
      rc.fillRect(0, 0, rs, rs);
    }

    // outer ring: 16 arc segments
    const outerR = rs * 0.38;
    for (let i = 0; i < 16; i++) {
      const baseAngle = (i / 16) * Math.PI * 2 + runeRotation;
      const gap = 0.12;
      const arcStart = baseAngle + gap;
      const arcEnd = baseAngle + (Math.PI * 2 / 16) - gap;
      const isLit = i < litSegs;

      rc.strokeStyle = isLit ? activeCol : dimCol;
      rc.lineWidth = isLit ? 3 : 1.5;
      rc.lineCap = 'round';
      rc.beginPath();
      rc.arc(rcx, rcy, outerR, arcStart, arcEnd);
      rc.stroke();

      if (isLit && runeFlash > 0.3) {
        rc.strokeStyle = `hsla(${runeHue}, 90%, 85%, ${runeFlash * 0.6})`;
        rc.lineWidth = 5;
        rc.beginPath();
        rc.arc(rcx, rcy, outerR, arcStart, arcEnd);
        rc.stroke();
      }
    }

    // inner ring: 8 rune tick marks
    const innerR = rs * 0.24;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + runeRotation * -0.6;
      const isLit = litSegs >= (i + 1) * 2;
      rc.strokeStyle = isLit ? activeCol : dimCol;
      rc.lineWidth = isLit ? 2.5 : 1;
      rc.lineCap = 'round';
      const r0 = innerR - 8;
      const r1 = innerR + 8;
      rc.beginPath();
      rc.moveTo(rcx + Math.cos(angle) * r0, rcy + Math.sin(angle) * r0);
      rc.lineTo(rcx + Math.cos(angle) * r1, rcy + Math.sin(angle) * r1);
      rc.stroke();
    }

    // center orb
    const orbPulse = 0.6 + Math.sin(now * 0.003) * 0.4;
    const orbR = 5 + progress * 4;
    const orbGrad = rc.createRadialGradient(rcx, rcy, 0, rcx, rcy, orbR + 10);
    orbGrad.addColorStop(0, `hsla(${runeHue}, ${runeSat + 20}%, ${runeLit + 25}%, ${0.5 + orbPulse * 0.5})`);
    orbGrad.addColorStop(0.5, `hsla(${runeHue}, ${runeSat}%, ${runeLit}%, ${0.2 + orbPulse * 0.15})`);
    orbGrad.addColorStop(1, 'transparent');
    rc.fillStyle = orbGrad;
    rc.beginPath();
    rc.arc(rcx, rcy, orbR + 10, 0, Math.PI * 2);
    rc.fill();

    // continuously update seed display + label
    if (entropyPool.length > 0 && !seedInput.matches(':focus')) {
      seedInput.value = '0x' + (entropyHash >>> 0).toString(16).toUpperCase();
    }
    if (progress >= 1 && !spiritFlashTriggered) {
      spiritFlashTriggered = true;
      spiritFlash = 1;
    }
  }
  bgLoop();

  // ---- inner box (semi-transparent so flames show through) ----
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'relative', zIndex: '1',
    width: 'min(420px, 88vw)',
    textAlign: 'center',
    background: 'rgba(10, 9, 8, 0.78)',
    border: '1px solid rgba(80, 70, 60, 0.4)',
    borderRadius: '12px',
    padding: '28px 24px 22px',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 28px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(188,206,224,0.06)',
  });

  // ---- version + badges (top-right) ----
  const versionRow = document.createElement('div');
  Object.assign(versionRow.style, {
    position: 'absolute', top: '8px', right: '12px',
    fontSize: '10px', color: UI.low, opacity: '0.8',
    display: 'inline-flex', alignItems: 'center', gap: '5px',
  });

  const versionEl = document.createElement('span');
  versionRow.appendChild(versionEl);

  const betaBadge = document.createElement('span');
  betaBadge.textContent = 'BETA';
  Object.assign(betaBadge.style, {
    fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.10em',
    color: '#ffd7bf', border: '1px solid #8b4f34', borderRadius: '999px',
    padding: '1px 6px', lineHeight: '1.4',
    background: 'rgba(116,44,20,0.40)',
  });
  versionRow.appendChild(betaBadge);
  try {
    betaBadge.animate(
      [
        { opacity: 0.65, transform: 'translateY(0px)' },
        { opacity: 1, transform: 'translateY(-1px)' },
      ],
      { duration: 1200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );
  } catch {}

  box.appendChild(versionRow);
  versionLoaded.then(() => {
    const ver = /** @type {any} */ (window).VERSION;
    if (!ver) return;
    versionEl.textContent = `v${ver} `;
    const state = getVersionState();
    if (!state.isNew) return;
    const badge = document.createElement('span');
    badge.textContent = 'NEW';
    Object.assign(badge.style, {
      fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.08em',
      color: '#ffd8bf', background: 'rgba(116,44,20,0.42)',
      border: '1px solid #8f4e2d', borderRadius: '999px',
      padding: '1px 5px', lineHeight: '1.4',
    });
    versionRow.insertBefore(badge, betaBadge);
    try {
      const entrance = badge.animate(
        [
          { transform: 'scale(0)', opacity: 0, filter: 'brightness(3)' },
          { transform: 'scale(4)', opacity: 1, filter: 'brightness(2.5)', offset: 0.45 },
          { transform: 'scale(3.5)', opacity: 1, filter: 'brightness(2)', offset: 0.55 },
          { transform: 'scale(1)', opacity: 1, filter: 'brightness(1.25)' },
        ],
        { duration: 520, easing: 'cubic-bezier(0.22,1.5,0.36,1)', fill: 'forwards' },
      );
      entrance.finished.then(() => {
        badge.animate(
          [
            { transform: 'translateY(0px)', opacity: 0.75, filter: 'brightness(1)' },
            { transform: 'translateY(-1px)', opacity: 1, filter: 'brightness(1.25)' },
          ],
          { duration: 700, easing: 'ease-in-out', direction: 'alternate', iterations: Infinity },
        );
      });
    } catch {}
  }).catch(() => {});

  // ---- help link (top-left) ----
  const helpLink = document.createElement('a');
  helpLink.textContent = '\u2139';
  helpLink.href = './tools/help/';
  helpLink.target = '_blank';
  helpLink.rel = 'noopener';
  helpLink.title = 'Help & Reference';
  Object.assign(helpLink.style, {
    position: 'absolute', top: '8px', left: '12px',
    width: '22px', height: '22px',
    display: 'grid', placeItems: 'center',
    borderRadius: '4px', border: '1px solid rgba(80,70,60,0.3)',
    background: 'transparent', color: UI.low,
    fontSize: '13px', textDecoration: 'none', lineHeight: '1',
    transition: 'color 120ms, border-color 120ms',
  });
  helpLink.addEventListener('pointerenter', () => { helpLink.style.color = UI.accent; helpLink.style.borderColor = UI.inputFocus; });
  helpLink.addEventListener('pointerleave', () => { helpLink.style.color = UI.low; helpLink.style.borderColor = 'rgba(80,70,60,0.3)'; });
  box.appendChild(helpLink);

  // ---- name input (at top) ----
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = fallbackName;
  nameInput.maxLength = 24;
  nameInput.placeholder = 'Name';
  nameInput.setAttribute('autocomplete', 'off');
  nameInput.setAttribute('autocapitalize', 'words');
  Object.assign(nameInput.style, {
    display: 'block', width: '100%', boxSizing: 'border-box',
    padding: '10px 14px', marginBottom: '20px',
    fontSize: '20px', fontFamily: 'monospace', fontWeight: 'bold',
    background: 'transparent', color: '#e8edf2',
    border: 'none', borderBottom: '1px solid rgba(120,110,100,0.35)',
    borderRadius: '0', outline: 'none',
    textAlign: 'center', letterSpacing: '0.03em',
    transition: 'border-color 140ms',
  });
  nameInput.addEventListener('focus', () => { nameInput.style.borderBottomColor = UI.inputFocus; });
  nameInput.addEventListener('blur', () => { nameInput.style.borderBottomColor = 'rgba(120,110,100,0.35)'; });
  box.appendChild(nameInput);

  // ---- class carousel (smooth-scrolling horizontal strip) ----
  const carouselWrap = document.createElement('div');
  Object.assign(carouselWrap.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '0', marginBottom: '8px', userSelect: 'none',
  });

  function makeArrow(text, dir) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    Object.assign(btn.style, {
      background: 'none', border: 'none',
      color: UI.muted, fontSize: '28px',
      cursor: 'pointer', padding: '8px 14px',
      transition: 'color 120ms, transform 120ms',
      lineHeight: '1', fontFamily: 'monospace',
      touchAction: 'manipulation', flexShrink: '0',
    });
    btn.addEventListener('pointerenter', () => { btn.style.color = UI.accent; });
    btn.addEventListener('pointerleave', () => { btn.style.color = UI.muted; });
    btn.addEventListener('pointerdown', () => {
      btn.style.transform = `translateX(${dir * 2}px)`;
      setTimeout(() => { btn.style.transform = ''; }, 120);
    });
    return btn;
  }

  const prevBtn = makeArrow('\u2039', -1);
  const nextBtn = makeArrow('\u203A', 1);

  // Scroll viewport — shows one slide at a time, smooth scroll between them
  const scrollViewport = document.createElement('div');
  Object.assign(scrollViewport.style, {
    position: 'relative', flex: '1', width: '100%', minWidth: '0',
    overflow: 'hidden',
  });

  const scrollTrack = document.createElement('div');
  Object.assign(scrollTrack.style, {
    display: 'flex',
    width: '100%',
    transition: 'transform 320ms cubic-bezier(0.25, 0.9, 0.3, 1)',
    willChange: 'transform',
  });

  const slides = [];
  for (const cls of classes) {
    const slide = document.createElement('div');
    Object.assign(slide.style, {
      flex: '0 0 100%', width: '100%',
      textAlign: 'center', padding: '8px 0',
      boxSizing: 'border-box',
    });

    const icon = document.createElement('div');
    Object.assign(icon.style, {
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      width: '100%', height: '176px',
      fontSize: '48px', lineHeight: '1.1',
      marginBottom: '6px',
      filter: 'saturate(0.85) brightness(0.92)',
    });
    icon.textContent = cls.icon || cls.name[0];
    icon.setAttribute('aria-label', `${cls.name} class icon`);
    // Each class owns its spirit state. The carousel only pauses/resumes it;
    // changing classes must never reset the spirit's chosen position.
    classIconStates.push({
      cls, element: icon, canvas: null, pixels: null, normals: null,
      x: 42, y: 42, vx: 0, vy: 0, targetX: 42, targetY: 42, lastNow: 0,
    });

    const name = document.createElement('div');
    Object.assign(name.style, {
      fontSize: '18px', fontWeight: 'bold',
      color: '#d7e3f1', letterSpacing: '0.08em',
      textTransform: 'uppercase', marginBottom: '6px',
    });
    name.textContent = cls.name;

    const desc = document.createElement('div');
    Object.assign(desc.style, {
      fontSize: '12px', color: UI.muted,
      lineHeight: '1.4', padding: '0 8px',
      minHeight: '34px',
    });
    desc.textContent = cls.description;

    const deity = document.createElement('div');
    Object.assign(deity.style, {
      fontSize: '11px', color: UI.low,
      fontStyle: 'italic', marginTop: '4px',
    });
    deity.textContent = `${cls.deityName} \u2022 ${cls.deityAlignment}`;

    slide.appendChild(icon);
    slide.appendChild(name);
    slide.appendChild(desc);
    slide.appendChild(deity);
    scrollTrack.appendChild(slide);
    slides.push(slide);
  }

  scrollViewport.appendChild(scrollTrack);
  const spiritOverlay = document.createElement('canvas');
  spiritOverlay.width = 128;
  spiritOverlay.height = 128;
  Object.assign(spiritOverlay.style, {
    position: 'absolute', top: '8px', left: '50%',
    width: '176px', height: '176px',
    transform: 'translateX(-50%)',
    pointerEvents: 'none', zIndex: '3',
  });
  const spiritOverlayCtx = spiritOverlay.getContext('2d');
  scrollViewport.appendChild(spiritOverlay);

  function launchBootSpiritHandoff() {
    const source = document.getElementById('boot-sigil');
    if (!source || !document.body || typeof spiritOverlay.getBoundingClientRect !== 'function') return;
    const from = source.getBoundingClientRect();
    const to = spiritOverlay.getBoundingClientRect();
    const orb = document.createElement('div');
    Object.assign(orb.style, {
      position: 'fixed', left: '0', top: '0', width: '14px', height: '14px',
      borderRadius: '50%', pointerEvents: 'none', zIndex: '10001',
      background: '#f2d9aa',
      boxShadow: '0 0 10px #f2d9aa, 0 0 30px rgba(226, 161, 100, 0.84)',
    });
    document.body.appendChild(orb);
    const fromX = from.left + from.width / 2 - 7;
    const fromY = from.top + from.height / 2 - 7;
    const toX = to.left + to.width / 2 - 7;
    const toY = to.top + to.height / 2 - 7;
    orb.style.transform = `translate(${fromX}px, ${fromY}px)`;
    try {
      const animation = orb.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px) scale(1)`, opacity: 0.95 },
          { transform: `translate(${(fromX + toX) / 2 - 34}px, ${(fromY + toY) / 2 - 42}px) scale(0.62)`, opacity: 0.5, offset: 0.52 },
          { transform: `translate(${toX}px, ${toY}px) scale(1.25)`, opacity: 0 },
        ],
        { duration: 1050, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)', fill: 'forwards' },
      );
      animation.finished.then(() => orb.remove()).catch(() => orb.remove());
    } catch {
      orb.remove();
    }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(launchBootSpiritHandoff);
  carouselWrap.appendChild(prevBtn);
  carouselWrap.appendChild(scrollViewport);
  carouselWrap.appendChild(nextBtn);
  box.appendChild(carouselWrap);

  // ---- dot indicators ----
  const dotsRow = document.createElement('div');
  Object.assign(dotsRow.style, {
    display: 'flex', justifyContent: 'center', gap: '6px',
    marginBottom: '18px',
  });
  const dots = [];
  for (let i = 0; i < classes.length; i++) {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      width: '6px', height: '6px', borderRadius: '50%',
      background: UI.low, opacity: '0.3',
      transition: 'opacity 150ms, background 150ms, transform 150ms',
      cursor: 'pointer',
    });
    dot.addEventListener('pointerdown', () => { scrollTo(i); });
    dotsRow.appendChild(dot);
    dots.push(dot);
  }
  box.appendChild(dotsRow);

  function prepareClassIcon(state, colorImage, normalImage) {
    const sprite = CLASS_ICON_ATLAS.entries.get(state.cls.iconId || state.cls.id);
    if (!sprite) return;
    const source = document.createElement('canvas');
    source.width = 256;
    source.height = 256;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    const output = document.createElement('canvas');
    output.width = 128;
    output.height = 128;
    const outputCtx = output.getContext('2d');
    if (!sourceCtx || !outputCtx) return;

    sourceCtx.clearRect(0, 0, 256, 256);
    sourceCtx.drawImage(colorImage, sprite.x * 256, sprite.y * 256, 256, 256, 0, 0, 256, 256);
    const pixels = sourceCtx.getImageData(0, 0, 256, 256).data;
    sourceCtx.clearRect(0, 0, 256, 256);
    sourceCtx.drawImage(normalImage, sprite.x * 256, sprite.y * 256, 256, 256, 0, 0, 256, 256);
    const normals = sourceCtx.getImageData(0, 0, 256, 256).data;
    state.canvas = output;
    state.ctx = outputCtx;
    state.pixels = pixels;
    state.normals = normals;
    if (!spiritReady) {
      chooseSpiritTarget(state.pixels);
      spiritReady = true;
    }
    state.element.replaceChildren(output);
    Object.assign(output.style, { width: '176px', height: '176px', imageRendering: 'pixelated' });
  }

  function chooseSpiritTarget(pixels) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = 5 + Math.floor(Math.random() * 74);
      const y = 5 + Math.floor(Math.random() * 74);
      const sourceIndex = ((y * 3) * 256 + (x * 3)) * 4;
      if (pixels?.[sourceIndex + 3] > 12) {
        spiritTargetX = x;
        spiritTargetY = y;
        return;
      }
    }
    spiritTargetX = 42;
    spiritTargetY = 42;
  }

  function updateSpiritLight(state, now) {
    if (now < classIconPauseUntil) return;
    const dt = Math.min(0.05, Math.max(0.008, (now - spiritLastNow) / 1000 || 0.016));
    spiritLastNow = now;
    const dx = spiritTargetX - spiritX;
    const dy = spiritTargetY - spiritY;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    spiritVx += (dx / distance) * dt * 20;
    spiritVy += (dy / distance) * dt * 20;
    spiritVx *= Math.pow(0.12, dt);
    spiritVy *= Math.pow(0.12, dt);
    spiritX = Math.max(4, Math.min(80, spiritX + spiritVx * dt));
    spiritY = Math.max(4, Math.min(80, spiritY + spiritVy * dt));
    if (distance < 7 || Math.random() < dt * 0.08) chooseSpiritTarget(state.pixels);
  }

  function renderClassIcon(state) {
    if (!state.canvas || !state.pixels || !state.normals) return;
    const image = state.ctx.createImageData(84, 84);
    const artOffset = 22;
    const lightX = artOffset + spiritX;
    const lightY = artOffset + spiritY;
    for (let y = 0; y < 84; y++) {
      for (let x = 0; x < 84; x++) {
        const sourceIndex = ((y * 3) * 256 + (x * 3)) * 4;
        const outputIndex = (y * 84 + x) * 4;
        const alpha = state.pixels[sourceIndex + 3];
        if (alpha === 0) continue;
        const nx = state.normals[sourceIndex] / 127.5 - 1;
        const ny = state.normals[sourceIndex + 1] / 127.5 - 1;
        const nz = state.normals[sourceIndex + 2] / 127.5 - 1;
        const dx = spiritX - x;
        const dy = spiritY - y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const diffuse = (nx * dx / distance) + (ny * dy / distance) + nz * 0.45;
        const falloff = Math.pow(Math.max(0, 1 - distance / CLASS_LIGHT_RADIUS), 1.35);
        const lightResponse = diffuse * falloff;
        const brightness = Math.max(
          CLASS_LIGHT_SHADOW_FLOOR,
          Math.min(CLASS_LIGHT_HIGHLIGHT_CEILING, CLASS_LIGHT_AMBIENT + lightResponse * CLASS_LIGHT_DIFFUSE),
        );
        const warmLift = Math.max(0, lightResponse);
        image.data[outputIndex] = Math.min(255, state.pixels[sourceIndex] * brightness + 20 * warmLift);
        image.data[outputIndex + 1] = Math.min(255, state.pixels[sourceIndex + 1] * brightness + 9 * warmLift);
        image.data[outputIndex + 2] = Math.min(255, state.pixels[sourceIndex + 2] * brightness);
        image.data[outputIndex + 3] = alpha;
      }
    }
    state.ctx.clearRect(0, 0, 128, 128);
    state.ctx.putImageData(image, artOffset, artOffset);

    const progress = clamp01(entropyPool.length / ENTROPY_TARGET);
    const litSegs = Math.min(16, Math.floor(progress * 16));
    const runeHue = 210 - progress * 172;
    state.ctx.save();
    state.ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const baseAngle = (i / 16) * Math.PI * 2 + runeRotation;
      const arcStart = baseAngle + 0.12;
      const arcEnd = baseAngle + (Math.PI * 2 / 16) - 0.12;
      const isLit = i < litSegs;
      state.ctx.strokeStyle = isLit
        ? `hsla(${runeHue}, 72%, 76%, ${0.62 + spiritFlash * 0.38})`
        : `hsla(210, 20%, 48%, ${0.18 + progress * 0.12})`;
      state.ctx.lineWidth = isLit ? 2.5 : 1;
      state.ctx.lineCap = 'round';
      state.ctx.beginPath();
      state.ctx.arc(64, 64, 53, arcStart, arcEnd);
      state.ctx.stroke();
    }
    if (spiritFlash > 0) {
      state.ctx.strokeStyle = `hsla(${runeHue}, 90%, 84%, ${spiritFlash * 0.7})`;
      state.ctx.lineWidth = 5;
      state.ctx.beginPath();
      state.ctx.arc(64, 64, 53, runeRotation, runeRotation + Math.PI * 1.8);
      state.ctx.stroke();
    }
    state.ctx.restore();
  }

  function renderSpiritOverlay() {
    if (!spiritOverlayCtx) return;
    spiritOverlayCtx.clearRect(0, 0, 128, 128);
    const lightX = 22 + spiritX;
    const lightY = 22 + spiritY;
    const flash = 1 + spiritFlash * 2.8;
    const glow = spiritOverlayCtx.createRadialGradient(lightX, lightY, 0, lightX, lightY, 16 + spiritFlash * 10);
    glow.addColorStop(0, `rgba(255, 238, 177, ${Math.min(1, 0.95 * flash)})`);
    glow.addColorStop(0.18, `rgba(255, 184, 76, ${Math.min(1, 0.62 * flash)})`);
    glow.addColorStop(0.42, `rgba(255, 125, 38, ${Math.min(0.8, 0.30 * flash)})`);
    glow.addColorStop(1, 'rgba(255, 103, 32, 0)');
    spiritOverlayCtx.globalCompositeOperation = 'lighter';
    spiritOverlayCtx.fillStyle = glow;
    spiritOverlayCtx.fillRect(0, 0, 128, 128);

  }

  function animateClassIcons(now) {
    classIconRafId = requestAnimationFrame(animateClassIcons);
    const state = classIconStates[classIndex];
    if (state) {
      updateSpiritLight(state, now);
      renderClassIcon(state);
    }
    renderSpiritOverlay();
  }

  classIconMaps.then(([colorImage, normalImage]) => {
    for (const state of classIconStates) prepareClassIcon(state, colorImage, normalImage);
    if (typeof requestAnimationFrame === 'function') classIconRafId = requestAnimationFrame(animateClassIcons);
  }).catch(() => {});

  function scrollTo(idx, opts = {}) {
    if (classIconStates[classIndex] && classIconStates[idx] && classIconStates[classIndex] !== classIconStates[idx]) {
      spiritVx = 0;
      spiritVy = 0;
      spiritLastNow = 0;
      classIconPauseUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + 360;
      if (spiritSwapAnim) { try { spiritSwapAnim.cancel(); } catch {} }
      try {
        spiritSwapAnim = spiritOverlay.animate(
          [
            { transform: 'translateX(-50%) scale(1)', opacity: 1, filter: 'brightness(1)' },
            { transform: 'translateX(-50%) scale(0.58)', opacity: 0.42, filter: 'brightness(0.72)', offset: 0.46 },
            { transform: 'translateX(-50%) scale(1)', opacity: 1, filter: 'brightness(1)' },
          ],
          { duration: 520, easing: 'cubic-bezier(0.22, 0.8, 0.28, 1)' },
        );
      } catch {}
    }
    classIndex = idx;
    scrollTrack.style.transform = `translateX(-${classIndex * 100}%)`;
    refreshConfirmCta();
    for (let i = 0; i < dots.length; i++) {
      dots[i].style.opacity = i === classIndex ? '1' : '0.3';
      dots[i].style.background = i === classIndex ? UI.accent : UI.low;
      dots[i].style.transform = i === classIndex ? 'scale(1.3)' : 'scale(1)';
    }
    if (!opts?.silent) play('./assets/audio/character_select.mp3', { bus: 'ui', volume: 0.7, priority: 1 });
  }

  prevBtn.addEventListener('pointerdown', () => {
    scrollTo((classIndex - 1 + classes.length) % classes.length);
  });
  nextBtn.addEventListener('pointerdown', () => {
    scrollTo((classIndex + 1) % classes.length);
  });

  // ---- hard mode checkbox (rendered inside confirm button, created here) ----
  const hardInput = document.createElement('input');
  hardInput.type = 'checkbox';
  hardInput.checked = false;
  Object.assign(hardInput.style, { position: 'absolute', opacity: '0', pointerEvents: 'none' });

  // ---- tutorial toggle ----
  const tutRow = document.createElement('label');
  Object.assign(tutRow.style, {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    cursor: 'pointer', userSelect: 'none',
    marginLeft: '18px',
    marginBottom: '16px',
    touchAction: 'manipulation',
  });
  const tutInput = document.createElement('input');
  tutInput.type = 'checkbox';
  // Default on if any tips remain unseen (partially complete resumes).
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('jshack:spiritGuide:seen:v1') : null;
    const seen = raw ? JSON.parse(raw) : [];
    const total = typeof opts?.tutorialTipCount === 'number' ? opts.tutorialTipCount : 15;
    tutInput.checked = !Array.isArray(seen) || seen.length < total;
  } catch { tutInput.checked = true; }
  Object.assign(tutInput.style, { position: 'absolute', opacity: '0', pointerEvents: 'none' });

  const tutBox = document.createElement('span');
  Object.assign(tutBox.style, {
    width: '18px', height: '18px',
    border: '1px solid rgba(90,100,115,0.5)',
    borderRadius: '4px',
    background: 'transparent',
    display: 'grid', placeItems: 'center',
    color: 'transparent', fontSize: '11px',
    transition: 'border-color 120ms, color 120ms, box-shadow 120ms',
  });
  tutBox.textContent = '\u2726';

  const tutLabel = document.createElement('span');
  tutLabel.textContent = 'Tutorial';
  Object.assign(tutLabel.style, {
    fontSize: '12px', color: UI.muted,
    textTransform: 'uppercase', letterSpacing: '0.10em',
  });

  function renderTut() {
    if (tutInput.checked) {
      tutBox.style.borderColor = '#8ca2ba';
      tutBox.style.color = '#d3e2f1';
      tutBox.style.boxShadow = '0 0 8px rgba(127,152,178,0.2)';
      tutLabel.style.color = '#c2d2e1';
    } else {
      tutBox.style.borderColor = 'rgba(90,100,115,0.5)';
      tutBox.style.color = 'transparent';
      tutBox.style.boxShadow = '';
      tutLabel.style.color = UI.muted;
    }
  }
  tutInput.addEventListener('change', renderTut);
  renderTut();
  tutRow.appendChild(tutInput);
  tutRow.appendChild(tutBox);
  tutRow.appendChild(tutLabel);
  box.appendChild(tutRow);

  // ---- no-gore toggle ----
  const goreRow = document.createElement('label');
  Object.assign(goreRow.style, {
    display: 'none', alignItems: 'center', gap: '8px',
    cursor: 'pointer', userSelect: 'none',
    marginLeft: '18px',
    marginBottom: '16px',
    touchAction: 'manipulation',
  });
  const goreInput = document.createElement('input');
  goreInput.type = 'checkbox';
  goreInput.checked = false;
  Object.assign(goreInput.style, { position: 'absolute', opacity: '0', pointerEvents: 'none' });

  const goreBox = document.createElement('span');
  Object.assign(goreBox.style, {
    width: '18px', height: '18px',
    border: '1px solid rgba(90,100,115,0.5)',
    borderRadius: '4px',
    background: 'transparent',
    display: 'grid', placeItems: 'center',
    color: 'transparent', fontSize: '11px',
    transition: 'border-color 120ms, color 120ms, box-shadow 120ms',
  });
  goreBox.textContent = '\u2726';

  const goreLabel = document.createElement('span');
  goreLabel.textContent = 'No Gore';
  Object.assign(goreLabel.style, {
    fontSize: '12px', color: UI.muted,
    textTransform: 'uppercase', letterSpacing: '0.10em',
  });

  function renderGore() {
    if (goreInput.checked) {
      goreBox.style.borderColor = '#8ca2ba';
      goreBox.style.color = '#d3e2f1';
      goreBox.style.boxShadow = '0 0 8px rgba(127,152,178,0.2)';
      goreLabel.style.color = '#c2d2e1';
    } else {
      goreBox.style.borderColor = 'rgba(90,100,115,0.5)';
      goreBox.style.color = 'transparent';
      goreBox.style.boxShadow = '';
      goreLabel.style.color = UI.muted;
    }
  }
  goreInput.addEventListener('change', renderGore);
  renderGore();
  goreRow.appendChild(goreInput);
  goreRow.appendChild(goreBox);
  goreRow.appendChild(goreLabel);
  box.appendChild(goreRow);
  box.appendChild(document.createElement('br'));

  // ---- confirm button (with inline hard-mode checkbox) ----
  const confirmBtn = document.createElement('button');
  Object.assign(confirmBtn.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%',
    padding: '14px',
    fontSize: '15px', fontWeight: 'bold', fontFamily: 'monospace',
    background: 'linear-gradient(180deg, #2a2f35 0%, #1f2329 100%)',
    color: '#dce5ef',
    border: '1px solid #6f7d8d',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'transform 120ms, border-color 120ms, box-shadow 120ms',
    touchAction: 'manipulation',
    marginBottom: '14px',
    gap: '10px',
  });

  const confirmText = document.createElement('span');
  const hardToggle = document.createElement('label');
  Object.assign(hardToggle.style, {
    display: 'none', alignItems: 'center', gap: '5px',
    cursor: 'pointer', userSelect: 'none',
    marginLeft: '6px',
    fontSize: '11px',
    touchAction: 'manipulation',
  });

  const hardBox = document.createElement('span');
  Object.assign(hardBox.style, {
    width: '16px', height: '16px',
    border: '1px solid rgba(90,100,115,0.5)',
    borderRadius: '3px',
    background: 'transparent',
    display: 'grid', placeItems: 'center',
    color: 'transparent', fontSize: '10px',
    transition: 'border-color 120ms, color 120ms, box-shadow 120ms',
    flexShrink: '0',
  });
  hardBox.textContent = '\u2726';

  const hardLabel = document.createElement('span');
  hardLabel.textContent = 'Hard';
  Object.assign(hardLabel.style, {
    fontSize: '11px', color: UI.muted,
    textTransform: 'uppercase', letterSpacing: '0.08em',
    transition: 'color 120ms',
  });

  hardToggle.appendChild(hardInput);
  hardToggle.appendChild(hardBox);
  hardToggle.appendChild(hardLabel);

  // Clicking the hard toggle should NOT trigger the confirm action
  hardToggle.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  hardToggle.addEventListener('click', (e) => { e.stopPropagation(); });

  function renderHard() {
    if (hardInput.checked) {
      hardBox.style.borderColor = '#8ca2ba';
      hardBox.style.color = '#d3e2f1';
      hardBox.style.boxShadow = '0 0 6px rgba(127,152,178,0.2)';
      hardLabel.style.color = '#c2d2e1';
    } else {
      hardBox.style.borderColor = 'rgba(90,100,115,0.5)';
      hardBox.style.color = 'transparent';
      hardBox.style.boxShadow = '';
      hardLabel.style.color = UI.muted;
    }
    refreshConfirmCta();
  }
  hardInput.addEventListener('change', renderHard);

  confirmBtn.appendChild(confirmText);
  confirmBtn.appendChild(hardToggle);

  let ctaPulseAnim = null;
  function refreshConfirmCta() {
    const cls = classes[classIndex];
    const hard = hardInput.checked;
    confirmText.textContent = hard ? `Swear and descend as ${cls.name}` : `Begin as ${cls.name}`;
    confirmBtn.style.borderColor = hard ? '#8ca2ba' : '#6f7d8d';
    if (ctaPulseAnim) { try { ctaPulseAnim.cancel(); } catch {} ctaPulseAnim = null; }
    try {
      ctaPulseAnim = confirmBtn.animate(
        [
          { boxShadow: '0 0 0 rgba(155,181,207,0)', filter: 'brightness(1)' },
          { boxShadow: '0 0 18px rgba(155,181,207,0.22)', filter: 'brightness(1.04)' },
        ],
        { duration: 1300, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
      );
    } catch {}
  }
  renderHard();

  confirmBtn.addEventListener('pointerenter', () => {
    confirmBtn.style.transform = 'translateY(-1px)';
    confirmBtn.style.boxShadow = '0 0 18px rgba(140,164,188,0.3)';
  });
  confirmBtn.addEventListener('pointerleave', () => {
    confirmBtn.style.transform = '';
    confirmBtn.style.boxShadow = '';
  });

  let confirming = false;
  function nextPaint() {
    if (typeof requestAnimationFrame !== 'function') return Promise.resolve();
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function showGenerationPanel() {
    box.replaceChildren();
    Object.assign(box.style, {
      width: 'min(420px, 88vw)',
      padding: '28px 24px 24px',
      textAlign: 'left',
    });

    const title = document.createElement('div');
    title.textContent = 'Generating World';
    Object.assign(title.style, {
      color: '#e3edf6',
      fontSize: '18px',
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: '8px',
      letterSpacing: '0.02em',
    });
    box.appendChild(title);

    // Single live status line — replaced in place with the current generation
    // step. No fixed list, no log, no rewinds.
    const status = document.createElement('div');
    status.textContent = 'Starting…';
    Object.assign(status.style, {
      color: '#e6d1a0',
      fontSize: '13px',
      textAlign: 'center',
      padding: '14px 0',
      borderTop: '1px solid rgba(120, 105, 90, 0.22)',
      borderBottom: '1px solid rgba(120, 105, 90, 0.22)',
      fontFamily: 'monospace',
      letterSpacing: '0.02em',
    });
    box.appendChild(status);

    const footer = document.createElement('div');
    footer.textContent = '0%';
    Object.assign(footer.style, {
      color: '#9fb4c8',
      fontSize: '11px',
      textAlign: 'center',
      marginTop: '14px',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    });
    box.appendChild(footer);

    return {
      readyDelayMs: 60,
      progress(progress = {}) {
        if (!progress) return;
        if (progress.phase === 'plan') {
          const step = Math.max(0, Number(progress.step) || 0);
          const total = Math.max(1, Number(progress.total) || 1);
          const label = String(progress.label || 'Planning');
          status.textContent = `${label}…`;
          footer.textContent = `${Math.floor((step / total) * 50)}%`;
          return;
        }
        if (progress.phase !== 'chunks') return;
        const total = Math.max(1, Number(progress.total) || 1);
        const processed = Math.max(0, Math.min(total, Number(progress.processed) || 0));
        const cxStr = Number.isFinite(progress.cx) ? ` (${progress.cx}, ${progress.cy})` : '';
        const detail = [];
        if (Number.isFinite(progress.rooms) && progress.rooms > 0) detail.push(`${progress.rooms} rooms`);
        if (Number.isFinite(progress.spawns) && progress.spawns > 0) detail.push(`${progress.spawns} spawns`);
        const detailStr = detail.length > 0 ? ` — ${detail.join(', ')}` : '';
        status.textContent = `Materializing chunk ${processed}/${total}${cxStr}${detailStr}`;
        footer.textContent = `${50 + Math.floor((processed / total) * 50)}%`;
      },
      complete() {
        status.textContent = 'World ready';
        footer.textContent = '100%';
      },
      dispose() { /* no-op */ },
    };
  }

  function doConfirm() {
    if (confirming) return;
    confirming = true;
    const name = (nameInput.value || '').trim() || fallbackName;
    const seedVal = parseSeed(seedInput.value) ?? (entropyPool.length >= 4 ? entropyHash >>> 0 : defaultSeed >>> 0);
    const difficulty = hardInput.checked ? 'hard' : 'easy';
    const tutorial = !!tutInput.checked;
    const disableGore = !!goreInput.checked;
    writeSavedName(name);

    // Play enter world transition (8s: 4s dramatic moment + 4s fade to world)
    play('./assets/audio/enter_world.mp3', { bus: 'ui', volume: 0.8, priority: 2 });

    const generationPanel = showGenerationPanel();

    nextPaint().then(() => {
      return new Promise((resolve) => setTimeout(resolve, generationPanel.readyDelayMs));
    }).then(async () => {
      const soundscapeHandedOff = await onConfirm({
        name,
        classId: classes[classIndex].id,
        seed: seedVal,
        difficulty,
        tutorial,
        disableGore,
        onProgress: generationPanel.progress,
      }, fadeSoundscape);
      generationPanel.complete();
      generationPanel.dispose();
      dispose({ fade: true, soundscapeHandedOff });
    });
  }

  confirmBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    confirmBtn.style.transform = 'scale(0.98)';
    doConfirm();
  });
  box.appendChild(confirmBtn);
  scrollTo(classIndex, { silent: true });

  // ---- seed (hidden, revealable) ----
  const seedToggle = document.createElement('div');
  seedToggle.textContent = 'Seed';
  Object.assign(seedToggle.style, {
    fontSize: '11px', color: UI.low, cursor: 'pointer',
    userSelect: 'none', display: 'inline-block',
    transition: 'color 120ms',
    marginBottom: '4px',
  });
  seedToggle.addEventListener('pointerenter', () => { seedToggle.style.color = UI.accent; });
  seedToggle.addEventListener('pointerleave', () => { seedToggle.style.color = UI.low; });

  const seedWrap = document.createElement('div');
  Object.assign(seedWrap.style, {
    maxHeight: '0', overflow: 'hidden',
    transition: 'max-height 200ms ease',
    marginBottom: '4px',
  });

  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = '0x' + (defaultSeed >>> 0).toString(16).toUpperCase();
  seedInput.maxLength = 16;
  seedInput.setAttribute('autocomplete', 'off');
  seedInput.setAttribute('spellcheck', 'false');
  Object.assign(seedInput.style, {
    display: 'block', width: '140px', boxSizing: 'border-box',
    margin: '6px auto 4px', padding: '6px 10px',
    fontSize: '13px', fontFamily: 'monospace',
    background: 'transparent', color: UI.text,
    border: '1px solid rgba(80,70,60,0.35)', borderRadius: '6px',
    outline: 'none', textAlign: 'center',
    transition: 'border-color 140ms',
  });
  seedInput.addEventListener('focus', () => { seedInput.style.borderColor = UI.inputFocus; });
  seedInput.addEventListener('blur', () => { seedInput.style.borderColor = 'rgba(80,70,60,0.35)'; });

  let seedOpen = false;
  seedToggle.addEventListener('pointerdown', () => {
    seedOpen = !seedOpen;
    seedWrap.style.maxHeight = seedOpen ? '50px' : '0';
    seedToggle.textContent = seedOpen ? 'Hide seed' : 'Seed';
  });
  seedWrap.appendChild(seedInput);
  box.appendChild(seedToggle);
  box.appendChild(seedWrap);

  // ---- highscores (collapsed, expandable) ----
  const hsToggle = document.createElement('div');
  hsToggle.textContent = 'Highscores';
  Object.assign(hsToggle.style, {
    fontSize: '11px', color: UI.low, cursor: 'pointer',
    userSelect: 'none', display: 'inline-block',
    marginTop: '10px',
    transition: 'color 120ms',
  });
  hsToggle.addEventListener('pointerenter', () => { hsToggle.style.color = UI.accent; });
  hsToggle.addEventListener('pointerleave', () => { hsToggle.style.color = UI.low; });

  const hsWrap = document.createElement('div');
  Object.assign(hsWrap.style, {
    maxHeight: '0', overflow: 'hidden',
    transition: 'max-height 300ms ease',
  });

  const hsList = document.createElement('div');
  hsList.textContent = 'Loading\u2026';
  Object.assign(hsList.style, {
    fontSize: '12px', color: UI.low, padding: '8px 0',
    fontFamily: 'monospace',
  });
  hsWrap.appendChild(hsList);

  let hsOpen = false;
  let hsLoaded = false;
  hsToggle.addEventListener('pointerdown', () => {
    hsOpen = !hsOpen;
    hsWrap.style.maxHeight = hsOpen ? '200px' : '0';
    hsToggle.textContent = hsOpen ? 'Hide highscores' : 'Highscores';
    if (hsOpen && !hsLoaded) {
      hsLoaded = true;
      getHighscores().then(scores => {
        hsList.textContent = '';
        if (!scores || scores.length === 0) { hsList.textContent = 'No scores yet'; return; }
        const top = scores.slice(0, 5);
        for (let i = 0; i < top.length; i++) {
          const entry = top[i];
          const row = document.createElement('div');
          Object.assign(row.style, {
            display: 'flex', gap: '8px', lineHeight: '1.7',
            fontSize: '11px', color: '#b89a84',
          });
          const rank = document.createElement('span');
          rank.textContent = `#${i + 1}`;
          rank.style.cssText = 'width:2em;text-align:right;flex-shrink:0;color:#836251';
          const ver = document.createElement('span');
          ver.textContent = getHighscoreVersionLabel(entry);
          ver.style.cssText = 'width:5em;text-align:left;flex-shrink:0;color:#9e7f6a;opacity:0.9';
          const nm = document.createElement('span');
          nm.textContent = entry.playerName || '???';
          nm.style.cssText = 'flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          const sc = document.createElement('span');
          sc.textContent = String(entry.score ?? 0);
          sc.style.cssText = 'text-align:right;flex-shrink:0;color:#d8a06d';
          const cl = document.createElement('span');
          cl.textContent = entry.className || '';
          cl.style.cssText = 'width:5em;text-align:left;flex-shrink:0;color:#9d7f6d;opacity:0.8';
          row.appendChild(rank);
          row.appendChild(ver);
          row.appendChild(nm);
          row.appendChild(sc);
          row.appendChild(cl);
          hsList.appendChild(row);
        }
      }).catch(() => { hsList.textContent = ''; });
    }
  });
  box.appendChild(hsToggle);
  box.appendChild(hsWrap);

  // ---- oracular gameplay messages ----
  const oracleHint = document.createElement('div');
  Object.assign(oracleHint.style, {
    margin: '12px auto 0',
    maxWidth: 'min(420px, 82vw)',
    minHeight: '2.8em',
    color: '#8fb8ca',
    fontSize: '11px',
    lineHeight: '1.4',
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: '0',
    transition: 'opacity 360ms ease',
  });
  function renderOracleHint() {
    if (!Array.isArray(ORACULAR_MESSAGES) || !ORACULAR_MESSAGES.length) return;
    const idx = Math.floor(Math.random() * ORACULAR_MESSAGES.length);
    oracleHint.style.opacity = '0';
    setTimeout(() => {
      oracleHint.innerHTML = formatOracularMessageHtml(ORACULAR_MESSAGES[idx]);
      oracleHint.style.opacity = '1';
    }, 360);
  }
  renderOracleHint();
  oracleTimer = setInterval(renderOracleHint, 5200);
  box.appendChild(oracleHint);

  // ---- footer: subscribe + music nudge ----
  const footerRow = document.createElement('div');
  Object.assign(footerRow.style, {
    marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '14px',
    fontSize: '11px', color: UI.low,
  });

  const subscribeLink = document.createElement('a');
  subscribeLink.href = 'https://hackjs.substack.com/';
  subscribeLink.target = '_blank';
  subscribeLink.rel = 'noopener';
  subscribeLink.textContent = 'Subscribe';
  Object.assign(subscribeLink.style, {
    color: UI.accentMuted, textDecoration: 'none', opacity: '0.7',
    transition: 'opacity 120ms',
  });
  subscribeLink.addEventListener('mouseenter', () => { subscribeLink.style.opacity = '1'; });
  subscribeLink.addEventListener('mouseleave', () => { subscribeLink.style.opacity = '0.7'; });
  footerRow.appendChild(subscribeLink);

  const musicNudge = document.createElement('span');
  musicNudge.textContent = '\u266B Bring your own war drums';
  musicNudge.style.fontStyle = 'italic';
  footerRow.appendChild(musicNudge);
  box.appendChild(footerRow);

  // ---- assemble ----
  panel.appendChild(bgCanvas);
  panel.appendChild(box);
  document.body.appendChild(panel);

  // Start character creation soundscape
  startLoop('./assets/audio/soundscape.mp3', { volume: 0.5, fadeIn: 1.5, bus: 'ambient' });

  try {
    box.animate(
      [
        { opacity: 0, transform: 'translateY(8px) scale(0.992)' },
        { opacity: 1, transform: 'translateY(0px) scale(1)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)', fill: 'both' },
    );
  } catch {}

  // ---- entropy listeners (all input forms → seed) ----
  function onPointerEntropy(e) {
    feedEntropy((e.clientX * 31337) ^ (e.clientY * 7919));
  }
  function onKeyEntropy(e) {
    feedEntropy((e.keyCode || 0) ^ (Date.now() * 2654435761));
  }
  function onWheelEntropy(e) {
    feedEntropy((e.deltaY * 48271) ^ (e.deltaX * 16807));
  }
  function onTouchEntropy(e) {
    const t = e.touches[0] || e.changedTouches[0];
    if (t) {
      feedEntropy((t.clientX * 31337) ^ (t.clientY * 7919));
      try { navigator.vibrate?.(4); } catch {}
    }
  }

  panel.addEventListener('pointermove', onPointerEntropy);
  panel.addEventListener('pointerdown', onPointerEntropy);
  panel.addEventListener('keydown', onKeyEntropy);
  panel.addEventListener('wheel', onWheelEntropy, { passive: true });
  panel.addEventListener('touchmove', onTouchEntropy, { passive: true });

  // accelerometer (device motion) — best entropy source on mobile
  // throttled to ~10Hz so it doesn't fill the entropy pool in <2 seconds
  let accelCleanup = null;
  let lastAccelT = 0;
  function onDeviceMotion(e) {
    const now = performance.now();
    if (now - lastAccelT < 100) return;
    lastAccelT = now;
    const a = e.accelerationIncludingGravity;
    if (a) feedEntropy(((a.x || 0) * 10000) ^ ((a.y || 0) * 10000) ^ ((a.z || 0) * 10000));
  }
  function startAccel() {
    window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
    accelCleanup = () => window.removeEventListener('devicemotion', onDeviceMotion);
  }
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    // iOS requires permission — request on first touch
    const onFirstTouch = () => {
      DeviceMotionEvent.requestPermission().then(state => { if (state === 'granted') startAccel(); }).catch(() => {});
      panel.removeEventListener('touchstart', onFirstTouch);
    };
    panel.addEventListener('touchstart', onFirstTouch, { passive: true });
  } else if (typeof DeviceMotionEvent !== 'undefined') {
    startAccel();
  }

  // keyboard: Enter to confirm, left/right arrows for carousel
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doConfirm();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollTo((classIndex - 1 + classes.length) % classes.length);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollTo((classIndex + 1) % classes.length);
    }
  });

  // touch swipe support for carousel
  let touchStartX = 0;
  let touchStartY = 0;
  scrollViewport.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  scrollViewport.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) scrollTo((classIndex + 1) % classes.length);
      else scrollTo((classIndex - 1 + classes.length) % classes.length);
    }
  }, { passive: true });

  function fadeSoundscape() {
    stopLoop('./assets/audio/soundscape.mp3', { fadeOut: 1.0 });
  }

  function dispose(opts = {}) {
    if (!opts.soundscapeHandedOff) fadeSoundscape();
    if (bgRafId !== null) cancelAnimationFrame(bgRafId);
    if (classIconRafId !== null) cancelAnimationFrame(classIconRafId);
    if (spiritSwapAnim) { try { spiritSwapAnim.cancel(); } catch {} spiritSwapAnim = null; }
    if (oracleTimer !== null) clearInterval(oracleTimer);
    if (ctaPulseAnim) { try { ctaPulseAnim.cancel(); } catch {} ctaPulseAnim = null; }
    window.removeEventListener('resize', resizeBgCanvas);
    panel.removeEventListener('pointermove', onPointerEntropy);
    panel.removeEventListener('pointerdown', onPointerEntropy);
    panel.removeEventListener('keydown', onKeyEntropy);
    panel.removeEventListener('wheel', onWheelEntropy);
    panel.removeEventListener('touchmove', onTouchEntropy);
    if (accelCleanup) accelCleanup();
    if (!panel.parentNode) return;
    if (opts?.fade) {
      panel.style.pointerEvents = 'none';
      panel.style.transition = 'opacity 360ms ease';
      panel.style.opacity = '0';
      setTimeout(() => {
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      }, 380);
      return;
    }
    panel.parentNode.removeChild(panel);
  }

  return { dispose };
}
