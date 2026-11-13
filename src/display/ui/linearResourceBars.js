// display/ui/linearResourceBars.js
// Compact, labeled player resource bars for health, mana, and stamina.
import { HUD_COLUMNS, HUD_GAP } from './hudTheme.js';

const RESOURCE_DEFS = Object.freeze([
  Object.freeze({
    key: 'health',
    label: 'Health',
    valueKey: 'hpValue',
    maxKey: 'hpMax',
    color: '#ff4164',
    gradient: 'linear-gradient(90deg, #c71942 0%, #ff4164 58%, #ff6b7f 100%)',
    shortLabel: 'H',
  }),
  Object.freeze({
    key: 'mana',
    label: 'Mana',
    valueKey: 'manaValue',
    maxKey: 'manaMax',
    color: '#55aaff',
    gradient: 'linear-gradient(90deg, #1d68c5 0%, #4aa3ff 58%, #72c2ff 100%)',
    shortLabel: 'M',
  }),
  Object.freeze({
    key: 'stamina',
    label: 'Stamina',
    valueKey: 'staminaValue',
    maxKey: 'staminaMax',
    color: '#ffc530',
    gradient: 'linear-gradient(90deg, #b87908 0%, #f4b52d 58%, #ffd45e 100%)',
    shortLabel: 'S',
  }),
]);

/**
 * @param {unknown} value
 * @returns {number}
 */
export function clampResourceRatio(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export function normalizeResourceValue(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.floor(Number(fallback) || 0));
  return Math.max(0, Math.floor(n));
}

/**
 * @param {unknown} value
 * @param {unknown} max
 * @returns {{ value: number, max: number, ratio: number, state: 'empty'|'critical'|'partial'|'full' }}
 */
export function resolveResourceBarState(value, max) {
  const safeMax = Math.max(1, normalizeResourceValue(max, 1));
  const safeValue = Math.min(safeMax, normalizeResourceValue(value));
  const ratio = clampResourceRatio(safeValue / safeMax);
  const state = ratio <= 0
    ? 'empty'
    : ratio <= 0.2
      ? 'critical'
      : ratio >= 1
        ? 'full'
        : 'partial';
  return { value: safeValue, max: safeMax, ratio, state };
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, number>} [initial]
 * @returns {{ set: (next: Record<string, number>) => void, draw: () => void }}
 */
export function createLinearResourceBars(root, initial = {}) {
  if (!root) throw new Error('createLinearResourceBars(root): root is required');

  Object.assign(root.style, {
    width: root.style.width || '100%',
    boxSizing: 'border-box',
    minWidth: '0',
    padding: '0',
    borderRadius: '16px',
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    display: 'grid',
    gridTemplateColumns: HUD_COLUMNS,
    gap: HUD_GAP,
    fontFamily: 'monospace',
    pointerEvents: 'none',
  });
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Player vitals');

  const rows = new Map();
  for (const def of RESOURCE_DEFS) {
    const row = document.createElement('div');
    row.dataset.resource = def.key;
    Object.assign(row.style, {
      padding: '0',
      minWidth: '0',
    });

    const content = document.createElement('div');
    Object.assign(content.style, { minWidth: '0' });

    const label = document.createElement('span');
    label.textContent = def.shortLabel;
    Object.assign(label.style, {
      minWidth: '0',
      flex: '0 0 auto',
      whiteSpace: 'nowrap',
      fontSize: '12px',
      fontWeight: def.key === 'health' ? '800' : '700',
      letterSpacing: def.key === 'health' ? '0.01em' : '0.02em',
      color: '#fff8ea',
      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
      position: 'relative',
      zIndex: '1',
    });
    const value = document.createElement('span');
    Object.assign(value.style, {
      flex: '0 0 auto',
      fontSize: 'clamp(10px, 2.8vw, 12px)',
      fontWeight: '800',
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      color: '#fff8ea',
      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
      position: 'relative',
      zIndex: '1',
    });

    const track = document.createElement('div');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', def.label);
    Object.assign(track.style, {
      position: 'relative',
      width: '100%',
      height: '28px',
      overflow: 'hidden',
      borderRadius: '999px',
      background: 'linear-gradient(180deg, rgba(3, 6, 13, 0.86), rgba(19, 24, 35, 0.92))',
      border: '1px solid rgba(255,255,255,0.19)',
      boxSizing: 'border-box',
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.50), 0 1px 0 rgba(255,255,255,0.04)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '3px',
      padding: '0 6px',
    });
    const fill = document.createElement('div');
    Object.assign(fill.style, {
      position: 'absolute',
      inset: '0 auto 0 0',
      width: '0%',
      borderRadius: 'inherit',
      background: def.gradient,
      boxShadow: `0 0 9px ${def.color}99, inset 0 1px 0 rgba(255,255,255,0.45)`,
      transition: 'width 220ms ease-out, filter 180ms ease-out, box-shadow 180ms ease-out',
      zIndex: '0',
    });
    const recentChange = document.createElement('div');
    Object.assign(recentChange.style, {
      position: 'absolute',
      inset: '0 auto 0 0',
      width: '0%',
      borderRadius: 'inherit',
      background: 'rgba(255,255,255,0.92)',
      boxShadow: '0 0 8px rgba(255,255,255,0.72), inset 0 1px 0 rgba(255,255,255,0.9)',
      opacity: '0',
      pointerEvents: 'none',
      transition: 'width 560ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease-out 560ms',
      zIndex: '1',
    });
    track.appendChild(fill);
    track.appendChild(recentChange);
    track.appendChild(label);
    track.appendChild(value);
    content.appendChild(track);
    row.appendChild(content);
    root.appendChild(row);
    rows.set(def.key, { def, row, value, track, fill, recentChange, lagRatio: 0 });
  }

  const state = {
    hpValue: Number(initial.hpValue ?? NaN),
    hpMax: Number(initial.hpMax ?? NaN),
    manaValue: Number(initial.manaValue ?? NaN),
    manaMax: Number(initial.manaMax ?? NaN),
    staminaValue: Number(initial.staminaValue ?? NaN),
    staminaMax: Number(initial.staminaMax ?? NaN),
  };

  function set(next = {}) {
    for (const resource of rows.values()) {
      const { def, row, value, track, fill, recentChange } = resource;
      const valueKey = def.valueKey;
      const maxKey = def.maxKey;
      if (Object.prototype.hasOwnProperty.call(next, valueKey)) state[valueKey] = Number(next[valueKey]);
      if (Object.prototype.hasOwnProperty.call(next, maxKey)) state[maxKey] = Number(next[maxKey]);
      const hasLiveValue = Number.isFinite(state[valueKey]) && Number.isFinite(state[maxKey]);
      if (!hasLiveValue) {
        value.textContent = '— / —';
        fill.style.width = '0%';
        recentChange.style.width = '0%';
        recentChange.style.opacity = '0';
        resource.lagRatio = 0;
        row.dataset.state = 'unknown';
        track.setAttribute('aria-valuetext', 'Waiting for vitals');
        continue;
      }
      const resolved = resolveResourceBarState(state[valueKey], state[maxKey]);
      const previousRatio = resource.lagRatio || 0;
      const width = `${(resolved.ratio * 100).toFixed(2)}%`;
      value.textContent = `${resolved.value}/${resolved.max}`;
      // The colored fill is authoritative and immediate. The white segment
      // deliberately lags behind reductions so players can read the loss.
      fill.style.width = width;
      if (resolved.ratio < previousRatio) {
        const lostRatio = previousRatio - resolved.ratio;
        recentChange.style.transition = 'none';
        recentChange.style.left = width;
        recentChange.style.width = `${(lostRatio * 100).toFixed(2)}%`;
        recentChange.style.opacity = '1';
        // Let the browser commit the lost segment before easing it away.
        const animate = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (callback) => setTimeout(callback, 0);
        animate(() => {
          recentChange.style.transition = 'width 560ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease-out 560ms';
          recentChange.style.width = '0%';
          recentChange.style.opacity = '0';
        });
      } else if (resolved.ratio > previousRatio) {
        recentChange.style.transition = 'opacity 120ms ease-out';
        recentChange.style.opacity = '0';
        recentChange.style.left = width;
        recentChange.style.width = '0%';
      }
      resource.lagRatio = resolved.ratio;
      fill.style.filter = resolved.state === 'empty' ? 'saturate(0.55)' : 'none';
      fill.style.boxShadow = resolved.state === 'critical'
        ? `0 0 15px ${def.color}, inset 0 1px 0 rgba(255,255,255,0.55)`
        : `0 0 9px ${def.color}99, inset 0 1px 0 rgba(255,255,255,0.45)`;
      row.dataset.state = resolved.state;
      if (previousRatio !== resolved.ratio) row.dataset.changed = 'true';
      track.setAttribute('aria-valuenow', String(resolved.value));
      track.setAttribute('aria-valuemax', String(resolved.max));
      track.setAttribute('aria-valuetext', `${resolved.value} of ${resolved.max}`);
    }
  }

  set(initial);
  return { set, draw: () => set(state) };
}
