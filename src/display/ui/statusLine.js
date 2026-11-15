// display/ui/statusLine.js
// NetHack-style horizontal status line (bottom of screen, above action bar).
// Single stats row (bottom of screen, above action bar).

export function initStatusLine() {
  let root = document.getElementById('ui-root');
  if (!root) return;

  // Shared style base for both lines
  const lineBase = {
    position: 'fixed',
    left: '8px',
    right: '8px',
    textAlign: 'center',
    fontFamily: 'monospace',
    fontSize: 'min(12px, 3vw)',
    color: '#cfd3dc',
    opacity: '0.85',
    pointerEvents: 'none',
    zIndex: '900',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  // Stats line (bottom) — existing
  const statsLine = document.createElement('div');
  Object.assign(statsLine.style, lineBase, {
    bottom: 'calc(var(--jshack-actionbar-height, 48px) + 60px + env(safe-area-inset-bottom, 0px))',
  });
  root.appendChild(statsLine);

  // Calendar line removed — date now shown at top of character sheet only.

  let depth = 1;
  let gold = 0;
  let atk = 0;
  let avoidance = 0;
  let luck = 0;
  let armorClass = 10;
  let critPct = 0;
  let scoreTarget = 0;
  let scoreDisplay = 0;
  let scoreClimbing = false;
  let scoreValueEl = null; // cached ref into the DOM for live updates


  function colorForDelta(value) {
    const n = Number(value || 0);
    if (n > 0) return '#64c87a';
    if (n < 0) return '#e06a6a';
    return '#98a0ab';
  }

  function fmtSigned(value) {
    const n = Number(value || 0);
    return n > 0 ? `+${n}` : `${n}`;
  }

  function fmtSignedPct(value) {
    const n = Number(value || 0);
    const rounded = Math.round(n * 10) / 10;
    const core = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${rounded > 0 ? "+" : ""}${core}%`;
  }

  function pushSegment(parts, label, value, color = '#cfd3dc', labelColor = null) {
    const wrap = document.createElement('span');
    const l = document.createElement('span');
    const v = document.createElement('span');
    l.textContent = `${label}:`;
    if (labelColor) Object.assign(l.style, { color: labelColor });
    v.textContent = value;
    Object.assign(v.style, { color });
    wrap.appendChild(l);
    wrap.appendChild(v);
    parts.push(wrap);
  }

  function renderStats() {
    const parts = [];
    pushSegment(parts, 'DLvl', String(depth));
    pushSegment(parts, 'Dmg', String(atk), atk > 0 ? '#64c87a' : '#98a0ab');
    pushSegment(parts, 'Avoid', fmtSigned(avoidance), avoidance > 0 ? '#64c87a' : '#98a0ab');
    pushSegment(parts, '$', String(gold), '#ffde5a', '#ffde5a');
    pushSegment(parts, 'Score', String(Math.floor(scoreDisplay)), '#5b9ff5');

    statsLine.replaceChildren();
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.textContent = ' \u2022 ';
        Object.assign(sep.style, { color: '#7f8793' });
        statsLine.appendChild(sep);
      }
      statsLine.appendChild(parts[i]);
    }
    // Cache the Score value span for live tick-up updates without full re-render
    const scoreWrap = parts[4]; // Score is the 5th segment
    scoreValueEl = scoreWrap?.querySelector('span:last-child') || null;
  }

  // Arcade score tick-up — runs on rAF while climbing
  let _scoreRafId = 0;
  let _scorePrevTime = 0;
  function tickScore(now) {
    _scoreRafId = 0;
    if (scoreDisplay >= scoreTarget) {
      scoreClimbing = false;
      if (scoreValueEl) scoreValueEl.style.textShadow = '';
      return;
    }
    const dt = Math.min(0.1, (now - _scorePrevTime) / 1000);
    _scorePrevTime = now;
    const gap = scoreTarget - scoreDisplay;
    const step = Math.max(1, Math.ceil(gap * 6 * dt));
    scoreDisplay = Math.min(scoreTarget, scoreDisplay + step);
    if (scoreValueEl) {
      scoreValueEl.textContent = String(Math.floor(scoreDisplay));
      // Pulse glow while climbing
      const intensity = Math.min(1, gap / 80);
      const blur = 4 + intensity * 8;
      scoreValueEl.style.textShadow = `0 0 ${blur}px rgba(200,244,255,${0.5 + intensity * 0.4})`;
    }
    _scoreRafId = requestAnimationFrame(tickScore);
  }

  function startScoreClimb() {
    if (scoreClimbing) return; // already running
    scoreClimbing = true;
    _scorePrevTime = performance.now();
    _scoreRafId = requestAnimationFrame(tickScore);
  }


  window.addEventListener('ui:updateDepth', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    depth = Number(e?.detail?.depth ?? depth);
    renderStats();
  });

  window.addEventListener('ui:updateVitals', (ev) => {
    // Status line no longer shows vitals; keep listener as a no-op for compatibility.
  });

  window.addEventListener('ui:updateGold', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    gold = Math.max(0, Number(e?.detail?.gold ?? gold) | 0);
    renderStats();
  });

  window.addEventListener('ui:updateScore', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const pts = Math.max(0, Number(e?.detail?.points ?? 0) | 0);
    if (pts > 0) {
      scoreTarget += pts;
      startScoreClimb();
    }
  });

  window.addEventListener('ui:updateCombatHUD', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    atk = Number(e?.detail?.attack ?? 0);
    avoidance = Number(e?.detail?.avoidance ?? e?.detail?.defense ?? 0);
    luck = Number(e?.detail?.luck ?? 0);
    armorClass = Number(e?.detail?.armorClass ?? (10 + def));
    critPct = Number(e?.detail?.critChancePercent ?? 0);
    renderStats();
  });

  renderStats();
}
