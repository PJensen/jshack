// app/main.js — compliant with Separation Manifest
// app/ wires rules + bridge + display. No FX in rules; no display -> rules imports.

// ---- Imports ---------------------------------------------------------------
// rules/ (app owns lifecycle only; no display code here)
import {
  createConfiguredWorld,
  ensurePlayerSpawned,
  applyPlayerClassLoadout,
  initializeRunItemState,
  reinitializeRunItemStateForFreshStart,
  reseedRunGemPricing,
  ensurePlayerDeityState,
  spawnStarterPet,
} from "./main/runtime/gameRuntime.js";
import { playerEntity } from "./rules/utils/queries.js";
import { getEffectiveVisionRange, blind } from "./rules/utils/blind.js";
import { FOV_CONE_DISABLED_KEY, getEntityFacingConeDegrees, getNormalizedEntityFacing, setFacingTurnCostEnabled } from "./rules/utils/facing.js";
import { ensureRunState } from "./rules/utils/deathModes.js";
import { DEATH_MODES } from "./rules/components/RunState.js";

// display/ camera + director utilities (pure display resources)
import { createCamera, updateCamera, applyCamera, worldToScreen, clientToWorld as cameraClientToWorld } from "./display/camera/controller.js";
import { updateShake } from "./display/camera/shake.js";
import { startZoomPunch, updateZoomPunch, getZoomPunchScale } from "./display/camera/zoomPunch.js";
import { zoomTo } from "./display/camera/utils.js";
import {
  setupDisplayRuntime,
  tickDisplayEffects,
  drawWorldEffects,
  drawScreenEffects,
  drawTargetingReticle,
  drawRulesProfilerOverlay,
  drawRenderProfilerOverlay,
  applyHallucinationSway,
} from "./display/composition/index.js";
import { shouldPostLightingRedrawKind } from "./display/composition/postLightingRedraw.js";

// display/ particles (pure display-side FX; no ECS, no rules)
import { Particle, ParticleFX } from "./display/passes/vfx/particles/particlePool.js";
// input wiring (display-only router)
import { setupInput } from "./display/input/InputRouter.js";
import { isInputLocked, setInputLock } from "./display/input/inputLock.js";
import { enableInputLockdown } from "./display/input/lockdown.js";
import { readInputMode } from "./display/input/inputSettings.js";
import { makeRulesDispatcher } from "./main/input/rulesDispatch.js";
import { shouldConsumeWorldTap } from "./main/input/worldTapGate.js";
// simple UI overlays
import { initOverlays } from "./display/ui/overlay.js";
import { initHUD } from "./display/ui/hud.js";
import { initPetMenu } from "./display/ui/petMenu.js";
import { initStatusLine } from "./display/ui/statusLine.js";
import { createHudFeeds } from "./main/ui/hudFeeds.js";
import { createSceneRuntime } from "./main/sceneRuntime.js";
import { createActiveSpellController } from "./main/spells/activeSpellController.js";
import { applyDebugCommands } from "./main/debug/debugCommands.js";
import { installSceneControls } from "./main/debug/sceneControls.js";
import { initDebugConsole } from "./display/ui/debugConsole.js";
import { registerBuiltinCommands } from "./main/debug/consoleCommands.js";
import { createCanvasSetup } from "./main/bootstrap/canvasSetup.js";
import { installInventoryDataProvider } from "./main/ui/inventoryDataProvider.js";
import { shouldSuppressRecentPickupChipForEquippedDuplicate } from "./main/ui/quickChipPolicy.js";
import { ensureRunContractQuest } from "./rules/quests/definitions/runContract.js";
import { impactTracker } from "./display/fx/projectileImpactTracker.js";
import { createThrowFxController } from "./display/fx/throwFxController.js";
import { createPickupFxController } from "./display/fx/pickupFxController.js";
import { createWeatherFxController } from "./display/fx/weatherFx.js";
import { createSlideFxController } from "./display/fx/slideFxController.js";
import { createLightingEngine } from "./display/lighting/engine.js";
import { collectLightSources, collectFxLights, computeAmbient, getVisionDef, installLightEventListeners } from "./display/lighting/sources/index.js";
import { drawProcStateBadges, getProcStateVisual, procBadgeWorldCenter } from "./display/fx/procStateGlyphs.js";
import { drawRootedVines } from "./display/fx/rootedVineFx.js";
import { drawEquipmentBadges } from "./display/fx/equipBadges.js";
import { readRuntimeConfig } from "./main/config/runtimeConfig.js";
import { createMessageLog } from "./main/ui/messageLog.js";
import { createMessageMoreQueue } from "./display/ui/messageMore.js";
import { installDeityUiWiring } from "./display/ui/wiring/deityUiWiring.js";
import { installMessageWiring } from "./display/ui/wiring/messageWiring.js";
import { installCombatLogTooltip } from "./display/ui/combatLogTooltip.js";
import { installShopWiring } from "./main/wiring/shopWiring.js";
import { installChestWiring } from "./main/wiring/chestWiring.js";
import { installLockPickingWiring } from "./main/wiring/lockPickingWiring.js";
import { installRackWiring } from "./main/wiring/rackWiring.js";
import { installAlchemyWiring } from "./main/wiring/alchemyWiring.js";
import { installAnvilWiring } from "./main/wiring/anvilWiring.js";
import { installCookingWiring } from "./main/wiring/cookingWiring.js";
import { installEnchantingWiring } from "./main/wiring/enchantingWiring.js";
import { installDigWiring } from "./main/wiring/digWiring.js";
import { installDialogWiring } from "./main/wiring/dialogWiring.js";
import { installBarkeepStoryWiring } from "./main/wiring/barkeepStoryWiring.js";
import { installSpeechBubbleWiring } from "./main/wiring/speechBubbleWiring.js";
import { installSpiritGuideWiring } from "./main/wiring/spiritGuideWiring.js";
import { createSpiritPointerFx } from "./display/fx/spiritPointerFx.js";
import { readSeenTips, GUIDANCE_TIPS, GUIDE_STORAGE_KEY } from "./shared/data/spiritGuidance.js";
import { installSavegameWiring } from "./main/wiring/savegameWiring.js";
import {
  hasSavegame,
  readSavegamePayload,
  clearSavegamePayload,
  readSavedDepth,
  readSavedSeed,
  restoreSnapshotFromSavegame,
} from "./main/wiring/savegameLoad.js";
import { loadGameData } from "./main/bootstrap/loadGameData.js";
import { PHASE_TURNS, TURNS_PER_DAY } from "./rules/data/calendar.js";
import { Inventory } from "./rules/components/Inventory.js";
import { Equipment, GEAR_SLOTS, getEquippedSlot } from "./rules/components/Equipment.js";
import { ItemInfo } from "./rules/components/ItemInfo.js";
import { ItemCooldown } from "./rules/components/ItemCooldown.js";
import { NamedIdentity } from "./rules/components/NamedIdentity.js";
import { Position } from "./rules/components/Position.js";
import { Player } from "./rules/components/Player.js";
import { Trap } from "./rules/components/Trap.js";
import { buildWorldView } from "./bridge/schema/worldView.js";
import { followEntity } from "./display/camera/follow.js";
import { ActiveEffects } from "./rules/components/ActiveEffects.js";
import { Material } from "./rules/components/Material.js";
import { getSpell, describeSpellDetailLines, describeSpellTargetEffects } from "./rules/data/spells.js";
import { getSpellCooldown } from "./rules/utils/spellCooldowns.js";
import { buildPalette } from "./display/palette/index.js";
import { canvasFont, canvasGlyphFont, GAME_ICON_FONT_FAMILY } from "./display/fonts.js";
import { createGlyphAtlas, drawKind, drawKindForeground, drawKindScaled, drawKindScaledForeground } from "./display/passes/glyphs/atlas.js";
import { aegisWard as drawAegisWardGlyphFx } from "./display/passes/vfx/glyph/effects/aegisWard.js";
import { Settings } from "./rules/components/Settings.js";
import { Vitality } from "./rules/components/Vitality.js";
import { Mana } from "./rules/components/Mana.js";
import { Stamina } from "./rules/components/Stamina.js";
import { Encumbrance } from "./rules/components/Encumbrance.js";
import { Devotion } from "./rules/components/Devotion.js";
import { Anatomy, HEARING_TIERS } from "./rules/components/Anatomy.js";
import { Status } from "./rules/components/Status.js";
import { getDeityInstance } from "./rules/systems/deitySystem.js";
import { DungeonState } from "./rules/components/DungeonState.js";
import { getTownEconomyData } from "./rules/systems/townSimulationSystem.js";
import { CastSpellIntent } from "./rules/components/Intents/CastSpellIntent.js";
import { Channeling } from "./rules/components/Channeling.js";
import { Interactable } from "./rules/components/Interactable.js";
import { TombstoneRepository } from "./rules/repositories/TombstoneRepository.js";
import { installTombstoneDeathListener } from "./rules/systems/tombstoneSystem.js";
import { Tombstone as TombstoneComponent } from "./rules/components/Tombstone.js";
import { resolveInteractableAffordance } from "./rules/interaction/interactableAffordance.js";
import { installDeathShareWiring } from "./cloud/wiring/deathShareWiring.js";
import { installMailboxWiring } from "./cloud/wiring/mailboxWiring.js";
import { installProofWiring } from "./cloud/wiring/proofWiring.js";
import { postVerifiedScore } from "./cloud/tombstones/client.js";
import { forEachInRadius } from "./rules/utils/spatialIndex.js";
import { chebyshevScalar, manhattanScalar } from "./rules/utils/distance.js";
import { buildBlocksVisionMap, blockedCallback } from "./rules/utils/vision.js";
import {
  inventoryItems, inventoryContains,
  removeFromInventory,
} from "./rules/utils/inventoryFacade.js";
import { Engraving } from "./rules/components/Engraving.js";
import { Pet } from "./rules/components/Pet.js";
import { PetCommandIntent } from "./rules/components/Intents/PetCommandIntent.js";
import { Owner } from "./rules/components/Owner.js";
import { getHungerLevel } from "./rules/data/food.js";
import { resolveItemDisplayName, buildItemDisplayData, resolveAffixes } from "./main/wiring/itemName.js";
import { getCatalogItem as _getCatalogItem } from "./rules/data/itemCatalog.js";
import { ScriptState } from "./rules/components/ScriptState.js";
import { evaluateSound, thresholdForTier } from "./rules/utils/sound.js";
import { updateFOV, isVisible as isTileVisible, isExplored as isTileExplored, setFovDisabled } from "./rules/environment/dungeon/exploredMap.js";
import { getTile, isWalkable, isOpaque, isFlyable, isRoofed, forEachLoadedTile } from "./rules/environment/dungeon/tileMap.js";
import { mulberry32 } from "./lib/ecs-js/rng.js";
import { getClass } from "./rules/data/classes.js";
import { buildClassDisplayData } from "./main/classDisplayData.js";
import { showCharCreation } from "./display/ui/charCreation.js";
import { installPluralizationExtensions } from "./shared/utils/pluralization.js";
import { pickRandomSeed } from "./shared/utils/funSeeds.js";
import { ensureStarterQuests, getQuestRecord } from "./rules/quests/runtime.js";
import { ensureStarterFetchQuestItem } from "./rules/quests/definitions/graveyardWatch.js";
import {
  acceptNoticeBoardOffer,
  buildNoticeBoardPayload,
  ensureLocalGeneratedQuest,
} from "./rules/quests/localGenerator.js";
import { postCharacterCreated, getCachedHighscores, getHighscores } from "./cloud/tombstones/client.js";
import { Traits } from "./rules/components/Traits.js";
import { Polymorph } from "./rules/components/Polymorph.js";
import { resolvePolymorph } from "./rules/systems/polymorphSystem.js";
import { listAllMonsterIds, MONSTERS, getMonster } from "./rules/data/monsters.js";
import { AggroState, AGGRO_LEVELS, SEARCH_TURNS_HUNTING_GRACE } from "./rules/components/AggroState.js";
import { spawnMonsterEntity } from "./rules/utils/spawnMonsterEntity.js";
import { effectiveMaxHp, effectiveMaxMana, effectiveMaxStamina } from "./rules/utils/passiveBonuses.js";
import { pickMonster } from "./rules/environment/dungeon/tables.js";
import { isApplyTool, listApplyTargetsForTool } from "./rules/content/items/applyPayloads.js";
import { installLodbrokSpawnWiring } from "./rules/data/procPackages.js";
import { createTargetingController, scanVisibleEnemies, clampTargetToRange, worldToTile, bracketizeName } from "./main/targeting/targetingController.js";
import { installScrollWandWiring } from "./main/wiring/scrollWandWiring.js";
import { installContentAbilityHandler } from "./content/abilityHandler.js";
import { installPetWiring } from "./main/wiring/petWiring.js";
import { createDeathLootArcFx } from "./display/fx/deathLootArcFx.js";
import { createBubbleDialogController } from "./display/ui/bubbleDialog.js";
import { createSpeechBubbleLayer } from "./display/ui/speechBubbleLayer.js";
import { createTransitionController } from "./main/wiring/transitionWiring.js";
import { BedSleepRequested } from "./events/BedSleepRequested.js";

// ---- Config & canvas -------------------------------------------------------
const runtimeConfig = readRuntimeConfig();
const PERF = runtimeConfig.perf;
const RENDER_PROFILE_ENABLED = runtimeConfig.renderProfile === true;
const chosenDeityId = runtimeConfig.chosenDeityId;
const TILE_PX = 28;
const CAMERA_START_SCALE_DESKTOP = TILE_PX * (1.2 ** 5);
const CAMERA_START_SCALE_MOBILE = TILE_PX * (1.2 ** 2);
const CAMERA_START_SCALE = (() => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return CAMERA_START_SCALE_DESKTOP;
  }
  return window.matchMedia("(max-width: 760px)").matches
    ? CAMERA_START_SCALE_MOBILE
    : CAMERA_START_SCALE_DESKTOP;
})();
const _canvasSetup = createCanvasSetup({ canvasId: 'stage', TILE_PX, dprCap: PERF.dprCap });
const { canvas, ctx, back, bctx } = _canvasSetup;
const speechBubbleLayer = createSpeechBubbleLayer({ sourceCanvas: canvas });

// Lock down browser-driven inputs/scroll/zoom so the app fully controls them
enableInputLockdown({ canvas });

const BOOT_STATIC_UNITS = 9;
let _bootDoneUnits = 0;
let _bootTotalUnits = BOOT_STATIC_UNITS;

function hasValidFloorOverride() {
  const raw = runtimeConfig?.params?.get("floor");
  if (raw == null) return false;
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) && value >= 0;
}

const _hasFloorOverride = hasValidFloorOverride();
const _pendingSavegame = _hasFloorOverride ? null : readSavegamePayload();
const FIRST_RUN_DEV_NOTICE_KEY = "jshack:firstRunDevNoticeSeen:v1";
const FIRST_RUN_TILE_KEY_KEY = "jshack:firstRunTileKeySeen:v1";
const _shouldShowFirstRunDevNotice = consumeFirstRunDevNoticeFlag();
let _didShowFirstRunDevNotice = false;

function consumeFirstRunDevNoticeFlag() {
  if (typeof localStorage === "undefined") return false;
  try {
    if (localStorage.getItem(FIRST_RUN_DEV_NOTICE_KEY) === "1") return false;
    localStorage.setItem(FIRST_RUN_DEV_NOTICE_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function maybeShowFirstRunDevNotice() {
  if (!_shouldShowFirstRunDevNotice || _didShowFirstRunDevNotice) return;
  _didShowFirstRunDevNotice = true;
  window.setTimeout(() => {
    try {
      window.dispatchEvent(new CustomEvent("ui:showDevNoticeTooltip", {
        detail: {
          title: "Active Development Notice",
          body: "JSHack is under very active development. Use the Bug button in the action bar to request features or report bugs!",
          closeText: "Got it",
        },
      }));
    } catch (e) { console.debug('[main] dispatch ui:showDevNoticeTooltip:', e); }
  }, 250);
}

/**
 * @param {string} label
 * @param {number} [done]
 */
function updateBootProgress(label, done = _bootDoneUnits) {
  try {
    const fn = /** @type {any} */ (window).__JSHACK_BOOT_PROGRESS;
    if (typeof fn === 'function') {
      fn({
        label,
        done: Math.max(0, done),
        total: Math.max(1, _bootTotalUnits),
      });
    }
  } catch (e) { console.debug('[main] boot progress update failed:', e); }
}

/** @param {string} label */
function bootAdvance(label) {
  _bootDoneUnits += 1;
  updateBootProgress(label);
}

function finishBoot() {
  try {
    const fn = /** @type {any} */ (window).__JSHACK_BOOT_DONE;
    if (typeof fn === 'function') fn();
  } catch (e) { console.debug('[main] boot done callback failed:', e); }
  maybeShowFirstRunDevNotice();
}

/**
 * Give the browser one frame to paint the bootloader before the next
 * synchronous startup phase takes over the main thread.
 *
 * @param {string} label
 * @param {number} [done]
 * @returns {Promise<void>}
 */
function bootPaint(label, done = _bootDoneUnits) {
  updateBootProgress(label, done);
  if (typeof requestAnimationFrame !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 48);
  });
}

updateBootProgress((!_hasFloorOverride && hasSavegame()) ? "Loading from Save" : "Loading...");
installPluralizationExtensions();

// ---- App wires rules/ (no display logic here) ------------------------------
const _bootSeed = runtimeConfig.seed ?? (_hasFloorOverride ? null : readSavedSeed(_pendingSavegame)) ?? pickRandomSeed();
const world = createConfiguredWorld(_bootSeed);
setFovDisabled(runtimeConfig.disableFov === true);
world[FOV_CONE_DISABLED_KEY] = runtimeConfig.disableFovCone === true;
setFacingTurnCostEnabled(world, runtimeConfig.facingTurnCost === true);
import { installChannelingController } from "./main/channelingController.js";
installChannelingController(world, () => (playerEntity(world)?.id || 0));
bootAdvance("Configured ECS systems");

// ---- Content DSL: load all scripted content, then install into engine -------
import './content/items/index.js';
import './content/monsters/index.js';
import './content/encounters/index.js';
import './content/interactables/index.js';
import { installContent } from './content/install.js';
import { getUseAction } from './rules/content/useActions/useActionRegistry.js';
installContent();

// Initialize identification & gem pricing for this game run
initializeRunItemState(world, {
  identifyItems: runtimeConfig.identifyItems,
  pendingSavegame: _pendingSavegame,
});
bootAdvance(_pendingSavegame ? "Prepared saved item state" : "Prepared run-specific item state");

// Initialize tombstone system
const tombstoneRepo = new TombstoneRepository(null, { getHighscores: getCachedHighscores });
installTombstoneDeathListener(world, tombstoneRepo);
installDeathShareWiring({ world });
installMailboxWiring({ world });
const _proofWiring = installProofWiring({ world });
world.on("proof:ready", ({ bundle }) => {
  postVerifiedScore(bundle).catch(() => {});
});
// Fire-and-forget: warm the highscores cache as early as possible so dungeon
// generation (synchronous, below) has the best chance of finding it populated.
getHighscores().catch(() => {});
bootAdvance("Installed run listeners");

// Warm data registries with per-dataset progress callbacks.
let _bootDataUnits = 0;
const _bootDataBase = _bootDoneUnits;
await bootPaint("Preparing game data...", _bootDataBase);
loadGameData({
  onProgress: (progress) => {
    if (!progress || progress.phase !== 'data') return;
    const total = Math.max(1, Number(progress.overallTotal) || 1);
    if (_bootDataUnits === 0) {
      _bootDataUnits = total;
      _bootTotalUnits += _bootDataUnits;
    }
    const completed = Math.max(0, Math.min(_bootDataUnits, Number(progress.completed) || 0));
    const dsProcessed = Math.max(0, Number(progress.processed) || 0);
    const dsTotal = Math.max(1, Number(progress.total) || 1);
    updateBootProgress(`${progress.label} ${dsProcessed}/${dsTotal}`, _bootDataBase + completed);
  },
});
_bootDoneUnits = _bootDataBase + _bootDataUnits;
updateBootProgress("Game data loaded", _bootDoneUnits);
await bootPaint("Game data loaded", _bootDoneUnits);

// Only app/scenes step the sim (deterministic). We'll keep it paused here.
function stepSim(dtTurns = 0) {
  if (dtTurns > 0) {
    world.tick(dtTurns);
    // Refresh inventory UI after each game tick so content-DSL status
    // (charges, radiance, stability) stays current in tooltips and chips.
    try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch {}
  }
}

function advanceSleepTurns(turns) {
  const count = Math.max(0, Number(turns || 0) | 0);
  for (let i = 0; i < count; i++) world.tick(1);
  if (count > 0) {
    try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch {}
  }
}

const SLEEP_INPUT_LOCK = "bed-sleep";
const SLEEP_TICK_CHUNK = 8;
const DEFAULT_SLEEP_TURNS = Math.max(1, Math.floor(TURNS_PER_DAY / 3));

function restoreBedSleepResources(actor) {
  const vit = world.get(actor, Vitality);
  if (vit) world.set(actor, Vitality, { maxHp: vit.maxHp, hp: effectiveMaxHp(world, actor, vit) });
  const mana = world.get(actor, Mana);
  if (mana) world.set(actor, Mana, { ...mana, mana: effectiveMaxMana(world, actor, mana) });
  const stamina = world.get(actor, Stamina);
  if (stamina) {
    world.set(actor, Stamina, {
      ...stamina,
      stamina: effectiveMaxStamina(world, actor, stamina),
      regenCooldown: 0,
    });
  }
}

function formatSleepTurns(turns) {
  const safeTurns = Math.max(1, Number(turns || 0) | 0);
  const totalMinutes = safeTurns * 2;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return `${safeTurns} turns (${parts.join(" ")})`;
}

function createSleepPopup({ maxTurns = TURNS_PER_DAY, initialTurns = TURNS_PER_DAY, onConfirm, onCancel } = {}) {
  if (typeof document === "undefined") return null;
  const safeMax = Math.max(1, Number(maxTurns || TURNS_PER_DAY) | 0);
  const safeInitial = Math.max(1, Math.min(safeMax, Number(initialTurns || safeMax) | 0));
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed",
    left: "50%",
    top: "18px",
    transform: "translateX(-50%)",
    zIndex: "12000",
    minWidth: "min(360px, calc(100vw - 32px))",
    padding: "12px 14px",
    border: "1px solid rgba(245, 222, 179, 0.34)",
    borderRadius: "8px",
    background: "rgba(22, 18, 24, 0.94)",
    color: "#f6ead8",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    pointerEvents: "auto",
  });
  const label = document.createElement("div");
  Object.assign(label.style, {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    fontSize: "13px",
    lineHeight: "18px",
    marginBottom: "8px",
  });
  const title = document.createElement("span");
  title.textContent = "Sleep";
  const value = document.createElement("span");
  value.textContent = formatSleepTurns(safeInitial);
  value.style.opacity = "0.78";
  label.append(title, value);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = String(safeMax);
  slider.step = "1";
  slider.value = String(safeInitial);
  Object.assign(slider.style, {
    width: "100%",
    margin: "0 0 10px",
    accentColor: "#ffd166",
  });

  const track = document.createElement("div");
  Object.assign(track.style, {
    height: "8px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "rgba(255, 255, 255, 0.12)",
  });
  const bar = document.createElement("div");
  Object.assign(bar.style, {
    width: "0%",
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #8ecae6, #ffd166)",
  });
  track.appendChild(bar);

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "12px",
  });
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const sleepButton = document.createElement("button");
  sleepButton.type = "button";
  sleepButton.textContent = "Sleep";
  for (const button of [cancelButton, sleepButton]) {
    Object.assign(button.style, {
      border: "1px solid rgba(255, 255, 255, 0.22)",
      borderRadius: "6px",
      padding: "7px 11px",
      color: "#f6ead8",
      background: "rgba(255, 255, 255, 0.08)",
      font: "inherit",
      fontSize: "13px",
      cursor: "pointer",
    });
  }
  Object.assign(sleepButton.style, {
    color: "#20170f",
    background: "#ffd166",
    borderColor: "#ffd166",
  });
  actions.append(cancelButton, sleepButton);

  root.append(label, slider, track, actions);
  document.body.appendChild(root);

  function selectedTurns() {
    return Math.max(1, Math.min(safeMax, Number(slider.value || safeInitial) | 0));
  }
  function refreshSelection() {
    const turns = selectedTurns();
    value.textContent = formatSleepTurns(turns);
    bar.style.width = `${Math.round((turns / safeMax) * 100)}%`;
  }
  slider.addEventListener("input", refreshSelection);
  cancelButton.addEventListener("click", () => {
    if (typeof onCancel === "function") onCancel();
  });
  sleepButton.addEventListener("click", () => {
    if (typeof onConfirm === "function") onConfirm(selectedTurns());
  });
  refreshSelection();

  return {
    setProgressMode() {
      title.textContent = "Sleeping";
      slider.style.display = "none";
      actions.style.display = "none";
      root.style.pointerEvents = "none";
    },
    update(done, total) {
      const safeTotal = Math.max(1, total | 0);
      const safeDone = Math.max(0, Math.min(safeTotal, done | 0));
      value.textContent = `${safeDone} / ${safeTotal} turns`;
      bar.style.width = `${Math.round((safeDone / safeTotal) * 100)}%`;
    },
    close() {
      root.remove();
    },
  };
}

let activeBedSleep = null;
function startBedSleep({ actor, targetId, turns = TURNS_PER_DAY } = {}) {
  const pe = playerEntity(world);
  if (!pe || Number(actor || 0) !== pe.id) return;
  if (activeBedSleep) return;

  const maxTurns = Math.max(1, Number(turns || TURNS_PER_DAY) | 0);
  const popup = createSleepPopup({
    maxTurns,
    initialTurns: Math.min(maxTurns, DEFAULT_SLEEP_TURNS),
    onConfirm: (selectedTurns) => beginSleep(selectedTurns),
    onCancel: () => cancelSleep(),
  });
  activeBedSleep = {
    actor: pe.id,
    targetId: Number(targetId || 0) | 0,
    done: 0,
    total: maxTurns,
    popup,
    confirmed: false,
  };
  setInputLock(SLEEP_INPUT_LOCK, true);

  function finish(completed) {
    const sleep = activeBedSleep;
    activeBedSleep = null;
    popup?.close();
    setInputLock(SLEEP_INPUT_LOCK, false);
    if (!completed) return;
    if (!world.has(sleep.actor, Player)) return;
    restoreBedSleepResources(sleep.actor);
    world.emit("bed:rested", { actor: sleep.actor, targetId: sleep.targetId, turns: sleep.total });
  }

  function cancelSleep() {
    finish(false);
  }

  function beginSleep(selectedTurns) {
    const sleep = activeBedSleep;
    if (!sleep || sleep.confirmed) return;
    sleep.confirmed = true;
    sleep.total = Math.max(1, Math.min(maxTurns, Number(selectedTurns || maxTurns) | 0));
    sleep.done = 0;
    sleep.popup?.setProgressMode();
    sleep.popup?.update(0, sleep.total);
    requestAnimationFrame(pump);
  }

  function pump() {
    const sleep = activeBedSleep;
    if (!sleep || !sleep.confirmed) return;
    if (!world.has(sleep.actor, Player)) {
      finish(false);
      return;
    }
    const remaining = sleep.total - sleep.done;
    const chunk = Math.min(SLEEP_TICK_CHUNK, remaining);
    advanceSleepTurns(chunk);
    sleep.done += chunk;
    sleep.popup?.update(sleep.done, sleep.total);
    if (sleep.done >= sleep.total) {
      finish(true);
      return;
    }
    requestAnimationFrame(pump);
  }
}
world.on(BedSleepRequested, startBedSleep);

// Bubble dialog controller — created after camera (needs cam/canvas refs).
// Placeholder; initialized below after cam is created.
/** @type {ReturnType<typeof createBubbleDialogController>|null} */
let bubbleDialog = null;

// (Bubble dialog DOM + logic extracted to display/ui/bubbleDialog.js)

// Post-mortem: keep the simulation ticking after the player dies so the world
// continues to evolve (fires spread, monsters roam, etc.) for a fixed number
// of ticks, then stop and signal that the post-mortem phase is complete.
const POST_MORTEM_TICKS = 10;
const POST_MORTEM_INTERVAL_MS = 500;
let _postMortemInterval = 0;
let _postMortemTicksLeft = 0;
world.on("died", ({ id }) => {
  if (!world.has(id, Player)) return;
  if (_postMortemInterval) return;
  // Death VFX: extended hitstop, shake, flash, jingle, blink sequence
  deathVfx.triggerDeath({ cam, hitstopFx });
  // Dim the lights: ramp vision to 0 over 10 half-second ticks (5s fade)
  blind(world, id, 0, POST_MORTEM_TICKS, 0, 0);
  _postMortemTicksLeft = POST_MORTEM_TICKS;
  _postMortemInterval = setInterval(() => {
    world.tick(1);
    _postMortemTicksLeft--;
    if (_postMortemTicksLeft <= 0) {
      clearInterval(_postMortemInterval);
      _postMortemInterval = 0;
      world.emit("postMortemComplete");
    }
  }, POST_MORTEM_INTERVAL_MS);
});

// --- Active spell selection (app-side state) ---------------------------------
/** @type {string|null} */
let _activeSpellId = null;
const TARGETED_SPELL_CONFIG = Object.freeze({
  blink: Object.freeze({
    fallbackRange: 10,
    requiresLOS: false,
    requiresVisible: false,
    describePrompt(range) {
      return `Choose blink destination (up to ${range} tiles). Tap a tile or use arrow keys + Enter. Esc to cancel.`;
    },
  }),
  meteor: Object.freeze({
    fallbackRange: 12,
    requiresLOS: true,
    requiresVisible: false,
    describePrompt(range) {
      return `Choose meteor target (LOS, range ${range}). Tap a tile or use arrow keys + Enter. Esc to cancel.`;
    },
  }),
  void_hole: Object.freeze({
    fallbackRange: 9,
    requiresLOS: true,
    requiresVisible: false,
    describePrompt(range) {
      return `Choose Void Hole center (LOS, range ${range}). Tap a tile or use arrow keys + Enter. Esc to cancel.`;
    },
  }),
  blizzard: Object.freeze({
    fallbackRange: 10,
    requiresLOS: true,
    requiresVisible: true,
    useVisionRange: true,
    describePrompt(range) {
      return `Choose blizzard target (visible tile, up to ${range} tiles). Tap a tile or use arrow keys + Enter. Esc to cancel.`;
    },
  }),
  firestorm: Object.freeze({
    fallbackRange: 10,
    requiresLOS: true,
    requiresVisible: true,
    useVisionRange: true,
    describePrompt(range) {
      return `Choose firestorm target (visible tile, up to ${range} tiles). Tap a tile or use arrow keys + Enter. Esc to cancel.`;
    },
  }),
  phase_strike: Object.freeze({
    fallbackRange: 10,
    requiresLOS: false,
    requiresVisible: false,
    describePrompt(range) {
      return `Choose Phase Strike destination (up to ${range} tiles). Tap a tile or use arrow keys + Enter. Esc to cancel.`;
    },
  }),
});

// Targeting controller — created early, keyboard handlers installed below.
// Pointer handlers require cam/canvas and are installed after camera init.
// The consolidated rules dispatcher is a single shared instance used everywhere.
// _messageMoreRef is populated later; the closure captures the mutable binding.
let _messageMoreRef = null;
const _sharedRulesDispatcher = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0), {
  onAction: () => { _messageMoreRef?.beginBatch(); },
});

window.addEventListener('ui:confirmActionAccepted', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const action = e?.detail?.action;
  if (!action || typeof action.type !== 'string') return;
  _sharedRulesDispatcher(action);
});

// Shim: targeting state accessors for code that still reads old variables directly.
// These are getters/setters that delegate to the targeting controller (created later).
// This avoids a flag-day rewrite of every reference in the render() function.
// TODO: migrate remaining consumers to use `targeting.*` directly.
function get_pendingEnemyTargeting() { return targeting?.getEnemy() ?? null; }
function get_pendingSpellTargeting() { return targeting?.getSpell() ?? null; }
function get_pendingThrowTargeting() { return targeting?.getThrow() ?? null; }
function get_targetCursor() { return targeting?.getCursor() ?? null; }
const throwFx = createThrowFxController({
  world,
  resolveItemMeta: (itemId) => {
    const ident = world.get(itemId, NamedIdentity);
    const info = world.get(itemId, ItemInfo);
    return {
      identity: String(ident?.identity || ""),
      isPotion: String(info?.type || "").toLowerCase() === "potion",
    };
  },
});

const pickupFx = createPickupFxController({
  world,
  resolveItemMeta: (itemId) => {
    const ident = world.get(itemId, NamedIdentity);
    return { identity: String(ident?.identity || "") };
  },
  getPosition: (id) => world.get(Number(id || 0), Position) || null,
});
const weatherFx = createWeatherFxController();
const lightingEngine = createLightingEngine();

// Dirty-field tracking for lighting engine — detect player/world changes
// between frames so we only rebuild what actually changed.
let _prevLightPX = -1, _prevLightPY = -1;    // player tile position
let _prevLightFDX = 0, _prevLightFDY = 0;    // player facing direction
let _prevLightStep = -1;                      // last world.step we saw

function getTargetedSpellConfig(spellId) {
  return TARGETED_SPELL_CONFIG[String(spellId || "").toLowerCase()] || null;
}
function computeThrowRange(weight) { return throwFx.computeThrowRange(weight); }
function isSimUiBlocked() { return isInputLocked(); }

function getPlayerVisionRange() {
  const pe = playerEntity(world);
  if (!pe?.id) return 0;
  return Math.max(1, getEffectiveVisionRange(world, pe.id) | 0);
}

const spellCtrl = createActiveSpellController(world);

// Initialize HUD feed updaters with stamina support
const hudFeeds = createHudFeeds(world, {
  getPlayerMana: spellCtrl.getPlayerMana,
  ensureActiveSpell: () => ensureActiveSpell(),
  updateActiveSpellLabel: () => spellCtrl.updateActiveSpellLabel(),
  knownSpellIds: () => spellCtrl.knownSpellIds(),
  getActionBarSlots: () => spellCtrl.getActionBarSlots(),
  getPinnedSpellSlots: () => spellCtrl.getPinnedSpellSlots(),
  autoAssignSlot: (id) => spellCtrl.autoAssignSlot(id),
  autoAssignPinnedSlot: (id) => spellCtrl.autoAssignPinnedSlot(id),
  getFxTime: () => _fxTime,
});

function ensureActiveSpell() {
  const id = spellCtrl.ensureActiveSpell();
  _activeSpellId = spellCtrl.getActiveSpellId();
  return id;
}
function setActiveSpell(id) {
  spellCtrl.setActiveSpell(id);
  _activeSpellId = spellCtrl.getActiveSpellId();
  if (targeting && get_pendingSpellTargeting()?.spellId !== _activeSpellId) {
    targeting.cancelAll();
  }
}

// ---- Dungeon initialization -------------------------------------------------
import { initDungeon, generateFloorPlan } from "./rules/environment/dungeon/index.js";
import { prewarmOverworldChunks } from "./rules/environment/dungeon/overworld.js";
import { transitionToDepth, clearFloorCache } from "./rules/environment/dungeon/transition.js";
import {
  TILE_FLOOR,
  TILE_WALL,
  TILE_DOOR,
  TILE_STAIR_DOWN,
  TILE_STAIR_UP,
  TILE_GRASS,
  TILE_GRASS_A,
  TILE_GRASS_C,
  TILE_GRASS_D,
  TILE_WATER,
  TILE_WATER_DEEP,
  TILE_MOUNTAIN,
  TILE_MOUNTAIN_B,
  TILE_MOUNTAIN_C,
  TILE_TREE,
  TILE_SHALLOW_WATER,
  TILE_LAVA,
  TILE_FARMLAND,
  TILE_FENCE,
  TILE_COBBLESTONE,
  TILE_ICE,
  TILE_PIT,
  TILE_BEACH,
  TILE_MARSH,
  TILE_SWAMP,
  TILE_BOG,
  TILE_SAND_DUNES,
  TILE_MUD,
  TILE_TIDAL_FLAT,
  TILE_ROCKY_SHORE,
  TILE_KELP_FOREST,
  TILE_SALT_MARSH,
  TILE_SHINGLE,
  TILE_SEAGRASS,
  TILE_MOORLAND,
  TILE_SCRUBLAND,
  TILE_BADLANDS,
  TILE_GRAVEL,
  TILE_PINE_FOREST,
  TILE_PALM_FOREST,
  TILE_MANGROVE,
  TILE_CORAL_REEF,
} from "./rules/environment/dungeon/constants.js";
import { dungeonConfig } from "./rules/environment/dungeon/dungeonConfig.js";
const _tileKindMap = {
  [TILE_FLOOR]: 'floor',
  [TILE_WALL]: 'wall',
  [TILE_DOOR]: 'floor',
  [TILE_STAIR_DOWN]: 'stair_down',
  [TILE_STAIR_UP]: 'stair_up',
  [TILE_GRASS]:   'grass',
  [TILE_GRASS_A]: 'grass_a',
  [TILE_GRASS_C]: 'grass_c',
  [TILE_GRASS_D]: 'grass_d',
  [TILE_WATER]:      'water',
  [TILE_WATER_DEEP]: 'water_deep',
  [TILE_SHALLOW_WATER]: 'water',
  [TILE_LAVA]: 'lava',
  [TILE_MOUNTAIN]:   'mountain',
  [TILE_MOUNTAIN_B]: 'mountain_b',
  [TILE_MOUNTAIN_C]: 'mountain_c',
  [TILE_TREE]: 'tree',
  [TILE_FARMLAND]: 'farmland',
  [TILE_FENCE]:    'fence',
  [TILE_COBBLESTONE]: 'cobblestone',
  [TILE_ICE]: 'ice',
  [TILE_PIT]: 'pit',
  [TILE_BEACH]: 'beach',
  [TILE_MARSH]: 'marsh',
  [TILE_SWAMP]: 'swamp',
  [TILE_BOG]: 'bog',
  [TILE_SAND_DUNES]: 'sand_dunes',
  [TILE_MUD]: 'mud',
  [TILE_TIDAL_FLAT]: 'tidal_flat',
  [TILE_ROCKY_SHORE]: 'rocky_shore',
  [TILE_KELP_FOREST]: 'kelp_forest',
  [TILE_SALT_MARSH]: 'salt_marsh',
  [TILE_SHINGLE]: 'shingle',
  [TILE_SEAGRASS]: 'seagrass',
  [TILE_MOORLAND]: 'moorland',
  [TILE_SCRUBLAND]: 'scrubland',
  [TILE_BADLANDS]: 'badlands',
  [TILE_GRAVEL]: 'gravel',
  [TILE_PINE_FOREST]: 'pine_forest',
  [TILE_PALM_FOREST]: 'palm_forest',
  [TILE_MANGROVE]: 'mangrove',
  [TILE_CORAL_REEF]: 'coral_reef',
};

const SURFACE_TILE_KINDS = Object.freeze({
  waterShallow: Object.freeze({ family: "water", tone: "shallow" }),
  water: Object.freeze({ family: "water", tone: "water" }),
  waterDeep: Object.freeze({ family: "water", tone: "deep" }),
  lava: Object.freeze({ family: "lava", tone: "bright" }),
});

function classifySurfaceTile(tile) {
  switch (tile) {
    case TILE_SHALLOW_WATER: return SURFACE_TILE_KINDS.waterShallow;
    case TILE_WATER: return SURFACE_TILE_KINDS.water;
    case TILE_WATER_DEEP: return SURFACE_TILE_KINDS.waterDeep;
    case TILE_KELP_FOREST: return SURFACE_TILE_KINDS.waterDeep;
    case TILE_SEAGRASS: return SURFACE_TILE_KINDS.waterShallow;
    case TILE_CORAL_REEF: return SURFACE_TILE_KINDS.waterShallow;
    case TILE_LAVA: return SURFACE_TILE_KINDS.lava;
    default: return null;
  }
}

// Allow URL override: ?dungeonScale=0.3 for compact debugging floors
{
  const ds = runtimeConfig.dungeonScale;
  if (Number.isFinite(ds) && ds > 0) dungeonConfig.dungeonScale = ds;
}

// Allow URL override: ?sparsity=0.55 for airier room layouts inside each chunk
{
  const sparsity = runtimeConfig.sparsity;
  if (Number.isFinite(sparsity) && sparsity >= 0 && sparsity <= 1) {
    dungeonConfig.roomSparsity = sparsity;
  }
}

// Allow URL override: ?floor=0|1|... to choose start depth.
const _startDepth = _hasFloorOverride
  ? runtimeConfig.startDepth
  : (readSavedDepth(_pendingSavegame) ?? runtimeConfig.startDepth);
const _initialDepth = (Number.isFinite(_startDepth) && _startDepth >= 0) ? _startDepth : 0;
// Skip boot dungeon gen for the new-game-with-char-creation path: we'd just
// throw it away when the player picks a character (their entropy-derived seed
// won't match the boot's random seed). Generate ONCE, after Begin is clicked.
// Savegames and ?test=1 still pre-generate at boot because they have a known
// seed and need entities ready immediately.
const _willShowCharCreation = !_pendingSavegame && runtimeConfig.params.get('test') !== '1';
let spawnPos = null;
if (!_willShowCharCreation) {
  _bootTotalUnits += 1;
  await bootPaint("Warming overworld return...", _bootDoneUnits);
  await prewarmOverworldChunks(world.seed >>> 0);
  bootAdvance("Overworld return warmed");

  const _bootFloorPlan = generateFloorPlan(world.seed >>> 0, _initialDepth, null, { dungeonType: runtimeConfig.dungeonType });
  const _bootChunkTotal = Math.max(
    1,
    (_bootFloorPlan.extent.maxCX - _bootFloorPlan.extent.minCX + 1)
    * (_bootFloorPlan.extent.maxCY - _bootFloorPlan.extent.minCY + 1),
  );
  let _bootChunkUnits = _bootChunkTotal;
  _bootTotalUnits += _bootChunkUnits;
  const _bootDungeonBase = _bootDoneUnits;
  await bootPaint(`Generating dungeon 0/${_bootChunkTotal} chunks`, _bootDungeonBase);

  spawnPos = await initDungeon(world, {
    startDepth: _startDepth,
    tombstoneRepo,
    getHighscores: getCachedHighscores,
    dungeonType: runtimeConfig.dungeonType,
    onProgress: (progress) => {
      if (!progress) return;
      if (progress.phase === 'plan') {
        const label = typeof progress.label === 'string' ? progress.label : 'Planning floor';
        updateBootProgress(`${label}…`, _bootDungeonBase);
        return;
      }
      if (progress.phase !== 'chunks') return;
      const total = Math.max(1, Number(progress.total) || _bootChunkTotal);
      const processed = Math.max(0, Math.min(total, Number(progress.processed) || 0));
      if (total !== _bootChunkUnits) {
        _bootTotalUnits += (total - _bootChunkUnits);
        _bootChunkUnits = total;
      }
      updateBootProgress(`Generating dungeon ${processed}/${total} chunks`, _bootDungeonBase + processed);
    },
  });
  _bootDoneUnits = _bootDungeonBase + _bootChunkUnits;
  updateBootProgress(`Dungeon ready (${_bootChunkUnits} chunks)`, _bootDoneUnits);
  await bootPaint(`Dungeon ready (${_bootChunkUnits} chunks)`, _bootDoneUnits);
}

let _savegameLoaded = false;
let _tutorialDisabledThisSession = false;
if (_pendingSavegame) {
  updateBootProgress("Applying save snapshot...", _bootDoneUnits);
  try {
    restoreSnapshotFromSavegame(world, _pendingSavegame);
    const savedSpell = _pendingSavegame?.app?.activeSpellId;
    if (typeof savedSpell === "string" && savedSpell.length > 0) { _activeSpellId = savedSpell; spellCtrl.setActiveSpell(savedSpell); }
    const savedSlots = _pendingSavegame?.app?.actionBarSlots;
    if (Array.isArray(savedSlots)) spellCtrl.restoreSlots(savedSlots);
    const savedPinned = _pendingSavegame?.app?.pinnedSpellSlots;
    if (Array.isArray(savedPinned)) spellCtrl.restorePinnedSlots(savedPinned);
    _savegameLoaded = true;
    _proofWiring.resetForLoad();
    updateBootProgress("Loaded save snapshot", _bootDoneUnits);
  } catch (err) {
    console.error("[SAVE] Failed to apply snapshot, continuing as new game.", err);
    clearSavegamePayload();
    _activeSpellId = null; spellCtrl.setActiveSpell(null); spellCtrl.restoreSlots([]); spellCtrl.restorePinnedSlots([]);
    reinitializeRunItemStateForFreshStart(world, { identifyItems: runtimeConfig.identifyItems });
    updateBootProgress("Save was invalid; starting new run", _bootDoneUnits);
  }
}

// Diagnostic: log all stair entities so we can confirm they exist
{
  let stairCount = 0;
  for (const [id, pos, ni] of world.query(Position, NamedIdentity)) {
    if (ni.identity === 'stair_down' || ni.identity === 'stair_up') {
      if (runtimeConfig.debug) console.log(`[DUNGEON] ${ni.identity} entity #${id} at (${pos.x}, ${pos.y})`);
      stairCount++;
    }
  }
  if (stairCount === 0 && runtimeConfig.debug) console.warn('[DUNGEON] WARNING: No stair entities were created!');
}

// _finalizeNewGame: called after character creation confirms (new game)
// or immediately (savegame loaded). Creates the player, applies class loadout,
// initializes deity, then starts the simulation and render loop.
async function _finalizeNewGame(classData) {
  // Fade in game world (4s, matches enter_world.mp3 dramatic moment)
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 4s ease-out';
  requestAnimationFrame(() => { canvas.style.opacity = '1'; });

  const classDef = classData ? getClass(classData.classId) : null;

  // Apply tutorial preference from character creation.
  // ON + all complete: reset localStorage → full replay.
  // ON + partial:     leave alone → resume where they left off.
  // OFF:              don't touch storage → just skip this session. Tips stay for next time.
  if (classData && classData.tutorial === true) {
    const seen = readSeenTips();
    if (seen.size >= GUIDANCE_TIPS.length) {
      try { localStorage.removeItem(GUIDE_STORAGE_KEY); } catch {}
    }
  } else if (classData && classData.tutorial === false) {
    _tutorialDisabledThisSession = true;
  }

  // Apply difficulty settings from character creation
  if (classData && classData.difficulty === 'hard') {
    world[FOV_CONE_DISABLED_KEY] = false;
    setFacingTurnCostEnabled(world, true);
    try { localStorage.setItem('jshack.disableFovCone', 'false'); } catch {}
    try { localStorage.setItem('jshack.facingTurnCost', 'true'); } catch {}
  } else if (classData && classData.difficulty === 'easy') {
    world[FOV_CONE_DISABLED_KEY] = true;
    setFacingTurnCostEnabled(world, false);
    try { localStorage.setItem('jshack.disableFovCone', 'true'); } catch {}
    try { localStorage.setItem('jshack.facingTurnCost', 'false'); } catch {}
  }

  // Apply gore preference from character creation
  if (classData) {
    try { localStorage.setItem('jshack.disableGore', classData.disableGore ? 'true' : 'false'); } catch {}
  }

  // For new games (no savegame), generate the dungeon HERE — we deferred it
  // out of boot so we don't waste work on a seed the player will replace via
  // the entropy-driven seed input. The seed-compare/regen branch is only used
  // when a savegame pre-populated the world but the player still picked a new
  // seed somehow (rare; defensive).
  if (!_savegameLoaded) clearFloorCache();
  if (classData && typeof classData.seed === 'number') {
    const chosenSeed = classData.seed >>> 0;
    if (spawnPos === null) {
      // First-time gen: world has no entities yet (boot skipped initDungeon).
      world.seed = chosenSeed;
      world.rand = mulberry32(chosenSeed);
      reseedRunGemPricing(world);
      spawnPos = await initDungeon(world, {
        startDepth: _startDepth,
        tombstoneRepo,
        getHighscores: getCachedHighscores,
        dungeonType: runtimeConfig.dungeonType,
        onProgress: typeof classData?.onProgress === "function" ? classData.onProgress : undefined,
      });
    } else if (chosenSeed !== (world.seed >>> 0)) {
      // Defensive re-gen path: pre-existing world but seed changed.
      world.seed = chosenSeed;
      world.rand = mulberry32(chosenSeed);
      for (const id of Array.from(world.alive)) world.destroy(id);
      reseedRunGemPricing(world);
      spawnPos = await initDungeon(world, {
        startDepth: _startDepth,
        tombstoneRepo,
        getHighscores: getCachedHighscores,
        dungeonType: runtimeConfig.dungeonType,
        onProgress: typeof classData?.onProgress === "function" ? classData.onProgress : undefined,
      });
    }
  }

  let pe;
  if (!_savegameLoaded) {
    // Start new games at dawn (start of "work" phase, ~7 AM)
    world.step = PHASE_TURNS.sleep + PHASE_TURNS.breakfast;
    if (classData && typeof classData.seed === 'number') {
      if (typeof classData?.onProgress === "function") {
        classData.onProgress({ phase: "plan", label: "Warming overworld return", step: 0, total: 1 });
      }
      await prewarmOverworldChunks(world.seed >>> 0);
      if (typeof classData?.onProgress === "function") {
        classData.onProgress({ phase: "plan", label: "Overworld return warmed", step: 1, total: 1 });
      }
    }
    pe = ensurePlayerSpawned(world, {
      x: spawnPos.x,
      y: spawnPos.y,
      classDef,
      playerName: classData?.name ?? "Hero",
    });
    const { classSpells } = applyPlayerClassLoadout(world, pe.id, classDef, { identifyStarterItems: true });
    if (classSpells.length > 0) setActiveSpell(classSpells[0]);

    // Spawn pet next to the player (familiar for warlock, kitty otherwise).
    const starterPetId = spawnStarterPet(world, pe.id, classDef);
    if (starterPetId > 0) {
      try {
        window.dispatchEvent(new CustomEvent('ui:petExists', {
          detail: { exists: true }
        }));
      } catch (e) { console.debug('[main] dispatch ui:petExists:', e); }
    }

    applyDebugCommands({ world, runtimeConfig });
    ensureRunState(world, {
      difficulty: classData?.difficulty === "hard" ? "hard" : "normal",
      deathMode: DEATH_MODES.permadeath,
    });

    // Capture character creation entry conditions for telemetry.
    postCharacterCreated({
      playerName: classData?.name ?? "Hero",
      classId: classDef?.id ?? null,
      className: classDef?.name ?? null,
      seed: (world.seed >>> 0).toString(16),
      startDepth: _startDepth,
      timestamp: Date.now(),
    }).catch(() => {});
  } else {
    pe = playerEntity(world);
  }

  // Ensure deity state is initialized for current player (new game or loaded save).
  ensurePlayerDeityState(world, pe.id, {
    classDef,
    fallbackDeityId: chosenDeityId,
  });

  ensureStarterQuests(world);
  ensureRunContractQuest(world, { playerId: pe.id });
  ensureLocalGeneratedQuest(world);
  ensureStarterFetchQuestItem(world);

  bootAdvance(_savegameLoaded ? "Restored saved player state" : "Spawned player state");

  // Strip in-flight spell intents and channeling state from all entities before
  // the first tick. These are transient and must not auto-fire on load — the
  // initial tick would otherwise immediately complete a restored channel or cast
  // a lingering CastSpellIntent from the savegame.
  for (const [eid] of world.query(CastSpellIntent)) {
    try { world.remove(eid, CastSpellIntent); } catch {}
  }
  for (const [eid] of world.query(Channeling)) {
    try { world.remove(eid, Channeling); } catch {}
  }

  // Initial world tick — runs all systems once so status effects, equipment stats,
  // and other derived state are fully resolved before the first frame renders.
  stepSim(1);

  // Show tile key overlay on very first run so new players learn the glyphs.
  if (!_savegameLoaded) {
    try {
      const seen = typeof localStorage !== "undefined" && localStorage.getItem(FIRST_RUN_TILE_KEY_KEY) === "1";
      if (!seen) {
        if (typeof localStorage !== "undefined") localStorage.setItem(FIRST_RUN_TILE_KEY_KEY, "1");
        window.setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent("ui:showTileKeyTooltip"));
          } catch (e) { console.debug('[main] dispatch ui:showTileKeyTooltip:', e); }
        }, 400);
      }
    } catch (e) { console.debug('[main] tile key:', e); }
  }

  bootAdvance("Starting render loop");
  requestAnimationFrame((now) => {
    frame(now);
    finishBoot();
  });

  installSceneControls({ world, cam, TILE_PX, defaultZoomScale: CAMERA_START_SCALE, messageLog, runtimeConfig });

  const debugConsole = initDebugConsole({ world, messageLog });
  registerBuiltinCommands(debugConsole, { world, messageLog, lightingEngine });
}

function findNearestTraversalTarget(world, x, y) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const [eid, pos, ni] of world.query(Position, NamedIdentity)) {
    if (ni.identity !== 'stair_down' && ni.identity !== 'stair_up' && ni.identity !== 'return_portal') continue;
    const dist = chebyshevScalar(pos.x, pos.y, x, y);
    if (dist > 0) continue;
    const prefer = dist < nearestDist
      || (dist === nearestDist && ni.identity === 'return_portal' && nearest?.identity !== 'return_portal');
    if (prefer) {
      nearestDist = dist;
      nearest = { id: eid, identity: ni.identity };
    }
  }
  return nearest;
}

function traversalDirection(identity) {
  if (identity === 'stair_down') return 'down';
  if (identity === 'return_portal') return 'return';
  return identity === 'stair_up' ? 'up' : 'down';
}

function findInteractableAffordanceAt(world, x, y) {
  for (const [eid, pos, inter] of world.query(Position, Interactable)) {
    if (!inter) continue;
    if ((pos.x | 0) !== (x | 0) || (pos.y | 0) !== (y | 0)) continue;
    const affordance = resolveInteractableAffordance(world, eid);
    if (affordance) return affordance;
  }
  return null;
}

// ---- Input setup (display/input → rules/display) ---------------------------
const inputDisposers = [];
{
  const rulesHandler = makeRulesDispatcher(
    /** @type any */(world),
    () => (playerEntity(world)?.id || 0),
    { onAction: _proofWiring.recordAction }
  );

  const displayHandler = (action) => {
    if (isSimUiBlocked()) return;
    switch (action.type) {
      case "display.openInventory":
        window.dispatchEvent(new CustomEvent("ui:openInventory"));
        break;
      case "display.openCharacter":
        window.dispatchEvent(new CustomEvent("ui:openCharacter", {
          detail: { restoreLastTab: true },
        }));
        break;
      case "display.openEquipment":
        window.dispatchEvent(new CustomEvent("ui:openEquipment"));
        break;
      case "display.openMessageLog":
        window.dispatchEvent(new CustomEvent("ui:openMessageLog"));
        break;
      case "display.openSpellPicker":
        window.dispatchEvent(new CustomEvent("ui:openSpellPicker"));
        break;
      case "display.beginAttackDirection":
        window.dispatchEvent(new CustomEvent("ui:beginAttackDirection"));
        break;
      case "display.rotatePetState":
        window.dispatchEvent(new CustomEvent("ui:rotatePetState"));
        break;
      case "display.zoom": {
        const f = Math.max(0.5, Math.min(1.5, Number(action.payload?.factor) || 1));
        const minS = TILE_PX * 0.5;
        const maxS = TILE_PX * 4.0;
        const current = (cam.targetScale || cam.scale || TILE_PX);
        const next = Math.max(minS, Math.min(maxS, current * f));
        zoomTo(cam, next);
        break;
      }
      case "display.openPickupChooser": {
        rulesHandler({ type: 'rules.openPickupChooser', payload: {} });
        break;
      }
      case "display.traverseStairs": {
        rulesHandler({ type: 'rules.traverseStairs', payload: {} });
        break;
      }
      case "display.openApplyChooser":
        window.dispatchEvent(new CustomEvent("ui:openApplyChooser"));
        break;
      case "display.openDeathLog":
        window.dispatchEvent(new CustomEvent("ui:openDeathLog"));
        break;
      default:
        break;
    }
  };

  setupInput({ canvas, rulesHandler, displayHandler, onDispose: inputDisposers, touchFeedback: true });
}
bootAdvance("Bound input handlers");

// ---- Display UI overlays + data feeds -------------------------------------
const _overlays = initOverlays();
initHUD();
initPetMenu();
initStatusLine();
bootAdvance("Initialized HUD and overlays");

// Register deity mood sampler for the debug graph (key 7).
// The sampler closure bridges rules-layer deity data to the display-layer graph.
window.dispatchEvent(new CustomEvent('debug:registerDeityMoodSampler', {
  detail: {
    sampler: () => {
      const pe = playerEntity(world);
      if (!pe) return null;
      const dev = /** @type {any} */ (world.get(pe.id, Devotion));
      if (!dev?.deityId) return null;
      const deity = getDeityInstance(dev.deityId);
      if (!deity) return null;
      return deity._queryPrecise();
    }
  }
}));

// Register town economy sampler for the debug graph.
window.dispatchEvent(new CustomEvent('debug:registerEconomySampler', {
  detail: {
    sampler: () => {
      for (const [, ds] of world.query(DungeonState)) {
        if ((ds.currentDepth || 0) !== 0) return null;
      }
      return getTownEconomyData(world);
    }
  }
}));

// Register lighting engine perf sampler for the debug graph (Shift+5).
window.dispatchEvent(new CustomEvent('debug:registerLightingPerfSampler', {
  detail: {
    sampler: () => {
      if (!lightingEngine || typeof lightingEngine.getLastFrameStats !== 'function') return null;
      return lightingEngine.getLastFrameStats();
    }
  }
}));

// Register tile inspector sampler for the debug panel (key 5).
const _TILE_NAMES = {
  0:'void', 1:'floor', 2:'wall', 3:'door', 4:'stair_down', 5:'stair_up',
  6:'grass', 7:'water', 8:'mountain', 9:'tree', 10:'grass_a', 11:'grass_c',
  12:'grass_d', 13:'mountain_b', 14:'mountain_c', 15:'water_deep',
  16:'ice', 17:'shallow_water', 18:'lava', 19:'farmland', 20:'fence', 21:'cobblestone',
  22:'pit', 23:'beach', 24:'marsh', 25:'swamp', 26:'bog', 27:'sand_dunes', 28:'mud',
  29:'tidal_flat', 30:'rocky_shore', 31:'kelp_forest', 32:'salt_marsh', 33:'shingle',
  34:'seagrass', 35:'moorland', 36:'scrubland', 37:'badlands', 38:'gravel',
  39:'pine_forest', 40:'palm_forest', 41:'mangrove', 42:'coral_reef',
};
window.dispatchEvent(new CustomEvent('debug:registerTileInspectorSampler', {
  detail: {
    sampler: () => {
      const pe = playerEntity(world);
      if (!pe) return null;
      const { x, y } = pe.pos;
      const tt = getTile(x, y);
      const entities = [];
      forEachInRadius(world, x, y, 0, (id, _pos) => {
        const ni = world.get(id, NamedIdentity);
        const comps = [];
        for (const [ckey, store] of world._store) {
          try {
            if (store && typeof store.has === 'function' && store.has(id)) {
              const data = (typeof store.get === 'function') ? store.get(id) : null;
              const name = store._comp?.name || ckey?.description || '?';
              comps.push({ name, data });
            }
          } catch { /* ignore */ }
        }
        entities.push({
          id,
          name: ni?.name || '???',
          identity: ni?.identity || '',
          components: comps,
        });
      });
      return {
        x, y, tileType: tt,
        tileName: _TILE_NAMES[tt] || `unknown(${tt})`,
        walkable: isWalkable(x, y), opaque: isOpaque(x, y), flyable: isFlyable(x, y),
        visible: isTileVisible(x, y), explored: isTileExplored(x, y),
        entities,
      };
    }
  }
}));

const { buildGroundPickupDetailAt } = installInventoryDataProvider({
  world,
  getActiveSpellId: () => _activeSpellId,
  isSimUiBlocked,
  getMessageLog: () => messageLog,
  tombstoneRepo,
});

// Camera zoom buttons on the vitals gauge
addEventListener('ui:zoom', (e) => {
  const f = Math.max(0.5, Math.min(1.5, Number(e.detail?.factor) || 1));
  const minS = TILE_PX * 0.5;
  const maxS = TILE_PX * 4.0;
  const current = (cam.targetScale || cam.scale || TILE_PX);
  const next = Math.max(minS, Math.min(maxS, current * f));
  zoomTo(cam, next);
});

// Active spell button click → cast (or open spell picker if none active)
addEventListener('ui:castActiveSpell', () => {
  if (isSimUiBlocked()) return;
  const id = ensureActiveSpell();
  if (!id) {
    try { window.dispatchEvent(new CustomEvent('ui:openSpellPicker')); } catch (e) { console.debug('[main] dispatch ui:openSpellPicker:', e); }
    return;
  }
  targeting.cancelAll();

  const targetedCfg = getTargetedSpellConfig(id);
  if (targetedCfg) {
    const spell = getSpell(id);
    const spellName = String(spell?.name || id);
    const configuredRange = Math.max(
      1,
      Number.isFinite(spell?.range) ? (Number(spell.range) | 0) : (Number(targetedCfg.fallbackRange) | 0),
    );
    const range = targetedCfg.useVisionRange === true ? getPlayerVisionRange() : configuredRange;
    if (targeting.toggleSpellOff(id)) return;
    targeting.openSpellTargeting({
      spellId: id,
      spellName,
      range,
      radius: Math.max(0, Number(spell?.radius || targetedCfg.radius || 0) | 0),
      requiresLOS: targetedCfg.requiresLOS === true,
      requiresVisible: targetedCfg.requiresVisible === true,
    }, targetedCfg.describePrompt(range));
    return;
  }

  // Enemy-targeted spells: build visible enemy list, Tab to cycle
  const enemySpellDef = getSpell(id);
  if (enemySpellDef?.targeting === 'enemy') {
    const _pe = playerEntity(world);
    if (!_pe) return;
    const px = _pe.pos.x | 0;
    const py = _pe.pos.y | 0;
    const range = Math.max(1, Number(enemySpellDef.range || 8));
    const enemies = scanVisibleEnemies(world, px, py, range, {
      playerId: _pe.id,
      includeSelf: !!enemySpellDef.selfTargetable,
    });

    if (enemies.length === 0) {
      try { messageLog.log({ text: 'No visible enemies in range.', type: 'system' }); } catch (e) { console.debug('[main] messageLog failed:', e); }
      return;
    }

    if (targeting.toggleEnemyOff(id)) return;
    targeting.openEnemyTargeting({
      spellId: id,
      spellName: enemySpellDef.name,
      range,
      enemies,
    });
    return;
  }

  targeting.cancelAll();
  _sharedRulesDispatcher({ type: 'rules.castActiveSpell', payload: { spellId: id } });
});

// (Escape/Tab/Enter/direction keyboard handlers for targeting are now in targetingController)

// (Enemy targeting keyboard + tile targeting keyboard handlers now in targetingController)

// When user taps "Open Chest" on the ground tooltip
addEventListener('ui:tapOpenChest', (e) => {
  if (isSimUiBlocked()) return;
  const chestId = Number(e.detail?.chestId || 0) | 0;
  if (!(chestId > 0)) return;
  const pe = playerEntity(world);
  if (!pe) return;
  const chestPos = world.get(chestId, Position);
  if (!chestPos) return;
  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.worldTap', payload: { x: chestPos.x, y: chestPos.y } });
});

// When user selects items from the pickup chooser overlay
addEventListener('ui:requestPickup', (e) => {
  if (isSimUiBlocked()) return;
  const arr = e.detail?.itemIds;
  if (!Array.isArray(arr) || !arr.length) return;
  const pe = playerEntity(world);
  if (!pe) return;
  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  for (const id of arr) {
    if (!Number.isInteger(id) || id <= 0) continue;
    rulesHandler({ type: 'rules.pickupItem', payload: { itemId: id } });
  }
});

// Ranged shoot button / 'r' key → auto-target nearest visible enemy and fire
addEventListener('ui:shootRanged', () => {
  if (isSimUiBlocked()) return;
  _sharedRulesDispatcher({ type: 'rules.shootRanged', payload: {} });
});

// Engrave button → prompt for text, then dispatch engrave action
addEventListener('ui:engrave', () => {
  if (isSimUiBlocked()) return;
  const pe = playerEntity(world);
  if (!pe) return;
  const text = prompt('Engrave what on the ground?');
  if (!text || !text.trim()) return;
  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.engrave', payload: { text: text.trim() } });
});

// (Scroll/wand handlers extracted to main/wiring/scrollWandWiring.js)

// Scroll of Polymorph — REMOVED (handled by scrollWandWiring)
// Scroll of Taming — REMOVED (handled by scrollWandWiring)
// Wand of Stasis — REMOVED (handled by scrollWandWiring)
// Sunsword Blinding Ray — REMOVED (handled by scrollWandWiring)
// Scroll of Aggravation — REMOVED (handled by scrollWandWiring)
// Scroll of Teleportation — REMOVED (handled by scrollWandWiring)
// Scroll of Summoning — REMOVED (handled by scrollWandWiring)
// Scroll of Decay — REMOVED (handled by scrollWandWiring)
// Scroll of Genocide — REMOVED (handled by scrollWandWiring)

// Wait button → dispatch wait action
addEventListener('ui:wait', () => {
  if (isSimUiBlocked()) return;
  _sharedRulesDispatcher({ type: 'rules.wait', payload: {} });
});

// Search button → dispatch search action
addEventListener('ui:search', () => {
  if (isSimUiBlocked()) return;
  _sharedRulesDispatcher({ type: 'rules.search', payload: {} });
});

// Posture button → cycle combat posture as a turn action
addEventListener('ui:cyclePosture', () => {
  if (isSimUiBlocked()) return;
  _sharedRulesDispatcher({ type: 'rules.cyclePosture', payload: {} });
});

addEventListener('ui:quickInteract', () => {
  if (isSimUiBlocked()) return;
  _sharedRulesDispatcher({ type: 'rules.quickInteract', payload: {} });
});

// Pray button → dispatch pray action
addEventListener('ui:pray', () => {
  if (isSimUiBlocked()) return;
  _sharedRulesDispatcher({ type: 'rules.pray', payload: {} });
});

// Bubble dialog event listeners now handled by bubbleDialogController.
// Close dialog on floor transitions.
world.on("dungeon:transitioned", () => { bubbleDialog?.close(); });
world.on("dungeon:teleport-depth", () => { bubbleDialog?.close(); });

// Spell picker data feed and selection
addEventListener('ui:requestSpellData', () => {
  const spells = spellCtrl.learnedSpells().map((spell) => {
    const cd = getSpellCooldown(world, spell.id);
    return {
      ...spell,
      detailLines: describeSpellDetailLines(spell),
      targetEffects: describeSpellTargetEffects(spell),
      cdRemaining: cd ? cd.remaining : 0,
      cdMax: cd ? cd.max : 0,
    };
  });
  const activeSpellId = ensureActiveSpell();
  try { window.dispatchEvent(new CustomEvent('ui:spellData', { detail: { spells, activeSpellId } })); } catch (e) { console.debug('[main] dispatch ui:spellData:', e); }
});
addEventListener('ui:selectActiveSpell', (ev) => {
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const spellId = e?.detail?.spellId;
  const bindSlot = e?.detail?.bindSlot;
  if (typeof spellId === 'string' && spellId.length) {
    // If binding to a specific action bar slot, assign it there
    if (typeof bindSlot === 'number' && bindSlot >= 0 && bindSlot < 6) {
      spellCtrl.setSlot(bindSlot, spellId);
    }
    setActiveSpell(spellId);
    // Refresh inventory so the brain-slot active marker updates
    try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
  }
});

// Action bar spell slot quick-cast (1-6 keys or click)
addEventListener('ui:castSpellSlot', (ev) => {
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const slot = Number(e?.detail?.slot);
  if (!(slot >= 0 && slot < 6)) return;
  const slots = spellCtrl.getActionBarSlots();
  const spellId = slots[slot];
  if (!spellId) return;
  setActiveSpell(spellId);
  window.dispatchEvent(new CustomEvent('ui:castActiveSpell'));
});

// Pinned spell dock: set a spell into a pinned slot
addEventListener('ui:setPinnedSpell', (ev) => {
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const slot = Number(e?.detail?.slot);
  const spellId = e?.detail?.spellId;
  if (!(slot >= 0 && slot < 4)) return;
  if (typeof spellId === 'string' && spellId.length) {
    spellCtrl.setPinnedSlot(slot, spellId);
  }
});

// Pinned spell dock: cast a pinned spell
addEventListener('ui:castPinnedSpell', (ev) => {
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const slot = Number(e?.detail?.slot);
  if (!(slot >= 0 && slot < 4)) return;
  const slots = spellCtrl.getPinnedSpellSlots();
  const spellId = slots[slot];
  if (!spellId) return;
  setActiveSpell(spellId);
  window.dispatchEvent(new CustomEvent('ui:castActiveSpell'));
});

// NetHack-style --More-- queue: gates rapid-fire messages behind a keypress.
// Assign to forward-ref so rulesDispatcher can call beginBatch before each tick.
const messageMoreQueue = _messageMoreRef = createMessageMoreQueue({
  onDisplay(message, hasMore) {
    try { window.dispatchEvent(new CustomEvent('ui:messageMoreShow', { detail: { message, hasMore } })); } catch (e) { console.debug('[main] dispatch ui:messageMoreShow:', e); }
  },
  onClear() {
    try { window.dispatchEvent(new CustomEvent('ui:messageMoreClear', { detail: { entries: messageLog.getEntries() } })); } catch (e) { console.debug('[main] dispatch ui:messageMoreClear:', e); }
  },
});

// Basic app-side message log collector (bridge-free for now)
// The onUpdate callback feeds new (non-repeat) messages into the --More-- queue.
let _lastQueuedEntry = null;
const messageLog = createMessageLog({
  maxEntries: 50,
  onUpdate: (entries) => {
    // Always update normal ticker (used as fallback / expanded history).
    try { window.dispatchEvent(new CustomEvent('ui:updateMessageTicker', { detail: { entries } })); } catch (e) { console.debug('[main] dispatch ui:updateMessageTicker:', e); }
    // Feed genuinely new messages into the --More-- queue.
    // Repeat-count increments mutate the same object, so reference check skips them.
    const newest = entries.length > 0 ? entries[entries.length - 1] : null;
    if (newest && newest !== _lastQueuedEntry) {
      _lastQueuedEntry = newest;
      messageMoreQueue.push(newest);
    }
  },
});
// Message formatting and logging now handled in messageWiring module

// --More-- advance: Space, Enter, or Escape dismiss the prompt.
// Capture phase so we eat the event before InputManager / rulesDispatch see it.
window.addEventListener('keydown', (e) => {
  if (!messageMoreQueue.isActive()) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    messageMoreQueue.advance();
  }
}, true); // ← capture phase
// Also allow click/tap on the ticker to advance (mobile-friendly).
if (_overlays?.ticker) {
  _overlays.ticker.addEventListener('click', (ev) => {
    if (!messageMoreQueue.isActive()) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    messageMoreQueue.advance();
  }, true);
}

installDeityUiWiring(world, { log: messageLog.log.bind(messageLog) });
installMessageWiring({
  world,
  messageLog,
  playerEntity,
  bracketizeName,
  getSpell,
  resolveItemDisplayName,
  isVisibleAt: isTileVisible,
  components: {
    Equipment,
    ItemInfo,
    NamedIdentity,
    Owner,
    Pet,
    Player,
    Position,
    Devotion,
    Anatomy,
    DungeonState,
    Status,
    Encumbrance,
    ActiveEffects,
  },
  soundApi: {
    evaluateSound,
    thresholdForTier,
    HEARING_TIERS,
  },
});

// ---- Combat log tooltip (hover items/monsters/spells in the message bar) ----
if (_overlays?.ticker) {
  installCombatLogTooltip(_overlays.ticker, {
    world,
    getMonster,
    getSpell,
    resolveItemDisplayObject: buildItemDisplayData,
    components: { NamedIdentity, ItemInfo, Vitality },
  });
}

// ---- Targeting controller (after messageLog is ready) -----------------------
// `isVisibleAt` is defined further down (display section) — forward-ref via closure.
const targeting = createTargetingController({
  world,
  messageLog,
  playerEntity: () => playerEntity(world),
  dispatchRules: (action) => _sharedRulesDispatcher(action),
  isVisibleAt: (x, y) => isVisibleAt(x, y),
});
targeting.installKeyboardHandlers();

// ---- Extracted wiring modules -----------------------------------------------
installScrollWandWiring({ world, targeting, playerEntity: () => playerEntity(world) });
installContentAbilityHandler({ world, targeting, playerEntity: () => playerEntity(world), scanVisibleEnemies });
installPetWiring({ world, playerEntity: () => playerEntity(world) });
installLodbrokSpawnWiring(world);

function buildQuickItemPinDetailFromWorld(itemId) {
  const id = Number(itemId || 0) | 0;
  const identity = String(world.get(id, NamedIdentity)?.identity || '');
  return {
    itemId: id,
    identity,
    pinKey: identity || (id > 0 ? `id:${id}` : ''),
  };
}

function tryOpenItemChannelTargeter(itemId) {
  const id = Number(itemId || 0) | 0;
  if (!(id > 0)) return false;
  const identity = String(world.get(id, NamedIdentity)?.identity || '');
  const action = getUseAction(identity);
  if (!action?.targeting) return false;

  const pe = playerEntity(world);
  if (!pe?.id) return true;
  const cfg = action.targeting;
  const range = Math.max(1, Number(cfg.fallbackRange || 6) | 0);
  targeting.cancelAll();
  targeting.openSpellTargeting({
    spellName: cfg.name || identity,
    range,
    requiresLOS: cfg.requiresLOS === true,
    requiresVisible: cfg.requiresVisible === true,
    validateTarget: cfg.validateTarget,
    onConfirm(x, y) {
      if (typeof cfg.onConfirm === 'function') cfg.onConfirm(world, pe.id, id, x, y);
    },
  }, cfg.describePrompt ? cfg.describePrompt(range) : `Use ${cfg.name || identity} (range ${range}).`);
  return true;
}

// Keep quick-slot and pinned chips in sync when items are consumed.
world.on('item:used', ({ itemId }) => {
  const detail = buildQuickItemPinDetailFromWorld(itemId);
  try { window.dispatchEvent(new CustomEvent('ui:itemUsed', { detail })); } catch (e) { console.debug('[main] dispatch ui:itemUsed:', e); }
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
});

// Keep quick-slot and pinned chips in sync when items are thrown.
world.on('item:thrown', ({ itemId }) => {
  const detail = buildQuickItemPinDetailFromWorld(itemId);
  try { window.dispatchEvent(new CustomEvent('ui:itemThrown', { detail })); } catch (e) { console.debug('[main] dispatch ui:itemThrown:', e); }
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
});

function findScrollOfIdentifyInPlayerInventory(playerId) {
  for (const id of inventoryItems(world, playerId)) {
    const ni = world.get(id, NamedIdentity);
    if (ni && ni.identity === 'scroll_identify') return id;
  }
  return 0;
}

function buildQuickChipEquippedComparison(ownerId, itemId, slot) {
  const eq = world.get(ownerId, Equipment);
  if (!eq) return null;

  const normalized = String(slot || '').trim().toLowerCase();
  if (!normalized) return null;
  const candidateSlots = normalized === 'ring' ? ['ring1', 'ring2'] : [normalized];
  const validSlots = candidateSlots.filter((name) => GEAR_SLOTS.includes(name));
  if (!validSlots.length) return null;

  for (const gearSlot of validSlots) {
    const eqId = Number(eq[gearSlot] || 0) | 0;
    if (!(eqId > 0) || eqId === itemId) continue;
    const eqInfo = world.get(eqId, ItemInfo);
    if (!eqInfo) continue;
    return {
      name: resolveItemDisplayName(world, eqId),
      bonuses: eqInfo.bonuses || {},
      damageDice: eqInfo.damageDice || null,
      staminaCost: eqInfo.staminaCost ?? null,
      twoHanded: !!eqInfo.twoHanded,
      affixes: resolveAffixes(eqInfo.affixes),
    };
  }
  return null;
}

world.on('item:identified', ({ actor, identity }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== actor) return;
  const ident = String(identity || '');
  if (!ident) return;
  const inv = world.get(pe.id, Inventory);
  if (!inv) return;
  for (const itemId of inventoryItems(world, pe.id)) {
    const ni = world.get(itemId, NamedIdentity);
    if (!ni || String(ni.identity || '') !== ident) continue;
    const displayItem = buildItemDisplayData(world, itemId);
    try {
      window.dispatchEvent(new CustomEvent('ui:itemIdentified', {
        detail: {
          item: {
            ...(displayItem && typeof displayItem === 'object' ? displayItem : {}),
            id: Number(itemId),
            identity: ident,
            type: world.get(itemId, ItemInfo)?.type || 'item',
            slot: world.get(itemId, ItemInfo)?.slot || '',
            name: resolveItemDisplayName(world, itemId),
            count: world.get(itemId, ItemInfo)?.count || 1,
            rarityName: world.get(itemId, ItemInfo)?.rarityName || 'common',
            glyph: palette?.[ident]?.glyph || '',
            glyphColor: palette?.[ident]?.fg || '#cfe8ff',
            hasScrollOfIdentify: false,
          }
        }
      }));
    } catch (e) { console.debug('[main] dispatch ui:itemIdentified:', e); }
    break;
  }
});

throwFx.installListeners();
pickupFx.installListeners();

world.on('item:pickup', ({ actor, itemId, count }) => {
  const id = Number(itemId || 0) | 0;
  if (id > 0) { deathLootArcFx.removeItem(id); }
});

function lootRarityColorHex(itemInfo) {
  const type = String(itemInfo?.type || "").toLowerCase();
  if (type === "currency") return "#ffd34d";
  const rarity = String(itemInfo?.rarityName || "common").toLowerCase();
  if (rarity === "legendary") return "#ff8a3d";
  if (rarity === "epic") return "#c77dff";
  if (rarity === "rare") return "#ffd54f";
  if (rarity === "magic") return "#63b3ff";
  return "#c2c2c2";
}

// Death loot arc FX controller (extracted to display/fx/deathLootArcFx.js)
const deathLootArcFx = createDeathLootArcFx({
  world,
  getItemInfo: (id) => world.get(Number(id || 0), ItemInfo) || null,
  getFxTime: () => _fxTime,
  isWalkable,
});
world.on("damaged", ({ target, amount, projectileDelay }) => {
  const tid = Number(target || 0) | 0;
  const d = Number(projectileDelay || 0);
  const dmg = Math.max(0, Number(amount) || 0);
  if (tid > 0 && d > 0 && dmg > 0) {
    impactTracker.record(tid, dmg, _fxTime + d);
    _pendingHitTints.push({ fireAt: _fxTime + d, id: tid });
  } else if (tid > 0 && dmg > 0) {
    triggerHitTint(tid);
  }
});

// (Death loot arc physics extracted to display/fx/deathLootArcFx.js)
function scheduleDeathLootArc(itemId, origin, at, delayOffset, impulse) {
  deathLootArcFx.schedule(itemId, origin, at, delayOffset, impulse);
}
function deathLootArcPos(itemId) {
  return deathLootArcFx.getPosition(itemId);
}

world.on("item:dropped", ({ itemId, actor, source, origin, at, targetId, impulse }) => {
  const src = String(source || "");
  if (src === "death") {
    const actorId = Number(actor || 0) | 0;
    const delay = actorId > 0 ? impactTracker.delayFor(actorId, _fxTime) : 0;
    scheduleDeathLootArc(itemId, origin, at, delay, impulse || null);
  } else if (src === "urn") {
    scheduleDeathLootArc(itemId, origin, at, 0);
  } else if (src === "chest") {
    const chestId = Number(targetId || 0) | 0;
    const chestPos = chestId > 0 ? world.get(chestId, Position) : null;
    const o = origin || (chestPos ? { x: chestPos.x | 0, y: chestPos.y | 0 } : null);
    if (o) scheduleDeathLootArc(itemId, o, at, 0);
  }
});

world.on("chest:burst", ({ actor, targetId, origin, drops }) => {
  const ox = Number(origin?.x || 0);
  const oy = Number(origin?.y || 0);
  if (Number.isFinite(ox) && Number.isFinite(oy)) {
    for (let i = 0; i < 18; i++) {
      const a = (Math.PI * 2 * i) / 18;
      const spd = 0.12 + (i % 3) * 0.03;
      fx.pool.spawn(new Particle({
        x: ox + Math.cos(a) * 0.12,
        y: oy + Math.sin(a) * 0.08,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 0.04,
        ay: 0.06,
        life: 0.28 + (i % 4) * 0.04,
        size0: 0.05,
        size1: 0.018,
        r: 199,
        g: 125,
        b: 255,
        a0: 0.66,
      }));
    }
  }

  const burstDrops = Array.isArray(drops) ? drops : [];
  for (let i = 0; i < burstDrops.length; i++) {
    const d = burstDrops[i];
    const itemId = Number(d?.itemId || 0) | 0;
    const atX = Number(d?.at?.x || 0);
    const atY = Number(d?.at?.y || 0);
    const info = world.get(itemId, ItemInfo);
    const color = lootRarityColorHex(info);
    const rgb = color.startsWith("#")
      ? {
        r: Number.parseInt(color.slice(1, 3), 16) || 255,
        g: Number.parseInt(color.slice(3, 5), 16) || 255,
        b: Number.parseInt(color.slice(5, 7), 16) || 255,
      }
      : { r: 255, g: 255, b: 255 };
    fx.pool.spawn(new Particle({
      x: atX,
      y: atY - 0.05,
      vx: 0,
      vy: -0.03,
      ay: -0.02,
      life: 0.22,
      size0: 0.055,
      size1: 0.014,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a0: 0.62,
    }));
  }

  const pe = playerEntity(world);
  if (!pe || pe.id !== (Number(actor) | 0)) return;
  const chestName = String(world.get(Number(targetId) | 0, NamedIdentity)?.name || "chest").toLowerCase();
  try { messageLog.log({ text: `You crack open the ${chestName}. Loot spills out.`, type: "system" }); } catch {}
  if (DEBUG_DISABLE_LEGACY_FLOOR_PICKUP_TOOLTIP) {
    try { window.dispatchEvent(new CustomEvent("ui:hideGroundItem")); } catch {}
    try { window.dispatchEvent(new CustomEvent("ui:requestInventoryData")); } catch {}
    return;
  }
  const detail = buildGroundPickupDetailAt(pe.id, pe.pos.x, pe.pos.y);
  if (detail) {
    try { window.dispatchEvent(new CustomEvent("ui:showGroundItem", { detail })); } catch {}
  } else {
    try { window.dispatchEvent(new CustomEvent("ui:hideGroundItem")); } catch {}
  }
  try { window.dispatchEvent(new CustomEvent("ui:requestInventoryData")); } catch {}
});

world.on("chest:empty", ({ actor, targetId }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== (Number(actor) | 0)) return;
  const chestName = String(world.get(Number(targetId) | 0, NamedIdentity)?.name || "chest").toLowerCase();
  try { messageLog.log({ text: `The ${chestName} is empty.`, type: "system" }); } catch {}
});
// Centralized quick-slot chip for any item entering player inventory
world.on('inventory:added', ({ ownerId, itemId }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== ownerId) return;
  const info = world.get(itemId, ItemInfo);
  if (!info || info.type === 'currency') return;
  if (info.noQuickChip === true) return;
  if (shouldSuppressRecentPickupChipForEquippedDuplicate(world, ownerId, itemId)) return;
  const hasScrollOfIdentify = findScrollOfIdentifyInPlayerInventory(pe.id) > 0;
  const displayItem = buildItemDisplayData(world, itemId);
  const canApply = isApplyTool(world, pe.id, itemId);
  const applyTargetCount = canApply ? listApplyTargetsForTool(world, pe.id, itemId).length : 0;
  if (displayItem?.noQuickChip === true) return;
  // Content-DSL status lines (same path as inventoryDataProvider)
  const identity = world.get(itemId, NamedIdentity)?.identity || '';
  let contentStatus = null;
  { const catDef = _getCatalogItem(identity);
    if (catDef?._contentStatus) {
      const ss = world.get(itemId, ScriptState);
      if (ss?.data) { try { contentStatus = catDef._contentStatus(ss.data); } catch {} }
    }
  }
  try {
    window.dispatchEvent(new CustomEvent('ui:recentPickup', {
      detail: {
        item: {
          ...(displayItem && typeof displayItem === 'object' ? displayItem : {}),
          id: Number(itemId),
          identity,
          type: info.type || 'item',
          slot: info.slot || '',
          name: resolveItemDisplayName(world, itemId),
          count: info.count || 1,
          rarityName: info.rarityName || 'common',
          equippedComparison: buildQuickChipEquippedComparison(ownerId, Number(itemId), info.slot),
          glyph: palette?.[identity]?.glyph || '',
          glyphColor: palette?.[identity]?.fg || '#cfe8ff',
          hasScrollOfIdentify,
          canApply,
          applyTargetCount,
          contentStatus,
        }
      }
    }));
  } catch (e) { console.debug('[main] dispatch ui:recentPickup:', e); }
});
// (Pet command/rotate/state handlers extracted to main/wiring/petWiring.js)

// ---- Transition controller (extracted to main/wiring/transitionWiring.js) ----
const transitionCtrl = createTransitionController({
  world,
  playerEntity: () => playerEntity(world),
  tombstoneRepo,
  getHighscores: getCachedHighscores,
  onTransitioned: () => {
    _cachedView = null;
    _cachedStep = -1;
    deathLootArcFx.clear();
  },
});
transitionCtrl.install();

// Thin shims so remaining main.js code (stair:traverse event in display handler,
// frame-loop flush) still works without a flag-day rewrite.
const RETURN_PORTAL_IDENTITY = transitionCtrl.RETURN_PORTAL_IDENTITY;
function queueStairTransition(direction, stairX, stairY) {
  transitionCtrl.queueStair(direction, stairX, stairY);
}
function queueDepthTransition(targetDepth, opts = {}) {
  transitionCtrl.queueDepth(targetDepth, opts);
}

function trackCurrentFloorEntity(entityId) { transitionCtrl.trackFloorEntity(entityId); }
function untrackCurrentFloorEntity(entityId) { transitionCtrl.untrackFloorEntity(entityId); }
function flushPendingStairTransition() { transitionCtrl.flush(); }

// (fragActorsAt, flushPendingStairTransition, stair:traverse, dungeon:teleport-depth,
//  portal:return listeners all in transitionWiring.js — installed via transitionCtrl.install())

// UI stair tooltip tap → trigger stair traverse
addEventListener('ui:requestStairTraverse', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const stairId = Number(e?.detail?.stairId || 0) | 0;
  const direction = e?.detail?.direction || 'down';
  _sharedRulesDispatcher({ type: 'rules.traverseStairs', payload: { targetId: stairId, direction } });
});

addEventListener('ui:requestTownBoardAccept', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const pe = playerEntity(world);
  if (!pe) return;

  const offer = e?.detail?.offer;
  const qid = acceptNoticeBoardOffer(world, pe.id, offer);
  if (!(qid > 0)) return;

  const payload = buildNoticeBoardPayload(world, pe.id);
  try {
    window.dispatchEvent(new CustomEvent('ui:townBoardData', { detail: payload }));
  } catch (err) {
    console.debug('[main] dispatch ui:townBoardData:', err);
  }
});

// UI trap tooltip tap → attempt disarm
addEventListener('ui:requestDisarmTrap', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const trapId = e?.detail?.trapId || 0;
  const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
  rulesHandler({ type: 'rules.disarmTrap', payload: { trapId } });
});

const shopWiring = installShopWiring({ world, playerEntity, log: (msg) => messageLog.log({ text: msg, type: 'system' }), bracketizeName });
installChestWiring({ world, playerEntity, log: (msg) => messageLog.log({ text: msg, type: 'system' }), bracketizeName });
installLockPickingWiring({ world, playerEntity, log: (msg) => messageLog.log({ text: msg, type: 'system' }) });
installRackWiring({ world, log: (msg) => messageLog.log({ text: msg, type: 'system' }) });
installAlchemyWiring({
  world,
  playerEntity,
  dispatchRules: (action) => {
    const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
    rulesHandler(action);
  },
  log: (msg) => messageLog.log({ text: msg, type: "system" }),
});
installEnchantingWiring({
  world,
  playerEntity,
  dispatchRules: (action) => {
    const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
    rulesHandler(action);
  },
  log: (msg) => messageLog.log({ text: msg, type: "system" }),
});
installAnvilWiring({
  world,
  playerEntity,
  dispatchRules: (action) => {
    const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
    rulesHandler(action);
  },
  log: (msg) => messageLog.log({ text: msg, type: "system" }),
});
installCookingWiring({
  world,
  playerEntity,
  dispatchRules: (action) => {
    const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
    rulesHandler(action);
  },
  log: (msg) => messageLog.log({ text: msg, type: "system" }),
});
installDigWiring({ world });
installDialogWiring({ world });
installSavegameWiring({
  world,
  playerEntity,
  getActiveSpellId: () => _activeSpellId,
  getActionBarSlots: () => spellCtrl.getActionBarSlots(),
  getPinnedSpellSlots: () => spellCtrl.getPinnedSpellSlots(),
  log: (msg) => messageLog.log({ text: msg, type: 'system' }),
});
bootAdvance("Installed world/UI wiring");

// Item equipped UI updates (message handled in messageWiring)
world.on('item:equipped', ({ itemId }) => {
  const detail = buildQuickItemPinDetailFromWorld(itemId);
  try { window.dispatchEvent(new CustomEvent('ui:itemEquipped', { detail })); } catch (e) { console.debug('[main] dispatch ui:itemEquipped:', e); }
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
});
world.on('item:unequipped', ({ itemId }) => {
  try { window.dispatchEvent(new CustomEvent('ui:itemUnequipped', { detail: { itemId } })); } catch (e) { console.debug('[main] dispatch ui:itemUnequipped:', e); }
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
});

function hideTrapTooltip() {
  try { window.dispatchEvent(new CustomEvent('ui:hideTrapTooltip')); } catch (e) { console.debug('[main] dispatch ui:hideTrapTooltip:', e); }
}

const _resolvedTrapTooltipSuppress = new Set();

// Temporary debug kill-switch while validating modern loot affordances.
// Keep this code-only (no URL/localStorage) to make rollback cheap.
const DEBUG_DISABLE_LEGACY_FLOOR_PICKUP_TOOLTIP = true;

// When player moves, show a mobile-friendly ground item tooltip for non-currency items on the tile
world.on('moved', ({ id, to }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== id) return;
  if (DEBUG_DISABLE_LEGACY_FLOOR_PICKUP_TOOLTIP) {
    try { window.dispatchEvent(new CustomEvent('ui:hideGroundItem')); } catch (e) { console.debug('[main] dispatch ui:hideGroundItem:', e); }
    return;
  }
  const detail = buildGroundPickupDetailAt(pe.id, to.x, to.y);
  if (!detail) {
    try { window.dispatchEvent(new CustomEvent('ui:hideGroundItem')); } catch (e) { console.debug('[main] dispatch ui:hideGroundItem:', e); }
    return;
  }
  try { window.dispatchEvent(new CustomEvent('ui:showGroundItem', { detail })); } catch (e) { console.debug('[main] dispatch ui:showGroundItem:', e); }
});

// When a rack/shelf/case drops an item at the player's feet, refresh ground tooltip
world.on('rack:looted', ({ actor }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== actor) return;
  if (DEBUG_DISABLE_LEGACY_FLOOR_PICKUP_TOOLTIP) {
    try { window.dispatchEvent(new CustomEvent('ui:hideGroundItem')); } catch (e) { console.debug('[main] dispatch ui:hideGroundItem:', e); }
    return;
  }
  const detail = buildGroundPickupDetailAt(pe.id, pe.pos.x, pe.pos.y);
  if (!detail) return;
  try { window.dispatchEvent(new CustomEvent('ui:showGroundItem', { detail })); } catch (e) { console.debug('[main] dispatch ui:showGroundItem:', e); }
});

// When player moves, show stair tooltip if standing on stairs
world.on('moved', ({ id, to }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== id) return;
  shopWiring.handlePlayerMoved();

  // Find traversable targets (stairs or return portal) at exact player position
  const nearestTarget = findNearestTraversalTarget(world, to.x, to.y);

  if (nearestTarget) {
    const direction = traversalDirection(nearestTarget.identity);
    try {
      window.dispatchEvent(new CustomEvent('ui:showStairTooltip', {
        detail: { stairId: nearestTarget.id, direction }
      }));
    } catch (e) { console.debug('[main] dispatch ui:showStairTooltip:', e); }
  } else {
    try { window.dispatchEvent(new CustomEvent('ui:hideStairTooltip')); } catch (e) { console.debug('[main] dispatch ui:hideStairTooltip:', e); }
  }

  const affordance = findInteractableAffordanceAt(world, to.x, to.y);
  if (affordance) {
    try {
      window.dispatchEvent(new CustomEvent('ui:showInteractableTooltip', {
        detail: affordance,
      }));
    } catch (e) { console.debug('[main] dispatch ui:showInteractableTooltip:', e); }
  } else {
    try { window.dispatchEvent(new CustomEvent('ui:hideInteractableTooltip')); } catch (e) { console.debug('[main] dispatch ui:hideInteractableTooltip:', e); }
  }

  // Trap tooltip: show when standing on an armed trap
  let foundTrap = null;
  for (const [tid, tpos, t] of world.query(Position, Trap)) {
    if (!tpos || !t || !t.armed || !t.revealed) continue;
    if (_resolvedTrapTooltipSuppress.has(tid)) continue;
    if (tpos.x === to.x && tpos.y === to.y) {
      const ni = world.get(tid, NamedIdentity);
      foundTrap = { id: tid, name: ni?.name || t.type, difficulty: t.difficulty };
      break;
    }
  }
  if (foundTrap) {
    try {
      window.dispatchEvent(new CustomEvent('ui:showTrapTooltip', {
        detail: { trapId: foundTrap.id, trapType: foundTrap.name, difficulty: foundTrap.difficulty }
      }));
    } catch (e) { console.debug('[main] dispatch ui:showTrapTooltip:', e); }
  } else {
    hideTrapTooltip();
  }

  // Check for adjacent shopkeeper
  for (const [eid, pos, ni] of world.query(Position, NamedIdentity)) {
    if (ni.identity !== 'shopkeeper') continue;
    const dist = chebyshevScalar(pos.x, pos.y, to.x, to.y);
    if (dist === 1) {
      world.emit?.('message', { text: 'A shopkeeper is nearby. Bump to trade.', type: 'system' });
      break;
    }
  }

  // Check for adjacent weapon rack
  for (const [eid, pos, ni] of world.query(Position, NamedIdentity)) {
    if (ni.identity !== 'weapon_rack') continue;
    const dist = chebyshevScalar(pos.x, pos.y, to.x, to.y);
    if (dist === 1) {
      world.emit?.('message', { text: 'A weapon rack is here. Bump to browse.', type: 'system' });
      break;
    }
  }

  // Tombstone tooltip: show epitaph when standing on a tombstone
  let tombstone = null;
  for (const [eid, pos, ni] of world.query(Position, NamedIdentity)) {
    if (ni.identity !== 'tombstone') continue;
    if (pos.x === to.x && pos.y === to.y) {
      tombstone = { id: eid };
      break;
    }
  }
  if (tombstone) {
    const tc = world.get(tombstone.id, TombstoneComponent);
    try {
      window.dispatchEvent(new CustomEvent('ui:showTombstoneTooltip', {
        detail: { epitaph: tc?.epitaph || '' }
      }));
    } catch (e) { console.debug('[main] dispatch ui:showTombstoneTooltip:', e); }
  } else {
    try { window.dispatchEvent(new CustomEvent('ui:hideTombstoneTooltip')); } catch (e) { console.debug('[main] dispatch ui:hideTombstoneTooltip:', e); }
  }
});

// Trap tooltip can be shown during movement, before trap resolution in the same tick.
// Hide it immediately when the trap resolves against the player.
world.on('trap:triggered', ({ victimId }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== (Number(victimId) | 0)) return;
  hideTrapTooltip();
});

world.on('trap:disarmed', ({ actor, trapId }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== (Number(actor) | 0)) return;
  _resolvedTrapTooltipSuppress.add(Number(trapId || 0) | 0);
  queueMicrotask(() => _resolvedTrapTooltipSuppress.delete(Number(trapId || 0) | 0));
  hideTrapTooltip();
});

world.on('trap:disarm:failed', ({ actor, trapId }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== (Number(actor) | 0)) return;
  _resolvedTrapTooltipSuppress.add(Number(trapId || 0) | 0);
  queueMicrotask(() => _resolvedTrapTooltipSuppress.delete(Number(trapId || 0) | 0));
  hideTrapTooltip();
});

// When player moves onto a tile with an engraving, show it in the log
world.on('moved', ({ id, to }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== id) return;
  for (const [eid, eng, pos] of world.query(Engraving, Position)) {
    if (pos.x === to.x && pos.y === to.y) {
      log(`You see "${eng.text}" engraved on the ground here.`);
      break;
    }
  }
});

// Refresh ground tooltip after pickups so remaining items stay discoverable.
world.on('item:pickup', ({ actor, itemId }) => {
  const pe = playerEntity(world);
  if (!pe || pe.id !== actor) return;
  if (DEBUG_DISABLE_LEGACY_FLOOR_PICKUP_TOOLTIP) {
    try { window.dispatchEvent(new CustomEvent('ui:hideGroundItem')); } catch (e) { console.debug('[main] dispatch ui:hideGroundItem:', e); }
    try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
    return;
  }
  const detail = buildGroundPickupDetailAt(pe.id, pe.pos.x, pe.pos.y);
  if (detail) {
    try { window.dispatchEvent(new CustomEvent('ui:showGroundItem', { detail })); } catch (e) { console.debug('[main] dispatch ui:showGroundItem:', e); }
  } else {
    try { window.dispatchEvent(new CustomEvent('ui:hideGroundItem')); } catch (e) { console.debug('[main] dispatch ui:hideGroundItem:', e); }
  }
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
});

/** @param {string} s */
/**
 * @param {string} key
 */
function humanizeProcStateKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return "Proc";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * @param {any} procState
 */
function formatProcStateDetail(procState) {
  const label = String(procState?.name || "").trim() || humanizeProcStateKey(procState?.key);
  const detail = String(procState?.description || "").trim();
  const stacks = Math.max(1, Number(procState?.stacks || 1) | 0);
  const turnsLeft = Math.max(0, Number(procState?.turnsLeft || 0) | 0);
  const potency = Number.isFinite(Number(procState?.potency)) ? Number(procState?.potency) : 1;
  const segments = [`x${stacks}`];
  if (turnsLeft > 0) segments.push(`${turnsLeft}t`);
  if (Number.isFinite(potency)) segments.push(`p${potency}`);
  const runtime = segments.join(" · ");
  return detail
    ? `${label}: ${detail} (${runtime})`
    : `${label} (${runtime})`;
}

/**
 * @param {number} tapX
 * @param {number} tapY
 * @returns {null | { entity:any, procState:any }}
 */
function findTappedProcBadge(tapX, tapY) {
  const view = getCachedView();
  const entities = Array.isArray(view?.entities) ? view.entities : [];
  /** @type {null | { entity:any, procState:any, d2:number }} */
  let best = null;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const procStates = Array.isArray(entity?.procStates) ? entity.procStates : [];
    if (!procStates.length) continue;
    for (let j = 0; j < procStates.length; j++) {
      const procState = procStates[j];
      const vis = getProcStateVisual(procState?.key);
      if (!vis) continue;
      const badge = procBadgeWorldCenter(entity.pos.x, entity.pos.y, j);
      const dx = tapX - badge.x;
      const dy = tapY - badge.y;
      const d2 = dx * dx + dy * dy;
      const hitR = badge.radius + 0.09; // touch-friendly expansion for mobile
      if (d2 > hitR * hitR) continue;
      if (!best || d2 < best.d2) best = { entity, procState, d2 };
    }
  }
  return best ? { entity: best.entity, procState: best.procState } : null;
}

// When user clicks an inventory item to drink
addEventListener('ui:requestDrink', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const itemId = e?.detail?.itemId;
  if (!Number.isInteger(itemId)) return;
  const action = { type: 'rules.drinkPotion', payload: { itemId } };
  const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
  rulesHandler(action);
});

// When user clicks an inventory item to equip
addEventListener('ui:requestEquip', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const itemId = e?.detail?.itemId;
  const targetSlot = e?.detail?.targetSlot || '';
  if (!Number.isInteger(itemId)) return;

  // If no explicit slot, check for dual-wield ambiguity before equipping.
  if (!targetSlot) {
    const pe = playerEntity(world);
    if (pe) {
      const info = world.get(itemId, ItemInfo);
      const eq = world.get(pe.id, Equipment);
      if (info && eq && (info.slot === 'weapon' || info.slot === 'Weapon') && !info.twoHanded) {
        const mainId = eq.weapon;
        const mainOccupied = Number.isInteger(mainId) && mainId > 0;
        if (mainOccupied) {
          const mainInfo = world.get(mainId, ItemInfo);
          if (mainInfo && !mainInfo.twoHanded) {
            // Ambiguous: main hand has 1H, equipping another 1H — ask the player.
            const itemName = world.get(itemId, NamedIdentity)?.name || 'weapon';
            const mainName = world.get(mainId, NamedIdentity)?.name || 'weapon';
            const offId = eq.offhand;
            const offhandOccupied = Number.isInteger(offId) && offId > 0;
            const offName = offhandOccupied ? (world.get(offId, NamedIdentity)?.name || 'weapon') : '';
            window.dispatchEvent(new CustomEvent('ui:openSlotChooser', {
              detail: { itemId, itemName, mainName, offName, offhandOccupied }
            }));
            return;
          }
        }
      }
    }
  }

  const action = { type: 'rules.equipItem', payload: { itemId, targetSlot } };
  const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
  rulesHandler(action);
});

// When user clicks an inventory item to use (e.g., read a spellbook)
addEventListener('ui:requestUse', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const itemId = e?.detail?.itemId;
  if (!Number.isInteger(itemId)) return;
  if (tryOpenItemChannelTargeter(itemId)) return;
  const action = { type: 'rules.useItem', payload: { itemId } };
  const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
  rulesHandler(action);
});

addEventListener('ui:requestQuickChipIdentify', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const targetItemId = Number(e?.detail?.targetItemId || 0);
  if (!Number.isInteger(targetItemId) || targetItemId <= 0) return;
  const pe = playerEntity(world);
  if (!pe) return;
  const toolId = findScrollOfIdentifyInPlayerInventory(pe.id);
  if (!toolId) return;
  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.applyItem', payload: { itemId: toolId, targetItemId } });
});

// When user offers an item at an altar from the altar-offering overlay
addEventListener('ui:requestAltarOffer', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const altarId = Number(e?.detail?.altarId || 0);
  const itemId = Number(e?.detail?.itemId || 0);
  if (!Number.isInteger(altarId) || altarId <= 0) return;
  if (!Number.isInteger(itemId) || itemId <= 0) return;

  const pe = playerEntity(world);
  if (!pe) return;

  const pPos = world.get(pe.id, Position);
  const aPos = world.get(altarId, Position);
  if (!pPos || !aPos) return;
  const dist = Math.max(Math.abs((pPos.x | 0) - (aPos.x | 0)), Math.abs((pPos.y | 0) - (aPos.y | 0)));
  if (dist > 1) {
    try { messageLog.log({ text: 'You are too far from the altar.', type: 'system' }); } catch (err) { console.debug('[main] messageLog failed:', err); }
    return;
  }

  const inter = world.get(altarId, Interactable);
  if (!inter || inter.action !== 'prayAltar') return;

  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.altarOffer', payload: { altarId, itemId } });
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (err) { console.debug('[main] dispatch ui:requestInventoryData:', err); }
});

// When user selects an action from the generic action chooser (fountain drink/dip, etc.)
addEventListener('ui:requestActionSelect', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const targetId = Number(e?.detail?.targetId || 0);
  const action = String(e?.detail?.action || "");
  const mode = String(e?.detail?.mode || "");
  if (!Number.isInteger(targetId) || targetId <= 0) return;
  if (!action || !mode) return;

  const pe = playerEntity(world);
  if (!pe) return;

  const pPos = world.get(pe.id, Position);
  const tPos = world.get(targetId, Position);
  if (!pPos || !tPos) return;
  const dist = Math.max(Math.abs((pPos.x | 0) - (tPos.x | 0)), Math.abs((pPos.y | 0) - (tPos.y | 0)));
  if (dist > 1) {
    try { messageLog.log({ text: 'You are too far away.', type: 'system' }); } catch (err) { console.debug('[main] messageLog failed:', err); }
    return;
  }

  const inter = world.get(targetId, Interactable);
  if (!inter || inter.action !== action) return;

  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.actionSelect', payload: { targetId, mode } });
});

// When user confirms a single authored interactable affordance.
addEventListener('ui:requestInteractableAction', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const targetId = Number(e?.detail?.targetId || 0);
  const action = String(e?.detail?.action || "");
  const mode = String(e?.detail?.mode || "");
  if (!Number.isInteger(targetId) || targetId <= 0) return;
  if (!action) return;

  const pe = playerEntity(world);
  if (!pe) return;

  const pPos = world.get(pe.id, Position);
  const tPos = world.get(targetId, Position);
  if (!pPos || !tPos) return;
  const dist = Math.max(Math.abs((pPos.x | 0) - (tPos.x | 0)), Math.abs((pPos.y | 0) - (tPos.y | 0)));
  if (dist > 1) {
    try { messageLog.log({ text: 'You are too far away.', type: 'system' }); } catch (err) { console.debug('[main] messageLog failed:', err); }
    return;
  }

  const inter = world.get(targetId, Interactable);
  if (!inter || inter.action !== action) return;

  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.interact', payload: { targetId, mode } });
});

// When user selects an item to dip in a fountain
addEventListener('ui:requestFountainDip', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const fountainId = Number(e?.detail?.fountainId || 0);
  const itemId = Number(e?.detail?.itemId || 0);
  if (!Number.isInteger(fountainId) || fountainId <= 0) return;
  if (!Number.isInteger(itemId) || itemId <= 0) return;

  const pe = playerEntity(world);
  if (!pe) return;

  const pPos = world.get(pe.id, Position);
  const fPos = world.get(fountainId, Position);
  if (!pPos || !fPos) return;
  const dist = Math.max(Math.abs((pPos.x | 0) - (fPos.x | 0)), Math.abs((pPos.y | 0) - (fPos.y | 0)));
  if (dist > 1) {
    try { messageLog.log({ text: 'You are too far from the fountain.', type: 'system' }); } catch (err) { console.debug('[main] messageLog failed:', err); }
    return;
  }

  const inter = world.get(fountainId, Interactable);
  if (!inter || inter.action !== 'fountain') return;

  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  rulesHandler({ type: 'rules.fountainDip', payload: { fountainId, itemId } });
});

// When user throws an inventory item
addEventListener('ui:requestThrow', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const itemId = Number(e?.detail?.itemId || 0);
  if (!Number.isInteger(itemId) || itemId <= 0) return;

  const targetId = Number(e?.detail?.targetId || 0);
  const x = Number(e?.detail?.x);
  const y = Number(e?.detail?.y);
  const hasTileTarget = Number.isFinite(x) && Number.isFinite(y);

  const pe = playerEntity(world);
  if (!pe) return;
  const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
  if (hasTileTarget || (Number.isInteger(targetId) && targetId > 0)) {
    targeting.cancelAll();
    const payload = { itemId };
    if (Number.isInteger(targetId) && targetId > 0) payload.targetId = targetId;
    if (hasTileTarget) {
      const info = world.get(itemId, ItemInfo);
      const range = computeThrowRange(Number(info?.weight));
      const tileX = worldToTile(x);
      const tileY = worldToTile(y);
      const clamped = clampTargetToRange(pe.pos.x, pe.pos.y, tileX, tileY, range);
      const dist = Math.max(Math.abs((clamped.x | 0) - (pe.pos.x | 0)), Math.abs((clamped.y | 0) - (pe.pos.y | 0)));
      if (!(dist > 0)) {
        try { messageLog.log({ text: `${bracketizeName(resolveItemDisplayName(world, itemId) || 'item')} must target another tile.`, type: 'system' }); } catch (err) { console.debug('[main] messageLog failed:', err); }
        return;
      }
      payload.x = clamped.x | 0;
      payload.y = clamped.y | 0;
    }
    rulesHandler({ type: 'rules.throwItem', payload });
    return;
  }

  if (!inventoryContains(world, pe.id, itemId)) {
    try { messageLog.log({ text: 'You are not carrying that item.', type: 'system' }); } catch (e) { console.debug('[main] messageLog failed:', e); }
    return;
  }

  const itemName = resolveItemDisplayName(world, itemId) || 'item';
  const info = world.get(itemId, ItemInfo);
  const range = computeThrowRange(Number(info?.weight));
  targeting.openThrowTargeting({ actorId: pe.id, itemId, itemName, range });
  try {
    messageLog.log({
      text: `Throw ${bracketizeName(itemName)} where? Tap/click a tile or use arrow keys + Enter (up to ${range}). Press Esc to cancel.`,
      type: 'system',
    });
  } catch (e) { console.debug('[main] messageLog failed:', e); }
});

// When user requests dropping an inventory item
addEventListener('ui:requestDrop', (ev) => {
  if (isSimUiBlocked()) return;
  /** @type {CustomEvent} */ // @ts-ignore
  const e = ev;
  const itemId = e?.detail?.itemId;
  const count = e?.detail?.count;
  if (!Number.isInteger(itemId)) return;
  const payload = { itemId };
  if (Number.isFinite(count) && count > 0) payload.count = count;
  const action = { type: 'rules.dropItem', payload };
  const rulesHandler = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
  rulesHandler(action);
  try { window.dispatchEvent(new CustomEvent('ui:requestInventoryData')); } catch (e) { console.debug('[main] dispatch ui:requestInventoryData:', e); }
});

// ---- Display camera (resource) ---------------------------------------------
const cam = createCamera(); // { x,y, scale, target*, shake* }
const sceneRuntime = createSceneRuntime({
  world,
  getPlayerEntity: () => playerEntity(world),
  getCam: () => cam,
  getCanvas: () => canvas,
  getCanvasSetup: () => _canvasSetup,
});
installSpeechBubbleWiring({ world, sceneRuntime });
installBarkeepStoryWiring({ world, sceneRuntime });
cam.scale = CAMERA_START_SCALE;
cam.targetScale = CAMERA_START_SCALE;
if (PERF.cameraLerp !== null && Number.isFinite(PERF.cameraLerp)) cam.lerpSpeed = Math.max(0, PERF.cameraLerp);

// ---- Bubble dialog controller (needs cam + canvas) -------------------------
bubbleDialog = createBubbleDialogController({
  getPosition: (id) => world.get(Number(id || 0), Position) || null,
  playerEntity: () => playerEntity(world),
  canvas,
  getCam: () => cam,
  worldToScreen,
  getCanvasSetup: () => _canvasSetup,
});

// ---- Targeting pointer handlers (needs cam + canvas) ------------------------
targeting.installPointerHandlers(canvas, (ev) => cameraClientToWorld(cam, ev.clientX, ev.clientY, canvas));

// Legacy pointer handler: was inline enemy-targeted spell casts
// Now handled by targeting.installPointerHandlers above.
// REMOVED: canvas.addEventListener('pointerdown') for enemy targeting
// REMOVED: canvas.addEventListener('pointerdown') for tile/throw targeting

// Proc-state badges are touchable: tap a badge to inspect stack/turn/potency details.
canvas.addEventListener('pointerdown', (ev) => {
  if (targeting.isActive()) return;
  const [wx, wy] = cameraClientToWorld(cam, ev.clientX, ev.clientY, canvas);
  const hit = findTappedProcBadge(wx, wy);
  if (!hit) return;
  const who = String(hit.entity?.kind || "").toLowerCase() === "player"
    ? "You"
    : bracketizeName(String(hit.entity?.name || hit.entity?.kind || "Target"));
  try {
    messageLog.log({
      text: `${who}: ${formatProcStateDetail(hit.procState)}`,
      type: 'system',
    });
  } catch (e) { console.debug('[main] messageLog failed:', e); }
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
}, { capture: true });

const INTERACTABLE_TAP_DELAY_MS = 260;
const INTERACTABLE_TAP_SLOP_PX = 14;
let pendingInteractableTap = null;

function classifyWorldTapConsumption(world, actor, tapX, tapY) {
  if (!shouldConsumeWorldTap(world, actor, tapX, tapY)) return 'none';
  const tx = Number(tapX) | 0;
  const ty = Number(tapY) | 0;
  const px = Number(actor?.pos?.x) | 0;
  const py = Number(actor?.pos?.y) | 0;
  const set = world.get(actor.id, Settings);
  const pickupRange = Math.max(3, Number(set?.pickupRange ?? 0));
  const nearbyOffsets = [
    { x: 0, y: 0 },
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
  ];

  for (const off of nearbyOffsets) {
    const cx = tx + (off.x | 0);
    const cy = ty + (off.y | 0);
    const dist = Math.max(Math.abs(px - cx), Math.abs(py - cy));
    if (dist > pickupRange) continue;
    for (const [, pos] of world.query(Position, ItemInfo)) {
      if ((pos.x | 0) === cx && (pos.y | 0) === cy) return 'pickup';
    }
  }

  return 'interact';
}

function clearPendingInteractableTap() {
  if (!pendingInteractableTap) return;
  const pointerId = pendingInteractableTap.pointerId;
  clearTimeout(pendingInteractableTap.timer);
  pendingInteractableTap = null;
  try {
    if (typeof canvas.releasePointerCapture === "function") canvas.releasePointerCapture(pointerId);
  } catch {}
}

function consumeCanvasTapEvent(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
}

// Walk-mode tap interaction: pickups route immediately through the canonical
// rules.worldTap path; touch interactables require a short hold so movement taps
// do not pop the verb surface by accident.
canvas.addEventListener('pointerdown', (ev) => {
  if (targeting.isActive()) return;
  if (isSimUiBlocked()) return;
  if (readInputMode() !== 'walk') return;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;

  const pe = playerEntity(world);
  if (!pe) return;

  const [wx, wy] = cameraClientToWorld(cam, ev.clientX, ev.clientY, canvas);
  const tx = worldToTile(wx);
  const ty = worldToTile(wy);
  const tapKind = classifyWorldTapConsumption(world, pe, tx, ty);
  if (tapKind === 'none') return;

  const rulesHandler = makeRulesDispatcher(world, () => pe.id);
  if (tapKind === 'interact' && ev.pointerType !== 'mouse') {
    clearPendingInteractableTap();
    pendingInteractableTap = {
      pointerId: Number(ev.pointerId),
      clientX: Number(ev.clientX),
      clientY: Number(ev.clientY),
      tx,
      ty,
      actorId: pe.id,
      timer: setTimeout(() => {
        const pending = pendingInteractableTap;
        pendingInteractableTap = null;
        if (!pending) return;
        try {
          if (typeof canvas.releasePointerCapture === "function") canvas.releasePointerCapture(pending.pointerId);
        } catch {}
        if (targeting.isActive() || isSimUiBlocked() || readInputMode() !== 'walk') return;
        const current = playerEntity(world);
        if (!current || current.id !== pending.actorId) return;
        if (classifyWorldTapConsumption(world, current, pending.tx, pending.ty) !== 'interact') return;
        const delayedRulesHandler = makeRulesDispatcher(world, () => current.id);
        delayedRulesHandler({ type: 'rules.worldTap', payload: { x: pending.tx, y: pending.ty } });
      }, INTERACTABLE_TAP_DELAY_MS),
    };
    try {
      if (typeof canvas.setPointerCapture === "function") canvas.setPointerCapture(ev.pointerId);
    } catch {}
    consumeCanvasTapEvent(ev);
    return;
  }

  rulesHandler({ type: 'rules.worldTap', payload: { x: tx, y: ty } });
  consumeCanvasTapEvent(ev);
}, { capture: true });

canvas.addEventListener('pointermove', (ev) => {
  if (!pendingInteractableTap) return;
  if (Number(ev.pointerId) !== pendingInteractableTap.pointerId) return;
  const dx = Number(ev.clientX) - pendingInteractableTap.clientX;
  const dy = Number(ev.clientY) - pendingInteractableTap.clientY;
  if (Math.hypot(dx, dy) > INTERACTABLE_TAP_SLOP_PX) clearPendingInteractableTap();
}, { capture: true });

canvas.addEventListener('pointerup', (ev) => {
  if (!pendingInteractableTap) return;
  if (Number(ev.pointerId) === pendingInteractableTap.pointerId) clearPendingInteractableTap();
}, { capture: true });

canvas.addEventListener('pointercancel', (ev) => {
  if (!pendingInteractableTap) return;
  if (Number(ev.pointerId) === pendingInteractableTap.pointerId) clearPendingInteractableTap();
}, { capture: true });

function particleWorldToScreen({ x, y, size = 1 }) {
  const sx = (x - cam.x) * cam.scale + canvas.width / (ctx.getTransform().a || 1) * 0.5;
  const sy = (y - cam.y) * cam.scale + canvas.height / (ctx.getTransform().d || 1) * 0.5;
  return { x: sx, y: sy, size: size * cam.scale };
}

// ---- Particle FX (display-only) -------------------------------------------
const fx = new ParticleFX({ capacity: PERF.particleCapacity, seedBase: (world.seed >>> 0) });
fx.ctx = bctx;
// Avoid expensive per-particle transforms: draw in world units under camera transform
fx.worldToScreen = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ size, /** @type {{x:number,y:number,size:number}} */ out) => { out.x = x; out.y = y; out.size = size; };
world.on('dungeon:transitioned', () => {
  fx.pool.count = 0;
  _roofParticleStamp.clear();
  _roofSmokeParticleStamp.clear();
  if (lightingEngine) lightingEngine.invalidateAll();
});
const getPosition = (id) => world.get(Number(id || 0), Position) || null;
world.on('fishing:cast', ({ actor, x, y }) => {
  const from = world.get(Number(actor || 0), Position);
  const tx = Number(x);
  const ty = Number(y);
  if (!from || !Number.isFinite(tx) || !Number.isFinite(ty)) return;
  const ax = (from.x | 0);
  const ay = (from.y | 0);
  const dx = (tx | 0) - ax;
  const dy = (ty | 0) - ay;
  const steps = Math.max(2, Math.max(Math.abs(dx), Math.abs(dy)) * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const sag = Math.sin(t * Math.PI) * 0.12;
    fx.pool.spawn(new Particle({
      x: ax + dx * t,
      y: ay + dy * t + sag,
      vx: 0,
      vy: 0,
      life: 1.25,
      size0: 0.035,
      size1: 0.018,
      r: 166,
      g: 218,
      b: 226,
      a0: 0.82,
      a1: 0.08,
    }));
  }
  fx.pool.spawn(new Particle({
    x: (tx | 0),
    y: (ty | 0),
    vx: 0,
    vy: -0.02,
    life: 1.9,
    size0: 0.22,
    size1: 0.08,
    r: 246,
    g: 82,
    b: 72,
    a0: 0.95,
    a1: 0.12,
  }));
});
const isPetEntity = (id) => world.has(Number(id || 0), Pet);
const isPlayerEntity = (id) => world.has(Number(id || 0), Player);
const getPlayerEntity = () => playerEntity(world);
const getItemInfo = (id) => world.get(Number(id || 0), ItemInfo) || null;
const uiRulesDispatcher = makeRulesDispatcher(world, () => (playerEntity(world)?.id || 0));
const dispatchRulesAction = (action) => uiRulesDispatcher(action);
const resolveDisplayName = (id) => resolveItemDisplayName(world, Number(id || 0));
let _floatTextFovStep = -1;
const isVisibleAt = (x, y) => {
  const step = world.step | 0;
  if (step !== _floatTextFovStep) {
    _floatTextFovStep = step;
    const pe = playerEntity(world);
    if (pe?.id && pe.pos) {
      const radius = getEffectiveVisionRange(world, pe.id);
      const pad = 2;
      const bounds = {
        x0: pe.pos.x - radius - pad,
        y0: pe.pos.y - radius - pad,
        x1: pe.pos.x + radius + pad,
        y1: pe.pos.y + radius + pad,
      };
      const blockedMap = buildBlocksVisionMap(world, bounds);
      const isBlocked = blockedCallback(blockedMap);
      const facing = getNormalizedEntityFacing(world, pe.id);
      const coneDegrees = getEntityFacingConeDegrees(world, pe.id);
      updateFOV(step, pe.pos.x, pe.pos.y, radius, isBlocked, {
        facingDx: facing?.dx || 0,
        facingDy: facing?.dy || 0,
        coneDegrees,
      });
    }
  }
  return !!isTileVisible(Number(x) | 0, Number(y) | 0);
};

const FLYING_FX_INSTALLED = Symbol.for('jshack:display:flyingFx:main:installed');
const FLYING_TAKEOFF_SECONDS = 0.34;
const FLYING_LAND_SECONDS = 0.24;
const FLYING_WAKE_SECONDS = 0.30;
const FLYING_MAX_LIFT = 0.36;
const FLYING_HOVER_BOB = 0.028;

function easeOutCubic(n) {
  const t = clamp01(n);
  return 1 - Math.pow(1 - t, 3);
}

function flyingPhaseFromId(id) {
  const h = (Math.imul((id | 0) ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
  return (h / 0xffffffff) * Math.PI * 2;
}

function buildFlyingPresentation({ id, x, y, progress, wake, wakeKind, fxTime, camScale, phase }) {
  const p = clamp01(progress);
  const lifted = easeOutCubic(p);
  const hoverBob = lifted > 0.001
    ? Math.sin(fxTime * (lifted > 0.96 ? 3.2 : 5.8) + phase) * FLYING_HOVER_BOB * lifted
    : 0;
  const lift = FLYING_MAX_LIFT * lifted + hoverBob;
  const scalePulse = lifted > 0.96
    ? (0.5 + 0.5 * Math.sin(fxTime * 2.7 + phase * 0.7))
    : lifted;
  const glyphScale = 1 + lifted * 0.085 + scalePulse * lifted * 0.02;
  const worldPerPx = 1 / Math.max(1, Number(camScale) || 1);
  const shadowSlideX = (-2.0 * worldPerPx * lifted) - (lift * 0.12);
  const shadowSlideY = (-2.0 * worldPerPx * lifted) - (lift * 0.08);
  return {
    id,
    progress: p,
    lift,
    glyphX: x,
    glyphY: y - lift,
    glyphScale,
    shadowX: x + shadowSlideX,
    shadowY: y + 0.24 + shadowSlideY,
    shadowRx: 0.30 - lifted * 0.04,
    shadowRy: 0.11 - lifted * 0.015,
    shadowAlpha: Math.max(0.08, 0.26 - lifted * 0.06),
    wake: clamp01(wake),
    wakeKind: wakeKind || '',
  };
}

function createFlyingFxController(world) {
  /** @type {Map<number, { progress:number, targetAirborne:boolean, wake:number, wakeKind:string, phase:number }>} */
  const states = new Map();

  function ensureState(id, seed = {}) {
    let rec = states.get(id);
    if (!rec) {
      rec = {
        progress: clamp01(seed.progress ?? 0),
        targetAirborne: !!seed.targetAirborne,
        wake: clamp01(seed.wake ?? 0),
        wakeKind: seed.wakeKind || '',
        phase: flyingPhaseFromId(id),
      };
      states.set(id, rec);
    }
    return rec;
  }

  function installListeners() {
    if (world[FLYING_FX_INSTALLED]) return;
    world[FLYING_FX_INSTALLED] = true;

    world.on('proc:fly:takeoff', ({ id }) => {
      const entityId = Number(id || 0);
      if (!entityId) return;
      const rec = ensureState(entityId, { progress: 0, targetAirborne: true });
      rec.targetAirborne = true;
      rec.progress = Math.max(rec.progress, 0.12);
      rec.wake = 1;
      rec.wakeKind = 'takeoff';
    });

    world.on('proc:fly:land', ({ id }) => {
      const entityId = Number(id || 0);
      if (!entityId) return;
      const rec = ensureState(entityId, { progress: 1, targetAirborne: false });
      rec.targetAirborne = false;
      rec.progress = Math.max(rec.progress, 0.18);
      rec.wake = 1;
      rec.wakeKind = 'land';
    });
  }

  function syncWorldView(worldView) {
    const entities = Array.isArray(worldView?.entities) ? worldView.entities : [];
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const flying = Array.isArray(e.tags) && e.tags.includes('flying');
      const rec = states.get(e.id);
      if (!flying) {
        if (rec) rec.targetAirborne = false;
        continue;
      }
      if (!rec) {
        states.set(e.id, {
          progress: 1,
          targetAirborne: true,
          wake: 0,
          wakeKind: '',
          phase: flyingPhaseFromId(e.id),
        });
        continue;
      }
      rec.targetAirborne = true;
      if (rec.progress <= 0.001) rec.progress = 1;
    }
  }

  function tick(dt) {
    for (const [id, rec] of states) {
      if (rec.targetAirborne) rec.progress = Math.min(1, rec.progress + (dt / FLYING_TAKEOFF_SECONDS));
      else rec.progress = Math.max(0, rec.progress - (dt / FLYING_LAND_SECONDS));

      rec.wake = Math.max(0, rec.wake - (dt / FLYING_WAKE_SECONDS));
      if (!rec.targetAirborne && rec.progress <= 0.001) {
        states.delete(id);
        continue;
      }
      if (rec.targetAirborne && typeof world.isAlive === 'function' && !world.isAlive(id) && rec.progress >= 0.999) {
        states.delete(id);
      }
    }
  }

  function getPresentation(entity, fxTime, camScale) {
    const flyingTag = Array.isArray(entity?.tags) && entity.tags.includes('flying');
    const rec = states.get(entity.id);
    if (!rec && !flyingTag) {
      return buildFlyingPresentation({
        id: entity.id,
        x: entity.pos.x,
        y: entity.pos.y,
        progress: 0,
        wake: 0,
        wakeKind: '',
        fxTime,
        camScale,
        phase: flyingPhaseFromId(entity.id),
      });
    }
    if (!rec && flyingTag) {
      return buildFlyingPresentation({
        id: entity.id,
        x: entity.pos.x,
        y: entity.pos.y,
        progress: 1,
        wake: 0,
        wakeKind: '',
        fxTime,
        camScale,
        phase: flyingPhaseFromId(entity.id),
      });
    }
    return buildFlyingPresentation({
      id: entity.id,
      x: entity.pos.x,
      y: entity.pos.y,
      progress: rec?.progress ?? 0,
      wake: rec?.wake ?? 0,
      wakeKind: rec?.wakeKind || '',
      fxTime,
      camScale,
      phase: rec?.phase ?? flyingPhaseFromId(entity.id),
    });
  }

  return { installListeners, syncWorldView, tick, getPresentation };
}

const displayRuntime = setupDisplayRuntime({
  world,
  cam,
  fx,
  PERF,
  getFxTime: () => _fxTime,
  getActiveSpellId: () => _activeSpellId,
  setActiveSpell,
  getPosition,
  getEntityIdentity: (id) => String(world.get(Number(id || 0) | 0, NamedIdentity)?.identity || ""),
  getEntityVitality: (id) => world.get(Number(id || 0) | 0, Vitality) || null,
  isVisibleAt,
  isPet: isPetEntity,
  isPlayer: isPlayerEntity,
  getPlayerEntity,
  getHiddenTrapPositions: () => {
    const out = [];
    for (const [, pos, trap] of world.query(Position, Trap)) {
      if (!trap?.armed || trap.revealed) continue;
      out.push({ x: pos.x, y: pos.y });
    }
    return out;
  },
  getSacredSitePositions: () => {
    const out = [];
    for (const [, pos, ident] of world.query(Position, NamedIdentity)) {
      const key = String(ident?.identity || "").toLowerCase();
      if (key === "altar" || key === "shrine" || key === "church_altar") {
        out.push({ x: pos.x, y: pos.y });
      }
    }
    return out;
  },
  getItemInfo,
  getItemMaterial: (id) => String(world.get(Number(id || 0) | 0, Material)?.kind || ""),
  resolveItemDisplayName: resolveDisplayName,
  dispatchRulesAction,
  classifySurfaceTile,
  sculptFloor: (x, y, delta, reliefKey) => {
    if (!lightingEngine || typeof lightingEngine.addFloorTileDelta !== "function") return;
    lightingEngine.addFloorTileDelta(x, y, delta, reliefKey);
  },
  sculptFloorBrush: (x, y, delta, radius, opts, reliefKey) => {
    if (!lightingEngine || typeof lightingEngine.addFloorRadialDelta !== "function") return;
    lightingEngine.addFloorRadialDelta(x, y, delta, radius, opts, reliefKey);
  },
  getActiveReliefKey: () => {
    if (!lightingEngine || typeof lightingEngine.getFloorReliefState !== "function") return "__default__";
    return lightingEngine.getFloorReliefState()?.reliefKey ?? "__default__";
  },
  sampleMood: () => {
    const pe = playerEntity(world);
    if (!pe) return null;
    const dev = /** @type {any} */ (world.get(pe.id, Devotion));
    if (!dev?.deityId) return null;
    const deity = getDeityInstance(dev.deityId);
    if (!deity) return null;
    return deity._queryPrecise();
  },
  getDepth: () => {
    for (const [, ds] of world.query(DungeonState)) return ds.currentDepth ?? 0;
    return 0;
  },
});
const {
  statusEmitterFx,
  statusPresentationDelayFx,
  boltFx,
  delayedDeathFx,
  projectileFx,
  spellAreaFx,
  cloudFx,
  surfaceAreaFx,
  spiritWispFx,
  sparksFx,
  bumpFx,
  meleeSlashFx,
  aggroFx,
  recoilFx,
  hitstopFx,
  deathEssenceFx,
  deathVfx,
  teleportFx,
  fountainAmbientFx,
  localEmitterAmbientFx,
  worldAmbientFx,
  biomeAmbientFx,
  ftext,
  goreTick,
} = displayRuntime;
const flyingFx = createFlyingFxController(world);
flyingFx.installListeners();
const slideFx = createSlideFxController();

// Spirit guide tutorial — only on new games, only when tips remain unseen,
// and only if the player didn't uncheck Tutorial at character creation.
if (!_savegameLoaded && !_tutorialDisabledThisSession) {
  const seenTips = readSeenTips();
  const hasUnseen = GUIDANCE_TIPS.some((t) => !seenTips.has(t.id));
  if (hasUnseen) {
    const spiritPointerFx = createSpiritPointerFx({
      getWispScreenPos() {
        const wp = spiritWispFx.getWispPos();
        if (!wp) return null;
        const [sx, sy] = worldToScreen(cam, wp.x, wp.y, canvas);
        const dpr = Math.max(1, canvas.width / Math.max(1, canvas.offsetWidth || canvas.width));
        return { x: sx / dpr, y: sy / dpr };
      },
    });
    installSpiritGuideWiring({
      world,
      sceneRuntime,
      getPlayerEntity: () => playerEntity(world),
      spiritWispFx,
      spiritPointerFx,
    });
  }
}

// ── Size-class display scale map ────────────────────────────────────
const SIZE_CLASS_SCALE = { XS: 0.55, S: 0.72, M: 0.88, L: 1.0, XL: 1.12 };
const _itemZeroOff = { dx: 0, dy: 0 };

// Wire transient lighting effects (gaze beams, chest blooms, etc.)
installLightEventListeners(world, getPosition);

// ---- Visual mappings (display contract) ------------------------------------
const palette = buildPalette();
const glyphAtlas = createGlyphAtlas(palette, { glowLayers: PERF.glowLayers, sizePx: (PERF.quality==='low'?32:64), fontPx: (PERF.quality==='low'?28:56) });
bootAdvance("Prepared render resources");

// ---- Render (display-only; consumes WorldView DTO) -------------------------
let _bgGradH = 0; let _bgGrad = null;
let _fxTime = 0; // display-side time accumulator for simple glyph FX
let _dtSec = 0;  // frame delta for render-internal use
let _renderPlayerBlinded = false;

// Reusable render buffers — hoisted out of hot functions to avoid per-frame GC
const _stackMeta = new Map();
const _stackSeqMeta = new Map();
/** @type {number[]} flat buffer [tile, x, y, ...] for explored-not-visible tiles */
const _exploredTileBuffer = [];
/** @type {Map<number, { hp:number, ratio:number, showUntil:number }>} */
const _healthBarState = new Map();
/** @type {Set<number>} */
const _healthBarSeen = new Set();
/** @type {Set<string>} */
const _roofCoverKeys = new Set();
/** @type {Set<string>} */
const _shelterInteriorKeys = new Set();
const _shelterFloodQueue = [];
const _aboveRoofEntities = [];  // entities tagged flying/above_roof, collected during main loop
const _postLightingTiles = []; // overworld tile stamps that should sit above the darkness overlay
const _postLightingGlyphs = []; // overworld structure/entity stamps that should sit above the darkness overlay
/** @type {Map<string, number>} */
const _roofParticleStamp = new Map();
/** Separate stamp for large smoldering smoke particles (slower rate). @type {Map<string, number>} */
const _roofSmokeParticleStamp = new Map();
/** @type {Array<{ id:number, pos:{x:number,y:number}, hp:number, maxHp:number, isPet?:boolean }>} */
const _healthBarsToDraw = [];
const _groundLootLabels = [];
const _monsterLabels = [];
const _memoryGlyphByKind = new Map();
const _renderProfile = {
  enabled: RENDER_PROFILE_ENABLED,
  lastFrame: null,
};
if (typeof window !== "undefined") {
  /** @type {any} */ (window).__JSHACK_RENDER_PROF = _renderProfile;
}
const HP_BAR_MEANINGFUL_RATIO_DELTA = 0.08;
const HP_BAR_SHOW_SECONDS = 2.25;
const PET_HP_BAR_SHOW_SECONDS = 3.5;
const LIGHTING_DETAIL_MAX_TILES = 3600;

// ── Hit tint: brief red shift on the entity glyph on successful damage ──
const HIT_TINT_DURATION = 0.18;
/** @type {Map<number, number>} entityId → elapsed seconds since tint started */
const _hitTints = new Map();
/** @type {Array<{ fireAt:number, id:number }>} deferred tints waiting for projectile impact */
const _pendingHitTints = [];

function triggerHitTint(id) { _hitTints.set(id | 0, 0); }
function tickHitTints(dt) {
  for (const [id, t] of _hitTints) {
    const next = t + dt;
    if (next >= HIT_TINT_DURATION) _hitTints.delete(id);
    else _hitTints.set(id, next);
  }
  for (let i = _pendingHitTints.length - 1; i >= 0; i--) {
    if (_fxTime >= _pendingHitTints[i].fireAt) {
      triggerHitTint(_pendingHitTints[i].id);
      _pendingHitTints.splice(i, 1);
    }
  }
}
/** Returns 0..1 tint intensity (0 = no tint). */
function getHitTint(id) {
  const t = _hitTints.get(id | 0);
  if (t === undefined) return 0;
  const k = t / HIT_TINT_DURATION;
  // fast peak at 15%, then smooth decay
  return k < 0.15 ? k / 0.15 : 1 - ((k - 0.15) / 0.85);
}
const PET_CRITICAL_RATIO = 0.35;

/**
 * Draw a small additive aura for entities explicitly tagged with `glowing`.
 * Kept tag-gated so palette `glow` color does not imply runtime glyph FX.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number}, tags?:string[] }} e
 * @param {number} fxTime
 */
function drawGlowingTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 4.2 + e.id * 0.37);
  const rOuter = (0.58 + 0.06 * pulse) * scale;
  const rInner = (0.27 + 0.03 * pulse) * scale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  outer.addColorStop(0,   `rgba(255,180,80,${(0.24 + 0.14 * pulse).toFixed(3)})`);
  outer.addColorStop(0.55,`rgba(255,110,20,${(0.12 + 0.10 * pulse).toFixed(3)})`);
  outer.addColorStop(1,   'rgba(170,60,10,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  inner.addColorStop(0, `rgba(255,230,170,${(0.28 + 0.22 * pulse).toFixed(3)})`);
  inner.addColorStop(1, 'rgba(255,170,80,0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a golden legendary glow for `legendary_chest` entities.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawLegendaryChestAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.8 + e.id * 1.3);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.62 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.30 + 0.15 * pulse;
  outerGrad.addColorStop(0,   `rgba(255,190,20,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(220,140,10,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(160,80,0,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.30 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.35 + 0.20 * pulse;
  innerGrad.addColorStop(0, `rgba(255,230,100,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(255,180,30,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a purple epic glow for `magic_chest` entities.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawEpicChestAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.0 + e.id * 1.3);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.62 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.28 + 0.14 * pulse;
  outerGrad.addColorStop(0,   `rgba(180,60,255,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(140,40,220,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(80,20,160,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.30 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.32 + 0.18 * pulse;
  innerGrad.addColorStop(0, `rgba(210,120,255,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(160,60,230,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a blue glow for rare-rarity items tagged with `rare_glowing`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawRareGlowAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.6 + e.id * 1.3);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.58 + 0.07 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.22 + 0.12 * pulse;
  outerGrad.addColorStop(0,   `rgba(85,170,255,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(60,130,220,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(30,80,160,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.28 + 0.04 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.28 + 0.16 * pulse;
  innerGrad.addColorStop(0, `rgba(140,200,255,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(85,170,255,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a poison-green glow for entities tagged with `venom_glowing`.
 * Matches the poisoned-item glow style to convey venomous nature.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawVenomTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.5 + e.id * 1.3);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Outer soft glow — same palette as poisoned-weapon ground glow
  const rOuter = (0.62 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.30 + 0.15 * pulse;
  outerGrad.addColorStop(0,   `rgba(50,220,70,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(40,190,55,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(20,140,35,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  // Inner bright core
  const rInner = (0.30 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.35 + 0.20 * pulse;
  innerGrad.addColorStop(0, `rgba(100,255,120,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(60,230,80,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw an icy cyan-blue glow for entities tagged with `frost_glowing`.
 * Slow crystalline pulse for frostbite weapons.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawFrostTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.5 + e.id * 1.3);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.62 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.26 + 0.14 * pulse;
  outerGrad.addColorStop(0,   `rgba(100,190,255,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(70,150,230,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(40,100,180,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.30 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.32 + 0.20 * pulse;
  innerGrad.addColorStop(0, `rgba(180,230,255,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a crackling electric blue-white glow for entities tagged with `storm_glowing`.
 * Fast pulse for lightning/capacitive weapons.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawStormTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 5.0 + e.id * 0.91);
  // Flicker: occasional sharp brightness spikes
  const flicker = Math.sin(fxTime * 13.7 + e.id * 2.3) > 0.7 ? 0.3 : 0;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.60 + 0.10 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.22 + 0.16 * pulse + flicker;
  outerGrad.addColorStop(0,   `rgba(120,170,255,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(80,130,240,${(outerA * 0.45).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(40,70,200,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.28 + 0.06 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.30 + 0.25 * pulse + flicker;
  innerGrad.addColorStop(0, `rgba(210,230,255,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(140,180,255,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a dark crimson-purple glow for entities tagged with `soul_glowing`.
 * Vampiric pulse for soul drain weapons.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawSoulTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.0 + e.id * 1.7);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.60 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.24 + 0.14 * pulse;
  outerGrad.addColorStop(0,   `rgba(180,40,110,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(140,25,85,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(80,10,50,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.28 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.30 + 0.20 * pulse;
  innerGrad.addColorStop(0, `rgba(220,80,170,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(170,50,120,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a deep crimson glow for entities tagged with `blood_glowing`.
 * Slow throb for hemorrhage / berserk weapons.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawBloodTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.2 + e.id * 1.1);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.60 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.24 + 0.14 * pulse;
  outerGrad.addColorStop(0,   `rgba(200,30,30,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(160,20,20,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(100,10,10,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.28 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.30 + 0.20 * pulse;
  innerGrad.addColorStop(0, `rgba(255,80,60,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(220,40,30,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw an acid yellow-green glow for entities tagged with `caustic_glowing`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawCausticTagAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x, cy = e.pos.y;
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.2 + e.id * 1.5);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const rOuter = (0.60 + 0.08 * pulse) * scale;
  const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  const outerA = 0.26 + 0.14 * pulse;
  outerGrad.addColorStop(0,   `rgba(190,210,30,${outerA.toFixed(3)})`);
  outerGrad.addColorStop(0.5, `rgba(150,180,20,${(outerA * 0.5).toFixed(3)})`);
  outerGrad.addColorStop(1,   'rgba(100,130,10,0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();

  const rInner = (0.28 + 0.05 * pulse) * scale;
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
  const innerA = 0.30 + 0.20 * pulse;
  innerGrad.addColorStop(0, `rgba(230,250,80,${innerA.toFixed(3)})`);
  innerGrad.addColorStop(1, 'rgba(190,220,40,0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a potion-shaped glow keyed off the "!" silhouette.
 * The disabled-kind set lives in worldView so enabling/disabling stays trivial.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, kind:string, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
// --- Potion shimmer tuning ---
const POTION_SHIMMER_SPEED = 2.6;   // pulse frequency (lower = lazier glow)
const POTION_SHIMMER_DEPTH = 0.18;  // how much alpha swings (0 = static, 1 = full throb)

function drawPotionGlyphAura(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const cy = e.pos.y;
  const look = palette[e.kind] || palette.potion || palette.default;
  const fgHex = look?.fg || "#8fd7ff";

  const pulse = 0.5 + 0.5 * Math.sin(fxTime * POTION_SHIMMER_SPEED + e.id * 0.83);
  const baseA = 0.22 + POTION_SHIMMER_DEPTH * pulse;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const r = (0.42 + 0.06 * pulse) * scale;
  const squeeze = 0.43; // sides 40% narrower than top/bottom — hugs the "!"
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0,   `${fgHex}${Math.round(baseA * 255).toString(16).padStart(2,'0')}`);
  grad.addColorStop(0.6, `${fgHex}${Math.round(baseA * 0.35 * 255).toString(16).padStart(2,'0')}`);
  grad.addColorStop(1,   `${fgHex}00`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  const steps = 16; // more steps = smoother glow outline but more CPU
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const s = Math.sin(a);
    const rr = r * ((1 - squeeze) + squeeze * s * s);
    const px = cx + rr * Math.cos(a);
    const py = cy + rr * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Fallback unknown potion identities to the generic potion glyph instead of the
 * default bullet. This keeps all potions rendering as "!" even when a new ID
 * has not received a dedicated palette row yet.
 * @param {Map<string, { canvas: HTMLCanvasElement }>} glyphAtlas
 * @param {{ kind:string, tags:string[] }} e
 * @returns {string}
 */
function resolveRenderableKind(glyphAtlas, e) {
  const kind = (typeof e.kind === 'string') ? e.kind : 'default';
  if (glyphAtlas.has(kind)) return kind;
  if (Array.isArray(e.tags) && e.tags.includes('potion_glow')) return 'potion';
  return kind;
}

function resolveMemoryGlyph(kind) {
  const key = (typeof kind === "string" && kind.length) ? kind : "default";
  if (_memoryGlyphByKind.has(key)) return _memoryGlyphByKind.get(key);
  const look = palette[key] || palette.default || {};
  let glyph = "?";
  if (Array.isArray(look.layers) && look.layers.length) {
    for (let i = look.layers.length - 1; i >= 0; i--) {
      const g = look.layers[i]?.glyph;
      if (typeof g === "string" && g.length) {
        glyph = g;
        break;
      }
    }
  } else if (typeof look.glyph === "string" && look.glyph.length) {
    glyph = look.glyph;
  }
  _memoryGlyphByKind.set(key, glyph);
  return glyph;
}

function drawMemoryGlyph(ctx, kind, x, y, alpha = 0.7) {
  const glyph = resolveMemoryGlyph(kind);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha *= Math.max(0, Math.min(1, Number(alpha) || 0));
  ctx.fillStyle = "#9a9a9a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = canvasGlyphFont(glyph, '0.92px', 900);
  ctx.fillText(glyph, x, y + 0.01);
  ctx.restore();
}

// drawKindScaled is imported from atlas.js (supports scale + rotation)

function hasTag(entity, tag) {
  return Array.isArray(entity?.tags) && entity.tags.includes(tag);
}

function hasAnyTag(entity, tags) {
  if (!Array.isArray(entity?.tags)) return false;
  for (let i = 0; i < tags.length; i++) {
    if (entity.tags.includes(tags[i])) return true;
  }
  return false;
}

function lootLabelColorFromTags(tags) {
  const list = Array.isArray(tags) ? tags : [];
  if (list.includes("legendary_glowing")) return "#ff9a5a";
  if (list.includes("epic_glowing")) return "#d58bff";
  if (list.includes("rare_glowing")) return "#ffe17a";
  if (list.includes("gold_glow")) return "#ffd34d";
  if (list.includes("potion_glow")) return "#8fd7ff";
  return "#cfd7e6";
}

function lootLabelFromKind(kind, itemId = 0) {
  if ((itemId | 0) > 0) {
    const resolved = String(resolveItemDisplayName(world, itemId) || "").trim();
    if (resolved) return resolved;
  }
  const key = String(kind || "item").trim().toLowerCase();
  if (!key) return "Loot";
  if (key.includes("gold")) return "Gold";
  if (key.includes("potion")) return "Potion";
  if (key.includes("scroll")) return "Scroll";
  if (key.includes("wand")) return "Wand";
  if (key.includes("chest")) return "Chest";
  const words = key.split("_").filter(Boolean);
  const core = words.slice(-2).join(" ");
  const text = core || key;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawGroundLootLabels(ctx, labels, fxTime) {
  if (!Array.isArray(labels) || labels.length <= 0) return;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = canvasFont('0.20px', 700);
  for (let i = 0; i < labels.length; i++) {
    const rec = labels[i];
    if (!rec) continue;
    const bob = Math.sin(fxTime * 2.4 + rec.id * 0.13) * 0.03;
    const y = rec.y - 0.55 + bob;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 0.06;
    ctx.strokeText(rec.text, rec.x, y);
    ctx.fillStyle = rec.color;
    ctx.fillText(rec.text, rec.x, y);
  }
  ctx.restore();
}

function monsterLabelFromKind(kind) {
  const key = String(kind || '').trim();
  if (!key || key === 'default') return '';
  return key.split('_').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function drawMonsterLabels(ctx, labels, fxTime) {
  if (!Array.isArray(labels) || labels.length <= 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = canvasFont('0.15px', 600);
  for (let i = 0; i < labels.length; i++) {
    const rec = labels[i];
    if (!rec) continue;
    // Offset label Y based on creature scale so it sits above the glyph
    const ss = rec.sizeScale || 1;
    const y = rec.y - (0.30 + 0.22 * ss);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.04;
    ctx.strokeText(rec.text, rec.x, y);
    ctx.fillStyle = rec.color;
    ctx.fillText(rec.text, rec.x, y);
  }
  ctx.restore();
}

function drawEntityGlyph(atlas, ctx, entity, scale = 1, rotation = 0) {
  if (hasTag(entity, 'thermal_sensed')) return;

  // Death VFX: player glyph blink (disappears on off-beats) + heartbeat scale
  const isPlayerGlyph = (entity.layer | 0) === 400;
  if (isPlayerGlyph) {
    const blinkAlpha = deathVfx.getPlayerGlyphAlpha(_fxTime);
    if (blinkAlpha < 0.01) return; // blink off-beat — don't draw
    scale *= deathVfx.getPlayerGlyphScale(_fxTime);
  }

  const kind = resolveRenderableKind(atlas, entity);
  const invisible = hasTag(entity, 'invisible');
  const shadowCloak = hasTag(entity, 'shadow_cloak');
  const phaseShift = hasTag(entity, 'phase_shift');
  const memoryRecent = hasTag(entity, 'memory_recent');
  const memoryTampered = hasTag(entity, 'memory_tampered');
  const espSensed = hasTag(entity, 'esp_sensed');
  if (!invisible && !shadowCloak && !phaseShift && !memoryRecent && !espSensed) {
    const tint = getHitTint(entity.id);
    const redPulse = isPlayerGlyph ? deathVfx.getPlayerGlyphRedPulse(_fxTime) : 0;
    if (tint > 0.01) {
      ctx.save();
      ctx.filter = `saturate(${1 - tint * 0.5}) sepia(${tint}) hue-rotate(-50deg) brightness(${1 + tint * 0.4})`;
      drawKindScaled(atlas, ctx, kind, entity.pos.x, entity.pos.y, scale, rotation);
      ctx.restore();
    } else {
      if (redPulse > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(220, 24, 32, ${redPulse * 0.28})`;
        ctx.beginPath();
        ctx.arc(entity.pos.x, entity.pos.y, 0.38 + redPulse * 0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      drawKindScaled(atlas, ctx, kind, entity.pos.x, entity.pos.y, scale, rotation);
    }
    return;
  }
  // Memory/ESP can affect many entities at once; avoid costly canvas filter path.
  if (memoryRecent || espSensed) {
    const jx = memoryTampered ? Math.sin(_fxTime * 14 + (entity.id | 0) * 0.73) * 0.045 : 0;
    const jy = memoryTampered ? Math.cos(_fxTime * 13 + (entity.id | 0) * 0.51) * 0.045 : 0;
    ctx.save();
    if (memoryRecent) {
      drawMemoryGlyph(
        ctx,
        kind,
        entity.pos.x + jx,
        entity.pos.y + jy,
        _renderPlayerBlinded
          ? (memoryTampered ? 0.62 : 0.74)
          : (memoryTampered ? 0.58 : 0.70),
      );
    } else {
      ctx.globalAlpha *= 0.52;
      drawKindScaled(atlas, ctx, kind, entity.pos.x, entity.pos.y, scale, rotation);
    }
    ctx.restore();
    return;
  }
  const jx = memoryTampered ? Math.sin(_fxTime * 14 + (entity.id | 0) * 0.73) * 0.045 : 0;
  const jy = memoryTampered ? Math.cos(_fxTime * 13 + (entity.id | 0) * 0.51) * 0.045 : 0;
  ctx.save();
  if (invisible) {
    ctx.filter = 'brightness(0.50) saturate(0.70)';
    ctx.globalAlpha *= 0.82;
  } else if (shadowCloak) {
    ctx.filter = 'brightness(0.72) saturate(0.80)';
    ctx.globalAlpha *= 0.90;
  } else if (phaseShift) {
    ctx.filter = 'brightness(0.86) saturate(0.95)';
    ctx.globalAlpha *= 0.94;
  }
  drawKindScaled(atlas, ctx, kind, entity.pos.x + jx, entity.pos.y + jy, scale, rotation);
  ctx.restore();
}

function drawEntityGlyphForeground(atlas, ctx, entity, scale = 1, rotation = 0) {
  const kind = resolveRenderableKind(atlas, entity);
  const memoryRecent = hasTag(entity, 'memory_recent');
  const memoryTampered = hasTag(entity, 'memory_tampered');
  const espSensed = hasTag(entity, 'esp_sensed');
  if (memoryRecent || espSensed) return;
  const jx = memoryTampered ? Math.sin(_fxTime * 14 + (entity.id | 0) * 0.73) * 0.045 : 0;
  const jy = memoryTampered ? Math.cos(_fxTime * 13 + (entity.id | 0) * 0.51) * 0.045 : 0;
  ctx.save();
  drawKindScaledForeground(atlas, ctx, kind, entity.pos.x + jx, entity.pos.y + jy, scale, rotation);
  ctx.restore();
}

function drawThermalSensePing(ctx, entity, fxTime) {
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 5.2 + (entity.id | 0) * 0.91);
  const cx = entity.pos.x;
  const cy = entity.pos.y;
  const rOuter = 0.16 + 0.03 * pulse;
  const rInner = 0.06 + 0.02 * pulse;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
  outer.addColorStop(0, `rgba(255,90,60,${(0.42 + 0.20 * pulse).toFixed(3)})`);
  outer.addColorStop(1, 'rgba(220,25,15,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,68,42,${(0.75 + 0.20 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEspSenseHalo(ctx, entity, fxTime) {
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.3 + (entity.id | 0) * 0.57);
  const cx = entity.pos.x;
  const cy = entity.pos.y;
  const ringR = 0.41 + 0.05 * pulse;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 0.038;
  ctx.strokeStyle = `rgba(90,225,255,${(0.34 + 0.20 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.23);
  core.addColorStop(0, `rgba(140,235,255,${(0.16 + 0.08 * pulse).toFixed(3)})`);
  core.addColorStop(1, 'rgba(90,190,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.23, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw a small white dot in front of the entity's facing direction.
 * World-space: 1 unit = 1 tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ pos:{x:number,y:number}, facing?:{dx:number,dy:number}|null }} entity
 */
function drawFacingDot(ctx, entity) {
  const f = entity?.facing || null;
  const dx = Math.sign(Number(f?.dx || 0));
  const dy = Math.sign(Number(f?.dy || 0));
  if (dx === 0 && dy === 0) return;

  const dotX = entity.pos.x + dx * 0.22;
  const dotY = entity.pos.y + dy * 0.22;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(220,195,95,0.98)';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDungeonEntranceBadge(ctx, entity) {
  const badge = entity?.entranceBadge || null;
  if (!badge) return;
  const level = Math.max(1, Number(badge.level || 1) | 0);
  const floors = Math.max(1, Number(badge.floors || level) | 0);
  const label = String(Math.min(level, 9));
  const x = entity.pos.x + 0.27;
  const y = entity.pos.y + 0.28;
  const color = String(badge.color || '#70d6ff');

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(8,10,14,0.88)';
  ctx.beginPath();
  ctx.arc(x, y, 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = floors > 1 ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.025;
  ctx.stroke();
  ctx.fillStyle = '#111318';
  ctx.font = canvasFont('0.16px', 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.004);
  ctx.restore();
}

function drawStoneskinWardAura(ctx, entity, fxTime) {
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.3 + (entity.id | 0) * 0.71);
  const cx = entity.pos.x;
  const cy = entity.pos.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const outerR = 0.74 + 0.06 * pulse;
  const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
  outer.addColorStop(0, `rgba(150,225,135,${(0.18 + 0.08 * pulse).toFixed(3)})`);
  outer.addColorStop(0.55, `rgba(95,170,90,${(0.14 + 0.06 * pulse).toFixed(3)})`);
  outer.addColorStop(1, 'rgba(60,120,55,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.34 + 0.03 * pulse);
  core.addColorStop(0, `rgba(210,255,195,${(0.22 + 0.10 * pulse).toFixed(3)})`);
  core.addColorStop(1, 'rgba(120,190,105,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.34 + 0.03 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHarmonyWardGlowAura(ctx, entity, fxTime) {
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.1 + (entity.id | 0) * 0.93);
  const cx = entity.pos.x;
  const cy = entity.pos.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const outerR = 0.78 + 0.07 * pulse;
  const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
  outer.addColorStop(0, `rgba(170,220,255,${(0.20 + 0.08 * pulse).toFixed(3)})`);
  outer.addColorStop(0.50, `rgba(255,220,135,${(0.16 + 0.07 * pulse).toFixed(3)})`);
  outer.addColorStop(1, 'rgba(120,150,255,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();
  const innerR = 0.42 + 0.05 * pulse;
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR);
  inner.addColorStop(0, `rgba(255,250,210,${(0.26 + 0.10 * pulse).toFixed(3)})`);
  inner.addColorStop(1, 'rgba(210,225,255,0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Reserved parked prototype.
// Unused by gameplay right now; keep for future status/tag experiments.
const WARD_BUBBLE_RESERVED_TAG = 'ward_bubble_preview';
function drawWardBubbleAura(ctx, entity, fxTime) {
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 2.0 + (entity.id | 0) * 1.03);
  const cx = entity.pos.x;
  const cy = entity.pos.y;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = fxTime * 0.8 + i * (Math.PI / 2);
    const ox = Math.cos(a) * 0.11;
    const oy = Math.sin(a) * 0.11;
    const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, 0.42 + 0.05 * pulse);
    if (i === 0) {
      g.addColorStop(0, `rgba(255,140,80,${(0.24 + 0.08 * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,100,60,0)');
    } else if (i === 1) {
      g.addColorStop(0, `rgba(120,255,120,${(0.24 + 0.08 * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(80,210,100,0)');
    } else if (i === 2) {
      g.addColorStop(0, `rgba(120,210,255,${(0.24 + 0.08 * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(70,160,255,0)');
    } else {
      g.addColorStop(0, `rgba(255,255,150,${(0.24 + 0.08 * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,210,110,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx + ox, cy + oy, 0.42 + 0.05 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = `rgba(205,230,255,${(0.30 + 0.12 * pulse).toFixed(3)})`;
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.arc(cx, cy, 0.62 + 0.05 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawInvisibleVeil(ctx, entity, fxTime, hasAmbushOpener) {
  const pulse = 0.5 + 0.5 * Math.sin(fxTime * 3.0 + (entity.id | 0) * 0.67);
  const cx = entity.pos.x;
  const cy = entity.pos.y;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const shellR = 0.64 + 0.05 * pulse;
  const shell = ctx.createRadialGradient(cx, cy, 0, cx, cy, shellR);
  if (hasAmbushOpener) {
    shell.addColorStop(0, `rgba(70,45,110,${(0.16 + 0.08 * pulse).toFixed(3)})`);
    shell.addColorStop(1, 'rgba(30,20,50,0)');
  } else {
    shell.addColorStop(0, `rgba(52,70,98,${(0.14 + 0.06 * pulse).toFixed(3)})`);
    shell.addColorStop(1, 'rgba(22,30,45,0)');
  }
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(cx, cy, shellR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roofCellKey(x, y) {
  return `${x | 0},${y | 0}`;
}

function collectShelterInteriorKeys(worldView) {
  _shelterInteriorKeys.clear();
  _shelterFloodQueue.length = 0;
  if (worldView?.playerSheltered !== true) return _shelterInteriorKeys;
  const pos = worldView?.player?.pos;
  if (!pos) return _shelterInteriorKeys;
  const px = pos.x | 0;
  const py = pos.y | 0;
  if (!isRoofed(px, py)) return _shelterInteriorKeys;

  const start = roofCellKey(px, py);
  _shelterInteriorKeys.add(start);
  _shelterFloodQueue.push([px, py]);
  for (let qi = 0; qi < _shelterFloodQueue.length && qi < 4096; qi++) {
    const [x, y] = _shelterFloodQueue[qi];
    for (let i = 0; i < 4; i++) {
      const nx = x + (i === 0 ? 1 : (i === 1 ? -1 : 0));
      const ny = y + (i === 2 ? 1 : (i === 3 ? -1 : 0));
      if (!isRoofed(nx, ny)) continue;
      const key = roofCellKey(nx, ny);
      if (_shelterInteriorKeys.has(key)) continue;
      _shelterInteriorKeys.add(key);
      _shelterFloodQueue.push([nx, ny]);
    }
  }
  return _shelterInteriorKeys;
}

function drawRoofSmoke(ctx, roof, fxTime, fx, quality) {
  if (!roof?.burning && !roof?.smoking) return;
  const _isBurning = !!roof.burning;
  const phase = ((Math.imul((roof.x | 0) + 11, 1103515245) ^ Math.imul((roof.y | 0) + 17, 12345)) >>> 0) / 0xffffffff;
  const bob = 0.5 + 0.5 * Math.sin(fxTime * 1.7 + phase * Math.PI * 2);
  const swell = roof.smoking ? 1 : 0.7;
  const cx = roof.x + (phase - 0.5) * 0.18 + Math.sin(fxTime * 0.9 + phase * 5.1) * 0.025 * swell;
  const cy = roof.y - 0.16 - bob * 0.12 - swell * 0.05;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(26,24,22,${(0.18 + bob * 0.09 + swell * 0.08).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 0.22 + swell * 0.03, 0.12 + swell * 0.03, 0.10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 0.06, cy - 0.13 - swell * 0.03, 0.18 + swell * 0.02, 0.11 + swell * 0.02, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - 0.09, cy - 0.22 - swell * 0.06, 0.15 + swell * 0.03, 0.09 + swell * 0.03, -0.18, 0, Math.PI * 2);
  ctx.fill();

  if (_isBurning) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,122,34,${(0.14 + bob * 0.08).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(roof.x - 0.04, roof.y - 0.05, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,210,120,${(0.08 + bob * 0.05).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(roof.x + 0.05, roof.y - 0.08, 0.03, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 4; i++) {
    const ashPhase = phase * 11.0 + i * 0.97;
    const fall = (fxTime * (0.55 + i * 0.08) + ashPhase) % 1.0;
    const ax = roof.x - 0.18 + i * 0.11 + Math.sin(fxTime * 1.3 + ashPhase) * 0.03;
    const ay = roof.y - 0.10 + fall * 0.42;
    const alpha = 0.20 + (1 - fall) * 0.18;
    ctx.strokeStyle = `rgba(170,168,160,${alpha.toFixed(3)})`;
    ctx.lineWidth = 0.018 + i * 0.002;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 0.018);
    ctx.lineTo(ax - 0.012, ay + 0.022);
    ctx.stroke();
  }
  ctx.restore();

  if (quality === 'low' || !fx?.pool) return;

  // Large billowing smoke for smoldering (post-fire) — slow rate, long TTL.
  if (roof.smoking) {
    const smokeTick = Math.floor(fxTime * 0.7 + phase * 7);
    const smokeKey = roofCellKey(roof.x, roof.y);
    const lastSmokeTick = _roofSmokeParticleStamp.get(smokeKey) ?? -1;
    if (smokeTick !== lastSmokeTick) {
      _roofSmokeParticleStamp.set(smokeKey, smokeTick);
      // Three large billow puffs, each offset and staggered.
      const drifts = [
        { ox: (phase - 0.5) * 0.28, oy: -0.12, vxd:  0.04, life: 7.6 + bob * 1.2, s0: 0.80, s1: 0.42, rr: 64, gg: 62, bb: 58, a: 0.38 },
        { ox: (phase - 0.5) * 0.14, oy: -0.06, vxd: -0.03, life: 6.8 + bob * 1.4, s0: 0.90, s1: 0.50, rr: 102, gg: 98, bb: 92, a: 0.30 },
        { ox: (phase - 0.5) * 0.38, oy: -0.18, vxd:  0.02, life: 8.8 + bob * 1.0, s0: 0.66, s1: 0.30, rr: 148, gg: 144, bb: 136, a: 0.22 },
      ];
      for (let di = 0; di < drifts.length; di++) {
        const d = drifts[di];
        fx.pool.spawn(new Particle({
          x: roof.x + d.ox,
          y: roof.y + d.oy,
          vx: d.vxd + (phase - 0.5) * 0.02,
          vy: -0.10 - bob * 0.05,
          ay: -0.012,
          life: d.life,
          size0: d.s0,
          size1: d.s1,
          r: d.rr, g: d.gg, b: d.bb,
          a0: d.a * 0.45,
          a1: Math.min(0.46, d.a * 1.18),
        }));
      }
    }
  }

  const particleTick = Math.floor(fxTime * 7 + phase * 13);
  const particleKey = roofCellKey(roof.x, roof.y);
  const lastTick = _roofParticleStamp.get(particleKey) ?? -1;
  if (lastTick === particleTick) return;
  _roofParticleStamp.set(particleKey, particleTick);

  fx.pool.spawn(new Particle({
    x: roof.x + (phase - 0.5) * 0.18,
    y: roof.y - 0.14,
    vx: (phase - 0.5) * 0.05,
    vy: -0.14 - bob * 0.06,
    ay: -0.03,
    life: 1.55 + bob * 0.45,
    size0: 0.045,
    size1: 0.020,
    r: 72,
    g: 70,
    b: 66,
    a0: 0.14,
    a1: 0.30,
  }));
  fx.pool.spawn(new Particle({
    x: roof.x - 0.10 + bob * 0.08,
    y: roof.y - 0.10,
    vx: -0.02 + (phase - 0.5) * 0.04,
    vy: 0.08 + bob * 0.03,
    ay: 0.08,
    life: 0.55,
    size0: 0.032,
    size1: 0.010,
    r: 182,
    g: 178,
    b: 168,
    a0: 0.34,
  }));
  if (_isBurning && particleTick % 2 === 0) {
    fx.pool.spawn(new Particle({
      x: roof.x + 0.03 - phase * 0.10,
      y: roof.y - 0.06,
      vx: (phase - 0.5) * 0.08,
      vy: -0.18 - bob * 0.08,
      ay: -0.04,
      life: 0.26,
      size0: 0.040,
      size1: 0.010,
      r: 255,
      g: 138,
      b: 48,
      a0: 0.50,
    }));
  }
}

function drawFlyingShadow(ctx, presentation) {
  if (!presentation || presentation.progress <= 0.001) return;

  const { shadowX, shadowY, shadowRx, shadowRy, shadowAlpha, wake, wakeKind, progress } = presentation;

  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${(shadowAlpha * 0.45).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(shadowX, shadowY, shadowRx * 1.55, shadowRy * 1.9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(6,8,14,${shadowAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(shadowX, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(0,0,0,${Math.max(0.08, shadowAlpha * 0.42).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(shadowX, shadowY, shadowRx * 0.72, shadowRy * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  if (wake > 0.001) {
    const u = 1 - wake;
    const ringRx = shadowRx + 0.08 + u * 0.24;
    const ringRy = shadowRy + 0.04 + u * 0.10;
    const ringAlpha = wake * (wakeKind === 'land' ? 0.24 : 0.20) * progress;
    ctx.lineWidth = 0.028 + wake * 0.014;
    ctx.strokeStyle = wakeKind === 'land'
      ? `rgba(255,188,120,${ringAlpha.toFixed(3)})`
      : `rgba(120,205,255,${ringAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, ringRx, ringRy, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw a small static star directly above the head of entities tagged with `rare`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawRareStar(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const cy = e.pos.y - 0.65 * scale; // directly above the glyph (glyph spans y-0.5 to y+0.5)
  const R = 0.09 * scale;  // outer point radius
  const r = 0.035 * scale; // inner point radius
  const POINTS = 4;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Soft glow halo behind the star
  const haloR = R * 2.0;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  halo.addColorStop(0, 'rgba(255,255,200,0.20)');
  halo.addColorStop(1, 'rgba(255,240,120,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 4-pointed star shape
  ctx.fillStyle = 'rgba(255,252,200,0.90)';
  ctx.beginPath();
  for (let i = 0; i < POINTS * 2; i++) {
    const angle = (i * Math.PI) / POINTS - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    if (i === 0) ctx.moveTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
    else ctx.lineTo(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a 👁️ icon above blinded entities for the duration of the effect.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawBlindEye(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const cy = e.pos.y - 0.72 * scale;

  // Gentle pulse
  const pulse = 0.85 + Math.sin(fxTime * 2.5) * 0.15;
  const dy = cy + Math.sin(fxTime * 1.8) * 0.025;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Soft violet glow halo
  const haloR = 0.2 * scale;
  const halo = ctx.createRadialGradient(cx, dy, 0, cx, dy, haloR);
  halo.addColorStop(0, `rgba(120,60,200,${(0.25 * pulse).toFixed(2)})`);
  halo.addColorStop(1, 'rgba(100,50,180,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, dy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Eye glyph
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.9 * pulse;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(`${0.32 * scale}px`, '', GAME_ICON_FONT_FAMILY);
  ctx.fillText('\u{1F441}\u{FE0F}', cx, dy);

  ctx.restore();
}

/**
 * Draw a skull above feared entities for the duration of the effect.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawFearSkull(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const cy = e.pos.y - 0.74 * scale;
  const pulse = 0.86 + Math.sin(fxTime * 3.2) * 0.14;
  const dy = cy + Math.sin(fxTime * 2.1) * 0.035 * scale;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const haloR = 0.24 * scale;
  const halo = ctx.createRadialGradient(cx, dy, 0, cx, dy, haloR);
  halo.addColorStop(0, `rgba(190,60,230,${(0.28 * pulse).toFixed(2)})`);
  halo.addColorStop(1, 'rgba(90,20,120,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, dy, haloR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.92 * pulse;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(`${0.34 * scale}px`, '', GAME_ICON_FONT_FAMILY);
  ctx.fillText('\u2620\uFE0F', cx, dy);

  ctx.restore();
}

/**
 * Draw ? marks bubbling up from a confused entity's head — spawn staggered,
 * drift upward with a lazy wobble, grow then fade out.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawConfusedMark(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const headY = e.pos.y - 0.45 * scale;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const COUNT = 4;
  const CYCLE = 2.4;
  for (let j = 0; j < COUNT; j++) {
    const phase = (fxTime + j * (CYCLE / COUNT)) % CYCLE;
    const t = phase / CYCLE; // 0→1 over lifetime
    // Rise from head
    const rise = t * 0.35 * scale;
    // Wobble side to side
    const wobble = Math.sin(t * Math.PI * 3 + j * 1.7) * 0.12 * scale;
    // Start small, grow to full, then shrink out
    const sz = t < 0.2 ? (t / 0.2) * 0.6 : t > 0.75 ? 0.6 + 0.4 * ((1 - t) / 0.25) : 0.6 + 0.4 * Math.min(1, (t - 0.2) / 0.3);
    const alpha = t < 0.1 ? (t / 0.1) : t > 0.6 ? Math.max(0, (1 - t) / 0.4) : 0.85;

    ctx.globalAlpha = alpha;
    ctx.font = canvasFont(`${(0.14 + sz * 0.1) * scale}px`);
    ctx.fillStyle = j % 2 === 0 ? '#f0c030' : '#ffe680';
    ctx.fillText('?', cx + wobble, headY - rise);
  }

  ctx.restore();
}

/**
 * Draw a small sleeping marker above sleeping actors.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 * @param {number} scale
 */
function drawSleepingMarker(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const baseY = e.pos.y - 0.72 * scale;
  const bob = Math.sin(fxTime * 1.7 + (e.id | 0) * 0.31) * 0.035 * scale;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(`${0.24 * scale}px`, '', GAME_ICON_FONT_FAMILY);
  ctx.lineWidth = 0.035 * scale;
  ctx.strokeStyle = 'rgba(8,12,24,0.82)';
  ctx.fillStyle = 'rgba(190,220,255,0.92)';
  ctx.globalAlpha = 0.88 + Math.sin(fxTime * 1.2) * 0.08;
  ctx.strokeText('\u{1F4A4}', cx + 0.12 * scale, baseY + bob);
  ctx.fillText('\u{1F4A4}', cx + 0.12 * scale, baseY + bob);
  ctx.restore();
}

/**
 * Draw a yellow "!" above quest giver NPCs (mirrors drawRareStar pattern).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ id:number, pos:{x:number,y:number} }} e
 * @param {number} fxTime
 */
function drawQuestBang(ctx, e, fxTime, scale = 1) {
  const cx = e.pos.x;
  const cy = e.pos.y - 0.72 * scale;

  // Gentle bob
  const bob = Math.sin(fxTime * 2.0) * 0.03;
  const dy = cy + bob;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Soft yellow glow halo
  const haloR = 0.18 * scale;
  const halo = ctx.createRadialGradient(cx, dy, 0, cx, dy, haloR);
  halo.addColorStop(0, 'rgba(255,220,40,0.25)');
  halo.addColorStop(1, 'rgba(255,200,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, dy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // "!" glyph
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,220,40,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = canvasFont(`${0.32 * scale}px`, 'bold');
  ctx.fillText('!', cx, dy);

  ctx.restore();
}


/**
 * @param {number} n
 */
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Bars are hidden by default and appear when HP changes enough to be informative.
 * Pet bars also stay visible while critically low.
 * @param {{ id:number, hp?:number, maxHp?:number, showHealthBar?:boolean, isPet?:boolean }} e
 * @param {number} now
 */
function shouldShowHealthBar(e, now) {
  if (!e || !e.showHealthBar) return false;
  const maxHp = Math.max(1, Number(e.maxHp) | 0);
  const rawHp = Math.max(0, Math.min(maxHp, Number(e.hp) | 0));
  // Use visual HP — add back damage whose projectile hasn't arrived yet
  const hp = impactTracker.visualHp(e.id, rawHp, maxHp, now);
  if (hp <= 0) {
    _healthBarState.delete(e.id);
    return false;
  }

  const ratio = clamp01(hp / maxHp);
  let state = _healthBarState.get(e.id);
  if (!state) {
    const seededShow = ratio < 1 ? (now + 0.9) : -Infinity;
    state = { hp, ratio, showUntil: seededShow };
    _healthBarState.set(e.id, state);
  } else {
    const hpDelta = Math.abs(hp - state.hp);
    const ratioDelta = Math.abs(ratio - state.ratio);
    const meaningfulHpDelta = Math.max(1, Math.ceil(maxHp * 0.06));
    if (ratioDelta >= HP_BAR_MEANINGFUL_RATIO_DELTA || hpDelta >= meaningfulHpDelta) {
      state.showUntil = now + (e.isPet ? PET_HP_BAR_SHOW_SECONDS : HP_BAR_SHOW_SECONDS);
    }
    state.hp = hp;
    state.ratio = ratio;
  }

  _healthBarSeen.add(e.id);
  if (e.isPet && ratio <= PET_CRITICAL_RATIO) return true;
  return now <= state.showUntil;
}

function pruneHealthBarState() {
  for (const id of _healthBarState.keys()) {
    if (!_healthBarSeen.has(id)) _healthBarState.delete(id);
  }
  _healthBarSeen.clear();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ pos:{x:number,y:number}, hp:number, maxHp:number, isPet?:boolean }} e
 */
function drawEntityHealthBar(ctx, e) {
  const maxHp = Math.max(1, Number(e.maxHp) | 0);
  const rawHp = Math.max(0, Math.min(maxHp, Number(e.hp) | 0));
  const hp = impactTracker.visualHp(e.id, rawHp, maxHp, _fxTime);
  const ratio = clamp01(hp / maxHp);
  const ss = e._sizeScale || 1;
  const width = 0.68 * ss;
  const height = 0.06;
  const y = e.pos.y + (0.22 + 0.21 * ss);
  const x = e.pos.x - (width * 0.5);
  const pad = 0.01;
  const innerW = Math.max(0, width - (pad * 2));
  const innerH = Math.max(0.01, height - (pad * 2));
  const fillW = innerW * ratio;
  const hue = Math.round(120 * ratio);

  ctx.save();
  ctx.fillStyle = 'rgba(10,12,18,0.8)';
  ctx.fillRect(x, y, width, height);
  if (fillW > 0.002) {
    ctx.fillStyle = `hsl(${hue} 85% 48%)`;
    ctx.fillRect(x + pad, y + pad, fillW, innerH);
  }
  ctx.strokeStyle = e.isPet ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 0.014;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

// Reusable Set for per-entity tag checks in the render loop (avoids alloc per frame)
const _renderTagSet = new Set();

function resolveLightingViewport(worldView, vx0, vy0, vx1, vy1) {
  const tw = Math.max(1, Math.ceil(vx1) - Math.floor(vx0) + 2);
  const th = Math.max(1, Math.ceil(vy1) - Math.floor(vy0) + 2);
  const area = tw * th;
  if (area <= LIGHTING_DETAIL_MAX_TILES) {
    return { vx0, vy0, vx1, vy1, capped: false, area };
  }
  const aspect = Math.max(0.35, Math.min(3.5, tw / th));
  const capW = Math.max(24, Math.floor(Math.sqrt(LIGHTING_DETAIL_MAX_TILES * aspect)));
  const capH = Math.max(18, Math.floor(LIGHTING_DETAIL_MAX_TILES / capW));
  const center = worldView?.player?.pos || { x: (vx0 + vx1) * 0.5, y: (vy0 + vy1) * 0.5 };
  const halfW = capW * 0.5;
  const halfH = capH * 0.5;
  return {
    vx0: center.x - halfW,
    vy0: center.y - halfH,
    vx1: center.x + halfW,
    vy1: center.y + halfH,
    capped: true,
    area,
  };
}

function render(worldView) {
  const _rpOn = _renderProfile.enabled === true;
  const _rp = _rpOn ? {
    totalMs: 0,
    fps: _fpsEMA,
    isOverworld: worldView?.isOverworld === true,
    tilesVisited: 0,
    tilesDrawn: 0,
    postTiles: 0,
    itemStackScanned: 0,
    entitiesVisited: 0,
    entitiesDrawn: 0,
    postGlyphs: 0,
    roofsDrawn: 0,
    lightingArea: 0,
    lightingCapped: false,
    stages: {},
  } : null;
  const _rpFrameStart = _rpOn ? performance.now() : 0;
  let _rpStageName = "setup";
  let _rpStageStart = _rpFrameStart;
  function _rpStage(name) {
    if (!_rpOn || !_rp) return;
    const now = performance.now();
    _rp.stages[_rpStageName] = (_rp.stages[_rpStageName] || 0) + (now - _rpStageStart);
    _rpStageName = name;
    _rpStageStart = now;
  }

  const W = _canvasSetup.cssW;
  const H = _canvasSetup.cssH;
  const effectiveWeather = worldView.playerSheltered ? "clear" : (worldView.weather || "clear");
  const playerId = Number(worldView?.player?.id || 0) | 0;
  let playerBlinded = false;
  if (playerId > 0 && Array.isArray(worldView?.entities)) {
    for (let i = 0; i < worldView.entities.length; i++) {
      const e = worldView.entities[i];
      if ((Number(e?.id || 0) | 0) !== playerId) continue;
      playerBlinded = Array.isArray(e.tags) && e.tags.includes("blinded");
      break;
    }
  }
  _renderPlayerBlinded = playerBlinded;
  _rpStage("background");

  // Background (cache gradient by height to avoid per-frame allocations)
  bctx.save();
  if (!_bgGrad || _bgGradH !== H) {
    _bgGrad = bctx.createLinearGradient(0, 0, 0, H);
    _bgGrad.addColorStop(0, "#0b0e16");
    _bgGrad.addColorStop(1, "#0a0c14");
    _bgGradH = H;
  }
  bctx.fillStyle = _bgGrad; bctx.fillRect(0, 0, W, H);
  bctx.restore();

  // Camera transform for world-space draws
  _rpStage("camera");
  bctx.save();
  const _zpOff = getZoomPunchScale(cam);
  if (_zpOff) cam.scale += _zpOff;
  applyCamera(bctx, cam, back);
  if (_zpOff) cam.scale -= _zpOff;

  // Compute view bounds in world units for culling
  const viewHalfW = W * 0.5 / (cam.scale || 1);
  const viewHalfH = H * 0.5 / (cam.scale || 1);
  const vx0 = cam.x - viewHalfW - 1; // add small margin
  const vy0 = cam.y - viewHalfH - 1;
  const vx1 = cam.x + viewHalfW + 1;
  const vy1 = cam.y + viewHalfH + 1;

  if (playerBlinded) {
    bctx.save();
    bctx.fillStyle = "#000";
    bctx.fillRect(vx0 - 1, vy0 - 1, (vx1 - vx0) + 2, (vy1 - vy0) + 2);
    bctx.restore();
  }

  // Pass 1: tiles from TileMap grid (3-state fog-of-war)
  _rpStage("tiles");
  // Single viewport scan: draw visible tiles immediately, buffer explored-not-visible
  // tiles into a flat array, then flush at reduced alpha. This halves the
  // forEachTileInRect iteration cost vs two separate passes (critical in large
  // open areas like the overworld where explored tile count grows with exploration).
  if (worldView.tileGrid) {
    const isVisible = worldView.isVisible;
    const isExplored = worldView.isExplored;
    const tx0 = Math.floor(vx0), ty0 = Math.floor(vy0);
    const tx1 = Math.ceil(vx1),  ty1 = Math.ceil(vy1);
    /** @type {Record<number, string>} */ const tileKinds = /** @type {any} */ (_tileKindMap);
    _exploredTileBuffer.length = 0;
    _postLightingTiles.length = 0;
    // When the lighting engine is active, draw ALL explored tiles at full
    // alpha and let the vision mask handle visibility visually.  This
    // eliminates the blocky tile-level FOV boundary entirely — the smooth
    // sub-tile vision mask is the only visual boundary.
    // On quality=low (no lighting engine), fall back to the old two-pass
    // visible/explored split.
    const _lightingActive = PERF.quality !== 'low';

    if (_lightingActive) {
      worldView.tileGrid.forEachTileInRect(tx0, ty0, tx1, ty1, (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ tile) => {
        if (_rp) _rp.tilesVisited++;
        if ((isVisible && isVisible(x, y)) || (isExplored && isExplored(x, y))) {
          const kind = tileKinds[tile];
          if (kind) {
            drawKind(glyphAtlas, bctx, kind, x, y);
            if (_rp) _rp.tilesDrawn++;
            if (shouldPostLightingRedrawKind(palette, kind, { isOverworld: !!worldView.isOverworld })) {
              _postLightingTiles.push(kind, x, y);
              if (_rp) _rp.postTiles++;
            }
          }
        }
      });
    } else {
      worldView.tileGrid.forEachTileInRect(tx0, ty0, tx1, ty1, (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ tile) => {
        if (_rp) _rp.tilesVisited++;
        if (isVisible && isVisible(x, y)) {
          const kind = tileKinds[tile];
          if (kind) {
            drawKind(glyphAtlas, bctx, kind, x, y);
            if (_rp) _rp.tilesDrawn++;
          }
        } else if (isExplored && isExplored(x, y)) {
          _exploredTileBuffer.push(tile, x, y);
        }
      });
      if (_exploredTileBuffer.length > 0) {
        if (playerBlinded) {
          for (let i = 0; i < _exploredTileBuffer.length; i += 3) {
            const kind = tileKinds[_exploredTileBuffer[i] ?? 0];
            if (!kind) continue;
            drawMemoryGlyph(
              bctx,
              kind,
              _exploredTileBuffer[i + 1] ?? 0,
              _exploredTileBuffer[i + 2] ?? 0,
              0.72,
            );
            if (_rp) _rp.tilesDrawn++;
          }
        } else {
          bctx.globalAlpha = 0.35;
          for (let i = 0; i < _exploredTileBuffer.length; i += 3) {
            const kind = tileKinds[_exploredTileBuffer[i] ?? 0];
            if (kind) {
              drawKind(glyphAtlas, bctx, kind, _exploredTileBuffer[i + 1] ?? 0, _exploredTileBuffer[i + 2] ?? 0);
              if (_rp) _rp.tilesDrawn++;
            }
          }
          bctx.globalAlpha = 1.0;
        }
      }
    }
  }

  _rpStage("surface");
  surfaceAreaFx.tick(_dtSec, worldView, { vx0, vx1, vy0, vy1 }, effectiveWeather);
  surfaceAreaFx.draw(bctx);

  // Pass 1.5: engravings on the ground (between tiles and entities)
  _rpStage("engravings");
  if (worldView.engravings && worldView.engravings.length) {
    const isVis = worldView.isVisible;
    bctx.save();
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    bctx.font = canvasFont('0.32px');
    for (let i = 0; i < worldView.engravings.length; i++) {
      const eng = worldView.engravings[i];
      if (eng.pos.x < vx0 || eng.pos.x > vx1 || eng.pos.y < vy0 || eng.pos.y > vy1) continue;
      const visible = isVis && isVis(eng.pos.x, eng.pos.y);
      bctx.globalAlpha = visible ? 0.6 : 0.2;
      const label = eng.text.length > 8 ? eng.text.slice(0, 7) + '\u2026' : eng.text;
      if (eng.profane && visible) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004 + eng.pos.x * 3.7);
        bctx.shadowColor = 'rgba(255,60,60,0.9)';
        bctx.shadowBlur = 4 + 6 * pulse;
        bctx.fillStyle = '#ff6655';
        bctx.fillText(label, eng.pos.x, eng.pos.y + 0.28);
        bctx.shadowBlur = 0;
        bctx.shadowColor = 'transparent';
      } else {
        bctx.fillStyle = '#8899aa';
        bctx.fillText(label, eng.pos.x, eng.pos.y + 0.28);
      }
    }
    bctx.globalAlpha = 1.0;
    bctx.restore();
  }

  // Pass 2: entities (doors, stairs, monsters, items, player)
  // Keep only the top-most ground item glyph per tile.
  _rpStage("entity_stack");
  _stackMeta.clear(); // "x,y" -> topItemId
  _stackSeqMeta.clear(); // "x,y" -> best stackSeq seen
  _healthBarsToDraw.length = 0;
  _groundLootLabels.length = 0;
  _monsterLabels.length = 0;
  flyingFx.syncWorldView(worldView);
  slideFx.syncWorldView(worldView.entities || []);
  delayedDeathFx.syncWorldView(worldView);
  const renderEntities = delayedDeathFx.getRenderableEntities(worldView.entities);
  if (_rp) _rp.entitiesVisited = renderEntities.length;
  const stackMeta = _stackMeta;
  const stackSeqMeta = _stackSeqMeta;
  for (let i = 0; i < renderEntities.length; i++) {
    const e = renderEntities[i];
    if (e.pos.x < vx0 || e.pos.x > vx1 || e.pos.y < vy0 || e.pos.y > vy1) continue;
    const layer = Number.isFinite(e.layer) ? (e.layer | 0) : 300;
    if (layer !== 250) continue;
    if (_rp) _rp.itemStackScanned++;
    if (throwFx.isItemHidden(e.id)) continue;
    if (delayedDeathFx.isItemHidden(e.id)) continue;
    const tileKey = `${e.pos.x},${e.pos.y}`;
    const seq = (e.stackSeq | 0) || 0;
    const prevSeq = stackSeqMeta.get(tileKey) ?? -1;
    // Higher stackSeq wins; if tied, later id (higher entity ID) wins.
    if (seq > prevSeq || (seq === prevSeq)) {
      stackMeta.set(tileKey, e.id);
      stackSeqMeta.set(tileKey, seq);
    }
  }

  // Draw order: doors/stairs (200) → items (250) → actors (300) → player (400)
  // Entities are sorted by layer, so drawing inline gives correct z-order.
  _aboveRoofEntities.length = 0;
  _postLightingGlyphs.length = 0;

  _rpStage("entities");
  for (let i = 0; i < renderEntities.length; i++) {
    const e = renderEntities[i];
    if (e.pos.x < vx0 || e.pos.x > vx1 || e.pos.y < vy0 || e.pos.y > vy1) continue;
    const k = (typeof e.kind === 'string') ? e.kind : 'default';
    const layer = Number.isFinite(e.layer) ? (e.layer | 0) : 300;

    if (layer === 250) {
      if (throwFx.isItemHidden(e.id) || delayedDeathFx.isItemHidden(e.id)) continue;
      const arcPos = deathLootArcPos(e.id);
      const vOff = e.visualOff || _itemZeroOff;
      const itemRender = arcPos
        ? { ...e, pos: { x: arcPos.x, y: arcPos.y } }
        : (vOff.dx || vOff.dy) ? { ...e, pos: { x: e.pos.x + vOff.dx, y: e.pos.y + vOff.dy } } : e;
      const itemKind = resolveRenderableKind(glyphAtlas, itemRender);
      const paletteBase = (glyphAtlas.get(itemKind) || glyphAtlas.get('default') || {}).baseScale || 1;
      const finalItemScale = (e.itemScale || 1) * paletteBase;
      drawKindScaled(glyphAtlas, bctx, itemKind, itemRender.pos.x, itemRender.pos.y, finalItemScale, e.rotation || 0);
      if (_rp) _rp.entitiesDrawn++;
      // Build tag set once — avoids 15+ O(n) .includes() scans per item
      _renderTagSet.clear();
      if (Array.isArray(itemRender.tags)) for (let _t = 0; _t < itemRender.tags.length; _t++) _renderTagSet.add(itemRender.tags[_t]);
      if (PERF.quality !== 'low' && _renderTagSet.has('glowing')) {
        drawGlowingTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (_renderTagSet.has('venom_glowing')) {
        drawVenomTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('frost_glowing')) {
        drawFrostTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('storm_glowing')) {
        drawStormTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('soul_glowing')) {
        drawSoulTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('blood_glowing')) {
        drawBloodTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('caustic_glowing')) {
        drawCausticTagAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (_renderTagSet.has('legendary_glowing')) {
        drawLegendaryChestAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (_renderTagSet.has('epic_glowing')) {
        drawEpicChestAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (_renderTagSet.has('rare_glowing')) {
        drawRareGlowAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (_renderTagSet.has('potion_glow')) {
        drawPotionGlyphAura(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('rare')) {
        drawRareStar(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('quest_giver')) {
        drawQuestBang(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('blinded')) {
        drawBlindEye(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('fear')) {
        drawFearSkull(bctx, itemRender, _fxTime, finalItemScale);
      }
      if (PERF.quality !== 'low' && _renderTagSet.has('confused')) {
        drawConfusedMark(bctx, itemRender, _fxTime, finalItemScale);
      }
      const topItemId = stackMeta.get(`${e.pos.x},${e.pos.y}`) || 0;
      const playerPos = worldView?.player?.pos;
      if (
        (arcPos || topItemId === e.id)
        && playerPos
        && (!worldView?.isVisible || worldView.isVisible(e.pos.x, e.pos.y))
        && chebyshevScalar(playerPos.x | 0, playerPos.y | 0, e.pos.x | 0, e.pos.y | 0) <= 3
      ) {
        _groundLootLabels.push({
          id: e.id,
          x: itemRender.pos.x,
          y: itemRender.pos.y,
          text: lootLabelFromKind(e.kind, e.id),
          color: lootLabelColorFromTags(e.tags),
        });
      }
      continue;
    }

    // Slide easing — smooth movement between tiles (skip player)
    const isPlayer = (e.layer | 0) === 400;
    const slidePos = isPlayer ? null : slideFx.getPosition(e.id, e.pos.x, e.pos.y);
    const slidEntity = slidePos && slidePos.sliding
      ? { ...e, pos: { x: slidePos.x, y: slidePos.y } }
      : e;

    // Bump lunge — attacker glyphs lurch toward their target (player + monsters)
    const bumpOff = bumpFx.getOffset(e.id);
    const bumpEntity = (bumpOff.dx || bumpOff.dy)
      ? { ...slidEntity, pos: { x: slidEntity.pos.x + bumpOff.dx, y: slidEntity.pos.y + bumpOff.dy } }
      : slidEntity;

    // Recoil — defender jolts away from impact direction + rotation wince
    const recoilOff = recoilFx.getOffset(e.id);
    const recoilEntity = (recoilOff.dx || recoilOff.dy)
      ? { ...bumpEntity, pos: { x: bumpEntity.pos.x + recoilOff.dx, y: bumpEntity.pos.y + recoilOff.dy } }
      : bumpEntity;

    const flyingPresentation = flyingFx.getPresentation(recoilEntity, _fxTime, cam.scale);
    const renderEntity = flyingPresentation.progress > 0.001
      ? { ...recoilEntity, pos: { x: flyingPresentation.glyphX, y: flyingPresentation.glyphY } }
      : recoilEntity;

    // Size-class scaling — small creatures render smaller, big ones bigger
    const sizeScale = SIZE_CLASS_SCALE[e.sizeClass] || 1;
    const entityScale = flyingPresentation.glyphScale * sizeScale *
      (hasTag(e, 'altar_offering') ? (e.itemScale || 1) : 1);
    const entityRotation = recoilOff.rotation || 0;

    // Build tag set once — avoids 20+ O(n) .includes() scans per actor
    _renderTagSet.clear();
    if (Array.isArray(renderEntity.tags)) for (let _t = 0; _t < renderEntity.tags.length; _t++) _renderTagSet.add(renderEntity.tags[_t]);

    // Collect candidates for post-roof redraw (tiny list — avoids full re-scan later)
    if (_renderTagSet.has('flying') || _renderTagSet.has('above_roof')) _aboveRoofEntities.push(e);

    if (_renderTagSet.has('thermal_sensed')) {
      drawThermalSensePing(bctx, renderEntity, _fxTime);
      continue;
    }

    drawFlyingShadow(bctx, flyingPresentation);
    drawEntityGlyph(glyphAtlas, bctx, renderEntity, entityScale, entityRotation);
    drawDungeonEntranceBadge(bctx, renderEntity);
    if (_rp) _rp.entitiesDrawn++;
    if (shouldPostLightingRedrawKind(palette, renderEntity.kind, { isOverworld: !!worldView.isOverworld, layer: renderEntity.layer })) {
      _postLightingGlyphs.push({
        entity: renderEntity,
        scale: entityScale,
        rotation: entityRotation,
      });
      if (_rp) _rp.postGlyphs++;
    }
    if (_renderTagSet.has('esp_sensed')) {
      drawEspSenseHalo(bctx, renderEntity, _fxTime);
    }
    if ((renderEntity.layer | 0) >= 300 && !_renderTagSet.has('memory_recent') && !_renderTagSet.has('esp_sensed')) {
      drawFacingDot(bctx, renderEntity);
    }
    if (shouldShowHealthBar(renderEntity, _fxTime)) {
      _healthBarsToDraw.push({ ...renderEntity, _sizeScale: sizeScale });
    }

    // Actor name labels — hostile actors, pets, town NPCs, and tagged named actors.
    if (
      (renderEntity.layer | 0) === 300
      && (renderEntity.showHealthBar || renderEntity.isNpc || renderEntity.showNameLabel)
      && !_renderTagSet.has('memory_recent')
      && !_renderTagSet.has('esp_sensed')
      && !_renderTagSet.has('thermal_sensed')
      && (!worldView?.isVisible || worldView.isVisible(renderEntity.pos.x, renderEntity.pos.y))
    ) {
      const label = (renderEntity.isNpc || renderEntity.showNameLabel)
        ? (String(renderEntity.displayName || '').trim() || monsterLabelFromKind(renderEntity.kind))
        : monsterLabelFromKind(renderEntity.kind);
      if (label) {
        _monsterLabels.push({
          id: renderEntity.id,
          x: renderEntity.pos.x,
          y: renderEntity.pos.y,
          text: label,
          color: '#e8d4c0',
          sizeScale,
        });
      }
    }

    // Spawner (nest) labels — show "Rat Nest" etc. when visible
    if (
      renderEntity.kind === 'spawner'
      && (!worldView?.isVisible || worldView.isVisible(renderEntity.pos.x, renderEntity.pos.y))
    ) {
      const ni = world.get(renderEntity.id, NamedIdentity);
      if (ni?.name) {
        _monsterLabels.push({
          id: renderEntity.id,
          x: renderEntity.pos.x,
          y: renderEntity.pos.y,
          text: ni.name,
          color: '#8b4513',
          sizeScale,
        });
      }
    }

    // Glyph-FX: passive glow aura for entities tagged "glowing"
    if (PERF.quality !== 'low' && _renderTagSet.has('glowing')) {
      drawGlowingTagAura(bctx, renderEntity, _fxTime);
    }
    if (_renderTagSet.has('venom_glowing')) {
      drawVenomTagAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('frost_glowing')) {
      drawFrostTagAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('storm_glowing')) {
      drawStormTagAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('soul_glowing')) {
      drawSoulTagAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('blood_glowing')) {
      drawBloodTagAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('caustic_glowing')) {
      drawCausticTagAura(bctx, renderEntity, _fxTime);
    }
    if (_renderTagSet.has('legendary_glowing')) {
      drawLegendaryChestAura(bctx, renderEntity, _fxTime);
    }
    if (_renderTagSet.has('epic_glowing')) {
      drawEpicChestAura(bctx, renderEntity, _fxTime);
    }
    if (_renderTagSet.has('rare_glowing')) {
      drawRareGlowAura(bctx, renderEntity, _fxTime);
    }
    if (_renderTagSet.has('potion_glow')) {
      drawPotionGlyphAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('rare')) {
      drawRareStar(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('quest_giver')) {
      drawQuestBang(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('blinded')) {
      drawBlindEye(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('fear')) {
      drawFearSkull(bctx, renderEntity, _fxTime, entityScale);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('confused')) {
      drawConfusedMark(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('sleeping')) {
      drawSleepingMarker(bctx, renderEntity, _fxTime, entityScale);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('invisible')) {
      drawInvisibleVeil(bctx, renderEntity, _fxTime, _renderTagSet.has('shadow_cloak'));
    }
    if (PERF.quality !== 'low' && _renderTagSet.has('stoneskin')) {
      drawStoneskinWardAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && (_renderTagSet.has('resist_fire') || _renderTagSet.has('resist_poison') || _renderTagSet.has('resist_electric') || _renderTagSet.has('resist_acid'))) {
      drawHarmonyWardGlowAura(bctx, renderEntity, _fxTime);
    }
    if (PERF.quality !== 'low' && _renderTagSet.has(WARD_BUBBLE_RESERVED_TAG)) {
      drawWardBubbleAura(bctx, renderEntity, _fxTime);
    }

    // Glyph-FX: grid bug multi-color cycle (purple ↔ cyan)
    if (PERF.quality !== 'low' && k === 'grid_bug') {
      const t = _fxTime * 3.0;               // 3 Hz cycle
      const pct = (Math.sin(t) + 1) * 0.5;   // 0 → 1 → 0
      const r = Math.round(187 + (68  - 187) * pct);
      const g = Math.round(102 + (204 - 102) * pct);
      const b = Math.round(255 + (255 - 255) * pct);
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      bctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
      bctx.beginPath();
      bctx.arc(renderEntity.pos.x, renderEntity.pos.y, 0.35, 0, Math.PI * 2);
      bctx.fill();
      bctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
      bctx.lineWidth = 0.06;
      const rad = 0.42 + 0.04 * Math.sin(t * 1.7);
      bctx.beginPath();
      bctx.arc(renderEntity.pos.x, renderEntity.pos.y, rad, 0, Math.PI * 2);
      bctx.stroke();
      bctx.restore();
    }

    // Glyph-FX: invulnerability aegis ward
    if (PERF.quality !== 'low' && _renderTagSet.has('invulnerable')) {
      drawAegisWardGlyphFx(
        bctx,
        '@',
        renderEntity.pos.x,
        renderEntity.pos.y,
        1.0,
        _fxTime,
        0,
        (renderEntity.id | 0) ^ 0xA381,
        renderEntity.pos.y,
        { gain: 1 }
      );
    }

    // Glyph-FX: frozen — pulsing icy blue radial glow (outer halo + bright inner core)
    if (PERF.quality !== 'low' && _renderTagSet.has('frozen')) {
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 1.4);
      const cx = renderEntity.pos.x, cy = renderEntity.pos.y;
      // Outer halo — wide, soft
      const rOuter = 0.70 + 0.08 * pulse;
      const outer = bctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
      outer.addColorStop(0,   `rgba(160,230,255,${(0.45 + 0.20 * pulse).toFixed(3)})`);
      outer.addColorStop(0.5, `rgba(80,180,255,${(0.20 + 0.10 * pulse).toFixed(3)})`);
      outer.addColorStop(1,   'rgba(40,120,255,0)');
      bctx.fillStyle = outer;
      bctx.beginPath();
      bctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      bctx.fill();
      // Inner core — tight, bright
      const rInner = 0.28 + 0.04 * pulse;
      const inner = bctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
      inner.addColorStop(0, `rgba(220,245,255,${(0.55 + 0.25 * pulse).toFixed(3)})`);
      inner.addColorStop(1, 'rgba(100,200,255,0)');
      bctx.fillStyle = inner;
      bctx.beginPath();
      bctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
    }

    // Glyph-FX: electric shock — soft aura with sparks orbiting outside the glyph
    // Glyph-FX: electric shock — chaotic arcs from center, geometry rerolled every discharge
    if (PERF.quality !== 'low' && _renderTagSet.has('shocked')) {
      bctx.save();
      const cx = renderEntity.pos.x, cy = renderEntity.pos.y;
      const _sid = (renderEntity.id || 0) | 0;
      // Static hash: stable per-arc properties (base angle, frequency, phase)
      const _sh  = (n) => ((Math.imul(n * 73 + 1, 2654435761) ^ Math.imul(_sid | 1, 1664525)) >>> 0) / 4294967296;
      // Fire-event hash: rerolls geometry on every new discharge
      const _shF = (i, fi, s) => ((Math.imul((i * 97 + fi * 31 + s + 1) * 73 + 1, 2654435761) ^ Math.imul(_sid | 1, 1664525)) >>> 0) / 4294967296;

      bctx.globalCompositeOperation = 'lighter';
      bctx.lineCap = 'round'; bctx.lineJoin = 'round';

      // Soft ambient glow
      const _aura = 0.60 + 0.40 * Math.sin(_fxTime * 2.3 + _sh(99) * Math.PI * 2);
      const _fg = bctx.createRadialGradient(cx, cy, 0.05, cx, cy, 0.80);
      _fg.addColorStop(0,   `rgba(100,210,255,${(0.22 * _aura).toFixed(3)})`);
      _fg.addColorStop(0.6, `rgba(40,140,220,${(0.08 * _aura).toFixed(3)})`);
      _fg.addColorStop(1,   'rgba(0,80,200,0)');
      bctx.fillStyle = _fg;
      bctx.beginPath(); bctx.arc(cx, cy, 0.80, 0, Math.PI * 2); bctx.fill();

      // 14 arcs — each fires at its own rate, geometry randomised per discharge
      for (let _i = 0; _i < 14; _i++) {
        const _baseAng = _sh(_i * 5 + 1) * Math.PI * 2;   // stable base direction
        const _freq    = 3.0 + _sh(_i * 5 + 2) * 10.0;   // 3–13 Hz, wide spread
        const _phase   = _sh(_i * 5 + 3) * Math.PI * 2;
        const _bright  = Math.max(0, Math.sin(_fxTime * _freq + _phase));
        if (_bright < 0.05) continue;

        // Fire-event counter — integer that increments each new discharge
        const _fi = Math.floor(_fxTime * _freq + _phase) | 0;

        // Geometry rerolled every discharge via _shF
        const _ang  = _baseAng + (_shF(_i, _fi, 0) - 0.5) * 0.9;       // angle wobbles ±0.45 rad
        const _len  = 0.35 + _shF(_i, _fi, 1) * 0.40;                  // 0.35–0.75
        const _perp = _ang + Math.PI / 2;
        // Two kink points — independently jittered perpendicular each fire
        const _j1   = (_shF(_i, _fi, 2) - 0.5) * _len * 0.70;
        const _j2   = (_shF(_i, _fi, 3) - 0.5) * _len * 0.50;
        const _t1   = 0.30 + _shF(_i, _fi, 4) * 0.20;                  // kink 1 at 30–50%
        const _t2   = 0.62 + _shF(_i, _fi, 5) * 0.18;                  // kink 2 at 62–80%
        const _k1x  = cx + Math.cos(_ang) * _len * _t1 + Math.cos(_perp) * _j1;
        const _k1y  = cy + Math.sin(_ang) * _len * _t1 + Math.sin(_perp) * _j1;
        const _k2x  = cx + Math.cos(_ang) * _len * _t2 + Math.cos(_perp) * _j2;
        const _k2y  = cy + Math.sin(_ang) * _len * _t2 + Math.sin(_perp) * _j2;
        const _ex   = cx + Math.cos(_ang) * _len;
        const _ey   = cy + Math.sin(_ang) * _len;
        const _alpha = 0.55 + 0.45 * _bright;

        const _drawArc = () => { bctx.beginPath(); bctx.moveTo(cx, cy); bctx.lineTo(_k1x, _k1y); bctx.lineTo(_k2x, _k2y); bctx.lineTo(_ex, _ey); bctx.stroke(); };

        // Cyan glow
        bctx.save();
        bctx.globalAlpha = _alpha * 0.40;
        bctx.lineWidth = 0.12; bctx.strokeStyle = 'rgba(60,200,255,0.90)';
        _drawArc();
        bctx.restore();
        // White-hot core
        bctx.save();
        bctx.globalAlpha = _alpha;
        bctx.lineWidth = 0.045; bctx.strokeStyle = 'rgba(235,250,255,0.98)';
        _drawArc();
        bctx.restore();
        // Tip spark
        bctx.save();
        bctx.globalAlpha = _alpha * 0.85;
        bctx.fillStyle = 'rgba(210,245,255,0.95)';
        bctx.beginPath(); bctx.arc(_ex, _ey, 0.050, 0, Math.PI * 2); bctx.fill();
        bctx.restore();
      }

      bctx.restore();
    }

    // Glyph-FX: simple green thorn spikes ring when wearing Thorns gear
    if (PERF.quality !== 'low' && _renderTagSet.has('thorns')) {
      /** @type {CanvasRenderingContext2D} */
      const g = /** @type any */ (bctx);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const cx = renderEntity.pos.x, cy = renderEntity.pos.y;
      // soft inner glow
      g.fillStyle = 'rgba(120,255,120,0.10)';
      g.beginPath(); g.arc(cx, cy, 0.36, 0, Math.PI * 2); g.fill();
      // spikes
      const n = 8; // keep it subtle
      const base = 0.30; const out = 0.52;
      const wob = 0.02 * Math.sin(_fxTime * 5.0);
      g.lineWidth = 0.06;
      g.strokeStyle = 'rgba(120,255,120,0.85)';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + _fxTime * 0.8; // slow rotation
        const x0 = cx + Math.cos(a) * base;
        const y0 = cy + Math.sin(a) * base;
        const x1 = cx + Math.cos(a) * (out + wob);
        const y1 = cy + Math.sin(a) * (out + wob);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      // faint outer ring
      g.strokeStyle = 'rgba(120,255,160,0.35)';
      g.lineWidth = 0.05;
      g.beginPath(); g.arc(cx, cy, out + 0.02, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    // Glyph-FX: flickering fire aura (unused — burning uses particles only)
    if (PERF.quality !== 'low' && _renderTagSet.has('_fire_aura')) {
      /** @type {CanvasRenderingContext2D} */
      const g = /** @type any */ (bctx);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const cx = renderEntity.pos.x, cy = renderEntity.pos.y;

      // Inner warm glow (pulsing)
      const pulse = 0.08 + 0.04 * Math.sin(_fxTime * 8.0);
      g.fillStyle = `rgba(255,120,20,${(0.12 + pulse).toFixed(2)})`;
      g.beginPath(); g.arc(cx, cy, 0.38, 0, Math.PI * 2); g.fill();

      // Flickering flame tongues (6 short strokes radiating outward)
      const nf = 6;
      const fBase = 0.28;
      g.lineWidth = 0.07;
      for (let j = 0; j < nf; j++) {
        const a = (j / nf) * Math.PI * 2 + _fxTime * 1.5;
        const flicker = 0.04 * Math.sin(_fxTime * 12.0 + j * 2.1);
        const tip = 0.42 + flicker;
        const x0 = cx + Math.cos(a) * fBase;
        const y0 = cy + Math.sin(a) * fBase;
        const x1 = cx + Math.cos(a) * tip;
        const y1 = cy + Math.sin(a) * tip;
        g.strokeStyle = (j % 2 === 0) ? 'rgba(255,160,40,0.85)' : 'rgba(255,80,20,0.75)';
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }

      // Outer heat ring (subtle, wobbly)
      g.strokeStyle = 'rgba(255,100,30,0.30)';
      g.lineWidth = 0.04;
      const rOuter = 0.46 + 0.03 * Math.sin(_fxTime * 6.0);
      g.beginPath(); g.arc(cx, cy, rOuter, 0, Math.PI * 2); g.stroke();

      g.restore();
    }

    // Glyph-FX: spinning 4-point stars above stunned entities
    if (PERF.quality !== 'low' && _renderTagSet.has('stunned')) {
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      bctx.lineWidth = 0.035;
      bctx.globalAlpha = 0.9;
      for (let j = 0; j < 3; j++) {
        const ang = _fxTime * 2.2 + (j / 3) * Math.PI * 2;
        const sx = renderEntity.pos.x + Math.cos(ang) * 0.32;
        const sy = renderEntity.pos.y + Math.sin(ang) * 0.12 - 0.52; // flattened orbit above head
        const r = 0.10;
        bctx.strokeStyle = j === 1 ? '#ffffff' : '#ffe033';
        bctx.beginPath();
        bctx.moveTo(sx - r, sy);           bctx.lineTo(sx + r, sy);
        bctx.moveTo(sx, sy - r);           bctx.lineTo(sx, sy + r);
        bctx.moveTo(sx - r*0.7, sy - r*0.7); bctx.lineTo(sx + r*0.7, sy + r*0.7);
        bctx.moveTo(sx + r*0.7, sy - r*0.7); bctx.lineTo(sx - r*0.7, sy + r*0.7);
        bctx.stroke();
      }
      bctx.restore();
    }

    // Glyph-FX: bleeding wound — pulsing red aura (particles handle the trail)
    if (PERF.quality !== 'low' && _renderTagSet.has('bleeding')) {
      bctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 7.0 + renderEntity.id * 0.3);
      bctx.globalCompositeOperation = 'source-over';
      bctx.fillStyle = `rgba(160,0,0,${(0.08 + 0.07 * pulse).toFixed(3)})`;
      bctx.beginPath();
      bctx.arc(renderEntity.pos.x, renderEntity.pos.y, 0.44 + 0.04 * pulse, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
    }

    // Glyph-FX: poisoned — pulsing green glow
    if (PERF.quality !== 'low' && _renderTagSet.has('poisoned')) {
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 3.5 + renderEntity.id * 1.3);
      const cx = renderEntity.pos.x, cy = renderEntity.pos.y;
      // Outer soft glow
      const rOuter = 0.62 + 0.08 * pulse;
      const outerGrad = bctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
      const outerA = 0.30 + 0.15 * pulse;
      outerGrad.addColorStop(0, `rgba(50,220,70,${outerA.toFixed(3)})`);
      outerGrad.addColorStop(0.5, `rgba(40,190,55,${(outerA * 0.5).toFixed(3)})`);
      outerGrad.addColorStop(1, 'rgba(20,140,35,0)');
      bctx.fillStyle = outerGrad;
      bctx.beginPath();
      bctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      bctx.fill();
      // Inner bright core
      const rInner = 0.30 + 0.05 * pulse;
      const innerGrad = bctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
      const innerA = 0.35 + 0.20 * pulse;
      innerGrad.addColorStop(0, `rgba(100,255,120,${innerA.toFixed(3)})`);
      innerGrad.addColorStop(1, 'rgba(60,230,80,0)');
      bctx.fillStyle = innerGrad;
      bctx.beginPath();
      bctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
    }

    // Glyph-FX: agony — pulsing dark purple shadow aura
    if (PERF.quality !== 'low' && _renderTagSet.has('agony')) {
      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.5 * Math.sin(_fxTime * 4.0 + renderEntity.id * 0.7);
      const cx = renderEntity.pos.x, cy = renderEntity.pos.y;
      // Outer shadow haze
      const rOuter = 0.65 + 0.12 * pulse;
      const outerGrad = bctx.createRadialGradient(cx, cy, 0, cx, cy, rOuter);
      const outerA = 0.32 + 0.18 * pulse;
      outerGrad.addColorStop(0, `rgba(160,50,220,${outerA.toFixed(3)})`);
      outerGrad.addColorStop(0.55, `rgba(110,25,170,${(outerA * 0.50).toFixed(3)})`);
      outerGrad.addColorStop(1, 'rgba(50,10,90,0)');
      bctx.fillStyle = outerGrad;
      bctx.beginPath();
      bctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      bctx.fill();
      // Inner bright core
      const rInner = 0.30 + 0.06 * pulse;
      const innerGrad = bctx.createRadialGradient(cx, cy, 0, cx, cy, rInner);
      const innerA = 0.48 + 0.28 * pulse;
      innerGrad.addColorStop(0, `rgba(200,80,255,${innerA.toFixed(3)})`);
      innerGrad.addColorStop(1, 'rgba(130,40,200,0)');
      bctx.fillStyle = innerGrad;
      bctx.beginPath();
      bctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
    }

    // Glyph-FX: proc state badges (doom_clock, cataclysm_mark, etc.) — above-right of entity
    if (renderEntity.procStates) {
      drawProcStateBadges(bctx, renderEntity.pos.x, renderEntity.pos.y, renderEntity.procStates, _fxTime, renderEntity.id);
    }

    if (_renderTagSet.has('rooted')) {
      drawRootedVines(bctx, renderEntity.pos.x, renderEntity.pos.y, _fxTime, renderEntity.id);
    }

    // Equipment corner badges — melee right, ranged/zap bottom-left, shield top-left
    if (renderEntity.equipBadges) {
      const eb = renderEntity.equipBadges;
      const resolved = {};
      if (eb.weaponIdentity) {
        const pe = palette[eb.weaponIdentity];
        if (pe) { resolved.weaponGlyph = pe.glyph; resolved.weaponColor = pe.fg; }
        else { resolved.weaponGlyph = ')'; resolved.weaponColor = '#bbbbbb'; }
      }
      if (eb.offhandIdentity) {
        const pe = palette[eb.offhandIdentity];
        if (pe) { resolved.offhandGlyph = pe.glyph; resolved.offhandColor = pe.fg; }
        else { resolved.offhandGlyph = ')'; resolved.offhandColor = '#bbbbbb'; }
      }
      if (eb.rangedIdentity) {
        const pe = palette[eb.rangedIdentity];
        if (pe) { resolved.rangedGlyph = pe.glyph; resolved.rangedColor = pe.fg; }
        else { resolved.rangedGlyph = ')'; resolved.rangedColor = '#88bbdd'; }
      }
      if (eb.shieldIdentity) {
        const pe = palette[eb.shieldIdentity];
        if (pe) { resolved.shieldGlyph = pe.glyph; resolved.shieldColor = pe.fg; }
        else { resolved.shieldGlyph = '['; resolved.shieldColor = '#88bbdd'; }
      }
      drawEquipmentBadges(bctx, renderEntity.pos.x, renderEntity.pos.y, resolved, _fxTime, renderEntity.id);
    }
  }



  drawGroundLootLabels(bctx, _groundLootLabels, _fxTime);
  drawMonsterLabels(bctx, _monsterLabels, _fxTime);

  for (let i = 0; i < _healthBarsToDraw.length; i++) {
    drawEntityHealthBar(bctx, _healthBarsToDraw[i]);
  }
  pruneHealthBarState();

  // ---- Lighting engine pass (SDF sub-tile overlay) --------------------------
  // Placed before spell FX so bolts/meteors/projectiles appear bright on top
  // of the darkness, while tiles + entities are properly darkened.
  _rpStage("lighting");
  if (PERF.quality !== 'low') {
    const _lights = collectLightSources(worldView, { quality: PERF.quality, fxTime: _fxTime, dt: _dtSec });
    collectFxLights(_lights, { boltFx, spellAreaFx, projectileFx, cloudFx, surfaceAreaFx, statusEmitterFx, spiritWispFx, sparksFx });
    const _ambient = computeAmbient(worldView);
    const _roofMask = worldView.isOverworld ? isRoofed : null;
    const _shelterInterior = collectShelterInteriorKeys(worldView);
    const _visionDef = getVisionDef();
    const _lightOpaque = worldView.isBlockedVision || isOpaque;
    const _lightViewport = resolveLightingViewport(worldView, vx0, vy0, vx1, vy1);
    if (_rp) {
      _rp.lightingArea = _lightViewport.area;
      _rp.lightingCapped = _lightViewport.capped;
    }
    if (_lightViewport.capped) {
      bctx.save();
      bctx.globalCompositeOperation = "source-over";
      bctx.fillStyle = "rgba(0,0,0,0.72)";
      if (_lightViewport.vy0 > vy0) bctx.fillRect(vx0 - 1, vy0 - 1, (vx1 - vx0) + 2, _lightViewport.vy0 - vy0);
      if (_lightViewport.vy1 < vy1) bctx.fillRect(vx0 - 1, _lightViewport.vy1, (vx1 - vx0) + 2, vy1 - _lightViewport.vy1 + 1);
      if (_lightViewport.vx0 > vx0) bctx.fillRect(vx0 - 1, _lightViewport.vy0, _lightViewport.vx0 - vx0, _lightViewport.vy1 - _lightViewport.vy0);
      if (_lightViewport.vx1 < vx1) bctx.fillRect(_lightViewport.vx1, _lightViewport.vy0, vx1 - _lightViewport.vx1 + 1, _lightViewport.vy1 - _lightViewport.vy0);
      bctx.restore();
    }

    // Dirty-field: detect player movement / facing change → invalidate vision.
    // Detect game-step advance → invalidate geometry (handles pickaxe, doors, etc.)
    {
      const pp = worldView.player?.pos;
      const pf = worldView.playerFacing;
      const px = pp ? pp.x : -1, py = pp ? pp.y : -1;
      const fdx = pf ? pf.dx : 0, fdy = pf ? pf.dy : 0;
      const step = world.step || 0;
      if (px !== _prevLightPX || py !== _prevLightPY
        || fdx !== _prevLightFDX || fdy !== _prevLightFDY) {
        lightingEngine.invalidateVision();
        _prevLightPX = px; _prevLightPY = py;
        _prevLightFDX = fdx; _prevLightFDY = fdy;
      }
      // Any game step could change geometry (pickaxe, door, meteor) — invalidate
      // the SDF once per step so we don't miss structural changes.
      if (step !== _prevLightStep) {
        lightingEngine.invalidateGeometry();
        lightingEngine.invalidateSurface();
        _prevLightStep = step;
      }
    }

    lightingEngine.render(
      bctx,
      _lights,
      _lightOpaque,
      _lightViewport.vx0,
      _lightViewport.vy0,
      _lightViewport.vx1,
      _lightViewport.vy1,
      _ambient,
      210,
      _roofMask,
      _visionDef,
      surfaceAreaFx.getSurfaceRegions(),
      _fxTime,
      worldView.currentDepth ?? 0,
      {
        playerSheltered: worldView.playerSheltered === true,
        isShelterInterior: (x, y) => _shelterInterior.has(roofCellKey(x, y)),
      },
    );
  }

  _rpStage("post_lighting");
  if (_postLightingTiles.length > 0) {
    for (let i = 0; i < _postLightingTiles.length; i += 3) {
      drawKindForeground(glyphAtlas, bctx, _postLightingTiles[i], _postLightingTiles[i + 1], _postLightingTiles[i + 2]);
    }
  }

  if (_postLightingGlyphs.length > 0) {
    for (let i = 0; i < _postLightingGlyphs.length; i++) {
      const rec = _postLightingGlyphs[i];
      drawEntityGlyphForeground(glyphAtlas, bctx, rec.entity, rec.scale, rec.rotation);
    }
  }

  drawWorldEffects({
    bctx,
    worldView,
    glyphAtlas,
    boltFx,
    spellAreaFx,
    projectileFx,
    throwFx,
    pickupFx,
    cloudFx,
    spiritWispFx,
    deathEssenceFx,
    meleeSlashFx,
    aggroFx,
    fx,
    PERF,
  });

  // Weather particles (rain) drawn above entities but under roofs
  // Suppress when player is sheltered indoors (intact roof overhead)
  _rpStage("weather_roofs");
  weatherFx.tick(_dtSec, effectiveWeather, { vx0, vx1, vy0, vy1 }, cam);
  weatherFx.draw(bctx, cam);

  _roofCoverKeys.clear();
  if (Array.isArray(worldView?.roofs) && worldView.roofs.length) {
    for (let i = 0; i < worldView.roofs.length; i++) {
      const roof = worldView.roofs[i];
      if (roof.x < vx0 || roof.x > vx1 || roof.y < vy0 || roof.y > vy1) continue;
      _roofCoverKeys.add(roofCellKey(roof.x, roof.y));
      bctx.globalAlpha = Number.isFinite(roof.alpha) ? roof.alpha : 1.0;
      drawKind(glyphAtlas, bctx, roof.kind, roof.x, roof.y);
      if (_rp) _rp.roofsDrawn++;
      drawRoofSmoke(bctx, roof, _fxTime, fx, PERF.quality);
    }
    bctx.globalAlpha = 1.0;
  }
  if (typeof cloudFx.drawBurnPlumes === 'function') {
    cloudFx.drawBurnPlumes(bctx);
  }

  if (_roofCoverKeys.size > 0) {
    for (let i = 0; i < _aboveRoofEntities.length; i++) {
      const e = _aboveRoofEntities[i];
      if (e.pos.x < vx0 || e.pos.x > vx1 || e.pos.y < vy0 || e.pos.y > vy1) continue;
      if (!_roofCoverKeys.has(roofCellKey(e.pos.x, e.pos.y))) continue;
      const eTags = Array.isArray(e.tags) ? e.tags : [];

      if (eTags.includes('flying')) {
        const slidePos2 = slideFx.getPosition(e.id, e.pos.x, e.pos.y);
        const slidEntity2 = slidePos2.sliding ? { ...e, pos: { x: slidePos2.x, y: slidePos2.y } } : e;
        const bumpOff2 = bumpFx.getOffset(e.id);
        const bumpEntity2 = (bumpOff2.dx || bumpOff2.dy)
          ? { ...slidEntity2, pos: { x: slidEntity2.pos.x + bumpOff2.dx, y: slidEntity2.pos.y + bumpOff2.dy } }
          : slidEntity2;
        const recoilOff2 = recoilFx.getOffset(e.id);
        const recoilEntity2 = (recoilOff2.dx || recoilOff2.dy)
          ? { ...bumpEntity2, pos: { x: bumpEntity2.pos.x + recoilOff2.dx, y: bumpEntity2.pos.y + recoilOff2.dy } }
          : bumpEntity2;
        const flyingPresentation = flyingFx.getPresentation(recoilEntity2, _fxTime, cam.scale);
        const renderEntity = flyingPresentation.progress > 0.001
          ? { ...recoilEntity2, pos: { x: flyingPresentation.glyphX, y: flyingPresentation.glyphY } }
          : recoilEntity2;
        const roofSizeScale = SIZE_CLASS_SCALE[e.sizeClass] || 1;

        const roofRotation = recoilOff2.rotation || 0;
        drawFlyingShadow(bctx, flyingPresentation);
        drawEntityGlyph(glyphAtlas, bctx, renderEntity, flyingPresentation.glyphScale * roofSizeScale, roofRotation);
        if (shouldShowHealthBar(renderEntity, _fxTime)) {
          drawEntityHealthBar(bctx, renderEntity);
        }
      } else if (eTags.includes('above_roof')) {
        drawEntityGlyph(glyphAtlas, bctx, e);
      }
    }
  }

  drawTargetingReticle({
    bctx,
    targetCursor: get_targetCursor(),
    pendingSpellTargeting: get_pendingSpellTargeting(),
    hasPendingSpellTargeting: !!get_pendingSpellTargeting(),
    hasPendingThrowTargeting: !!get_pendingThrowTargeting(),
    hasPendingEnemyTargeting: !!get_pendingEnemyTargeting(),
    fxTime: _fxTime,
  });

  // Float text is the top-most world-space layer so roofs and cover never occlude it.
  ftext.render(bctx);

  bctx.restore();

  // Present backbuffer once (reset transform to identity for exact pixel copy)
  _rpStage("present");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(back, 0, 0);
  ctx.restore();

  // Heavy rain dark tint overlay (also suppressed indoors)
  _rpStage("screen_fx");
  weatherFx.drawScreenTint(ctx, W, H, effectiveWeather);

  // Night / dawn / dusk tints replaced by lighting engine ambient (sun/moon).
  // Falls back to CSS tints on quality=low where the engine is disabled.
  if (PERF.quality === 'low') {
    if (worldView.nightAlpha > 0.01) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(8, 12, 28, ${(worldView.nightAlpha * 0.38).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (worldView.dawnAlpha > 0.01) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(255, 150, 40, ${(worldView.dawnAlpha * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    if (worldView.duskAlpha > 0.01) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(210, 70, 20, ${(worldView.duskAlpha * 0.16).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  // Death VFX screen overlays: desaturation, vignette, flash
  deathVfx.drawDesaturation(ctx, W, H);
  deathVfx.drawLowHpVignette(ctx, W, H, _fxTime);
  deathVfx.drawDeathFlash(ctx, W, H);

  // Screen-space wrath flash drawn after world present so lethal hits still read.
  drawScreenEffects({ ctx, W, H, boltFx });
  teleportFx.draw(ctx, W, H);

  if (_rpOn && _rp) {
    _rpStage("profile");
    const now = performance.now();
    _rp.stages[_rpStageName] = (_rp.stages[_rpStageName] || 0) + (now - _rpStageStart);
    _rp.totalMs = now - _rpFrameStart;
    _renderProfile.lastFrame = _rp;
  }
  drawRulesProfilerOverlay({ ctx, quality: PERF.quality, prof: /** @type any */ (window).__JSHACK_RULES_PROF });
  drawRenderProfilerOverlay({ ctx, quality: PERF.quality, prof: _renderProfile });
  speechBubbleLayer.render((speechCtx) => sceneRuntime.drawSpeechBubble(speechCtx));
}

// ---- Frame loop (FXClock) --------------------------------------------------
let last = performance.now();
let _fpsEMA = 0; // FX FPS (EMA)
const MAX_FRAME_DT_SEC = 0.10;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    _dtSec = 0;
  });
}
function frame(now) {
    /** @type {DOMHighResTimeStamp} */
    // @ts-ignore - annotate for JS type checking
  const dtSec = Math.min(MAX_FRAME_DT_SEC, Math.max(0, (now - last) / 1000));
  last = now;

  // Update FX FPS (exponential moving average for stability)
  const instFps = dtSec > 0 ? (1 / dtSec) : 0;
  _fpsEMA = _fpsEMA ? (_fpsEMA * 0.9 + instFps * 0.1) : instFps;
  // Hitstop: scale display dt (gore, bumps, particles all slow in unison)
  const displayDt = hitstopFx.scale(dtSec);
  _fxTime += displayDt;
  _dtSec = displayDt;
  impactTracker.flush(_fxTime);

  // Sim step is scene-controlled; keep paused (no tick) unless a scene/input advances it.
  stepSim(0);
  flushPendingStairTransition();

  // Advance display-only systems (fx.step moved below — needs worldView for emitter origins)
  // Camera / shake / zoom use real dt so they stay responsive during hitstop
  updateCamera(cam, dtSec);
  updateShake(cam, dtSec);
  updateZoomPunch(cam, dtSec);
  // Combat VFX use hitstop-scaled dt so swings, bumps, gore all freeze in unison
  tickDisplayEffects({ dtSec: displayDt, boltFx, spellAreaFx, projectileFx, throwFx, pickupFx, cloudFx, spiritWispFx, deathEssenceFx, meleeSlashFx, aggroFx, ftext, goreTick });
  delayedDeathFx.tick(displayDt);
  flyingFx.tick(displayDt);
  slideFx.tick(displayDt);
  bumpFx.tick(displayDt);
  recoilFx.tick(displayDt);
  tickHitTints(displayDt);
  deathVfx.tick(dtSec);
  teleportFx.tick(dtSec);
  sceneRuntime.tick(dtSec);

  // Update vitals HUD if changed (lightweight per-frame check)
  hudFeeds.updateVitalsHUD();
  hudFeeds.updateCombatHUD();
  hudFeeds.updateDepthHUD();
  hudFeeds.updateTurnHUD();
  hudFeeds.updateGoldHUD();
  hudFeeds.updatePetHUD();
  hudFeeds.updateActiveSpellHUD();
  hudFeeds.updateCalendarHUD();
  hudFeeds.updateQuestTrackerHUD();
  bubbleDialog?.layout();

  // Render
  const rawView = getCachedView();
  const view = statusPresentationDelayFx.filterWorldView(rawView, _fxTime);
  if (view.player && !cam._detached) {
    followEntity(cam, view.player.pos, dtSec, 6.0);
  }

  // Feed player HP ratio to death VFX (low-HP heartbeat warning)
  if (view.player) {
    const pe = view.playerEntity || null;
    if (pe && pe.maxHp > 0) deathVfx.setPlayerHpRatio(pe.hp / pe.maxHp);
  }

  // Sync spirit wisp depth (dungeon only)
  spiritWispFx.setDepth(view.currentDepth ?? 0);
  fountainAmbientFx.syncWorldView(view);
  localEmitterAmbientFx.syncWorldView(view);
  worldAmbientFx.syncWorldView(view);
  biomeAmbientFx.syncWorldView(view);

  // Status particle emitter reconciliation + advance particles
  if (PERF.particleCapacity > 0) {
    statusEmitterFx.step(dtSec, view, _fxTime);
  }
  sparksFx.tick(dtSec);

  applyHallucinationSway({ cam, view, fxTime: _fxTime });

  render(view);

  requestAnimationFrame(frame);
}



// ---- Character creation gate -------------------------------------------------
// Savegames bypass char creation; new games show the selection screen first.
if (_savegameLoaded) {
  await bootPaint("Finalizing saved run...", _bootDoneUnits);
  _finalizeNewGame(null);
} else if (runtimeConfig.params.get('test') === '1') {
  // ?test=1 — skip char creation, auto-start as Outlaw "Debug Agent"
  await bootPaint("Finalizing debug run...", _bootDoneUnits);
  finishBoot();
  _finalizeNewGame({ name: 'Debug Agent', classId: 'outlaw', seed: 0xC0FFEE, difficulty: 'easy' });
} else {
  // Fade out the boot loader so the char creation panel is visible
  await bootPaint("Opening character creation...", _bootDoneUnits);
  finishBoot();

  const classDisplayData = buildClassDisplayData();

  showCharCreation({
    classes: classDisplayData,
    defaultSeed: _bootSeed,
    tutorialTipCount: GUIDANCE_TIPS.length,
    onConfirm: (result) => _finalizeNewGame(result),
  });
}

// Cache WorldView per rules step; if the sim hasn't advanced, reuse the view
let _cachedView = null; let _cachedStep = -1;
function getCachedView() {
  const step = world.step | 0;
  if (!_cachedView || step !== _cachedStep) {
    _cachedView = buildWorldView(world);
    _cachedStep = step;
  }
  return _cachedView;
}

// Cache FOV between frames; recompute when world turn changes or player moves.
// (FOV/Lightmask were removed per request; focusing strictly on tuning existing features.)
