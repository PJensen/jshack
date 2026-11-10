import { applyAtlasIcon, SPELL_ICON_ATLAS } from './atlasIcons.js';

export function createMobileSpellRadial(mobileLayoutMq) {
  const MICRO_UX_STYLE_ID = 'jshack-mobile-spell-radial-micro-ux';
  function ensureMicroUxStyles() {
    if (document.getElementById(MICRO_UX_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = MICRO_UX_STYLE_ID;
    style.textContent = `
      @keyframes jshackSpellRadialBump {
        0% { transform: scale(1.02); }
        45% { transform: scale(1.16); }
        100% { transform: scale(1.1); }
      }
      @keyframes jshackSpellRadialPulse {
        0% { box-shadow: 0 0 0 0 rgba(114, 176, 255, 0.36), 0 2px 6px rgba(0,0,0,0.42); }
        100% { box-shadow: 0 0 0 10px rgba(114, 176, 255, 0), 0 2px 6px rgba(0,0,0,0.42); }
      }
    `;
    document.head.appendChild(style);
  }
  ensureMicroUxStyles();

  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    right: 'calc(12px + env(safe-area-inset-right, 0px))',
    bottom: 'calc(var(--jshack-actionbar-height, 48px) + 28px + env(safe-area-inset-bottom, 0px))',
    display: 'none',
    pointerEvents: 'auto',
    zIndex: '920',
  });

  // --- Trigger button (always-visible circle) ---
  const trigger = document.createElement('button');
  Object.assign(trigger.style, {
    width: '56px', height: '56px', borderRadius: '50%',
    border: '2px solid #2d3b52', background: '#101626', color: '#cfe8ff',
    fontSize: '26px', lineHeight: '1',
    display: 'grid', placeItems: 'center',
    cursor: 'pointer', touchAction: 'manipulation',
    position: 'relative',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  });

  const glyphSpan = document.createElement('span');
  glyphSpan.textContent = '\u2726'; // default ✦
  glyphSpan.style.lineHeight = '1';
  trigger.appendChild(glyphSpan);

  // Mana cost badge (top-right corner of trigger)
  const manaBadge = document.createElement('span');
  Object.assign(manaBadge.style, {
    position: 'absolute', top: '-4px', right: '-4px',
    fontSize: '10px', fontWeight: 'bold',
    background: '#1a2a4a', border: '1px solid #2d3b52',
    borderRadius: '8px', padding: '1px 4px',
    color: '#88bbff', pointerEvents: 'none', display: 'none',
  });
  trigger.appendChild(manaBadge);

  el.appendChild(trigger);

  // --- State ---
  let _activeSpellId = null;
  let _canCast = false;
  let _fanOpen = false;
  let _holdTimer = null;
  let _isHold = false;
  let _hoverSpellId = null;
  let _fanItems = [];
  const HOLD_THRESHOLD_MS = 350;

  // --- Fan-out container ---
  const fan = document.createElement('div');
  Object.assign(fan.style, {
    position: 'absolute',
    bottom: '0', right: '0',
    display: 'none',
    pointerEvents: 'none',
  });
  el.appendChild(fan);

  // --- Gesture handling (tap vs hold) ---
  function onPressStart() {
    _isHold = false;
    _holdTimer = setTimeout(() => {
      _isHold = true;
      openFan();
    }, HOLD_THRESHOLD_MS);
  }

  function onPressEnd(e) {
    if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
    if (_isHold) {
      // Hold release — choose currently hovered spell (with fallback hit-test)
      let selectedSpellId = _hoverSpellId;
      if (!selectedSpellId && e && e.changedTouches && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const item = pickClosestSpellAtPoint(touch.clientX, touch.clientY);
        selectedSpellId = item?.dataset?.spellId || null;
      }
      if (selectedSpellId) {
        window.dispatchEvent(new CustomEvent('ui:selectActiveSpell', {
          detail: { spellId: selectedSpellId }
        }));
      }
      closeFan();
    } else {
      // Short tap — cast active spell
      window.dispatchEvent(new CustomEvent('ui:castActiveSpell'));
    }
    _isHold = false;
  }

  function onPressCancel() {
    if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
    _isHold = false;
    closeFan();
  }

  trigger.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onPressStart();
  }, { passive: false });
  trigger.addEventListener('touchend', (e) => {
    e.preventDefault();
    onPressEnd(e);
  }, { passive: false });
  trigger.addEventListener('touchcancel', () => onPressCancel(), { passive: true });

  // Mouse fallback for desktop mobile emulation
  trigger.addEventListener('mousedown', (e) => { if (e.button === 0) onPressStart(); });
  trigger.addEventListener('mouseup', (e) => { if (e.button === 0) onPressEnd(e); });
  trigger.addEventListener('mouseleave', () => onPressCancel());

  // --- Fan open/close ---
  function openFan() {
    _fanOpen = true;
    _hoverSpellId = _activeSpellId;
    trigger.style.transform = 'scale(1.1)';
    trigger.style.borderColor = '#6b8fbf';
    fan.style.display = 'block';
    window.dispatchEvent(new CustomEvent('ui:requestSpellData'));
  }

  function closeFan() {
    _fanOpen = false;
    _hoverSpellId = null;
    _fanItems = [];
    trigger.style.transform = '';
    trigger.style.borderColor = '#2d3b52';
    fan.style.display = 'none';
    fan.innerHTML = '';
  }

  function setFanItemVisual(item, selected, bump = false) {
    if (!item) return;
    if (selected) {
      item.style.transform = 'scale(1.1)';
      item.style.border = '2px solid #8fc2ff';
      item.style.background = '#1b2a44';
      item.style.zIndex = '5';
      item.style.boxShadow = '0 0 0 1px rgba(155,210,255,0.45), 0 4px 12px rgba(0,0,0,0.45)';
      if (bump) {
        item.style.animation = 'none';
        // Force restart of the bump animation.
        void item.offsetWidth;
        item.style.animation = 'jshackSpellRadialBump 220ms cubic-bezier(0.2, 0.9, 0.2, 1), jshackSpellRadialPulse 360ms ease-out';
      }
    } else {
      item.style.animation = 'none';
      item.style.transform = 'scale(0.98)';
      item.style.zIndex = '1';
      item.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
      item.style.border = item.dataset.baseBorder || '1px solid #2d3b52';
      item.style.background = item.dataset.baseBg || '#101626';
    }
  }

  function pickClosestSpellAtPoint(clientX, clientY) {
    if (!_fanItems.length) return null;
    let closest = null;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const item of _fanItems) {
      const rect = item.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        closest = item;
      }
    }
    return closest;
  }

  function updateHoverFromPoint(clientX, clientY) {
    if (!_fanOpen || !_isHold) return;
    const item = pickClosestSpellAtPoint(clientX, clientY);
    const nextId = item?.dataset?.spellId || null;
    if (!nextId || nextId === _hoverSpellId) return;
    _hoverSpellId = nextId;
    for (const fanItem of _fanItems) {
      setFanItemVisual(fanItem, fanItem.dataset.spellId === _hoverSpellId, fanItem.dataset.spellId === _hoverSpellId);
    }
  }

  // --- Fan item rendering ---
  function renderFanItems(spells, activeId) {
    fan.innerHTML = '';
    _fanItems = [];
    const count = spells.length;
    if (count === 0) return;

    // Quarter-circle arc from 90° (up) to 180° (left), facing into the game field
    const RADIUS = 90;
    const ARC_START = 90;
    const ARC_END = 180;
    const ARC_SPAN = ARC_END - ARC_START;
    const HALF_ITEM = 22; // half of 44px item

    for (let i = 0; i < count; i++) {
      const spell = spells[i];
      const angle = count === 1
        ? (ARC_START + ARC_END) / 2
        : ARC_START + (ARC_SPAN * i / (count - 1));
      const rad = angle * Math.PI / 180;
      // Position from bottom-right of trigger: right increases leftward, bottom increases upward
      const r = 28 - Math.cos(rad) * RADIUS - HALF_ITEM;
      const b = 28 + Math.sin(rad) * RADIUS - HALF_ITEM;

      const isActive = spell.id === activeId;
      const item = document.createElement('div');
      item.dataset.spellId = spell.id;
      Object.assign(item.style, {
        position: 'absolute',
        width: '44px', height: '44px', borderRadius: '50%',
        border: isActive ? '2px solid #6b8fbf' : '1px solid #2d3b52',
        background: isActive ? '#152035' : '#101626',
        color: '#cfe8ff', fontSize: '20px',
        display: 'grid', placeItems: 'center',
        right: r + 'px',
        bottom: b + 'px',
        cursor: 'pointer',
        pointerEvents: 'auto',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'opacity 0.14s ease, transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1), border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease',
        opacity: '0',
        transform: 'scale(0.86)',
      });
      item.dataset.baseBorder = isActive ? '2px solid #6b8fbf' : '1px solid #2d3b52';
      item.dataset.baseBg = isActive ? '#152035' : '#101626';

      const sym = document.createElement('span');
      applyAtlasIcon(sym, SPELL_ICON_ATLAS, spell.iconId || spell.id, spell.symbol || '\u2726', 30);
      sym.style.lineHeight = '1';
      sym.style.pointerEvents = 'none';
      item.appendChild(sym);

      // Spell name label
      const label = document.createElement('span');
      const name = spell.name || spell.id;
      label.textContent = name.length > 6 ? name.slice(0, 5) + '\u2026' : name;
      Object.assign(label.style, {
        position: 'absolute', bottom: '-15px', left: '-8px', right: '-8px',
        textAlign: 'center', fontSize: '9px', color: '#cfe8ff',
        background: '#1a2744', borderRadius: '3px', padding: '2px 0',
        pointerEvents: 'none', whiteSpace: 'nowrap',
      });
      item.appendChild(label);

      // Cooldown overlay
      const cdRemaining = Number(spell.cdRemaining || 0);
      const cdMax = Number(spell.cdMax || 0);
      if (cdRemaining > 0 && cdMax > 0) {
        const pct = (1 - cdRemaining / cdMax) * 100;
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
          position: 'absolute', inset: '0', borderRadius: '50%',
          background: `conic-gradient(from 0deg, transparent ${pct}%, rgba(0,0,0,0.65) ${pct}%)`,
          pointerEvents: 'none', zIndex: '1',
        });
        item.appendChild(overlay);

        const cdLabel = document.createElement('span');
        cdLabel.textContent = String(cdRemaining);
        Object.assign(cdLabel.style, {
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '13px', fontWeight: 'bold', color: '#ff9999',
          textShadow: '0 0 4px #000', pointerEvents: 'none', zIndex: '2',
        });
        item.appendChild(cdLabel);
        item.style.opacity = '0.5';
      }

      fan.appendChild(item);
      _fanItems.push(item);

      // Stagger fade-in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fan.contains(item)) {
            const selected = (_hoverSpellId || activeId) === spell.id;
            setFanItemVisual(item, selected, false);
            item.style.opacity = (cdRemaining > 0 && cdMax > 0) ? '0.5' : '1';
          }
        });
      });

      // Click selection (for non-hold taps on fan items when fan is already open)
      item.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('ui:selectActiveSpell', {
          detail: { spellId: spell.id }
        }));
        closeFan();
      });
    }
  }

  // --- Event listeners ---
  window.addEventListener('ui:updateActiveSpellLabel', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const symbol = String(e?.detail?.symbol || '').trim();
    const name = String(e?.detail?.name || '').trim();
    const canCast = Boolean(e?.detail?.canCast ?? true);
    const cost = Number(e?.detail?.cost || 0);
    _activeSpellId = e?.detail?.id || null;
    _canCast = canCast;

    applyAtlasIcon(glyphSpan, SPELL_ICON_ATLAS, e?.detail?.iconId || e?.detail?.id, symbol || '\u2726', 38);
    trigger.title = name || 'Cast';
    trigger.style.opacity = _activeSpellId ? (canCast ? '1' : '0.6') : '0.4';

    manaBadge.textContent = cost > 0 ? String(cost) : '';
    manaBadge.style.display = cost > 0 ? 'block' : 'none';
  });

  window.addEventListener('ui:spellData', (ev) => {
    if (!_fanOpen) return;
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const spells = e?.detail?.spells || [];
    const activeId = e?.detail?.activeSpellId || null;
    _hoverSpellId = activeId;
    renderFanItems(spells, activeId);
  });

  // Close fan when a spell overlay opens or a spell is cast
  window.addEventListener('ui:castActiveSpell', () => { if (_fanOpen) closeFan(); });

  // Close fan on outside touch
  document.addEventListener('touchstart', (e) => {
    if (_fanOpen && !el.contains(/** @type {Node} */ (e.target))) closeFan();
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!_fanOpen || !_isHold) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    e.preventDefault();
    updateHoverFromPoint(touch.clientX, touch.clientY);
  }, { passive: false });
  document.addEventListener('mousemove', (e) => {
    if (!_fanOpen || !_isHold) return;
    updateHoverFromPoint(e.clientX, e.clientY);
  }, { passive: true });

  return { el };
}
