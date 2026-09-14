// src/main/scheduler.js
// Register rules systems into phases and set the world scheduler.

import { composeScheduler, registerSystem, clearSystems, getOrderedSystems, installScriptsAPI } from "../lib/ecs-js/index.js";
/** @typedef {import('../lib/ecs-js/index.js').World} World */
import { drinkSystem } from "../rules/systems/drinkSystem.js";
import { scriptTickSystem } from "../rules/systems/scriptTickSystem.js";
import { itemPickupSystem } from "../rules/systems/itemPickupSystem.js";
import { itemDropSystem } from "../rules/systems/itemDropSystem.js";
import { equipItemSystem } from "../rules/systems/equipItemSystem.js";
import { useItemSystem } from "../rules/systems/useItemSystem.js";
import { applySystem } from "../rules/systems/applySystem.js";
import { throwSystem } from "../rules/systems/throwSystem.js";
import { rangedAttackSystem } from "../rules/systems/rangedAttackSystem.js";
import { attackDirectionSystem } from "../rules/systems/attackDirectionSystem.js";
import { interactionSystem } from "../rules/systems/interactionSystem.js";
import { effectSystem } from "../rules/systems/effectSystem.js";
import { aggroDamageReactionSystem } from "../rules/systems/damageReactions/aggroDamageReactionSystem.js";
import { channelingDamageReactionSystem } from "../rules/systems/damageReactions/channelingDamageReactionSystem.js";
import { deathImpactDamageReactionSystem } from "../rules/systems/damageReactions/deathImpactDamageReactionSystem.js";
import { deityDamageReactionSystem } from "../rules/systems/damageReactions/deityDamageReactionSystem.js";
import { deityHealingReactionSystem } from "../rules/systems/healingReactions/deityHealingReactionSystem.js";
import { electrocuteDamageReactionSystem } from "../rules/systems/damageReactions/electrocuteDamageReactionSystem.js";
import { itemDamageReactionSystem } from "../rules/systems/damageReactions/itemDamageReactionSystem.js";
import { sleepDamageReactionSystem } from "../rules/systems/damageReactions/sleepDamageReactionSystem.js";
import { threatDamageReactionSystem } from "../rules/systems/damageReactions/threatDamageReactionSystem.js";
import { shieldGuardSystem } from "../rules/systems/shieldGuardSystem.js";
import { stealthAmbushSystem } from "../rules/systems/stealthAmbushSystem.js";
import { waitSystem } from "../rules/systems/waitSystem.js";
import { searchSystem } from "../rules/systems/searchSystem.js";
import { postureIntentSystem } from "../rules/systems/postureIntentSystem.js";
import { flyIntentSystem } from "../rules/systems/flyIntentSystem.js";
import { praySystem } from "../rules/systems/praySystem.js";
import { castSpellSystem } from "../rules/systems/castSpellSystem.js";
import { aiChaseSystem, installAggroFromStealthOffenseListener } from "../rules/systems/aiChaseSystem.js";
import { aiPolicySystem } from "../rules/systems/aiPolicySystem.js";
import { aiTownfolkSystem, installTownfolkDoorListener, installBellListener } from "../rules/systems/aiTownfolkSystem.js";
import { socialAggroSystem } from "../rules/systems/socialAggroSystem.js";
import { aiScurrySystem } from "../rules/systems/aiScurrySystem.js";
import { aiFarmAnimalSystem } from "../rules/systems/aiFarmAnimalSystem.js";
import { installRatatoskrListeners, ratatoskrSystem } from "../rules/systems/ratatoskrSystem.js";
import { aiWeaponPickupSystem } from "../rules/systems/aiWeaponPickupSystem.js";
import { aiScrollPickupSystem, aiScrollUseSystem } from "../rules/systems/aiScrollSystem.js";
import { aiCorpseEatSystem } from "../rules/systems/aiCorpseEatSystem.js";
import { aiFlyingSystem } from "../rules/systems/aiFlyingSystem.js";
import { jumpScareSystem } from "../rules/systems/jumpScareSystem.js";
import { lifespanSystem } from "../rules/systems/lifespanSystem.js";
import { temporarySpawnExpirySystem } from "../rules/systems/temporarySpawnExpirySystem.js";
import { voidHoleSystem } from "../rules/systems/voidHoleSystem.js";
import { knockbackSystem } from "../rules/systems/knockbackSystem.js";
import { soundPropagationSystem } from "../rules/systems/soundPropagationSystem.js";
import { sleepScheduleSystem } from "../rules/systems/sleepScheduleSystem.js";
import { encumbranceSystem } from "../rules/systems/encumbranceSystem.js";
import { weightDerivationSystem } from "../rules/systems/weightDerivationSystem.js";
import { installTauntListener, tauntSteeringSystem } from "../rules/systems/tauntSystem.js";
import { installThreatListeners, threatSystem } from "../rules/systems/threatSystem.js";
import { petCommandSystem } from "../rules/systems/petCommandSystem.js";
import { petBehaviorSystem } from "../rules/systems/petBehaviorSystem.js";
import { summonedBehaviorSystem } from "../rules/systems/summonedBehaviorSystem.js";
import { shopkeeperSystem } from "../rules/systems/shopkeeperSystem.js";
import { shopAmbientSoundSystem } from "../rules/systems/shopAmbientSoundSystem.js";
import {
  movementSystem,
  installMoveAutoPickupListener,
} from "../rules/systems/movementSystem.js";
import { intentValidationSystem } from "../rules/systems/intentValidationSystem.js";
import { combatSystem, installBumpAttackListener } from "../rules/systems/combatSystem.js";
import { installCombatInteractions } from "../rules/data/combatInteractions.js";
import { cleanupSystem } from "../rules/systems/cleanupSystem.js";
import { trapSystem, trapDodgePromptExtension, trapStepListenerExtension } from "../rules/systems/trapSystem.js";
import { disarmTrapSystem } from "../rules/systems/disarmTrapSystem.js";
import { manaRegenerationSystem } from "../rules/systems/manaRegenerationSystem.js";
import { staminaRegenerationSystem } from "../rules/systems/staminaRegenerationSystem.js";
import { monsterSpawnerSystem } from "../rules/systems/monsterSpawnerSystem.js";
import { spatialIndexSystem } from "../rules/systems/spatialIndexSystem.js";
import { deitySystem } from "../rules/systems/deitySystem.js";
import { deityChallengeSystem } from "../rules/systems/deityChallengeSystem.js";
import { engraveSystem, installEngraveListeners } from "../rules/systems/engraveSystem.js";
import { installBumpInteractListener } from "../rules/systems/interactionSystem.js";
import { hungerSystem } from "../rules/systems/hungerSystem.js";
import { hazardSystem } from "../rules/systems/hazardSystem.js";
import { monsterDeathHookSystem } from "../rules/systems/monsterDeathHookSystem.js";
import { scoreSystem } from "../rules/systems/scoreSystem.js";
import { materialReactionListenersExtension, materialReactionSystem } from "../rules/systems/materialReactionSystem.js";
import { foodDecaySystem } from "../rules/systems/foodDecaySystem.js";
import { itemCooldownSystem } from "../rules/systems/itemCooldownSystem.js";
import { spellCooldownSystem } from "../rules/systems/spellCooldownSystem.js";
import { harvestRegrowthSystem } from "../rules/systems/harvestRegrowthSystem.js";
import { plantGrowthSystem } from "../rules/systems/plantGrowthSystem.js";
import { fountainRegrowthSystem } from "../rules/systems/fountainRegrowthSystem.js";
import { weatherSystem } from "../rules/systems/weatherSystem.js";
import { calendarSystem } from "../rules/systems/calendarSystem.js";
import { townSimulationSystem } from "../rules/systems/townSimulationSystem.js";
import { townfolkAmbientDialogueSystem } from "../rules/systems/townfolkAmbientDialogueSystem.js";
import { entrancePressureSystem } from "../rules/systems/entrancePressureSystem.js";
import { districtConditionSystem } from "../rules/systems/districtConditionSystem.js";
import { installTileStepEffectListener } from "../rules/systems/tileStepEffectSystem.js";
import { installPolymorphListener } from "../rules/systems/polymorphSystem.js";
import { installCurseHooks } from "../rules/systems/curseHooks.js";
import { channelingSystem } from "../rules/systems/channelingSystem.js";
import { installFishingAction } from "../rules/content/useActions/fishingAction.js";
import { installGenocideListener } from "../rules/systems/genocideSystem.js";
import { installTamingListener } from "../rules/systems/tamingSystem.js";
import { workstationStateSystem } from "../rules/systems/workstationStateSystem.js";
import { hydraulicsSystem } from "../rules/systems/hydraulicsSystem.js";
import { defineInventoryVirtuals, installVirtuals } from "../rules/utils/inventoryVirtuals.js";
import { defineDerivedStatVirtuals } from "../rules/utils/derivedStats.js";
import { definePassiveBonusVirtuals } from "../rules/utils/passiveBonuses.js";
import { defineTownInterpretationVirtuals } from "../rules/utils/townInterpretationVirtuals.js";
import { defineShopDebtVirtuals } from "../rules/utils/shopDebt.js";
import { installDispositionOffenseListeners } from "../rules/utils/disposition.js";
import { installReputationOffenseListeners } from "../rules/utils/reputation.js";
import { installShopLawListeners } from "../rules/utils/shopLaw.js";
import { installDialogRuntime } from "../rules/dialogues/runtime.js";
import { installQuestRuntime } from "../rules/quests/runtime.js";
import { installStarterFetchQuestHooks } from "../rules/quests/definitions/graveyardWatch.js";
import { installRatQuestHooks, ratInfestationDeathSystem } from "../rules/quests/definitions/ratInfestation.js";
import { installRunContractHooks, runContractDeathSystem } from "../rules/quests/definitions/runContract.js";
import { installPriestRiftHooks, priestRiftDeathSystem } from "../rules/quests/definitions/priestRift.js";
// Side-effect: registers script handlers at import time
import "../rules/scripts/traps.js";
import "../rules/scripts/monsters.js";
import "../rules/data/procPackages.js";
import "../rules/dialogues/townfolkDialogs.js";
import "../rules/dialogues/ratatoskrDialog.js";
import { installGemSocketListener } from "../rules/data/gemSocketAffixes.js";
import { installCentipedeBodyCascade } from "../rules/utils/centipedeMovement.js";
import { perceptionMemorySystem } from "../rules/systems/perceptionMemorySystem.js";
import { installEnchantingOpenRequestListener } from "../rules/content/enchanting/benchGame.js";
import { tombstoneSystem } from "../rules/systems/tombstoneSystem.js";
import { treasureGuardianListenerExtension, treasureGuardianSystem } from "../rules/systems/treasureGuardianSystem.js";
import { experimentalAIExtension } from "./resources/AI.js";
import { encounterListenerExtension, encounterSystem } from "../rules/systems/encounterSystem.js";

/**
 * @param {World} world
 */
export function configureWorld(world) {
  clearSystems();
  installScriptsAPI(world);
  world.install(experimentalAIExtension);
  world.install(encounterListenerExtension);
  installVirtuals(world);
  defineInventoryVirtuals(world);
  defineDerivedStatVirtuals(world);
  definePassiveBonusVirtuals(world);
  defineTownInterpretationVirtuals(world);
  defineShopDebtVirtuals(world);
  installDialogRuntime(world);
  installQuestRuntime(world);
  installStarterFetchQuestHooks(world);
  installRatQuestHooks(world);
  installRunContractHooks(world);
  installPriestRiftHooks(world);
  installRatatoskrListeners(world);

  installTownfolkDoorListener(world);
  installBellListener(world);
  installGemSocketListener(world);
  // Install engraving scramble-on-step listener once per world
  installEngraveListeners(world);
  // Install bump-interact listener for immediate interactions (doors, chests, NPCs)
  installBumpInteractListener(world);
  // Install bump-attack listener for immediate melee-on-bump resolution
  installBumpAttackListener(world);
  // Install data-driven combat interaction rules (blessed vs undead, frozen shatter, etc.)
  installCombatInteractions(world);
  // Install taunt listeners once per world
  installTauntListener(world);
  // Install threat listeners once per world
  installThreatListeners(world);
  // Auto-pickup currency etc. when any actor moves onto a tile (reacts to "moved" event)
  installMoveAutoPickupListener(world);
  // Shop-law ledger catches value extraction that bypasses ordinary doorway blocking.
  installShopLawListeners(world);
  // Social offense memory feeds disposition first; aggro is a tactical output.
  installDispositionOffenseListeners(world);
  // Public reputation is downstream of witnessed or ledgered disposition changes.
  installReputationOffenseListeners(world);
  // Tile step effects: ice slides, lava scorch, water extinguish (reacts to "moved" event)
  installTileStepEffectListener(world);
  // Trap plates trigger from arrival movement events, then resolve in trapSystem.
  world.install(trapStepListenerExtension);
  world.install(trapDodgePromptExtension);
  // Material reactions consume semantic reaction events (water splash/dip, etc.).
  world.install(materialReactionListenersExtension);
  world.install(treasureGuardianListenerExtension);
  // Polymorph requests (e.g. mimic reveal on touch).
  installPolymorphListener(world);
  installCurseHooks(world);
  installGenocideListener(world);
  installTamingListener(world);
  // Witnesses react to stealth offense and enter hunting with attacker last-known position.
  installAggroFromStealthOffenseListener(world);
  installFishingAction(world);
  // Centipede body segments cascade position when the head moves.
  installCentipedeBodyCascade(world);
  installEnchantingOpenRequestListener(world);

  // Phase: ai (intent producers — added intents are visible to later phases
  // in the same tick because ecs-js add() is intratick-immediate)

  // Jump scare triggers on first proximity to dangerous creatures (dragons, lich, etc.)
  registerSystem(jumpScareSystem, 'ai');
  registerSystem(encounterSystem, 'ai');
  // Flying AI claims the action with FlyIntent before scurry/chase.
  registerSystem(aiFlyingSystem, 'ai');
  // Scurry before chase: dumb idle creatures set a random MoveIntent which
  // aiChaseSystem's existing intent-skip guard then honours.
  registerSystem(aiScurrySystem, 'ai');
  registerSystem(aiFarmAnimalSystem, 'ai');
  registerSystem(ratatoskrSystem, 'ai');
  registerSystem(aiTownfolkSystem, 'ai');
  registerSystem(socialAggroSystem, 'ai');
  registerSystem(aiChaseSystem, 'ai');
  // Policy override: neural net replaces/improves intents for intel ≥ 7 monsters.
  // Runs after chase so alert state and whileLOS hooks are already resolved.
  registerSystem(aiPolicySystem, 'ai');
  // Weapon pickup after chase so the monster's hunt state is settled first.
  registerSystem(aiWeaponPickupSystem, 'ai');
  registerSystem(aiScrollPickupSystem, 'ai');
  registerSystem(aiScrollUseSystem, 'ai');
  // Corpse eating after weapon pickup — idle scavengers and tactical devourers.
  registerSystem(aiCorpseEatSystem, 'ai');
  registerSystem(summonedBehaviorSystem, 'ai');
  registerSystem(petCommandSystem, 'ai');
  registerSystem(petBehaviorSystem, 'ai');

  // Phase: intents (intent consumers + steering)
  registerSystem(intentValidationSystem, 'intents', {
    before: [knockbackSystem, flyIntentSystem, waitSystem, movementSystem, combatSystem],
  });
  // Knockback resolves before standard movement so positions are committed first.
  registerSystem(knockbackSystem, 'intents', { before: [movementSystem] });
  registerSystem(flyIntentSystem, 'intents');
  registerSystem(waitSystem, 'intents');
  registerSystem(searchSystem, 'intents');
  registerSystem(postureIntentSystem, 'intents');
  registerSystem(praySystem, 'intents');
  registerSystem(drinkSystem, 'intents');
  registerSystem(useItemSystem, 'intents');
  registerSystem(applySystem, 'intents');
  registerSystem(equipItemSystem, 'intents');
  registerSystem(itemDropSystem, 'intents');
  registerSystem(engraveSystem, 'intents');
  // Shopkeeper system must run BEFORE movementSystem to block exits
  registerSystem(shopkeeperSystem, 'intents');
  // Taunt steering can override enemy movement intents before movement resolves.
  registerSystem(tauntSteeringSystem, 'intents');
  // Refill dry fountains at cooldown before interaction tries to drink.
  registerSystem(fountainRegrowthSystem, 'intents');
  // Resolve movement before targeted ranged actions so same-tick attacks use
  // the destination a target actually reaches this turn.
  registerSystem(movementSystem, 'intents', {
    after: [knockbackSystem, shopkeeperSystem, tauntSteeringSystem, fountainRegrowthSystem],
    before: [throwSystem, rangedAttackSystem, channelingSystem, castSpellSystem, interactionSystem, combatSystem],
  });
  registerSystem(throwSystem, 'intents', { after: [movementSystem] });
  registerSystem(rangedAttackSystem, 'intents', { after: [movementSystem] });
  registerSystem(attackDirectionSystem, 'intents', { after: [movementSystem], before: [combatSystem] });
  registerSystem(channelingSystem, 'intents', { after: [movementSystem] });   // countdown before castSpellSystem fires
  registerSystem(castSpellSystem, 'intents', { after: [movementSystem, channelingSystem] });
  // interactionSystem must run AFTER movementSystem: bump-to-interact adds
  // InteractIntent during movement; processing it in the same tick prevents
  // the shop overlay from re-firing on every subsequent action.
  registerSystem(interactionSystem, 'intents', { after: [movementSystem] });
  registerSystem(combatSystem, 'intents', { after: [movementSystem] });
  // Run pickup after movement so stepping onto items can pick them up immediately
  registerSystem(itemPickupSystem, 'intents');
  // Disarm attempts resolve before traps trigger (so disarming prevents stepping-trigger)
  registerSystem(disarmTrapSystem, 'intents');
  // Traps trigger after movement (player steps onto trap tile)
  registerSystem(trapSystem, 'intents');

  // Phase: effects (derived first, then per-turn effects)
  // Weight derivation: bottom-up recomputation of Weight.total for bags/actors.
  registerSystem(weightDerivationSystem, 'effects');
  // Encumbrance recomputed after equipment + weight are settled; movement reads it next tick.
  registerSystem(encumbranceSystem, 'effects');
  // Sound propagation checks SoundEmitter vs Anatomy.hearing; updates AggroState.
  registerSystem(soundPropagationSystem, 'effects');
  // Run stealth ambush rearm before effect aging so the cooldown tracker can
  // complete cleanly and restore opener while invisibility remains active.
  registerSystem(stealthAmbushSystem, 'effects');
  registerSystem(sleepDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(electrocuteDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(itemDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(channelingDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(aggroDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(threatDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(deityDamageReactionSystem, 'effects', { after: [stealthAmbushSystem], before: [effectSystem] });
  registerSystem(effectSystem, 'effects');
  // Keep shield guard/break icon state synced to equipped offhand shields.
  registerSystem(shieldGuardSystem, 'effects');
  registerSystem(threatSystem, 'effects', { after: [shieldGuardSystem] });
  registerSystem(materialReactionSystem, 'effects');
  registerSystem(hungerSystem, 'effects');
  // Food decay ticks after hunger (rot inventory food each turn)
  registerSystem(foodDecaySystem, 'effects');
  registerSystem(itemCooldownSystem, 'effects');
  registerSystem(spellCooldownSystem, 'effects');
  registerSystem(hazardSystem, 'effects');
  registerSystem(voidHoleSystem, 'effects', { after: [hazardSystem] });
  registerSystem(manaRegenerationSystem, 'effects');
  registerSystem(staminaRegenerationSystem, 'effects');
  registerSystem(harvestRegrowthSystem, 'effects');
  registerSystem(plantGrowthSystem, 'effects');
  registerSystem(calendarSystem, 'effects');
  registerSystem(sleepScheduleSystem, 'effects', { after: [calendarSystem] });
  registerSystem(weatherSystem, 'effects');
  registerSystem(townSimulationSystem, 'effects');
  registerSystem(townfolkAmbientDialogueSystem, 'effects');
  registerSystem(shopAmbientSoundSystem, 'effects');
  registerSystem(entrancePressureSystem, 'effects');
  registerSystem(districtConditionSystem, 'effects');
  registerSystem(workstationStateSystem, 'effects');
  registerSystem(hydraulicsSystem, 'effects');
  registerSystem(treasureGuardianSystem, 'effects');
  // Spawners tick in the effects phase
  registerSystem(monsterSpawnerSystem, 'effects', { after: [treasureGuardianSystem] });
  // Deity mood ticks in the effects phase (after combat results are emitted)
  registerSystem(deitySystem, 'effects');
  registerSystem(scoreSystem, 'effects', { after: [deitySystem] });
  registerSystem(monsterDeathHookSystem, 'effects', { after: [scoreSystem] });
  registerSystem(ratInfestationDeathSystem, 'effects', { after: [monsterDeathHookSystem] });
  registerSystem(runContractDeathSystem, 'effects', { after: [ratInfestationDeathSystem] });
  registerSystem(priestRiftDeathSystem, 'effects', { after: [runContractDeathSystem] });
  registerSystem(deityChallengeSystem, 'effects', { after: [runContractDeathSystem] });
  registerSystem(tombstoneSystem, 'effects', { after: [deityChallengeSystem] });
  registerSystem(perceptionMemorySystem, 'effects');
  registerSystem(deathImpactDamageReactionSystem, 'effects', { after: [perceptionMemorySystem] });

  // Phase: scripts (content-DSL tick hooks: onTurnWhileCarried, etc.)
  registerSystem(scriptTickSystem, 'scripts');

  // Phase: cleanup (end-of-turn removals like killing entities with hp <= 0)
  registerSystem(cleanupSystem, 'cleanup');
  registerSystem(deityHealingReactionSystem, 'cleanup', { after: [cleanupSystem], before: [lifespanSystem] });
  // Lifespan countdown and entity removal (before spatial index sync).
  registerSystem(lifespanSystem, 'cleanup');
  // Temporary materialized spawns expire on absolute world turns.
  registerSystem(temporarySpawnExpirySystem, 'cleanup', { after: [lifespanSystem], before: [spatialIndexSystem] });
  // Keep spatial index in sync after structural changes
  registerSystem(spatialIndexSystem, 'cleanup');

  const baseScheduler = composeScheduler('ai', 'intents', 'effects', 'scripts', 'cleanup');
  const profEnabled = shouldProfileRules();
  if (!profEnabled) {
    world.setScheduler(baseScheduler);
    return;
  }

  // Build profiled scheduler: measure per system and per phase using high-res timer
  /** @type {Array<'ai'|'intents'|'effects'|'scripts'|'cleanup'>} */
  const phases = ['ai', 'intents', 'effects', 'scripts', 'cleanup'];
  /** @type {Record<string, Function[]>} */
  const phaseSystems = Object.create(null);
  for (const ph of phases) phaseSystems[ph] = getOrderedSystems(ph);

  world.setScheduler((w, dt) => {
    const perf = getRulesProfilerState();
    /** @type {any} */
    const tick = { phases: {}, totalMs: 0 };
    let tickStart = performance.now();

    for (const ph of phases) {
      /** @type {Function[]} */
      const list = phaseSystems[ph] || [];
      let phStart = performance.now();
      const sysTimes = [];
      for (let i = 0; i < list.length; i++) {
        /** @type {Function} */
        const fn = /** @type any */ (list[i] || (()=>{}));
        const s0 = performance.now();
        fn(w, dt);
        const s1 = performance.now();
        sysTimes.push({ name: fn.name || `sys${i}`, ms: s1 - s0 });
      }
      const phEnd = performance.now();
      tick.phases[ph] = { totalMs: phEnd - phStart, systems: sysTimes };
    }

    tick.totalMs = performance.now() - tickStart;
    perf.lastTick = tick;
  });
}

function shouldProfileRules() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search || '');
  const v = (params.get('rulesProfile') || (typeof localStorage !== 'undefined' ? localStorage.getItem('jshack.rulesProfile') : '0') || '0');
  return v === '1' || v === 'true' || v === 'on';
}

function getRulesProfilerState() {
  const w = /** @type any */(window);
  return (w.__JSHACK_RULES_PROF ||= { enabled: true, lastTick: null });
}
