// display/ui/overlayRenders.js
// Barrel re-exports from domain overlay files + remaining renderers.

// --- Re-exports from extracted domain files ---
export { renderInventory } from './inventoryOverlay.js';
export { renderCharacterSheet, renderEquipment } from './characterOverlay.js';
export { renderShop, renderChest, renderRack } from './shopOverlay.js';

import {
  appendCharacterMenuTabs, markScrollable,
  decorateButton, sanitize, bracketize,
  hide, showItemTooltip, hideItemTooltip,
  rarityStyle, getMessageColor,
  UI, createChooserRow, createSimpleSel, installKeyHandler, installDetachableKeyHandler,
  pulseRow, UX_THEME, dispatchCharacterMenuTabCycle,
  INTERACTION_POPUP_ARM_DELAY_MS,
} from './overlayUtils.js';
import {
  readInputMode, readWalkInterval, writeInputMode, writeWalkInterval,
  WALK_INTERVAL_MIN, WALK_INTERVAL_MAX,
} from '../input/inputSettings.js';
import { DEFAULT_AI_ENDPOINT } from '../../shared/aiSettings.js';
import { versionLoaded } from '../../shared/version.js';
import { SAVEGAME_KEY } from '../../shared/savegameKeys.js';

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {{ identificationEnabled?: boolean, deityDebugPinned?: boolean, allItemIds?: string[], allMonsterIds?: string[], hasPet?: boolean, petAlive?: boolean, aiSettings?: { enabled?: boolean, endpoint?: string, apiKey?: string, model?: string } }} data
 * @param {{ canvas: HTMLCanvasElement }} memGraph
 * @param {{ canvas: HTMLCanvasElement }} dtyGraph
 */
export function renderSettings(panel, data, memGraph, dtyGraph, econGraph, tileInsp, lightPerfGraph) {
  const existingDetach = /** @type {any} */ (panel)._settingsDetach;
  if (typeof existingDetach === 'function') {
    try { existingDetach(); } catch (e) { console.debug('[overlay] settings detach failed:', e); }
  }

  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';

  appendCharacterMenuTabs(el, 'settings');

  const content = document.createElement('div');
  Object.assign(content.style, {
    display: 'flex', flexDirection: 'column', gap: '14px',
    maxHeight: '55vh', overflowY: 'auto', overflowX: 'hidden',
  });
  markScrollable(content);

  function makeSectionHead(label, marginTop = '4px') {
    const head = document.createElement('div');
    head.textContent = label;
    Object.assign(head.style, {
      fontWeight: 'bold', fontSize: '13px',
      color: UX_THEME.accent,
      borderBottom: UX_THEME.surfaceBorderSoft, paddingBottom: '4px', marginTop,
    });
    return head;
  }

  function makeAutocompleteActionRow({ ids, placeholder, buttonText, eventName, detailKey }) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', gap: '6px', alignItems: 'flex-start', position: 'relative',
    });

    const inputWrap = document.createElement('div');
    Object.assign(inputWrap.style, { position: 'relative', flex: '1' });

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    Object.assign(input.style, {
      width: '100%', boxSizing: 'border-box',
      padding: '6px 8px', background: UX_THEME.surfaceBg, color: UI.TEXT,
      border: UI.BORDER, borderRadius: UI.RADIUS,
      fontFamily: 'monospace', fontSize: '13px', outline: 'none',
    });

    const dropdown = document.createElement('div');
    Object.assign(dropdown.style, {
      position: 'absolute', left: '0', right: '0', top: '100%',
      maxHeight: '150px', overflowY: 'auto', overflowX: 'hidden',
      background: UX_THEME.panelBg, border: UI.BORDER, borderRadius: `0 0 ${UI.RADIUS} ${UI.RADIUS}`,
      zIndex: '10', display: 'none',
    });
    markScrollable(dropdown);

    const allIds = Array.isArray(ids) ? ids : [];

    function updateDropdown() {
      const q = input.value.trim().toLowerCase();
      dropdown.innerHTML = '';
      if (!q) { dropdown.style.display = 'none'; return; }
      const matches = allIds.filter((id) => id.includes(q)).slice(0, 30);
      if (!matches.length) { dropdown.style.display = 'none'; return; }
      for (const id of matches) {
        const opt = document.createElement('div');
        opt.textContent = id;
        Object.assign(opt.style, {
          padding: '4px 8px', cursor: 'pointer', fontSize: '12px',
          color: UI.TEXT, fontFamily: 'monospace',
        });
        opt.addEventListener('pointerenter', () => { opt.style.background = UI.SEL_BG; });
        opt.addEventListener('pointerleave', () => { opt.style.background = ''; });
        opt.addEventListener('click', () => {
          input.value = id;
          dropdown.style.display = 'none';
        });
        dropdown.appendChild(opt);
      }
      dropdown.style.display = 'block';
    }

    function submit() {
      const value = input.value.trim();
      if (!value) return;
      window.dispatchEvent(new CustomEvent(eventName, { detail: { [detailKey]: value } }));
      input.value = '';
      dropdown.style.display = 'none';
    }

    input.addEventListener('input', updateDropdown);
    input.addEventListener('focus', updateDropdown);
    input.addEventListener('blur', () => {
      // Delay hide so click on dropdown option can fire first
      setTimeout(() => { dropdown.style.display = 'none'; }, 200);
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      submit();
    });

    inputWrap.appendChild(input);
    inputWrap.appendChild(dropdown);
    row.appendChild(inputWrap);

    const button = document.createElement('button');
    button.textContent = buttonText;
    decorateButton(button);
    button.style.minHeight = '34px';
    button.addEventListener('click', submit);
    row.appendChild(button);

    return row;
  }

  function makeTextInput(labelText, value, placeholder, inputType, onChange) {
    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'flex', flexDirection: 'column', gap: '5px',
      fontSize: '12px', color: UX_THEME.muted,
    });
    const label = document.createElement('span');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = inputType || 'text';
    input.value = String(value || '');
    input.placeholder = placeholder || '';
    Object.assign(input.style, {
      width: '100%', boxSizing: 'border-box',
      padding: '6px 8px', background: UX_THEME.surfaceBg, color: UI.TEXT,
      border: UI.BORDER, borderRadius: UI.RADIUS,
      fontFamily: 'monospace', fontSize: '13px', outline: 'none',
    });
    input.addEventListener('change', () => onChange(input.value));
    input.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      input.blur();
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  content.appendChild(makeAutocompleteActionRow({
    ids: data.allItemIds,
    placeholder: 'item id\u2026',
    buttonText: 'Give',
    eventName: 'ui:debugGiveItem',
    detailKey: 'itemId',
  }));

  content.appendChild(makeAutocompleteActionRow({
    ids: data.allMonsterIds,
    placeholder: 'monster id\u2026',
    buttonText: 'Spawn',
    eventName: 'ui:debugSpawnMonster',
    detailKey: 'monsterId',
  }));

  // --- Gameplay section ---
  content.appendChild(makeSectionHead('Gameplay', '0'));

  content.appendChild(makeCheckbox('Identification', !!data.identificationEnabled, (on) => {
    window.dispatchEvent(new CustomEvent('ui:setIdentification', { detail: { enabled: on } }));
  }));

  content.appendChild(makeCheckbox('FOV cone', !data.fovConeDisabled, (on) => {
    window.dispatchEvent(new CustomEvent('ui:setFovConeDisabled', { detail: { disabled: !on } }));
  }));

  content.appendChild(makeCheckbox('Facing turn cost', !!data.facingTurnCostEnabled, (on) => {
    window.dispatchEvent(new CustomEvent('ui:setFacingTurnCost', { detail: { enabled: on } }));
  }));

  // --- Input section ---
  const inputSection = document.createDocumentFragment();
  inputSection.appendChild(makeSectionHead('Input'));

  // Radio: input scheme selection
  const currentMode = readInputMode();
  const modeRow = document.createElement('div');
  Object.assign(modeRow.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

  function makeRadio(labelText, value, checked) {
    const lbl = document.createElement('label');
    Object.assign(lbl.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      cursor: 'pointer', fontSize: '13px', minHeight: '32px',
    });
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'jshack-input-mode';
    radio.value = value;
    radio.checked = checked;
    Object.assign(radio.style, { width: '16px', height: '16px', accentColor: UX_THEME.accentBorder, cursor: 'pointer' });
    const txt = document.createElement('span');
    txt.textContent = labelText;
    lbl.appendChild(radio);
    lbl.appendChild(txt);
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      writeInputMode(/** @type {'walk'|'gesture'|'joystick'} */ (value));
      window.dispatchEvent(new CustomEvent('ui:inputSettingsChanged', {
        detail: { inputMode: value, walkInterval: readWalkInterval() },
      }));
      // Show/hide movement speed row.
      speedRow.style.display = (value === 'walk' || value === 'joystick') ? 'flex' : 'none';
    });
    return lbl;
  }

  modeRow.appendChild(makeRadio('Tap and Hold', 'walk', currentMode === 'walk'));
  modeRow.appendChild(makeRadio('Spell Gestures', 'gesture', currentMode === 'gesture'));
  modeRow.appendChild(makeRadio('Joystick & Spell Gestures', 'joystick', currentMode === 'joystick'));
  inputSection.appendChild(modeRow);

  // Trackbar: movement repeat interval (ms)
  const speedRow = document.createElement('div');
  Object.assign(speedRow.style, {
    display: (currentMode === 'walk' || currentMode === 'joystick') ? 'flex' : 'none',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
  });
  const speedLabel = document.createElement('span');
  speedLabel.textContent = 'Movement Speed';
  Object.assign(speedLabel.style, { fontSize: '13px', color: '#aac8e8' });
  speedRow.appendChild(speedLabel);

  const sliderWrap = document.createElement('div');
  Object.assign(sliderWrap.style, {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '8px',
  });

  const minEl = document.createElement('span');
  minEl.textContent = 'Slow';
  Object.assign(minEl.style, { fontSize: '11px', color: '#6f8fb2', minWidth: '44px', textAlign: 'left' });

  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.min = '0';
  speedSlider.max = String(WALK_INTERVAL_MAX - WALK_INTERVAL_MIN);
  speedSlider.step = '1';
  speedSlider.value = String(WALK_INTERVAL_MAX - readWalkInterval());
  Object.assign(speedSlider.style, {
    width: '100%',
    minHeight: '34px',
    accentColor: UX_THEME.accentBorder,
  });

  const maxEl = document.createElement('span');
  maxEl.textContent = 'Fast';
  Object.assign(maxEl.style, { fontSize: '11px', color: '#6f8fb2', minWidth: '50px', textAlign: 'right' });

  sliderWrap.appendChild(minEl);
  sliderWrap.appendChild(speedSlider);
  sliderWrap.appendChild(maxEl);
  speedRow.appendChild(sliderWrap);

  function syncMovementSpeed(interval) {
    const ms = Math.max(WALK_INTERVAL_MIN, Math.min(WALK_INTERVAL_MAX, Number(interval) | 0));
    writeWalkInterval(ms);
    window.dispatchEvent(new CustomEvent('ui:inputSettingsChanged', {
      detail: { inputMode: readInputMode(), walkInterval: ms },
    }));
  }

  speedSlider.addEventListener('input', () => {
    const ms = WALK_INTERVAL_MAX - (Number(speedSlider.value) | 0);
    syncMovementSpeed(ms);
  });
  speedSlider.addEventListener('change', () => {
    const ms = WALK_INTERVAL_MAX - (Number(speedSlider.value) | 0);
    syncMovementSpeed(ms);
  });

  inputSection.appendChild(speedRow);

  // --- Debugging section ---
  content.appendChild(makeSectionHead('Debugging'));

  content.appendChild(makeCheckbox('Deity debugging', data.deityDebugPinned === true, (on) => {
    window.dispatchEvent(new CustomEvent('ui:setDeityDebugPinned', { detail: { enabled: on } }));
  }));

  content.appendChild(makeCheckbox('Economy graph', econGraph.canvas.style.display === 'block', () => {
    window.dispatchEvent(new CustomEvent('ui:toggleEconomyGraph'));
  }));

  content.appendChild(makeCheckbox('Memory visualizer', memGraph.canvas.style.display === 'block', () => {
    window.dispatchEvent(new CustomEvent('ui:toggleMemoryGraph'));
  }));

  content.appendChild(makeCheckbox('Tile inspector', tileInsp.el.style.display === 'block', () => {
    window.dispatchEvent(new CustomEvent('ui:toggleTileInspector'));
  }));

  if (lightPerfGraph) {
    content.appendChild(makeCheckbox('Lighting perf', lightPerfGraph.canvas.style.display === 'block', () => {
      window.dispatchEvent(new CustomEvent('ui:toggleLightingPerfGraph'));
    }));
  }

  // --- Resurrect pet button ---
  const petBtn = document.createElement('button');
  petBtn.textContent = 'Resurrect Pet';
  decorateButton(petBtn);
  petBtn.style.minHeight = '44px';
  if (!data.hasPet || data.petAlive) {
    petBtn.disabled = true;
    petBtn.style.opacity = '0.4';
    petBtn.style.cursor = 'default';
  }
  petBtn.addEventListener('click', () => {
    if (petBtn.disabled) return;
    window.dispatchEvent(new CustomEvent('ui:debugResurrectPet'));
    // Re-request settings to update button state
    window.dispatchEvent(new CustomEvent('ui:requestSettingsData'));
  });
  content.appendChild(petBtn);

  // --- Save data section ---
  content.appendChild(makeSectionHead('Save Data'));

  const saveRow = document.createElement('div');
  Object.assign(saveRow.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  });

  function readSaveData() {
    try { return localStorage.getItem(SAVEGAME_KEY) || ''; } catch { return ''; }
  }

  function clearStoredGameData() {
    try {
      const keys = [SAVEGAME_KEY];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('jshack:floor:')) keys.push(key);
      }
      for (const key of keys) localStorage.removeItem(key);
    } catch {}
  }

  const exportBtn = document.createElement('button');
  exportBtn.textContent = 'Export JSON';
  decorateButton(exportBtn);
  exportBtn.style.minHeight = '38px';
  function downloadSaveData(raw, filename) {
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `jshack-save-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); }, 0);
  }
  exportBtn.addEventListener('click', () => {
    let exported = false;
    const onExport = (ev) => {
      const raw = String(ev?.detail?.json || '');
      if (!raw) return;
      exported = true;
      downloadSaveData(raw, String(ev?.detail?.filename || ''));
    };
    window.addEventListener('ui:saveDataExport', onExport, { once: true });
    window.dispatchEvent(new CustomEvent('ui:requestSaveDataExport'));
    setTimeout(() => {
      window.removeEventListener('ui:saveDataExport', onExport);
      if (exported) return;
      const raw = readSaveData();
      if (raw) downloadSaveData(raw);
    }, 0);
  });
  saveRow.appendChild(exportBtn);

  const nukeBtn = document.createElement('button');
  nukeBtn.textContent = 'Nuke Game';
  decorateButton(nukeBtn);
  nukeBtn.style.minHeight = '38px';
  nukeBtn.style.borderColor = '#8f3f3f';
  nukeBtn.style.color = '#ffd0d0';
  nukeBtn.addEventListener('click', () => {
    if (!confirm('Delete the saved game and reload?')) return;
    clearStoredGameData();
    location.reload();
  });
  saveRow.appendChild(nukeBtn);

  content.appendChild(saveRow);

  content.appendChild(inputSection);


  // --- Experimental AI section ---
  const aiSettings = data.aiSettings || {};
  content.appendChild(makeSectionHead('Experimental AI'));

  content.appendChild(makeCheckbox('Enabled', aiSettings.enabled === true, (on) => {
    window.dispatchEvent(new CustomEvent('ui:setAISettings', { detail: { enabled: on } }));
  }));

  content.appendChild(makeTextInput(
    'Endpoint URL',
    aiSettings.endpoint || DEFAULT_AI_ENDPOINT,
    DEFAULT_AI_ENDPOINT,
    'url',
    (endpoint) => {
      window.dispatchEvent(new CustomEvent('ui:setAISettings', { detail: { endpoint } }));
    },
  ));

  content.appendChild(makeTextInput(
    'API Key',
    aiSettings.apiKey || '',
    'optional bearer token',
    'password',
    (apiKey) => {
      window.dispatchEvent(new CustomEvent('ui:setAISettings', { detail: { apiKey } }));
    },
  ));

  content.appendChild(makeTextInput(
    'Model name',
    aiSettings.model || '',
    'model name',
    'text',
    (model) => {
      window.dispatchEvent(new CustomEvent('ui:setAISettings', { detail: { model } }));
    },
  ));

  // --- Version + Subscribe row ---
  const versionRow = document.createElement('div');
  Object.assign(versionRow.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '10px', marginTop: '8px',
  });

  const versionEl = document.createElement('div');
  Object.assign(versionEl.style, { fontSize: '12px', color: '#4a6080' });
  versionRow.appendChild(versionEl);

  const subscribeLink = document.createElement('a');
  subscribeLink.href = 'https://hackjs.substack.com/';
  subscribeLink.target = '_blank';
  subscribeLink.rel = 'noopener';
  subscribeLink.textContent = 'Subscribe to Updates';
  Object.assign(subscribeLink.style, {
    fontSize: '12px', color: '#7aacdf', textDecoration: 'none', opacity: '0.8',
  });
  subscribeLink.addEventListener('mouseenter', () => { subscribeLink.style.opacity = '1'; });
  subscribeLink.addEventListener('mouseleave', () => { subscribeLink.style.opacity = '0.8'; });
  versionRow.appendChild(subscribeLink);

  content.appendChild(versionRow);

  versionLoaded.then(() => {
    const ver = /** @type {any} */ (window).VERSION;
    if (ver) versionEl.textContent = `v${ver}`;
  });

  el.appendChild(content);

  installDetachableKeyHandler(panel, '_settingsDetach', (e) => {
    if (panel.style.display !== 'block') return;
    if (e.key !== 'Tab') return;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    dispatchCharacterMenuTabCycle('settings', e.shiftKey);
    e.preventDefault();
  });
}

/**
 * @param {string} label
 * @param {boolean} checked
 * @param {(on: boolean) => void} onChange
 * @returns {HTMLLabelElement}
 */
function makeCheckbox(label, checked, onChange) {
  const row = document.createElement('label');
  Object.assign(row.style, {
    display: 'flex', alignItems: 'center', gap: '8px',
    cursor: 'pointer', fontSize: '13px', minHeight: '32px',
  });
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  Object.assign(cb.style, { width: '16px', height: '16px', accentColor: UX_THEME.accentBorder, cursor: 'pointer' });
  cb.addEventListener('change', () => onChange(cb.checked));
  const txt = document.createElement('span');
  txt.textContent = label;
  row.appendChild(cb);
  row.appendChild(txt);
  return row;
}

// --- Quest Journal tab -------------------------------------------------------

/**
 * Human-readable label for a quest node + status pair.
 * @param {string} node
 * @param {string} status
 * @returns {string}
 */
function questNodeLabel(node, status) {
  if (status === 'complete') return 'Complete';
  switch (node) {
    case 'offer':   return 'Offered';
    case 'survey':  return 'In Progress';
    case 'report':  return 'Ready to Report';
    default:        return node.charAt(0).toUpperCase() + node.slice(1);
  }
}

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {Array<{questId:string, title:string, status:string, node:string, t0:number, summary?:string, flavorText?:string, rewardText?:string, rewardItems?:Array<{itemId?:string,name?:string,description?:string,count?:number,choiceId?:string,choiceLabel?:string}>, rewardGold?:number, completionText?:string, progress?:number, target?:number, checklist?:Array<{text?:string, done?:boolean}>}>} quests
 */
export function renderQuestJournal(panel, quests) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';
  el.style.overflowX = 'hidden';
  appendCharacterMenuTabs(el, 'quests');

  const heading = document.createElement('div');
  heading.textContent = 'Quest Journal';
  heading.style.fontWeight = 'bold';
  heading.style.marginBottom = '10px';
  el.appendChild(heading);

  const active = quests.filter(q => q.status !== 'complete');
  const done   = quests.filter(q => q.status === 'complete');
  const storedTab = String((/** @type {any} */ (panel))._questJournalTab || 'active');
  const tab = storedTab === 'completed' ? 'completed' : 'active';
  const storedExpanded = String((/** @type {any} */ (panel))._expandedQuestId || '');
  const visibleQuests = tab === 'completed' ? done : active;
  const fallbackExpanded = visibleQuests.some((quest) => quest.questId === storedExpanded)
    ? storedExpanded
    : (visibleQuests[0]?.questId || '');
  const expandedQuestId = storedExpanded || fallbackExpanded;

  function setExpandedQuest(id) {
    (/** @type {any} */ (panel))._expandedQuestId = String(id || '');
    renderQuestJournal(panel, quests);
  }

  const tabs = document.createElement('div');
  Object.assign(tabs.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px',
    marginBottom: '10px',
  });
  for (const [key, label] of [['active', 'Active'], ['completed', 'Completed']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    decorateButton(button);
    button.setAttribute('aria-selected', key === tab ? 'true' : 'false');
    button.style.opacity = key === tab ? '1' : '0.58';
    button.addEventListener('click', () => {
      (/** @type {any} */ (panel))._questJournalTab = key;
      (/** @type {any} */ (panel))._expandedQuestId = '';
      renderQuestJournal(panel, quests);
    });
    tabs.appendChild(button);
  }
  el.appendChild(tabs);

  function appendSection(label, items) {
    const sectionLabel = document.createElement('div');
    Object.assign(sectionLabel.style, {
      fontSize: '11px',
      color: UI.TEXT,
      opacity: '0.78',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: '4px',
      marginTop: label === 'Active' ? '0' : '14px',
    });
    sectionLabel.textContent = label;
    el.appendChild(sectionLabel);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.textContent = label === 'Active' ? 'No active quests.' : 'None completed yet.';
      Object.assign(empty.style, { opacity: '0.55', fontStyle: 'italic', fontSize: '12px', marginBottom: '4px' });
      el.appendChild(empty);
      return;
    }

    for (const q of items) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        marginBottom: '6px',
        background: q.questId === expandedQuestId ? UI.SEL_BG : UI.DEFAULT_BG,
        border: q.questId === expandedQuestId ? '1px solid #8ca2ba' : UI.BORDER,
        borderRadius: UI.RADIUS,
        fontSize: '13px',
        boxShadow: q.questId === expandedQuestId ? '0 0 18px rgba(140,164,188,0.16)' : 'none',
      });

      const header = document.createElement('button');
      header.type = 'button';
      Object.assign(header.style, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '9px 10px',
        background: 'transparent',
        border: '0',
        color: UI.TEXT,
        cursor: 'pointer',
        textAlign: 'left',
      });
      header.setAttribute('aria-expanded', q.questId === expandedQuestId ? 'true' : 'false');
      header.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('ui:setActiveQuest', { detail: { questId: q.questId } }));
        setExpandedQuest(q.questId === expandedQuestId ? '' : q.questId);
      });

      const titleWrap = document.createElement('div');
      Object.assign(titleWrap.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        minWidth: '0',
        flex: '1 1 auto',
      });

      const titleEl = document.createElement('span');
      titleEl.textContent = q.title || q.questId;
      Object.assign(titleEl.style, {
        fontWeight: 'bold',
        letterSpacing: '0.01em',
      });
      titleWrap.appendChild(titleEl);

      const subtitle = document.createElement('span');
      const progressText = (Number(q.target || 0) > 0)
        ? `${Math.max(0, Number(q.progress || 0) | 0)}/${Math.max(0, Number(q.target || 0) | 0)}`
        : '';
      subtitle.textContent = [questNodeLabel(q.node, q.status), progressText].filter(Boolean).join(' · ');
      Object.assign(subtitle.style, {
        fontSize: '11px',
        color: q.questId === expandedQuestId ? '#c5d4e3' : '#ad9f8d',
      });
      titleWrap.appendChild(subtitle);
      header.appendChild(titleWrap);

      const rightWrap = document.createElement('div');
      Object.assign(rightWrap.style, {
        display: 'flex',
        alignItems: 'center',
        flexShrink: '0',
        marginLeft: '8px',
      });

      const badge = document.createElement('span');
      const nodeLabel = questNodeLabel(q.node, q.status);
      badge.textContent = nodeLabel;
      const isComplete = q.status === 'complete';
      Object.assign(badge.style, {
        fontSize: '10px',
        fontWeight: 'bold',
        padding: '2px 7px',
        borderRadius: '10px',
        flexShrink: '0',
        marginLeft: '8px',
        background: isComplete ? 'rgba(28, 70, 38, 0.62)' : (q.node === 'report' ? 'rgba(88, 62, 18, 0.58)' : 'rgba(43, 48, 54, 0.74)'),
        color: isComplete ? '#7fd28c' : (q.node === 'report' ? '#f5c043' : '#c5d4e3'),
        border: isComplete ? '1px solid rgba(72, 140, 82, 0.7)' : (q.node === 'report' ? '1px solid rgba(122, 90, 16, 0.8)' : UI.BORDER),
      });
      rightWrap.appendChild(badge);

      const chevron = document.createElement('span');
      chevron.textContent = q.questId === expandedQuestId ? '▾' : '▸';
      Object.assign(chevron.style, {
        marginLeft: '8px',
        color: q.questId === expandedQuestId ? '#c5d4e3' : '#918678',
        fontSize: '14px',
      });
      rightWrap.appendChild(chevron);
      header.appendChild(rightWrap);
      row.appendChild(header);

      if (q.questId === expandedQuestId) {
        const body = document.createElement('div');
        Object.assign(body.style, {
          padding: '0 10px 10px',
          borderTop: '1px solid rgba(120, 105, 90, 0.32)',
        });

        const sections = [
          { label: 'Objective', value: String(q.summary || '') },
          { label: 'Details', value: String(q.flavorText || '') },
          { label: 'Completion', value: String(q.completionText || '') },
          { label: 'Reward', value: q.rewardItems?.length || Number(q.rewardGold || 0) > 0 ? '' : String(q.rewardText || '') },
        ].filter((entry) => entry.value);

        for (const section of sections) {
          const block = document.createElement('div');
          Object.assign(block.style, { marginTop: '10px' });

          const labelEl = document.createElement('div');
          labelEl.textContent = section.label;
          Object.assign(labelEl.style, {
            fontSize: '10px',
            color: '#ad9f8d',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '3px',
          });
          block.appendChild(labelEl);

          const valueEl = document.createElement('div');
          valueEl.textContent = section.value;
          Object.assign(valueEl.style, {
            fontSize: '12px',
            lineHeight: '1.45',
            color: '#dbe9f6',
            opacity: '0.9',
          });
          block.appendChild(valueEl);
          body.appendChild(block);
        }

        const rewardItems = Array.isArray(q.rewardItems) ? q.rewardItems : [];
        const rewardGold = Math.max(0, Number(q.rewardGold || 0) | 0);
        if (rewardItems.length > 0 || rewardGold > 0) {
          const rewardBlock = document.createElement('div');
          Object.assign(rewardBlock.style, { marginTop: '10px' });

          const rewardLabel = document.createElement('div');
          rewardLabel.textContent = 'Reward';
          Object.assign(rewardLabel.style, {
            fontSize: '10px', color: '#ad9f8d', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '3px',
          });
          rewardBlock.appendChild(rewardLabel);

          for (const item of rewardItems) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${Number(item.count || 1) > 1 ? `${Number(item.count || 1)}x ` : ''}${String(item.name || item.itemId || 'Item')}`;
            button.setAttribute('aria-label', `Show tooltip for ${String(item.name || item.itemId || 'reward item')}`);
            Object.assign(button.style, {
              display: 'block', padding: '3px 0', border: '0', background: 'transparent',
              color: '#ffd85a', cursor: 'pointer', fontSize: '12px', textAlign: 'left',
              textDecoration: 'underline',
            });
            button.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (button.dataset.tooltipOpen === 'true') {
                hideItemTooltip();
                button.dataset.tooltipOpen = 'false';
                return;
              }
              showItemTooltip(item.tooltip || item, button, { pinBottomOnMobile: true });
              button.dataset.tooltipOpen = 'true';
            });
            rewardBlock.appendChild(button);
          }
          if (rewardGold > 0) {
            const gold = document.createElement('div');
            gold.textContent = `$${rewardGold}g`;
            Object.assign(gold.style, { color: '#ffd85a', fontSize: '12px', padding: '3px 0' });
            rewardBlock.appendChild(gold);
          }
          body.appendChild(rewardBlock);

        }

        const checklist = Array.isArray(q.checklist) ? q.checklist : [];
        if (checklist.length > 0) {
          const checklistWrap = document.createElement('div');
          Object.assign(checklistWrap.style, { marginTop: '10px' });

          const checklistLabel = document.createElement('div');
          checklistLabel.textContent = 'Objectives';
          Object.assign(checklistLabel.style, {
            fontSize: '10px',
            color: '#7ba7cc',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '4px',
          });
          checklistWrap.appendChild(checklistLabel);

          for (const entry of checklist) {
            if (!entry?.text) continue;
            const line = document.createElement('div');
            line.textContent = `${entry.done ? '[x]' : '[ ]'} ${String(entry.text || '')}`;
            Object.assign(line.style, {
              fontSize: '11px',
              lineHeight: '1.4',
              opacity: entry.done ? '0.9' : '0.72',
              color: entry.done ? '#9fe0ac' : '#c9d9ea',
              marginTop: '4px',
            });
            checklistWrap.appendChild(line);
          }

          body.appendChild(checklistWrap);
        }

        row.appendChild(body);
      }

      el.appendChild(row);
    }
  }

  appendSection(tab === 'completed' ? 'Completed' : 'Active', visibleQuests);
}

/**
 * Render the canonical quest turn-in window. Reward selection belongs here,
 * after the NPC has accepted the report, rather than in dialogue choices.
 * @param {HTMLDivElement} panel
 * @param {any} quest
 */
export function renderQuestReward(panel, quest) {
  panel.innerHTML = '';
  Object.assign(panel.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
    width: 'min(92vw, 460px)', maxHeight: 'min(84vh, 680px)', overflowY: 'auto',
    padding: '22px', background: 'rgba(16, 21, 29, 0.98)', border: '1px solid #8ca2ba',
    borderRadius: '12px', boxShadow: '0 18px 60px rgba(0,0,0,0.65)', zIndex: '1400',
  });

  const title = document.createElement('div');
  title.textContent = String(quest?.title || 'Quest Complete');
  Object.assign(title.style, { fontSize: '20px', fontWeight: '700', color: '#f3e6b3', marginBottom: '14px' });
  panel.appendChild(title);

  const flavor = document.createElement('div');
  flavor.textContent = String(quest?.flavorText || 'Your work is complete.');
  Object.assign(flavor.style, { fontSize: '14px', lineHeight: '1.5', color: '#e8edf5', whiteSpace: 'pre-wrap', marginBottom: '18px' });
  panel.appendChild(flavor);
  const completionText = String(quest?.completionText || '').trim();
  if (completionText && completionText !== String(quest?.flavorText || '').trim()) {
    const outcome = document.createElement('div');
    outcome.textContent = completionText;
    Object.assign(outcome.style, { fontSize: '13px', lineHeight: '1.45', color: '#b9d7c0', marginTop: '-8px', marginBottom: '18px' });
    panel.appendChild(outcome);
  }

  const rewardHeading = document.createElement('div');
  rewardHeading.textContent = 'Rewards';
  Object.assign(rewardHeading.style, { fontSize: '11px', color: '#ad9f8d', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' });
  panel.appendChild(rewardHeading);

  const selected = String((/** @type {any} */ (panel))._selectedReward || '');
  const items = Array.isArray(quest?.rewardItems) ? quest.rewardItems : [];
  const choiceIds = [...new Set(items.map((item) => String(item.choiceId || item.itemId || '')))].filter(Boolean);
  for (const choiceId of choiceIds) {
    const choiceItems = items.filter((item) => String(item.choiceId || item.itemId || '') === choiceId);
    const row = document.createElement('button');
    row.type = 'button';
    row.textContent = String(choiceItems[0]?.choiceLabel || '').trim()
      || choiceItems.map((item) => `${Number(item.count || 1) > 1 ? `${Number(item.count || 1)}x ` : ''}${String(item.name || item.itemId || 'Item')}`).join(' + ');
    Object.assign(row.style, {
      display: 'block', width: '100%', padding: '11px 12px', margin: '6px 0', textAlign: 'left',
      border: selected === choiceId ? '1px solid #d8b45a' : UI.BORDER, borderRadius: UI.RADIUS,
      background: selected === choiceId ? 'rgba(100, 75, 25, 0.55)' : 'rgba(36, 46, 58, 0.82)',
      color: '#ffd85a', font: 'inherit', cursor: 'pointer',
    });
    row.addEventListener('click', () => {
      (/** @type {any} */ (panel))._selectedReward = choiceId;
      renderQuestReward(panel, quest);
    });
    panel.appendChild(row);
  }

  const gold = Math.max(0, Number(quest?.rewardGold || 0) | 0);
  if (gold > 0) {
    const goldLine = document.createElement('div');
    goldLine.textContent = `${gold} gold`;
    Object.assign(goldLine.style, { color: '#ffd85a', fontSize: '13px', margin: '10px 0 4px' });
    panel.appendChild(goldLine);
  }

  const warning = document.createElement('div');
  warning.textContent = 'Select a reward before completing this quest.';
  Object.assign(warning.style, { display: 'none', color: '#f07878', fontSize: '12px', marginTop: '10px' });
  panel.appendChild(warning);

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' });
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Close';
  Object.assign(close.style, { minHeight: '42px', padding: '8px 14px', borderRadius: '999px', border: UI.BORDER, background: 'transparent', color: '#b6c4d6', font: 'inherit', cursor: 'pointer' });
  close.addEventListener('click', () => {
    if (!selected) {
      warning.style.display = 'block';
      return;
    }
    window.dispatchEvent(new CustomEvent('ui:closeQuestReward'));
  });
  actions.appendChild(close);
  const complete = document.createElement('button');
  complete.type = 'button'; complete.textContent = 'Complete'; complete.disabled = !selected;
  Object.assign(complete.style, { minHeight: '42px', padding: '8px 18px', borderRadius: '999px', border: '1px solid #c99d3c', background: selected ? 'rgba(125, 87, 24, 0.95)' : 'rgba(60, 60, 60, 0.6)', color: selected ? '#fff1b0' : '#8994a0', font: 'inherit', fontWeight: '700', cursor: selected ? 'pointer' : 'default' });
  complete.addEventListener('click', () => {
    if (!selected) { warning.style.display = 'block'; return; }
    window.dispatchEvent(new CustomEvent('ui:requestQuestReward', { detail: { questId: quest.questId, rewardId: selected } }));
  });
  actions.appendChild(complete);
  panel.appendChild(actions);
}

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {{
 *   districts?: Array<{label?:string, opportunities?:string[], shortages?:string[]}>,
 *   questBoard?: {
 *     generatedAt?: number,
 *     offers?: Array<{title?:string, objective?:string, sourceLabel?:string, urgency?:string, accepted?:boolean}>,
 *     sectors?: string[],
 *   }
 * }} data
 */
export function renderTownBoard(panel, data) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';
  el.style.overflowX = 'hidden';

  const heading = document.createElement('div');
  heading.textContent = 'Town Notice Board';
  heading.style.fontWeight = 'bold';
  heading.style.marginBottom = '10px';
  el.appendChild(heading);

  const questBoard = (data && typeof data.questBoard === 'object') ? data.questBoard : {};
  const offers = Array.isArray(questBoard.offers) ? questBoard.offers : [];
  const sectors = Array.isArray(questBoard.sectors) ? questBoard.sectors : [];

  const summary = document.createElement('div');
  Object.assign(summary.style, {
    fontSize: '12px',
    opacity: '0.85',
    marginBottom: '10px',
  });
  summary.textContent = `${offers.length} posted contract${offers.length === 1 ? '' : 's'}`;
  el.appendChild(summary);

  const offerLabel = document.createElement('div');
  offerLabel.textContent = 'Posted Contracts';
  Object.assign(offerLabel.style, {
    fontSize: '11px',
    color: '#7ba7cc',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '10px',
    marginBottom: '4px',
  });
  el.appendChild(offerLabel);

  if (!offers.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No contracts are currently posted.';
    Object.assign(empty.style, { opacity: '0.55', fontStyle: 'italic', fontSize: '12px', marginBottom: '8px' });
    el.appendChild(empty);
  } else {
    for (const offer of offers) {
      const isAccepted = !!offer?.accepted;
      const row = document.createElement('div');
      Object.assign(row.style, {
        padding: '7px 10px',
        marginBottom: '5px',
        background: isAccepted ? '#0f1a12' : '#0a111f',
        border: isAccepted ? '1px solid #2a6e38' : '1px solid #1e2d45',
        borderRadius: '6px',
      });
      const title = document.createElement('div');
      title.textContent = String(offer?.title || 'Town Contract');
      Object.assign(title.style, { fontSize: '13px', marginBottom: '2px' });
      row.appendChild(title);

      const objective = document.createElement('div');
      objective.textContent = String(offer?.objective || 'Investigate local demand.');
      Object.assign(objective.style, { fontSize: '11px', opacity: '0.85' });
      row.appendChild(objective);

      const meta = document.createElement('div');
      const urgency = String(offer?.urgency || 'low').toUpperCase();
      const district = String(offer?.sourceLabel || 'Town');
      meta.textContent = `${district} \u00b7 ${urgency}${isAccepted ? ' \u00b7 CLAIMED' : ''}`;
      Object.assign(meta.style, { fontSize: '10px', opacity: '0.7', marginTop: '2px' });
      row.appendChild(meta);

      const actions = document.createElement('div');
      Object.assign(actions.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: '6px',
      });
      const acceptBtn = document.createElement('button');
      decorateButton(acceptBtn);
      acceptBtn.textContent = isAccepted ? 'Accepted' : 'Accept';
      Object.assign(acceptBtn.style, {
        minHeight: '32px',
        minWidth: '82px',
        padding: '0 10px',
        fontSize: '12px',
      });
      if (isAccepted) {
        acceptBtn.disabled = true;
        acceptBtn.style.opacity = '0.6';
      } else {
        acceptBtn.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('ui:requestTownBoardAccept', {
            detail: { offer },
          }));
        });
      }
      actions.appendChild(acceptBtn);
      row.appendChild(actions);

      el.appendChild(row);
    }
  }

  if (sectors.length) {
    const sectorsEl = document.createElement('div');
    sectorsEl.textContent = `Profitable sectors: ${sectors.join(', ')}`;
    Object.assign(sectorsEl.style, {
      marginTop: '8px',
      fontSize: '11px',
      color: '#c0def8',
      opacity: '0.9',
    });
    el.appendChild(sectorsEl);
  }
}


/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<{id:string,name:string,symbol?:string,cost?:number,description?:string,targetEffects?:string[]}>} spells @param {string|null} activeId */
export function renderSpellPicker(panel, spells, activeId, bindSlot) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = typeof bindSlot === 'number'
    ? `Bind Spell to Slot ${bindSlot + 1}`
    : 'Select Active Spell';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!spells.length) {
    const empty = document.createElement('div');
    empty.textContent = '(no learned spells)';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '6px';
  el.appendChild(list);

  for (const sp of spells) {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      flexDirection: 'column',
      padding: '6px 8px', border: sp.id === activeId ? `1px solid ${UX_THEME.accentBorder}` : UI.BORDER, borderRadius: UI.RADIUS,
      background: sp.id === activeId ? UI.SEL_BG : UI.DEFAULT_BG, cursor: 'pointer'
    });
    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      width: '100%',
    });
    if (sp.symbol) {
      const sym = document.createElement('span');
      sym.textContent = sp.symbol;
      sym.style.fontSize = '18px';
      head.appendChild(sym);
    }
    const name = document.createElement('span');
    name.textContent = sp.name ? `[${sp.name}]` : `[${sp.id}]`;
    const cost = document.createElement('span');
    cost.style.marginLeft = 'auto'; cost.style.opacity = '0.8'; cost.textContent = sp.cost ? `Mana ${sp.cost}` : '';
    head.appendChild(name);
    head.appendChild(cost);
    row.appendChild(head);

    const desc = String(sp.description || '').trim();
    if (desc) {
      const descLine = document.createElement('div');
      descLine.textContent = desc;
      descLine.style.opacity = '0.85';
      descLine.style.fontSize = '12px';
      descLine.style.fontStyle = 'italic';
      row.appendChild(descLine);
    }

    const targetEffects = Array.isArray(sp.targetEffects)
      ? sp.targetEffects.map((line) => String(line || '').trim()).filter(Boolean)
      : [];
    for (const effect of targetEffects.slice(0, 2)) {
      const effectLine = document.createElement('div');
      effectLine.textContent = `\u2022 ${effect}`;
      effectLine.style.opacity = '0.85';
      effectLine.style.fontSize = '11px';
      effectLine.style.color = '#9fd6ff';
      row.appendChild(effectLine);
    }

    row.addEventListener('click', () => {
      const detail = { spellId: sp.id };
      if (typeof bindSlot === 'number') detail.bindSlot = bindSlot;
      window.dispatchEvent(new CustomEvent('ui:selectActiveSpell', { detail }));
      hide(panel);
    });
    list.appendChild(row);
  }

  const btn = document.createElement('button');
  btn.textContent = 'Close';
  decorateButton(btn);
  btn.style.marginTop = '10px';
  btn.addEventListener('click', () => hide(panel));
  el.appendChild(btn);
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} entries */
export function renderMessageLog(panel, entries) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  el.style.fontSize = '15px';
  const title = document.createElement('div');
  title.textContent = 'Message Log';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  title.style.fontSize = '17px';
  el.appendChild(title);
  const box = document.createElement('div');
  Object.assign(box.style, {
    display: 'flex', flexDirection: 'column', gap: '4px'
  });
  for (const m of entries) {
    const row = document.createElement('div');
    // Handle both plain strings (legacy) and message objects with types
    if (typeof m === 'string') {
      row.textContent = m;
    } else if (m && typeof m === 'object') {
      row.textContent = m.text || String(m);
      row.style.color = getMessageColor(m.type);
    } else {
      row.textContent = String(m);
    }
    box.appendChild(row);
  }
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.textContent = '(no messages yet)';
    box.appendChild(empty);
  }
  el.appendChild(box);
}

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {Array<any>} items
 * @param {number} altarId
 */
export function renderAltarOfferChooser(panel, items, altarId) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = 'Offer which item?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = '(you have nothing to offer)';
    empty.style.marginBottom = '10px';
    el.appendChild(empty);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    decorateButton(closeBtn);
    closeBtn.addEventListener('click', () => hide(panel));
    el.appendChild(closeBtn);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  el.appendChild(list);

  const rows = items.map((it, idx) => {
    const row = createChooserRow();

    const name = document.createElement('span');
    Object.assign(name.style, rarityStyle(it.rarityName));
    name.textContent = bracketize(sanitize(it.name || it.description || it.type || 'item'));

    const qty = document.createElement('span');
    qty.style.opacity = '0.8';
    qty.textContent = `x${Math.max(1, Number(it.count || 1))}`;

    const value = document.createElement('span');
    value.style.marginLeft = 'auto';
    value.style.opacity = '0.75';
    value.style.fontSize = '12px';
    value.textContent = `value ${Math.max(0, Number(it.value || 0))}`;

    row.appendChild(name);
    row.appendChild(qty);
    row.appendChild(value);

    row.addEventListener('mouseenter', () => setSel(idx));
    row.addEventListener('click', () => offerSelected());
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.opacity = '0.85';
  hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Offer \u00b7 Esc=Close';
  el.appendChild(hint);

  const actionsEl = document.createElement('div');
  actionsEl.style.display = 'flex';
  actionsEl.style.gap = '8px';
  actionsEl.style.marginTop = '10px';

  const offerBtn = document.createElement('button');
  offerBtn.textContent = 'Offer';
  decorateButton(offerBtn);
  offerBtn.addEventListener('click', () => offerSelected());

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  decorateButton(cancelBtn);
  cancelBtn.addEventListener('click', () => hide(panel));

  actionsEl.appendChild(offerBtn);
  actionsEl.appendChild(cancelBtn);
  el.appendChild(actionsEl);

  const { getSel, setSel } = createSimpleSel(rows, items.length, (i) => {
    showItemTooltip(items[i], rows[i]);
  });

  function offerSelected() {
    const i = getSel();
    const it = items[i];
    if (!it) return;
    pulseRow(rows[i], 'use');
    window.dispatchEvent(new CustomEvent('ui:requestAltarOffer', {
      detail: { altarId, itemId: it.id }
    }));
    hide(panel);
  }

  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Home') { setSel(0); e.preventDefault(); }
    else if (k === 'End') { setSel(items.length - 1); e.preventDefault(); }
    else if (k === 'Enter') { offerSelected(); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------------------
// Generic action chooser — used by any multi-action interactable
// (fountains, etc.). Displays a short list of labelled actions.
// ---------------------------------------------------------------------------

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {{ targetId: number, action: string, options: Array<{mode:string,label:string,disabled?:boolean}> }} data
 */
export function renderActionChooser(panel, data) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = 'What do you want to do?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  const { targetId, action, options } = data;
  if (!options || !options.length) { hide(panel); return; }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  list.style.pointerEvents = 'none';
  el.appendChild(list);
  const armAt = performance.now() + INTERACTION_POPUP_ARM_DELAY_MS;
  setTimeout(() => {
    list.style.pointerEvents = 'auto';
  }, INTERACTION_POPUP_ARM_DELAY_MS);

  const enabledIndexes = [];
  const rows = options.map((opt, idx) => {
    const row = createChooserRow();
    const label = document.createElement('span');
    label.textContent = opt.label || opt.mode;
    row.appendChild(label);
    if (opt.disabled) {
      row.style.opacity = '0.48';
      row.style.cursor = 'not-allowed';
    } else {
      enabledIndexes.push(idx);
      row.addEventListener('mouseenter', () => setSel(idx));
      row.addEventListener('click', () => confirmSelected());
    }
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.opacity = '0.85';
  hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Confirm \u00b7 Esc=Close';
  el.appendChild(hint);

  const { getSel, setSel } = createSimpleSel(rows, options.length);

  function firstEnabled() {
    return enabledIndexes.length ? enabledIndexes[0] : 0;
  }

  function lastEnabled() {
    return enabledIndexes.length ? enabledIndexes[enabledIndexes.length - 1] : Math.max(0, options.length - 1);
  }

  function moveEnabled(delta) {
    if (!enabledIndexes.length) return;
    const current = getSel();
    let pos = enabledIndexes.indexOf(current);
    if (pos < 0) pos = delta < 0 ? enabledIndexes.length : -1;
    pos = Math.max(0, Math.min(enabledIndexes.length - 1, pos + delta));
    setSel(enabledIndexes[pos]);
  }

  function confirmSelected() {
    if (performance.now() < armAt) return;
    const i = getSel();
    const opt = options[i];
    if (!opt) return;
    if (opt.disabled) return;
    pulseRow(rows[i], 'use');
    window.dispatchEvent(new CustomEvent('ui:requestActionSelect', {
      detail: { targetId, action, mode: opt.mode },
    }));
    hide(panel);
  }

  setSel(firstEnabled());

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { moveEnabled(-1); e.preventDefault(); }
    else if (k === 'ArrowDown') { moveEnabled(1); e.preventDefault(); }
    else if (k === 'Home') { setSel(firstEnabled()); e.preventDefault(); }
    else if (k === 'End') { setSel(lastEnabled()); e.preventDefault(); }
    else if (k === 'Enter') { confirmSelected(); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------------------
// Confirm action — used when the rules dispatcher needs explicit consent for
// a direct hostile action against a protected/social target.
// ---------------------------------------------------------------------------

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {{ title?: string, message?: string, confirmLabel?: string, cancelLabel?: string, action?: object, offense?: { offenseLabel?: string, severityName?: string } }} data
 */
export function renderConfirmAction(panel, data) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = String(data?.title || 'Confirm action');
  Object.assign(title.style, {
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#ffcf7a',
  });
  el.appendChild(title);

  const message = document.createElement('div');
  message.textContent = String(data?.message || 'Proceed?');
  Object.assign(message.style, {
    fontSize: '13px',
    lineHeight: '1.35',
    marginBottom: '10px',
    color: '#d8e8ff',
  });
  el.appendChild(message);

  const offense = data?.offense || null;
  if (offense) {
    const meta = document.createElement('div');
    const label = String(offense.offenseLabel || 'Offense');
    const severity = String(offense.severityName || '').replaceAll('_', ' ');
    meta.textContent = severity ? `${label} · ${severity}` : label;
    Object.assign(meta.style, {
      fontSize: '12px',
      color: '#ff9f9f',
      marginBottom: '12px',
    });
    el.appendChild(meta);
  }

  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  });

  const cancel = document.createElement('button');
  cancel.textContent = String(data?.cancelLabel || 'Cancel');
  decorateButton(cancel);
  cancel.style.minHeight = '40px';
  cancel.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ui:confirmActionCancelled', { detail: data || {} }));
    hide(panel);
  });
  row.appendChild(cancel);

  const confirm = document.createElement('button');
  confirm.textContent = String(data?.confirmLabel || 'Confirm');
  decorateButton(confirm);
  confirm.style.minHeight = '40px';
  confirm.style.borderColor = '#a85858';
  confirm.style.background = '#3a1518';
  confirm.addEventListener('click', () => {
    const action = data?.action || null;
    if (action) {
      window.dispatchEvent(new CustomEvent('ui:confirmActionAccepted', { detail: { action } }));
    }
    hide(panel);
  });
  row.appendChild(confirm);

  el.appendChild(row);

  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.opacity = '0.85';
  hint.style.fontSize = '12px';
  hint.textContent = 'Enter=Confirm · Esc=Cancel';
  el.appendChild(hint);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    if (e.key === 'Enter') { confirm.click(); e.preventDefault(); }
    else if (e.key === 'Escape') { cancel.click(); e.preventDefault(); }
  });
}

// ---------------------------------------------------------------------------
// Dip item chooser — select which inventory item to dip into a fountain
// ---------------------------------------------------------------------------

/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {Array<any>} items
 * @param {number} fountainId
 */
export function renderDipChooser(panel, items, fountainId) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  el.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = 'Dip which item?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = '(you have nothing to dip)';
    empty.style.marginBottom = '10px';
    el.appendChild(empty);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    decorateButton(closeBtn);
    closeBtn.addEventListener('click', () => hide(panel));
    el.appendChild(closeBtn);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  el.appendChild(list);

  const rows = items.map((it, idx) => {
    const row = createChooserRow();

    const name = document.createElement('span');
    Object.assign(name.style, rarityStyle(it.rarityName));
    name.textContent = bracketize(sanitize(it.name || it.description || it.type || 'item'));

    const qty = document.createElement('span');
    qty.style.opacity = '0.8';
    qty.textContent = `x${Math.max(1, Number(it.count || 1))}`;

    row.appendChild(name);
    row.appendChild(qty);

    row.addEventListener('mouseenter', () => setSel(idx));
    row.addEventListener('click', () => dipSelected());
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.opacity = '0.85';
  hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Dip \u00b7 Esc=Close';
  el.appendChild(hint);

  const actionsEl = document.createElement('div');
  actionsEl.style.display = 'flex';
  actionsEl.style.gap = '8px';
  actionsEl.style.marginTop = '10px';

  const dipBtn = document.createElement('button');
  dipBtn.textContent = 'Dip';
  decorateButton(dipBtn);
  dipBtn.addEventListener('click', () => dipSelected());

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  decorateButton(cancelBtn);
  cancelBtn.addEventListener('click', () => hide(panel));

  actionsEl.appendChild(dipBtn);
  actionsEl.appendChild(cancelBtn);
  el.appendChild(actionsEl);

  const { getSel, setSel } = createSimpleSel(rows, items.length, (i) => {
    showItemTooltip(items[i], rows[i]);
  });

  function dipSelected() {
    const i = getSel();
    const it = items[i];
    if (!it) return;
    pulseRow(rows[i], 'use');
    window.dispatchEvent(new CustomEvent('ui:requestFountainDip', {
      detail: { fountainId, itemId: it.id },
    }));
    hide(panel);
  }

  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Home') { setSel(0); e.preventDefault(); }
    else if (k === 'End') { setSel(items.length - 1); e.preventDefault(); }
    else if (k === 'Enter') { dipSelected(); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
  });
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} items */
export function renderPickupChooser(panel, items) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Pick up what?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = '(nothing here)';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';

  const selections = new Set();
  const checkboxes = [];
  const rows = items.map((it, idx) => {
    const row = document.createElement('label');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 8px', border: UI.BORDER, borderRadius: UI.RADIUS,
      background: UI.DEFAULT_BG,
    });
    row.tabIndex = 0;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      const ids = getUiItemEntityIds(it);
      for (const id of ids) {
        if (cb.checked) selections.add(id);
        else selections.delete(id);
      }
    });
    checkboxes.push(cb);
    const name = document.createElement('span');
    Object.assign(name.style, rarityStyle(it.rarityName));
    name.textContent = bracketize(sanitize(it.name || it.type || 'item'));
    const desc = document.createElement('span');
    desc.style.opacity = '0.85';
    desc.textContent = `x${it.count ?? 1}`;

    row.appendChild(cb);
    row.appendChild(name);
    row.appendChild(desc);
    row.addEventListener('mouseenter', () => { setSel(idx); });
    list.appendChild(row);
    return row;
  });

  el.appendChild(list);

  const hint = document.createElement('div');
  hint.style.marginTop = '8px'; hint.style.opacity = '0.85';
  hint.textContent = '\u2191/\u2193 select \u00b7 Space=Toggle \u00b7 Enter=Take All \u00b7 Esc=Close';
  el.appendChild(hint);

  const actionsEl = document.createElement('div');
  actionsEl.style.display = 'flex';
  actionsEl.style.gap = '8px';
  actionsEl.style.marginTop = '10px';

  function takeSelected() {
    const ids = Array.from(selections);
    if (!ids.length) return;
    window.dispatchEvent(new CustomEvent('ui:requestPickup', { detail: { itemIds: ids } }));
    hide(panel);
  }

  function takeAll() {
    const ids = items.flatMap((i) => getUiItemEntityIds(i));
    if (!ids.length) return;
    window.dispatchEvent(new CustomEvent('ui:requestPickup', { detail: { itemIds: ids } }));
    hide(panel);
  }

  const btnPickSel = document.createElement('button');
  btnPickSel.textContent = 'Take Selected';
  decorateButton(btnPickSel);
  btnPickSel.addEventListener('click', takeSelected);

  const btnPickAll = document.createElement('button');
  btnPickAll.textContent = 'Take All';
  decorateButton(btnPickAll);
  btnPickAll.addEventListener('click', takeAll);

  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Cancel';
  decorateButton(btnCancel);
  btnCancel.addEventListener('click', () => hide(panel));

  actionsEl.appendChild(btnPickAll);
  actionsEl.appendChild(btnPickSel);
  actionsEl.appendChild(btnCancel);
  el.appendChild(actionsEl);

  const { getSel, setSel } = createSimpleSel(rows, items.length, (i) => {
    showItemTooltip(items[i], rows[i]);
  });
  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const s = getSel();
    const k = e.key;
    if (k === 'ArrowUp') { setSel(s - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(s + 1); e.preventDefault(); }
    else if (k === 'Home') { setSel(0); e.preventDefault(); }
    else if (k === 'End') { setSel(items.length - 1); e.preventDefault(); }
    else if (k === ' ') { checkboxes[s].checked = !checkboxes[s].checked; checkboxes[s].dispatchEvent(new Event('change')); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'Enter') { selections.size ? takeSelected() : takeAll(); e.preventDefault(); }
  });
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} items */
export function renderUseChooser(panel, items) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Use which item?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = '(no usable items)';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  el.appendChild(list);

  const rows = items.map((it, idx) => {
    const row = createChooserRow();

    const name = document.createElement('span');
    Object.assign(name.style, rarityStyle(it.rarityName));
    name.textContent = bracketize(sanitize(it.name || it.description || it.type));

    const typeLabel = document.createElement('span');
    typeLabel.style.opacity = '0.6';
    typeLabel.style.fontSize = '12px';
    typeLabel.textContent = it.type || '';

    const qty = document.createElement('span');
    qty.style.marginLeft = 'auto'; qty.style.opacity = '0.8';
    qty.textContent = it.count > 1 ? `x${it.count}` : '';

    row.appendChild(name);
    row.appendChild(typeLabel);
    row.appendChild(qty);

    row.addEventListener('mouseenter', () => setSel(idx));
    row.addEventListener('click', () => useSelected());
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px'; hint.style.opacity = '0.85'; hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Use \u00b7 T=Throw \u00b7 Esc=Close';
  el.appendChild(hint);

  const { getSel, setSel } = createSimpleSel(rows, items.length, (i) => {
    showItemTooltip(items[i], rows[i]);
  });

  function useSelected() {
    const i = getSel();
    const it = items[i]; if (!it) return;
    pulseRow(rows[i], 'use');
    if (it.type === 'potion') {
      window.dispatchEvent(new CustomEvent('ui:requestDrink', { detail: { itemId: it.id } }));
    } else {
      window.dispatchEvent(new CustomEvent('ui:requestUse', { detail: { itemId: it.id } }));
    }
    hide(panel);
  }

  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'Enter') { useSelected(); e.preventDefault(); }
    else if (k === 't' || k === 'T') {
      const it = items[getSel()];
      if (it && Number.isInteger(it.id) && it.id > 0) {
        window.dispatchEvent(new CustomEvent('ui:requestThrow', { detail: { itemId: it.id } }));
        hide(panel);
        e.preventDefault();
      }
    }
  });
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} items */
export function renderThrowChooser(panel, items) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Throw which item?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.textContent = '(nothing to throw)';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  el.appendChild(list);

  const rows = items.map((it, idx) => {
    const row = createChooserRow();

    const name = document.createElement('span');
    Object.assign(name.style, rarityStyle(it.rarityName));
    name.textContent = bracketize(sanitize(it.name || it.description || it.type));

    const typeLabel = document.createElement('span');
    typeLabel.style.opacity = '0.6';
    typeLabel.style.fontSize = '12px';
    typeLabel.textContent = it.type || '';

    const qty = document.createElement('span');
    qty.style.marginLeft = 'auto'; qty.style.opacity = '0.8';
    qty.textContent = it.count > 1 ? `x${it.count}` : '';

    row.appendChild(name);
    row.appendChild(typeLabel);
    row.appendChild(qty);

    row.addEventListener('mouseenter', () => setSel(idx));
    row.addEventListener('click', () => throwSelected());
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px'; hint.style.opacity = '0.85'; hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Select item \u00b7 then tap target \u00b7 Esc=Close';
  el.appendChild(hint);

  const { getSel, setSel } = createSimpleSel(rows, items.length, (i) => {
    showItemTooltip(items[i], rows[i]);
  });

  function throwSelected() {
    const i = getSel();
    const it = items[i]; if (!it) return;
    pulseRow(rows[i], 'throw');
    window.dispatchEvent(new CustomEvent('ui:requestThrow', { detail: { itemId: it.id } }));
    hide(panel);
  }

  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'Enter') { throwSelected(); e.preventDefault(); }
  });
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} tools @param {(toolId:number)=>void} onSelect */
export function renderApplyToolChooser(panel, tools, onSelect) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Apply which tool?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!tools.length) {
    const empty = document.createElement('div');
    empty.textContent = '(no applicable tools)';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  el.appendChild(list);

  const rows = tools.map((it, idx) => {
    const row = createChooserRow();
    const name = document.createElement('span');
    name.textContent = bracketize(sanitize(it.name || 'tool'));
    row.appendChild(name);
    row.addEventListener('mouseenter', () => setSel(idx));
    row.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      pickTool();
    });
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px'; hint.style.opacity = '0.85'; hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Apply \u00b7 Esc=Close';
  el.appendChild(hint);

  const { getSel, setSel } = createSimpleSel(rows, tools.length);
  function pickTool() {
    const i = getSel();
    const it = tools[i]; if (!it) return;
    pulseRow(rows[i], 'use');
    onSelect(it.id);
  }
  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'Enter') { pickTool(); e.preventDefault(); }
  });
}

/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} targets @param {number} toolId @param {(targetId:number)=>void} onSelect */
export function renderApplyTargetChooser(panel, targets, toolId, onSelect) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'Apply to which item?';
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  if (!targets.length) {
    const empty = document.createElement('div');
    empty.textContent = '(no valid targets)';
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '4px';
  el.appendChild(list);

  const rows = targets.map((it, idx) => {
    const row = createChooserRow();
    const name = document.createElement('span');
    name.textContent = bracketize(sanitize(it.name || 'item'));
    row.appendChild(name);

    if (it.description) {
      const desc = document.createElement('span');
      desc.style.opacity = '0.6';
      desc.style.fontSize = '12px';
      desc.textContent = it.description;
      row.appendChild(desc);
    }

    row.addEventListener('mouseenter', () => setSel(idx));
    row.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      pickTarget();
    });
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px'; hint.style.opacity = '0.85'; hint.style.fontSize = '12px';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Apply \u00b7 Esc=Close';
  el.appendChild(hint);

  const { getSel, setSel } = createSimpleSel(rows, targets.length);
  function pickTarget() {
    const i = getSel();
    const it = targets[i]; if (!it) return;
    pulseRow(rows[i], 'use');
    onSelect(it.id);
  }
  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
    else if (k === 'Enter') { pickTarget(); e.preventDefault(); }
  });
}

/**
 * renderSlotChooser — asks player to pick Main Hand or Off-Hand when equipping a 1H weapon
 * with an ambiguous target slot.
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {{itemId:number, itemName:string, mainName:string, offName:string, offhandOccupied:boolean}} opts
 */
export function renderSlotChooser(panel, opts) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';

  const title = document.createElement('div');
  title.textContent = `Wield ${bracketize(sanitize(opts.itemName))} where?`;
  title.style.fontWeight = 'bold';
  title.style.marginBottom = '8px';
  el.appendChild(title);

  const mainLabel = `Main Hand  (replace ${bracketize(sanitize(opts.mainName))})`;
  const offLabel = opts.offhandOccupied
    ? `Off-Hand  (replace ${bracketize(sanitize(opts.offName))})`
    : `Off-Hand  (dual wield)`;

  const choices = [
    { label: mainLabel, slot: 'weapon' },
    { label: offLabel, slot: 'offhand' },
  ];

  const rows = choices.map((ch, idx) => {
    const row = createChooserRow({ padding: '8px 10px', marginBottom: '4px' });
    row.textContent = ch.label;
    row.addEventListener('mouseenter', () => { setSel(idx); });
    row.addEventListener('click', () => { pick(idx); });
    el.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  hint.style.marginTop = '8px';
  hint.style.opacity = '0.85';
  hint.textContent = '\u2191/\u2193 select \u00b7 Enter=Confirm \u00b7 Esc=Cancel';
  el.appendChild(hint);

  const { getSel, setSel } = createSimpleSel(rows, choices.length);

  function pick(i) {
    const slot = choices[i]?.slot;
    if (!slot) return;
    pulseRow(rows[i], 'equip');
    hide(panel);
    window.dispatchEvent(new CustomEvent('ui:requestEquip', {
      detail: { itemId: opts.itemId, targetSlot: slot }
    }));
  }

  setSel(0);

  installKeyHandler(panel, (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(getSel() - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(getSel() + 1); e.preventDefault(); }
    else if (k === 'Enter') { pick(getSel()); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
  });
}



// --- Book reader overlay (decorative dungeon books) ------------------------
/**
 * @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel
 * @param {string} title
 * @param {string} text
 */
export function renderBookReader(panel, title, text) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' });
  const icon = document.createElement('span');
  icon.textContent = '\uD83D\uDCD6'; // book emoji
  icon.style.fontSize = '22px';
  const heading = document.createElement('span');
  heading.textContent = title;
  Object.assign(heading.style, { fontWeight: 'bold', fontSize: '16px', color: '#c8a882' });
  header.appendChild(icon);
  header.appendChild(heading);
  el.appendChild(header);

  // Body text
  const body = document.createElement('div');
  Object.assign(body.style, {
    padding: '14px 16px',
    border: '1px solid #2d3b52', borderRadius: '6px',
    background: '#0f1421',
    lineHeight: '1.6', fontSize: '14px', color: '#cfe8ff',
    whiteSpace: 'pre-wrap',
  });
  body.textContent = text;
  el.appendChild(body);

  // Hint
  const hint = document.createElement('div');
  Object.assign(hint.style, { marginTop: '12px', opacity: '0.6', fontSize: '11px', textAlign: 'center' });
  hint.textContent = 'Esc=Close';
  el.appendChild(hint);
}

// --- Death log overlay (past deaths from localStorage) ---------------------
/** @param {HTMLDivElement & {_inner?:HTMLDivElement}} panel @param {Array<any>} records */
export function renderDeathLog(panel, records) {
  const existingDetach = /** @type {any} */ (panel)._deathLogDetach;
  if (typeof existingDetach === 'function') {
    try { existingDetach(); } catch (e) { console.debug('[overlay] deathLog detach failed:', e); }
  }

  const el = /** @type {HTMLDivElement} */ (/** @type {any} */(panel)._inner);
  el.innerHTML = '';

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' });
  const skull = document.createElement('span');
  skull.textContent = '\u2620';
  skull.style.fontSize = '22px';
  const title = document.createElement('span');
  title.textContent = 'Book of the Dead';
  Object.assign(title.style, { fontWeight: 'bold', fontSize: '16px', color: '#ff9999' });
  const countBadge = document.createElement('span');
  countBadge.textContent = `${records.length} death${records.length !== 1 ? 's' : ''}`;
  Object.assign(countBadge.style, { marginLeft: 'auto', opacity: '0.7', fontSize: '12px' });
  header.appendChild(skull);
  header.appendChild(title);
  header.appendChild(countBadge);
  el.appendChild(header);

  if (!records.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No deaths recorded yet. Stay alive out there.';
    Object.assign(empty.style, { opacity: '0.6', padding: '20px 0', textAlign: 'center' });
    el.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
  el.appendChild(list);

  let sel = 0;

  const rows = records.map((rec, idx) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', flexDirection: 'column', gap: '2px',
      padding: '8px 10px', border: '1px solid #2d3b52', borderRadius: '6px',
      background: '#0f1421', cursor: 'default',
    });

    // Top line: name, cause, depth
    const top = document.createElement('div');
    Object.assign(top.style, { display: 'flex', alignItems: 'center', gap: '8px' });

    const name = document.createElement('span');
    name.textContent = rec.playerName || 'Hero';
    Object.assign(name.style, { fontWeight: 'bold', color: '#ff9999' });

    const sep = document.createElement('span');
    sep.textContent = '\u2014';
    sep.style.opacity = '0.4';

    const cause = document.createElement('span');
    if (rec.cause === 'combat' && rec.killerName) {
      cause.textContent = `Slain by ${rec.killerName}`;
      cause.style.color = '#ff6b6b';
    } else if (rec.cause === 'starvation') {
      cause.textContent = 'Starved';
      cause.style.color = '#ffcc66';
    } else if (rec.cause === 'trap') {
      cause.textContent = 'Trap';
      cause.style.color = '#ff8844';
    } else if (rec.cause === 'spell') {
      cause.textContent = 'Magic';
      cause.style.color = '#c47bff';
    } else {
      cause.textContent = rec.cause || 'unknown';
      cause.style.color = '#aabbcc';
    }

    const depthLabel = document.createElement('span');
    depthLabel.textContent = `Depth ${rec.depth || '?'}`;
    Object.assign(depthLabel.style, { marginLeft: 'auto', color: '#88aacc', fontSize: '12px' });

    top.appendChild(name);
    top.appendChild(sep);
    top.appendChild(cause);
    top.appendChild(depthLabel);
    row.appendChild(top);

    // Bottom line: turn + timestamp
    const bottom = document.createElement('div');
    Object.assign(bottom.style, { display: 'flex', gap: '12px', fontSize: '11px', opacity: '0.55' });

    if (rec.turn) {
      const turnLabel = document.createElement('span');
      turnLabel.textContent = `Turn ${rec.turn}`;
      bottom.appendChild(turnLabel);
    }
    if (rec.timestamp) {
      const dateLabel = document.createElement('span');
      dateLabel.style.marginLeft = 'auto';
      try {
        dateLabel.textContent = new Date(rec.timestamp).toLocaleDateString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      } catch {
        dateLabel.textContent = String(rec.timestamp);
      }
      bottom.appendChild(dateLabel);
    }
    row.appendChild(bottom);

    row.addEventListener('mouseenter', () => setSel(idx));
    list.appendChild(row);
    return row;
  });

  const hint = document.createElement('div');
  Object.assign(hint.style, { marginTop: '10px', opacity: '0.6', fontSize: '11px', textAlign: 'center' });
  hint.textContent = '\u2191/\u2193 scroll \u00b7 Esc=Close \u00b7 # to toggle';
  el.appendChild(hint);

  function setSel(i) {
    sel = Math.max(0, Math.min(records.length - 1, i | 0));
    for (let j = 0; j < rows.length; j++) {
      rows[j].style.outline = (j === sel) ? '1px solid #55aaff' : 'none';
      rows[j].style.background = (j === sel) ? UI.SEL_BG : UI.DEFAULT_BG;
    }
    rows[sel]?.scrollIntoView?.({ block: 'nearest' });
  }

  setSel(0);

  installDetachableKeyHandler(panel, '_deathLogDetach', (e) => {
    if (panel.style.display !== 'block') return;
    const k = e.key;
    if (k === 'ArrowUp') { setSel(sel - 1); e.preventDefault(); }
    else if (k === 'ArrowDown') { setSel(sel + 1); e.preventDefault(); }
    else if (k === 'Home') { setSel(0); e.preventDefault(); }
    else if (k === 'End') { setSel(records.length - 1); e.preventDefault(); }
    else if (k === 'Escape') { hide(panel); e.preventDefault(); }
  });
}
