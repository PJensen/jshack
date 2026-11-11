// display/ui/overlay.js
// Coordinator: imports utilities and render functions, wires up event listeners.

import { ensureMemoryGraph } from './memoryGraph.js';
import { createDebugGraph } from './debugGraph.js';
import { createTileInspector } from './tileInspector.js';
import { renderAlchemyBench } from './alchemyBenchOverlay.js';
import { renderAnvil } from './anvilOverlay.js';
import { renderEnchantingBench } from './enchantingBenchOverlay.js';
import { renderCookingFire } from './cookingFireOverlay.js';
import { renderDialog } from './dialogOverlay.js';
import { renderLockPicking } from './lockPickingOverlay.js';
import { renderMailbox } from './mailboxOverlay.js';
import { renderMonsterChooser } from './monsterChooserOverlay.js';
import { playDeathJingle } from '../fx/deathJingle.js';
import { readInputMode } from '../input/inputSettings.js';
import { setInputLock } from '../input/inputLock.js';
import { getInventoryDefaultAction } from './inventoryUtils.js';
export { getInventoryDefaultAction };

import {
  ensureRoot, ensurePanel, ensureGroundTooltip, ensureItemTooltip,
  ensureStairTooltip, ensureInteractableTooltip, ensureTrapTooltip, ensureTombstoneTooltip,
  ensureDevNoticeTooltip, ensureTileKeyTooltip, ensureSpellGestureHint,
  ensureVirtualJoystick, ensureGestureDebugLayer, ensureMessageTicker,
  ensureDeathScreen,
  show, hide, setItemTooltip,
  renderGroundTooltip, renderStairTooltip, renderInteractableTooltip, renderTrapTooltip,
  renderTombstoneTooltip, renderDevNoticeTooltip, renderTileKeyTooltip,
  renderMessageTicker, renderMessageMore, renderDeathScreen,
  drawGestureDebug, buildLightningShadow,
  showItemTooltip, hideItemTooltip,
  CHARACTER_MENU_TABS,
  DIALOG_LAYER_Z_INDEX,
  UI_TOOLTIP_Z_BASE,
  UI_TOOLTIP_Z_FOCUS,
} from './overlayUtils.js';

// Re-export renderItemDetails from overlayUtils as a public API
export { renderItemDetails } from './overlayUtils.js';

import {
  renderInventory, renderSettings, renderQuestJournal, renderQuestReward, renderTownBoard,
  renderCharacterSheet, renderEquipment, renderSpellPicker, renderMessageLog,
  renderAltarOfferChooser, renderActionChooser, renderDipChooser, renderPickupChooser, renderUseChooser,
  renderThrowChooser, renderApplyToolChooser, renderApplyTargetChooser, renderSlotChooser,
  renderShop, renderChest, renderBookReader, renderDeathLog, renderRack, renderConfirmAction,
} from './overlayRenders.js';

export function initOverlays() {
  const root = ensureRoot();
  const inv = ensurePanel('inventory');
  const char = ensurePanel('character');
  const equip = ensurePanel('equipment');
  const settingsPanel = ensurePanel('settings');
  const questJournal = ensurePanel('quests');
  const questReward = ensurePanel('questReward');
  const townBoard = ensurePanel('townBoard');
  const mailbox = ensurePanel('mailbox');
  const log = ensurePanel('messageLog');
  const pick = ensurePanel('pickup');
  const usePanel = ensurePanel('use');
  const throwPanel = ensurePanel('throw');
  const spells = ensurePanel('spells');
  const alchemy = ensurePanel('alchemy');
  const cooking = ensurePanel('cooking');
  const dialog = ensurePanel('dialog');
  dialog.style.position = 'fixed';
  document.body.appendChild(dialog);
  const lockPicking = ensurePanel('lockPicking');
  const monsterChooser = ensurePanel('monsterChooser');
  const shop = ensurePanel('shop');
  const chest = ensurePanel('chest');
  const rack = ensurePanel('rack');
  const altar = ensurePanel('altar');
  const actionChooser = ensurePanel('actionChooser');
  const confirmAction = ensurePanel('confirmAction');
  const dipChooser = ensurePanel('dipChooser');
  const slotChooser = ensurePanel('slotChooser');
  const groundTip = ensureGroundTooltip(root);
  setItemTooltip(ensureItemTooltip(root));
  const stairTip = ensureStairTooltip(root);
  const interactableTip = ensureInteractableTooltip(root);
  const trapTip = ensureTrapTooltip(root);
  const tombstoneTip = ensureTombstoneTooltip(root);
  const devNoticeTip = ensureDevNoticeTooltip(root);
  const tileKeyTip = ensureTileKeyTooltip(root);
  const spellGestureHint = ensureSpellGestureHint(root);
  const virtualJoystick = ensureVirtualJoystick(root);
  const gestureDebug = ensureGestureDebugLayer(root);
  const trapDodge = document.createElement('div');
  const trapDodgeFill = document.createElement('div');
  const trapDodgeBtn = document.createElement('button');
  const trapDodgeLabel = document.createElement('div');
  const trapDodgeStat = document.createElement('div');
  Object.assign(trapDodge.style, {
    position: 'fixed',
    left: '50%',
    top: '50%',
    width: '116px',
    height: '54px',
    transform: 'translate(-50%, -50%)',
    zIndex: '1220',
    display: 'none',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
  });
  Object.assign(trapDodgeBtn.style, {
    position: 'absolute',
    inset: '0',
    border: '1px solid rgba(255,255,255,0.48)',
    borderRadius: '8px',
    background: 'rgba(22,24,28,0.92)',
    color: '#fff7d7',
    font: '700 16px/1 system-ui, sans-serif',
    letterSpacing: '0',
    textTransform: 'uppercase',
    boxShadow: '0 12px 30px rgba(0,0,0,0.42), 0 0 24px rgba(255,92,42,0.28)',
    overflow: 'hidden',
  });
  Object.assign(trapDodgeLabel.style, {
    position: 'relative',
    zIndex: '1',
    paddingTop: '10px',
  });
  Object.assign(trapDodgeStat.style, {
    position: 'relative',
    zIndex: '1',
    marginTop: '3px',
    color: '#ffd166',
    font: '600 10px/1 system-ui, sans-serif',
  });
  Object.assign(trapDodgeFill.style, {
    position: 'absolute',
    left: '0',
    bottom: '0',
    width: '100%',
    height: '5px',
    background: 'linear-gradient(90deg, #f05b35, #ffd166)',
    transformOrigin: 'left center',
    transform: 'scaleX(1)',
    pointerEvents: 'none',
  });
  trapDodgeLabel.textContent = 'Dodge';
  trapDodgeStat.textContent = 'EVA 0';
  trapDodgeBtn.appendChild(trapDodgeLabel);
  trapDodgeBtn.appendChild(trapDodgeStat);
  trapDodgeBtn.appendChild(trapDodgeFill);
  trapDodge.appendChild(trapDodgeBtn);
  root.appendChild(trapDodge);
  let trapDodgePrompt = null;
  let trapDodgeRaf = 0;

  function finishTrapDodge(dodged) {
    if (!trapDodgePrompt) return;
    const prompt = trapDodgePrompt;
    trapDodgePrompt = null;
    if (trapDodgeRaf) {
      cancelAnimationFrame(trapDodgeRaf);
      trapDodgeRaf = 0;
    }
    trapDodge.style.display = 'none';
    setInputLock('trapDodge', false);
    window.dispatchEvent(new CustomEvent('ui:trapDodgeResolved', {
      detail: {
        promptId: prompt.promptId,
        victimId: prompt.victimId,
        trapId: prompt.trapId,
        dodged,
      },
    }));
  }

  function showTrapDodgePrompt(detail) {
    const durationMs = Math.max(250, Number(detail?.durationMs || 0) | 0);
    const angle = Number(detail?.angleDeg || 0) * Math.PI / 180;
    const shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    const radius = Math.max(92, Math.min(210, shortSide * 0.28));
    const cx = (window.innerWidth || 0) * 0.5;
    const cy = (window.innerHeight || 0) * 0.5;
    const margin = 68;
    const x = Math.max(margin, Math.min((window.innerWidth || 0) - margin, cx + Math.cos(angle) * radius));
    const y = Math.max(margin, Math.min((window.innerHeight || 0) - margin, cy + Math.sin(angle) * radius));
    trapDodgePrompt = {
      promptId: String(detail?.promptId || ''),
      victimId: Number(detail?.victimId || 0) | 0,
      trapId: Number(detail?.trapId || 0) | 0,
      startedAt: performance.now(),
      durationMs,
    };
    trapDodge.style.left = `${x}px`;
    trapDodge.style.top = `${y}px`;
    trapDodgeFill.style.transform = 'scaleX(1)';
    trapDodgeStat.textContent = `EVA ${Number(detail?.evade || 0) | 0}`;
    trapDodge.style.display = 'block';
    setInputLock('trapDodge', true);
    trapDodgeBtn.focus({ preventScroll: true });

    const tick = () => {
      if (!trapDodgePrompt) return;
      const elapsed = performance.now() - trapDodgePrompt.startedAt;
      const remaining = Math.max(0, 1 - elapsed / trapDodgePrompt.durationMs);
      trapDodgeFill.style.transform = `scaleX(${remaining})`;
      if (remaining <= 0) {
        finishTrapDodge(false);
        return;
      }
      trapDodgeRaf = requestAnimationFrame(tick);
    };
    if (trapDodgeRaf) cancelAnimationFrame(trapDodgeRaf);
    trapDodgeRaf = requestAnimationFrame(tick);
  }

  trapDodgeBtn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    finishTrapDodge(true);
  }, { passive: false });
  // Flex container for debug graph overlays — graphs stack bottom-up
  const debugGraphStack = document.createElement('div');
  Object.assign(debugGraphStack.style, {
    position: 'fixed',
    left: '8px',
    bottom: '56px',
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: '8px',
    zIndex: '910',
    pointerEvents: 'none',
  });
  root.appendChild(debugGraphStack);

  const memoryGraph = ensureMemoryGraph(root);
  debugGraphStack.appendChild(memoryGraph.canvas);
  const deityGraph = createDebugGraph({
    id: 'deity-mood-graph-layer',
    title: 'Deity Mood',
    width: 240,
    height: 160,
    zIndex: 910,
    series: [
      { key: 'wrath',     color: '#ff4444', label: 'Wrath' },
      { key: 'serenity',  color: '#4488ff', label: 'Serenity' },
      { key: 'hunger',    color: '#ff8800', label: 'Hunger' },
      { key: 'amusement', color: '#44cc44', label: 'Amusement' },
      { key: 'sorrow',    color: '#aa44ff', label: 'Sorrow' },
      { key: 'chaos',     color: '#ff44ff', label: 'Chaos' },
    ],
    maxPoints: 60,
    sampleInterval: 1000,
    normalizedY: true,
    unavailableMessage: 'No deity data',
  });
  debugGraphStack.appendChild(deityGraph.canvas);
  let deityDebugPinned = false;

  function showDeityGraph() {
    hideTileInspector();
    deityGraph.show();
    deityGraph.startSampling();
  }

  function hideDeityGraph() {
    deityGraph.hide();
    deityGraph.stopSampling();
  }

  function applyDeityDebugPinned(enabled) {
    deityDebugPinned = !!enabled;
    if (deityDebugPinned) showDeityGraph();
    else hideDeityGraph();
  }

  const economyGraph = createDebugGraph({
    id: 'economy-graph-layer',
    title: 'Town Economy',
    width: 320,
    height: 160,
    zIndex: 910,
    series: [
      { key: 'food',      color: '#44cc44', label: 'Food',      shortLabel: 'Food' },
      { key: 'fuel',      color: '#ff8844', label: 'Fuel',      shortLabel: 'Fuel' },
      { key: 'materials', color: '#d8a04a', label: 'Materials', shortLabel: 'Mats' },
      { key: 'medicine',  color: '#aa44ff', label: 'Medicine',  shortLabel: 'Meds' },
      { key: 'labor',     color: '#44aaff', label: 'Labor',     shortLabel: 'Labor' },
      { key: 'morale',    color: '#ffcc00', label: 'Morale',    shortLabel: 'Morale' },
    ],
    maxPoints: 60,
    sampleInterval: 1000,
    normalizedY: false,
    valueDecimals: 0,
    unavailableMessage: 'Not on overworld',
  });
  debugGraphStack.appendChild(economyGraph.canvas);

  const lightingPerfGraph = createDebugGraph({
    id: 'lighting-perf-graph-layer',
    title: 'Lighting Engine',
    width: 280,
    height: 170,
    zIndex: 910,
    series: [
      { key: 'dtMs',        color: '#ff8844', label: 'dt ms' },
      { key: 'builtSdf',    color: '#ff4444', label: 'SDF' },
      { key: 'builtSurf',   color: '#4488ff', label: 'Surf' },
      { key: 'builtRelief', color: '#aa44ff', label: 'Relief' },
      { key: 'builtVision', color: '#44cc44', label: 'Vision' },
      { key: 'lightCount',  color: '#ffcc00', label: 'Lights' },
    ],
    maxPoints: 120,
    sampleInterval: 100,
    normalizedY: false,
    unavailableMessage: 'Lighting disabled',
  });
  debugGraphStack.appendChild(lightingPerfGraph.canvas);

  const tileInspector = createTileInspector();
  debugGraphStack.appendChild(tileInspector.el);
  const deathLog = ensurePanel('deathLog');
  const bookReader = ensurePanel('bookReader');
  const deathScreen = ensureDeathScreen(root);
  const WRATH_DEATH_SCREEN_DELAY_MS = 320;
  let deathScreenShowTimer = 0;

  // Always-on, semi-transparent message ticker (non-modal)
  const ticker = ensureMessageTicker(root);
  let spellGestureTimer = 0;
  let lastCharacterMenuTab = 'character';

  /** Hide all character-menu panels (mutual exclusivity). */
  function hideCharMenuPanels() {
    hide(inv); hide(char); hide(equip);
    hide(settingsPanel); hide(questJournal); hide(questReward); hide(townBoard);
  }

  window.addEventListener('ui:openInventory', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const slotFilter = String(e?.detail?.slotFilter || '').trim().toLowerCase();
    lastCharacterMenuTab = 'inventory';
    (/** @type {any} */ (inv))._inventorySlotFilter = slotFilter || '';
    hideCharMenuPanels();
    show(inv);
    window.dispatchEvent(new CustomEvent('ui:requestInventoryData', { detail: { slotFilter } }));
  });
  window.addEventListener('ui:openCharacter', (ev) => {
    const restoreLastTab = !!(/** @type {CustomEvent} */ (ev))?.detail?.restoreLastTab;
    if (restoreLastTab && lastCharacterMenuTab !== 'character') {
      const remembered = CHARACTER_MENU_TABS.find((tab) => tab.key === lastCharacterMenuTab);
      if (remembered) window.dispatchEvent(new CustomEvent(remembered.eventName));
      return;
    }
    lastCharacterMenuTab = 'character';
    hideCharMenuPanels();
    show(char);
    window.dispatchEvent(new CustomEvent('ui:requestCharacterData'));
  });
  window.addEventListener('ui:openEquipment', () => {
    lastCharacterMenuTab = 'equipment';
    hideCharMenuPanels();
    show(equip);
    window.dispatchEvent(new CustomEvent('ui:requestEquipmentData'));
  });
  window.addEventListener('ui:openSettings', () => {
    lastCharacterMenuTab = 'settings';
    hideCharMenuPanels();
    show(settingsPanel);
    window.dispatchEvent(new CustomEvent('ui:requestSettingsData'));
  });
  window.addEventListener('ui:openQuests', () => {
    lastCharacterMenuTab = 'quests';
    hideCharMenuPanels();
    show(questJournal);
    window.dispatchEvent(new CustomEvent('ui:requestQuestJournalData'));
  });
  window.addEventListener('ui:openQuestReward', (ev) => {
    const questId = String(ev?.detail?.questId || '');
    (/** @type {any} */ (questReward))._questId = questId;
    (/** @type {any} */ (questReward))._selectedReward = '';
    hideCharMenuPanels();
    show(questReward);
    window.dispatchEvent(new CustomEvent('ui:requestQuestJournalData'));
  });
  window.addEventListener('ui:closeQuestReward', () => hide(questReward));
  window.addEventListener('ui:openTownBoard', () => {
    hideCharMenuPanels();
    show(townBoard);
  });
  window.addEventListener('ui:openMailbox', () => {
    hideCharMenuPanels();
    show(mailbox);
  });
  window.addEventListener('ui:closeMailbox', () => {
    hide(mailbox);
  });
  window.addEventListener('ui:mailboxData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    renderMailbox(mailbox, e?.detail || {});
  });
  // Toggle inventory panel open/close
  window.addEventListener('ui:toggleInventory', () => {
    if (inv.style.display === 'block') {
      hide(inv);
    } else {
      hideCharMenuPanels();
      show(inv);
      (/** @type {any} */ (inv))._inventorySlotFilter = '';
      window.dispatchEvent(new CustomEvent('ui:requestInventoryData'));
    }
  });
  window.addEventListener('ui:toggleCharacter', () => {
    const openPanel = [char, inv, equip, questJournal, settingsPanel]
      .find((panel) => panel.style.display === 'block');
    if (openPanel) {
      hide(openPanel);
    } else {
      window.dispatchEvent(new CustomEvent('ui:openCharacter', {
        detail: { restoreLastTab: true },
      }));
    }
  });
  window.addEventListener('ui:toggleEquipment', () => {
    if (equip.style.display === 'block') {
      hide(equip);
    } else {
      hideCharMenuPanels();
      show(equip);
      window.dispatchEvent(new CustomEvent('ui:requestEquipmentData'));
    }
  });
  window.addEventListener('ui:toggleSettings', () => {
    if (settingsPanel.style.display === 'block') {
      hide(settingsPanel);
    } else {
      hideCharMenuPanels();
      show(settingsPanel);
      window.dispatchEvent(new CustomEvent('ui:requestSettingsData'));
    }
  });
  window.addEventListener('ui:settingsData', (ev) => {
    const data = /** @type {CustomEvent} */ (ev).detail || {};
    applyDeityDebugPinned(data.deityDebugPinned === true);
    renderSettings(settingsPanel, data, memoryGraph, deityGraph, economyGraph, tileInspector, lightingPerfGraph);
  });
  // Helper: hide tile inspector (mutual exclusivity with debug graphs)
  function hideTileInspector() {
    tileInspector.hide();
    tileInspector.stopPolling();
  }
  // Toggle memory graph
  window.addEventListener('ui:toggleMemoryGraph', () => {
    if (memoryGraph.canvas.style.display === 'block') {
      memoryGraph.hide();
      memoryGraph.stopSampling();
    } else {
      hideTileInspector();
      memoryGraph.show();
      memoryGraph.startSampling();
    }
  });
  // Toggle deity mood graph
  window.addEventListener('ui:toggleDeityMoodGraph', () => {
    if (deityDebugPinned) {
      showDeityGraph();
      return;
    }
    if (deityGraph.canvas.style.display === 'block') hideDeityGraph();
    else showDeityGraph();
  });
  window.addEventListener('ui:showDeityMoodGraph', () => {
    showDeityGraph();
  });
  window.addEventListener('ui:setDeityDebugPinned', (ev) => {
    const enabled = !!(/** @type {CustomEvent} */ (ev)).detail?.enabled;
    applyDeityDebugPinned(enabled);
  });
  // Late-bind deity mood sampler from main.js
  window.addEventListener('debug:registerDeityMoodSampler', (ev) => {
    const fn = /** @type {CustomEvent} */ (ev).detail?.sampler;
    if (typeof fn === 'function') deityGraph.setSampler(fn);
  });
  // Toggle economy graph
  window.addEventListener('ui:toggleEconomyGraph', () => {
    if (economyGraph.canvas.style.display === 'block') {
      economyGraph.hide();
      economyGraph.stopSampling();
    } else {
      hideTileInspector();
      economyGraph.show();
      economyGraph.startSampling();
    }
  });
  // Late-bind economy sampler from main.js
  window.addEventListener('debug:registerEconomySampler', (ev) => {
    const fn = /** @type {CustomEvent} */ (ev).detail?.sampler;
    if (typeof fn === 'function') economyGraph.setSampler(fn);
  });
  // Toggle lighting perf graph
  window.addEventListener('ui:toggleLightingPerfGraph', () => {
    if (lightingPerfGraph.canvas.style.display === 'block') {
      lightingPerfGraph.hide();
      lightingPerfGraph.stopSampling();
    } else {
      hideTileInspector();
      lightingPerfGraph.show();
      lightingPerfGraph.startSampling();
    }
  });
  // Late-bind lighting perf sampler from main.js
  window.addEventListener('debug:registerLightingPerfSampler', (ev) => {
    const fn = /** @type {CustomEvent} */ (ev).detail?.sampler;
    if (typeof fn === 'function') lightingPerfGraph.setSampler(fn);
  });
  // Toggle tile inspector (mutually exclusive with all debug graphs)
  window.addEventListener('ui:toggleTileInspector', () => {
    if (tileInspector.el.style.display === 'block') {
      hideTileInspector();
    } else {
      // Hide all debug graphs
      memoryGraph.hide(); memoryGraph.stopSampling();
      if (!deityDebugPinned) hideDeityGraph();
      economyGraph.hide(); economyGraph.stopSampling();
      tileInspector.show();
      tileInspector.startPolling();
    }
  });
  // Late-bind tile inspector sampler from main.js
  window.addEventListener('debug:registerTileInspectorSampler', (ev) => {
    const fn = /** @type {CustomEvent} */ (ev).detail?.sampler;
    if (typeof fn === 'function') tileInspector.setSampler(fn);
  });
  window.addEventListener('ui:openMessageLog', () => {
    show(log);
    // Request messages; app may respond with ui:messageLogData
    window.dispatchEvent(new CustomEvent('ui:requestMessageLogData'));
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const tabPanels = [char, inv, equip, questJournal, settingsPanel];
      const curIdx = tabPanels.findIndex(p => p.style.display === 'block');
      if (curIdx !== -1) {
        e.preventDefault();
        const next = CHARACTER_MENU_TABS[(curIdx + (e.shiftKey ? CHARACTER_MENU_TABS.length - 1 : 1)) % CHARACTER_MENU_TABS.length];
        window.dispatchEvent(new CustomEvent(next.eventName));
      }
    }
    if (e.key === 'Escape') {
      // Close every ui-panel that is currently visible
      let closed = false;
      for (const p of document.querySelectorAll('.ui-panel')) {
        if (p.style.display === 'block') {
          hide(/** @type {HTMLDivElement} */ (p));
          closed = true;
        }
      }
      // Close debug graphs
      if (memoryGraph.canvas.style.display === 'block') {
        memoryGraph.hide();
        memoryGraph.stopSampling();
        closed = true;
      }
      if (deityGraph.canvas.style.display === 'block') {
        if (!deityDebugPinned) {
          hideDeityGraph();
          closed = true;
        }
      }
      if (economyGraph.canvas.style.display === 'block') {
        economyGraph.hide();
        economyGraph.stopSampling();
        closed = true;
      }
      if ((/** @type {any} */ (ticker))._expanded) {
        (/** @type {any} */ (ticker))._expanded = false;
        renderMessageTicker(ticker, (/** @type {any} */ (ticker))._entries || []);
        closed = true;
      }
      if (closed) e.preventDefault();
    }
  });

  // Pulse guard: defer inventory re-render while a row pulse animation is active
  // so equip/drop/use feedback isn't immediately wiped by a data refresh.
  let invPulseUntil = 0;
  let invDeferredRender = 0;
  window.addEventListener('ui:inventoryPulse', () => {
    invPulseUntil = performance.now() + 480;
  });

  // Data feeds
  window.addEventListener('ui:inventoryData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.bagItems) || (e?.detail?.items) || [];
    const equippedBySlot = e?.detail?.equippedBySlot || null;
    const ground = e?.detail?.ground || null;
    const slotFilter = String(e?.detail?.slotFilter || '').trim().toLowerCase();
    const scrollOfIdentifyId = Number(e?.detail?.scrollOfIdentifyId || 0) | 0;
    const encumbrance = e?.detail?.encumbrance || null;
    (/** @type {any} */ (inv))._inventoryLastData = {
      items,
      ground,
      slotFilter,
      scrollOfIdentifyId,
      encumbrance,
    };
    const pinnedKeys = Array.isArray((/** @type {any} */ (inv))._inventoryPinnedKeys)
      ? (/** @type {any} */ (inv))._inventoryPinnedKeys
      : [];

    const doRender = () => {
      if (inv.style.display === 'block') renderInventory(inv, items, ground, slotFilter, scrollOfIdentifyId, encumbrance, pinnedKeys);
      if (equip.style.display === 'block') {
        const cachedPlayerName = String((/** @type {any} */ (equip))._equipmentPlayerName || 'Hero');
        renderEquipment(equip, equippedBySlot, cachedPlayerName, scrollOfIdentifyId, encumbrance);
      }
    };

    const now = performance.now();
    if (now < invPulseUntil) {
      clearTimeout(invDeferredRender);
      invDeferredRender = setTimeout(doRender, invPulseUntil - now);
    } else {
      doRender();
    }
  });
  window.addEventListener('ui:pinnedQuickItems', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const pinKeys = Array.isArray(e?.detail?.pinKeys) ? e.detail.pinKeys.map((key) => String(key || '')) : [];
    (/** @type {any} */ (inv))._inventoryPinnedKeys = pinKeys;
    if (inv.style.display !== 'block') return;
    const last = (/** @type {any} */ (inv))._inventoryLastData;
    if (!last) return;
    renderInventory(
      inv,
      Array.isArray(last.items) ? last.items : [],
      last.ground || null,
      String(last.slotFilter || ''),
      Number(last.scrollOfIdentifyId || 0) | 0,
      last.encumbrance || null,
      pinKeys,
    );
  });
  window.addEventListener('ui:characterData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const playerName = String(e?.detail?.playerName || 'Hero');
    const stats = e?.detail?.stats || {};
    const activeEffects = Array.isArray(e?.detail?.activeEffects) ? e.detail.activeEffects : [];
    const traits = Array.isArray(e?.detail?.traits) ? e.detail.traits : [];
    const calendar = e?.detail?.calendar || null;
    if (char.style.display === 'block') renderCharacterSheet(char, { playerName, stats, activeEffects, traits, calendar });
  });
  window.addEventListener('ui:equipmentData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const equippedBySlot = e?.detail?.equippedBySlot || null;
    const playerName = String(e?.detail?.playerName || 'Hero');
    const scrollOfIdentifyId = Number(e?.detail?.scrollOfIdentifyId || 0) | 0;
    const encumbrance = e?.detail?.encumbrance || null;
    (/** @type {any} */ (equip))._equipmentPlayerName = playerName;
    if (equip.style.display === 'block') renderEquipment(equip, equippedBySlot, playerName, scrollOfIdentifyId, encumbrance);
  });
  window.addEventListener('ui:questJournalData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const quests = Array.isArray(e?.detail?.quests) ? e.detail.quests : [];
    if (questJournal.style.display === 'block') renderQuestJournal(questJournal, quests);
    if (questReward.style.display === 'block') {
      const questId = String((/** @type {any} */ (questReward))._questId || '');
      const quest = quests.find((entry) => entry.questId === questId && entry.node === 'reward');
      if (quest) renderQuestReward(questReward, quest);
      else hide(questReward);
    }
  });
  window.addEventListener('ui:townBoardData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderTownBoard(townBoard, d);
  });
  window.addEventListener('ui:messageLogData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const entries = (e?.detail?.entries) || [];
    renderMessageLog(log, entries);
  });

  // Spell picker overlay
  /** @type {number|null} Track which action bar slot is being rebound, if any */
  let _spellPickerBindSlot = null;
  window.addEventListener('ui:openSpellPicker', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    _spellPickerBindSlot = (typeof e?.detail?.bindSlot === 'number') ? e.detail.bindSlot : null;
    show(spells);
    window.dispatchEvent(new CustomEvent('ui:requestSpellData'));
  });
  window.addEventListener('ui:spellData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.spells) || [];
    const activeId = e?.detail?.activeSpellId || null;
    renderSpellPicker(spells, items, activeId, _spellPickerBindSlot);
  });

  // Open pickup chooser: expects items array [{ id, name, type, count }]
  window.addEventListener('ui:openPickupChooser', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.items) || [];
    renderPickupChooser(pick, items);
    show(pick);
  });

  // Altar offering chooser
  window.addEventListener('ui:altarOfferPrompt', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.items) || [];
    const altarId = Number(e?.detail?.altarId || 0) | 0;
    renderAltarOfferChooser(altar, items, altarId);
    show(altar);
  });

  // Generic action chooser (fountain drink/dip, etc.)
  window.addEventListener('ui:actionChooser', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const detail = e?.detail;
    if (!detail) return;
    renderActionChooser(actionChooser, detail);
    show(actionChooser);
  });

  window.addEventListener('ui:confirmAction', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const detail = e?.detail;
    if (!detail) return;
    renderConfirmAction(confirmAction, detail);
    show(confirmAction);
  });

  // Fountain dip item chooser
  window.addEventListener('ui:fountainDipPrompt', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.items) || [];
    const fountainId = Number(e?.detail?.fountainId || 0) | 0;
    renderDipChooser(dipChooser, items, fountainId);
    show(dipChooser);
  });

  // Use-item chooser (filtered inventory for usable items)
  window.addEventListener('ui:openUseChooser', () => {
    show(usePanel);
    window.dispatchEvent(new CustomEvent('ui:requestUsableItemsData'));
  });
  window.addEventListener('ui:usableItemsData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.items) || [];
    renderUseChooser(usePanel, items);
  });

  // Throw-item chooser
  window.addEventListener('ui:openThrowChooser', () => {
    show(throwPanel);
    window.dispatchEvent(new CustomEvent('ui:requestThrowableItemsData'));
  });
  window.addEventListener('ui:throwableItemsData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const items = (e?.detail?.items) || [];
    renderThrowChooser(throwPanel, items);
  });

  // Slot chooser for dual-wield weapon placement
  window.addEventListener('ui:openSlotChooser', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const detail = e?.detail || {};
    renderSlotChooser(slotChooser, detail);
    show(slotChooser);
  });

  window.addEventListener('ui:openDialog', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    hide(inv);
    hide(char);
    hide(equip);
    hide(settingsPanel);
    hide(pick);
    hide(usePanel);
    hide(throwPanel);
    hide(spells);
    hide(alchemy);
    hide(cooking);
    hide(lockPicking);
    hide(monsterChooser);
    hide(shop);
    hide(chest);
    hide(rack);
    hide(altar);
    renderDialog(dialog, d);
    show(dialog);
    dialog.style.zIndex = String(DIALOG_LAYER_Z_INDEX);
    const dialogKey = (/** @type {KeyboardEvent} */ ke) => {
      if (dialog.style.display !== 'block') return;
      if (ke.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('ui:requestDialogClose', { detail: { sessionId: Number(d.sessionId || 0) | 0 } }));
      } else if (ke.key === 'Enter' || ke.code === 'NumpadEnter') {
        const defaultChoiceId = String((Array.isArray(d.choices) ? d.choices[0]?.id : '') || '');
        if (!defaultChoiceId) return;
        window.dispatchEvent(new CustomEvent('ui:requestDialogChoice', {
          detail: { sessionId: Number(d.sessionId || 0) | 0, choiceId: defaultChoiceId },
        }));
      } else {
        return;
      }
      ke.preventDefault();
      ke.stopImmediatePropagation();
    };
    window.addEventListener('keydown', dialogKey, { capture: true });
    // Backdrop click should close the dialog session, not just hide the panel
    const backdropClose = (/** @type {PointerEvent} */ pe) => {
      if (pe.target === dialog) {
        window.dispatchEvent(new CustomEvent('ui:requestDialogClose', { detail: { sessionId: Number(d.sessionId || 0) | 0 } }));
      }
    };
    dialog.addEventListener('pointerdown', backdropClose);
    const obs = new MutationObserver(() => {
      if (dialog.style.display === 'none') {
        window.removeEventListener('keydown', dialogKey, { capture: true });
        dialog.removeEventListener('pointerdown', backdropClose);
        obs.disconnect();
      }
    });
    obs.observe(dialog, { attributes: true, attributeFilter: ['style'] });
  });
  window.addEventListener('ui:closeDialog', () => {
    hide(dialog);
  });

  window.addEventListener('ui:openLockPicking', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    hide(inv);
    hide(char);
    hide(equip);
    hide(settingsPanel);
    hide(pick);
    hide(usePanel);
    hide(throwPanel);
    hide(spells);
    hide(alchemy);
    hide(cooking);
    hide(dialog);
    hide(lockPicking);
    hide(shop);
    hide(chest);
    hide(rack);
    hide(altar);
    renderLockPicking(lockPicking, e?.detail || {});
    show(lockPicking);
  });
  window.addEventListener('ui:closeLockPicking', () => {
    hide(lockPicking);
  });

  window.addEventListener('ui:openMonsterChooser', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    hide(inv);
    hide(char);
    hide(equip);
    hide(settingsPanel);
    hide(pick);
    hide(usePanel);
    hide(throwPanel);
    hide(spells);
    hide(alchemy);
    hide(cooking);
    hide(dialog);
    hide(shop);
    hide(chest);
    hide(rack);
    hide(altar);
    renderMonsterChooser(monsterChooser, e?.detail || {});
    show(monsterChooser);
  });
  window.addEventListener('ui:closeMonsterChooser', () => {
    hide(monsterChooser);
  });

  // Apply-tool chooser (two-step: pick tool, then pick target)
  const applyPanel = ensurePanel('apply');
  let _applyToolId = 0;
  window.addEventListener('ui:openApplyChooser', () => {
    _applyToolId = 0;
    // Keep modal overlays exclusive; prevents touch click-through into inventory rows.
    hide(inv);
    hide(char);
    hide(equip);
    show(applyPanel);
    window.dispatchEvent(new CustomEvent('ui:requestApplyToolsData'));
  });
  window.addEventListener('ui:openApplyForTool', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const toolId = Number(e?.detail?.toolId || 0);
    if (!Number.isInteger(toolId) || toolId <= 0) return;
    _applyToolId = toolId;
    // Opening apply from inventory should not leave inventory interactive behind it.
    hide(inv);
    hide(equip);
    show(applyPanel);
    window.dispatchEvent(new CustomEvent('ui:requestApplyTargetsData', { detail: { toolId } }));
  });
  window.addEventListener('ui:applyToolsData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const tools = (e?.detail?.items) || [];
    renderApplyToolChooser(applyPanel, tools, (toolId) => {
      _applyToolId = toolId;
      window.dispatchEvent(new CustomEvent('ui:requestApplyTargetsData', { detail: { toolId } }));
    });
  });
  window.addEventListener('ui:applyTargetsData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const targets = (e?.detail?.items) || [];
    const toolId = _applyToolId;
    renderApplyTargetChooser(applyPanel, targets, toolId, (targetItemId) => {
      window.dispatchEvent(new CustomEvent('ui:requestApply', { detail: { toolId, targetItemId } }));
      hide(applyPanel);
    });
  });

  // Gem selector for weapon sockets ("Add Gem" action)
  window.addEventListener('ui:openGemSelectorForWeapon', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const weaponId = Number(e?.detail?.weaponId || 0);
    if (!(weaponId > 0)) return;
    hide(inv);
    hide(equip);
    show(applyPanel);
    window.dispatchEvent(new CustomEvent('ui:requestSocketableGemsData', { detail: { weaponId } }));
  });
  window.addEventListener('ui:socketableGemsData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const gems = (e?.detail?.items) || [];
    const weaponId = Number(e?.detail?.weaponId || 0);
    renderApplyToolChooser(applyPanel, gems, (gemId) => {
      window.dispatchEvent(new CustomEvent('ui:requestApply', { detail: { toolId: gemId, targetItemId: weaponId } }));
      hide(applyPanel);
    });
  });

  // Shop overlay
  let _shopState = { shopkeeperId: 0, buyMarkup: 1.0, sellDiscount: 0.5, mode: 'browse', activeTab: 'buy', vendorKind: '', vendorLabel: '' };
  window.addEventListener('ui:openShop', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _shopState.shopkeeperId = d.shopkeeperId || 0;
    _shopState.buyMarkup = d.buyMarkup ?? 1.0;
    _shopState.sellDiscount = d.sellDiscount ?? 0.5;
    _shopState.mode = d.mode || 'browse';
    _shopState.vendorKind = String(d.vendorKind || '');
    _shopState.vendorLabel = String(d.vendorLabel || '');
    show(shop);
  });
  window.addEventListener('ui:closeShop', () => {
    _shopState.shopkeeperId = 0;
    _shopState.mode = 'browse';
    _shopState.activeTab = 'buy';
    _shopState.vendorKind = '';
    _shopState.vendorLabel = '';
    hide(shop);
  });
  window.addEventListener('ui:shopData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderShop(shop, d, _shopState);
  });

  // Alchemy bench overlay
  let _alchemyState = {
    benchId: 0,
    ingredients: { berries: 0, herbs: 0, thornPods: 0, venomFronds: 0, moonleaf: 0, emberRoot: 0 },
    recipes: [],
  };
  let _craftPanelMode = '';
  window.addEventListener('ui:openAlchemyBench', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _craftPanelMode = 'alchemy';
    _alchemyState.benchId = Number(d.benchId || 0) | 0;
    show(alchemy);
    renderAlchemyBench(alchemy, _alchemyState);
    const escKey = (/** @type {KeyboardEvent} */ ke) => {
      if (alchemy.style.display !== 'block') return;
      if (_craftPanelMode !== 'alchemy') return;
      if (ke.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('ui:closeAlchemyBench'));
        ke.preventDefault();
        ke.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', escKey, { capture: true });
    const obs = new MutationObserver(() => {
      if (alchemy.style.display === 'none') {
        window.removeEventListener('keydown', escKey, { capture: true });
        obs.disconnect();
      }
    });
    obs.observe(alchemy, { attributes: true, attributeFilter: ['style'] });
  });
  window.addEventListener('ui:closeAlchemyBench', () => {
    _alchemyState.benchId = 0;
    if (_craftPanelMode === 'alchemy') {
      _craftPanelMode = '';
      hide(alchemy);
    }
  });
  window.addEventListener('ui:alchemyBenchData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _alchemyState = {
      benchId: Number(d.benchId || _alchemyState.benchId || 0) | 0,
      ingredients: d.ingredients && typeof d.ingredients === 'object'
        ? d.ingredients
        : { berries: 0, herbs: 0, thornPods: 0, venomFronds: 0, moonleaf: 0, emberRoot: 0 },
      recipes: Array.isArray(d.recipes) ? d.recipes : [],
    };
    renderAlchemyBench(alchemy, _alchemyState);
  });

  // Enchanting bench overlay
  let _enchantingState = {
    benchId: 0,
    ingredients: { emberRoot: 0, moonleaf: 0, thornPods: 0, venomFronds: 0, spiderLeg: 0, venomGland: 0, resin: 0, boneDust: 0, ectoplasm: 0, runeFragment: 0, frostCore: 0, beastClaw: 0, cursedThread: 0, oil: 0, water: 0, ashes: 0, gold: 0 },
    recipes: [],
    title: "✧ Enchanting Bench",
    subtitle: "Bind reagents and gold into a scroll, then apply it to your gear.",
  };
  window.addEventListener('ui:openEnchantingBench', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _craftPanelMode = 'enchanting';
    _enchantingState.benchId = Number(d.benchId || 0) | 0;
    show(alchemy);
    renderEnchantingBench(alchemy, _enchantingState);
    const escKey = (/** @type {KeyboardEvent} */ ke) => {
      if (alchemy.style.display !== 'block') return;
      if (_craftPanelMode !== 'enchanting') return;
      if (ke.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('ui:closeEnchantingBench'));
        ke.preventDefault();
        ke.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', escKey, { capture: true });
    const obs = new MutationObserver(() => {
      if (alchemy.style.display === 'none') {
        window.removeEventListener('keydown', escKey, { capture: true });
        obs.disconnect();
      }
    });
    obs.observe(alchemy, { attributes: true, attributeFilter: ['style'] });
  });
  window.addEventListener('ui:closeEnchantingBench', () => {
    _enchantingState.benchId = 0;
    if (_craftPanelMode === 'enchanting') {
      _craftPanelMode = '';
      hide(alchemy);
    }
  });
  window.addEventListener('ui:enchantingBenchData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _enchantingState = {
      benchId: Number(d.benchId || _enchantingState.benchId || 0) | 0,
      ingredients: d.ingredients && typeof d.ingredients === 'object'
        ? d.ingredients
        : { emberRoot: 0, moonleaf: 0, thornPods: 0, venomFronds: 0, spiderLeg: 0, venomGland: 0, resin: 0, boneDust: 0, ectoplasm: 0, runeFragment: 0, frostCore: 0, beastClaw: 0, cursedThread: 0, oil: 0, water: 0, ashes: 0, gold: 0 },
      recipes: Array.isArray(d.recipes) ? d.recipes : [],
      title: String(d.title || _enchantingState.title || "✧ Enchanting Bench"),
      subtitle: String(d.subtitle || _enchantingState.subtitle || "Bind reagents and gold into a scroll, then apply it to your gear."),
    };
    renderEnchantingBench(alchemy, _enchantingState);
  });

  // Anvil overlay
  let _anvilState = {
    anvilId: 0,
    materials: { iron: 0, lumber: 0 },
    recipes: [],
  };
  window.addEventListener('ui:openAnvil', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _craftPanelMode = 'anvil';
    _anvilState.anvilId = Number(d.anvilId || 0) | 0;
    show(alchemy);
    renderAnvil(alchemy, _anvilState);
    const escKey = (/** @type {KeyboardEvent} */ ke) => {
      if (alchemy.style.display !== 'block') return;
      if (_craftPanelMode !== 'anvil') return;
      if (ke.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('ui:closeAnvil'));
        ke.preventDefault();
      }
    };
    window.addEventListener('keydown', escKey);
    const obs = new MutationObserver(() => {
      if (alchemy.style.display === 'none') {
        window.removeEventListener('keydown', escKey);
        obs.disconnect();
      }
    });
    obs.observe(alchemy, { attributes: true, attributeFilter: ['style'] });
  });
  window.addEventListener('ui:closeAnvil', () => {
    _anvilState.anvilId = 0;
    if (_craftPanelMode === 'anvil') {
      _craftPanelMode = '';
      hide(alchemy);
    }
  });
  window.addEventListener('ui:anvilData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _anvilState = {
      anvilId: Number(d.anvilId || _anvilState.anvilId || 0) | 0,
      materials: d.materials && typeof d.materials === 'object'
        ? d.materials
        : { iron: 0, lumber: 0 },
      recipes: Array.isArray(d.recipes) ? d.recipes : [],
    };
    renderAnvil(alchemy, _anvilState);
  });

  // Cooking fire overlay
  let _cookingState = {
    fireId: 0,
    corpses: [],
    herbs: { count: 0 },
    ingredients: {},
    recipes: [],
  };
  window.addEventListener('ui:openCookingFire', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _cookingState.fireId = Number(d.fireId || 0) | 0;
    show(cooking);
    renderCookingFire(cooking, _cookingState);
    const escKey = (/** @type {KeyboardEvent} */ ke) => {
      if (cooking.style.display !== 'block') return;
      if (ke.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('ui:closeCookingFire'));
        ke.preventDefault();
      }
    };
    window.addEventListener('keydown', escKey);
    const obs = new MutationObserver(() => {
      if (cooking.style.display === 'none') {
        window.removeEventListener('keydown', escKey);
        obs.disconnect();
      }
    });
    obs.observe(cooking, { attributes: true, attributeFilter: ['style'] });
  });
  window.addEventListener('ui:closeCookingFire', () => {
    _cookingState.fireId = 0;
    hide(cooking);
  });
  window.addEventListener('ui:channeling:start', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    if (String(e?.detail?.channelId || '') !== 'cooking') return;
    window.dispatchEvent(new CustomEvent('ui:closeCookingFire'));
  });
  window.addEventListener('ui:cookingFireData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _cookingState = {
      fireId: Number(d.fireId || _cookingState.fireId || 0) | 0,
      corpses: Array.isArray(d.corpses) ? d.corpses : [],
      herbs: d.herbs && typeof d.herbs === 'object' ? d.herbs : { count: 0 },
      ingredients: d.ingredients && typeof d.ingredients === 'object' ? d.ingredients : {},
      recipes: Array.isArray(d.recipes) ? d.recipes : [],
    };
    renderCookingFire(cooking, _cookingState);
  });

  // Chest overlay
  let _chestState = { chestId: 0, label: 'Chest' };
  window.addEventListener('ui:openChest', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _chestState.chestId = d.chestId || 0;
    _chestState.label = d.label || 'Chest';
    show(chest);
  });
  window.addEventListener('ui:chestData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderChest(chest, d, _chestState);
  });

  // Rack overlay
  let _rackState = { rackId: 0 };
  window.addEventListener('ui:openRack', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    _rackState.rackId = d.rackId || 0;
    show(rack);
  });
  window.addEventListener('ui:rackData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderRack(rack, d, _rackState);
  });

  /** @param {HTMLDivElement} active */
  function focusGameplayTooltip(active) {
    const tooltips = [groundTip, stairTip, interactableTip, trapTip];
    for (const tip of tooltips) {
      if (tip === active) {
        tip.style.display = 'block';
        tip.style.zIndex = String(UI_TOOLTIP_Z_FOCUS);
      } else {
        tip.style.display = 'none';
        tip.style.zIndex = String(UI_TOOLTIP_Z_BASE);
      }
    }
  }

  // Ground item tooltip lifecycle
  window.addEventListener('ui:showGroundItem', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderGroundTooltip(groundTip, d);
    focusGameplayTooltip(groundTip);
  });
  window.addEventListener('ui:hideGroundItem', () => {
    groundTip.style.display = 'none';
  });

  // Stair tooltip lifecycle
  window.addEventListener('ui:showStairTooltip', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderStairTooltip(stairTip, d);
    focusGameplayTooltip(stairTip);
  });
  window.addEventListener('ui:hideStairTooltip', () => {
    stairTip.style.display = 'none';
  });

  // Authored interactable tooltip lifecycle
  window.addEventListener('ui:showInteractableTooltip', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderInteractableTooltip(interactableTip, d);
    focusGameplayTooltip(interactableTip);
  });
  window.addEventListener('ui:hideInteractableTooltip', () => {
    interactableTip.style.display = 'none';
  });

  // Trap tooltip lifecycle
  window.addEventListener('ui:showTrapTooltip', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderTrapTooltip(trapTip, d);
    focusGameplayTooltip(trapTip);
  });
  window.addEventListener('ui:hideTrapTooltip', () => {
    trapTip.style.display = 'none';
  });

  // Tombstone tooltip lifecycle
  window.addEventListener('ui:showTombstoneTooltip', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderTombstoneTooltip(tombstoneTip, d);
    tombstoneTip.style.display = 'block';
  });
  window.addEventListener('ui:hideTombstoneTooltip', () => {
    tombstoneTip.style.display = 'none';
  });

  // Project development notice tooltip lifecycle
  window.addEventListener('ui:showDevNoticeTooltip', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderDevNoticeTooltip(devNoticeTip, d);
    devNoticeTip.style.display = 'block';
  });
  window.addEventListener('ui:hideDevNoticeTooltip', () => {
    devNoticeTip.style.display = 'none';
  });

  // First-run tile key overlay
  window.addEventListener('ui:showTileKeyTooltip', () => {
    renderTileKeyTooltip(tileKeyTip);
    tileKeyTip.style.display = 'flex';
  });

  // Keep the full history even while the separate More renderer owns display.
  let _moreActive = false;
  window.addEventListener('ui:updateMessageTicker', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const entries = (e?.detail?.entries) || [];
    (/** @type {any} */ (ticker))._entries = entries.slice();
    if (_moreActive) return;
    renderMessageTicker(ticker, entries);
  });

  // NetHack --More-- queue display events
  window.addEventListener('ui:messageMoreShow', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const { message, hasMore } = e?.detail || {};
    _moreActive = true;
    renderMessageMore(ticker, message, hasMore);
  });
  window.addEventListener('ui:messageMoreClear', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    _moreActive = false;
    const entries = e?.detail?.entries || (/** @type {any} */ (ticker))._entries || [];
    renderMessageTicker(ticker, entries);
  });

  // Gesture debug path overlay
  window.addEventListener('ui:gestureProgress', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const pts = Array.isArray(e?.detail?.points) ? e.detail.points : [];
    const active = !!e?.detail?.active;
    const rec = e?.detail?.recognized || null;
    drawGestureDebug(gestureDebug, pts, active, rec);
  });

  // Virtual joystick overlay
  window.addEventListener('ui:joystickProgress', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    const active = !!d.active;
    if (!active) {
      virtualJoystick.wrap.style.display = 'none';
      return;
    }
    const baseX = Number(d?.base?.x);
    const baseY = Number(d?.base?.y);
    const knobX = Number(d?.knob?.x);
    const knobY = Number(d?.knob?.y);
    const radius = Number(d?.radius);
    if (!Number.isFinite(baseX) || !Number.isFinite(baseY) || !Number.isFinite(knobX) || !Number.isFinite(knobY)) {
      virtualJoystick.wrap.style.display = 'none';
      return;
    }
    const outerPx = Number.isFinite(radius) ? Math.max(34, radius) : 46;
    const innerPx = Math.max(16, outerPx * 0.45);

    virtualJoystick.wrap.style.display = 'block';
    virtualJoystick.outer.style.width = `${outerPx * 2}px`;
    virtualJoystick.outer.style.height = `${outerPx * 2}px`;
    virtualJoystick.outer.style.left = `${baseX - outerPx}px`;
    virtualJoystick.outer.style.top = `${baseY - outerPx}px`;
    virtualJoystick.inner.style.width = `${innerPx * 2}px`;
    virtualJoystick.inner.style.height = `${innerPx * 2}px`;
    virtualJoystick.inner.style.left = `${knobX - innerPx}px`;
    virtualJoystick.inner.style.top = `${knobY - innerPx}px`;
  });

  window.addEventListener('ui:showSpellGestureHint', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const inputMode = readInputMode();
    if (inputMode === 'walk') {
      if (spellGestureTimer) {
        window.clearTimeout(spellGestureTimer);
        spellGestureTimer = 0;
      }
      spellGestureHint.wrap.style.display = 'none';
      return;
    }
    const id = String(e?.detail?.id || '');
    if (id !== 'lightning') return;
    const mode = String(e?.detail?.mode || 'cast');
    const quality = Number(e?.detail?.quality);
    const clamped = Number.isFinite(quality) ? Math.max(0.35, Math.min(1, quality)) : 1;
    const duration = mode === 'learn' ? 2600 : 900;
    spellGestureHint.glyph.textContent = 'Z';
    spellGestureHint.glyph.style.textShadow = buildLightningShadow(clamped);
    spellGestureHint.wrap.style.filter = 'drop-shadow(0 0 22px rgba(120,200,255,0.45))';
    spellGestureHint.caption.textContent = mode === 'learn'
      ? 'Draw a Z to cast your active spell!'
      : '';
    spellGestureHint.caption.style.display = mode === 'learn' ? 'block' : 'none';
    spellGestureHint.glyph.style.opacity = mode === 'cast' ? '0.92' : '1';
    spellGestureHint.wrap.style.display = 'flex';
    spellGestureHint.wrap.style.animation = 'none';
    spellGestureHint.wrap.style.transform = 'translate(-50%, -50%) scale(1)';
    if (spellGestureTimer) window.clearTimeout(spellGestureTimer);
    spellGestureTimer = window.setTimeout(() => {
      spellGestureHint.wrap.style.display = 'none';
      spellGestureTimer = 0;
    }, duration);
  });

  window.addEventListener('ui:trapDodgePrompt', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    showTrapDodgePrompt(e?.detail || {});
  });

  // Death log overlay (all past deaths)
  window.addEventListener('ui:openDeathLog', () => {
    show(deathLog);
    window.dispatchEvent(new CustomEvent('ui:requestDeathLogData'));
  });
  window.addEventListener('ui:deathLogData', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const records = (e?.detail?.records) || [];
    renderDeathLog(deathLog, records);
  });

  // Book reader overlay (decorative dungeon books)
  window.addEventListener('ui:openBookReader', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    renderBookReader(bookReader, d.title || 'Book', d.text || '');
    show(bookReader);
  });

  // Death screen with social share
  window.addEventListener('ui:playerDied', (ev) => {
    /** @type {CustomEvent} */ // @ts-ignore
    const e = ev;
    const d = e?.detail || {};
    const showDeathScreen = () => {
      renderDeathScreen(deathScreen, d);
      deathScreen.style.display = 'block';
      // LOL playDeathJingle();
    };

    if (deathScreenShowTimer) {
      window.clearTimeout(deathScreenShowTimer);
      deathScreenShowTimer = 0;
    }

    if (String(d?.cause || '').toLowerCase() === 'divine_wrath') {
      deathScreenShowTimer = window.setTimeout(() => {
        deathScreenShowTimer = 0;
        showDeathScreen();
      }, WRATH_DEATH_SCREEN_DELAY_MS);
      return;
    }

    showDeathScreen();
  });

  return { root, inv, log, ticker };
}
