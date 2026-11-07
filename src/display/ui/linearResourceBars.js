// display/ui/linearResourceBars.js
// Compact, labeled player resource bars for health, mana, and stamina.

const RESOURCE_DEFS = Object.freeze([
  Object.freeze({
    key: 'health',
    label: 'Health',
    valueKey: 'hpValue',
    maxKey: 'hpMax',
    icon: '♥',
    color: '#ff4164',
    gradient: 'linear-gradient(90deg, #c71942 0%, #ff4164 58%, #ff6b7f 100%)',
    height: '12px',
    labelSize: '17px',
  }),
  Object.freeze({
    key: 'mana',
    label: 'Mana',
    valueKey: 'manaValue',
    maxKey: 'manaMax',
    icon: '◆',
    color: '#55aaff',
    gradient: 'linear-gradient(90deg, #1d68c5 0%, #4aa3ff 58%, #72c2ff 100%)',
    height: '9px',
    labelSize: '14px',
  }),
  Object.freeze({
    key: 'stamina',
    label: 'Stamina',
    valueKey: 'staminaValue',
    maxKey: 'staminaMax',
    icon: 'ϟ',
    color: '#ffc530',
    gradient: 'linear-gradient(90deg, #b87908 0%, #f4b52d 58%, #ffd45e 100%)',
    height: '9px',
    labelSize: '14px',
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
    width: root.style.width || 'min(420px, calc(100vw - 16px))',
    boxSizing: 'border-box',
    padding: '11px clamp(12px, 2.5vw, 18px) 12px',
    borderRadius: '16px',
    background:
      'linear-gradient(135deg, rgba(45, 35, 34, 0.96) 0%, rgba(23, 24, 31, 0.97) 52%, rgba(19, 23, 32, 0.98) 100%)',
    border: '1px solid rgba(214, 178, 91, 0.44)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.035)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
      display: 'grid',
      gridTemplateColumns: '30px minmax(0, 1fr)',
      columnGap: '9px',
      alignItems: 'center',
      minWidth: '0',
    });

    const iconFrame = document.createElement('div');
    Object.assign(iconFrame.style, {
      width: '27px',
      height: '27px',
      display: 'grid',
      placeItems: 'center',
      transform: 'rotate(45deg)',
      borderRadius: '7px',
      border: `1px solid ${def.color}`,
      background: 'rgba(8, 12, 22, 0.72)',
      boxShadow: `0 0 12px ${def.color}33, inset 0 0 0 1px rgba(255,255,255,0.08)`,
    });
    const icon = document.createElement('span');
    icon.textContent = def.icon;
    Object.assign(icon.style, {
      transform: 'rotate(-45deg)',
      color: def.color,
      fontSize: def.key === 'health' ? '20px' : '17px',
      fontWeight: '900',
      lineHeight: '1',
      textShadow: `0 0 8px ${def.color}99`,
    });
    iconFrame.appendChild(icon);

    const content = document.createElement('div');
    Object.assign(content.style, { minWidth: '0', display: 'flex', flexDirection: 'column', gap: '3px' });

    const heading = document.createElement('div');
    Object.assign(heading.style, {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '8px',
      minWidth: '0',
      color: 'rgba(246, 240, 224, 0.96)',
      lineHeight: '1',
    });
    const label = document.createElement('span');
    label.textContent = def.label;
    Object.assign(label.style, {
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: def.labelSize,
      fontWeight: def.key === 'health' ? '800' : '700',
      letterSpacing: def.key === 'health' ? '0.01em' : '0.02em',
      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    });
    const value = document.createElement('span');
    Object.assign(value.style, {
      flex: '0 0 auto',
      color: def.color,
      fontSize: def.key === 'health' ? '15px' : '13px',
      fontWeight: '800',
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap',
      textShadow: `0 0 7px ${def.color}55`,
    });
    heading.appendChild(label);
    heading.appendChild(value);

    const track = document.createElement('div');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', def.label);
    Object.assign(track.style, {
      position: 'relative',
      width: '100%',
      height: def.height,
      overflow: 'hidden',
      borderRadius: '999px',
      background: 'linear-gradient(180deg, rgba(3, 6, 13, 0.86), rgba(19, 24, 35, 0.92))',
      border: '1px solid rgba(255,255,255,0.19)',
      boxSizing: 'border-box',
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.50), 0 1px 0 rgba(255,255,255,0.04)',
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
    });
    track.appendChild(fill);
    content.appendChild(heading);
    content.appendChild(track);
    row.appendChild(iconFrame);
    row.appendChild(content);
    root.appendChild(row);
    rows.set(def.key, { def, row, value, track, fill });
  }

  const state = {
    hpValue: Number(initial.hpValue ?? 1),
    hpMax: Number(initial.hpMax ?? 1),
    manaValue: Number(initial.manaValue ?? 1),
    manaMax: Number(initial.manaMax ?? 1),
    staminaValue: Number(initial.staminaValue ?? 1),
    staminaMax: Number(initial.staminaMax ?? 1),
  };

  function set(next = {}) {
    for (const { def, row, value, track, fill } of rows.values()) {
      const valueKey = def.valueKey;
      const maxKey = def.maxKey;
      if (Object.prototype.hasOwnProperty.call(next, valueKey)) state[valueKey] = Number(next[valueKey]);
      if (Object.prototype.hasOwnProperty.call(next, maxKey)) state[maxKey] = Number(next[maxKey]);
      const resolved = resolveResourceBarState(state[valueKey], state[maxKey]);
      const previousWidth = fill.style.width;
      const width = `${(resolved.ratio * 100).toFixed(2)}%`;
      value.textContent = `${resolved.value}/${resolved.max}`;
      fill.style.width = width;
      fill.style.filter = resolved.state === 'empty' ? 'saturate(0.55)' : 'none';
      fill.style.boxShadow = resolved.state === 'critical'
        ? `0 0 15px ${def.color}, inset 0 1px 0 rgba(255,255,255,0.55)`
        : `0 0 9px ${def.color}99, inset 0 1px 0 rgba(255,255,255,0.45)`;
      row.dataset.state = resolved.state;
      if (previousWidth !== width) row.dataset.changed = String(Date.now());
      track.setAttribute('aria-valuenow', String(resolved.value));
      track.setAttribute('aria-valuemax', String(resolved.max));
      track.setAttribute('aria-valuetext', `${resolved.value} of ${resolved.max}`);
    }
  }

  set(initial);
  return { set, draw: () => set(state) };
}
