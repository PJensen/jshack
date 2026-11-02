import { assert } from "jsr:@std/assert";
import { assertAlmostEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import {
  CHANNELING_LOOP_OPTIONS,
  CHANNELING_LOOP_SOUND_ID,
  BONE_CHIME_SOUND_ID,
  CRAFTING_MENU_LOOP_BY_KIND,
  CRAFTING_MENU_LOOP_OPTIONS,
  CRAFTING_RESULT_SOUND_BY_KIND,
  DUNGEON_LOOP_OPTIONS,
  DUNGEON_LOOP_SOUND_ID,
  DEATH_SOUND_BY_IDENTITY,
  FAMILIAR_FIRE_CAST_SOUND_ID,
  FAMILIAR_FIRE_READY_SOUND_ID,
  FOOD_EAT_SOUND_ID,
  PORTAL_CREATED_SOUND_ID,
  PORTAL_DESTROYED_SOUND_ID,
  PUSH_STONE_SOUND_ID,
  SEARCH_FOUND_SOUND_ID,
  SEARCH_PING_SOUND_ID,
  SECRET_FOUND_SOUND_ID,
  HARVEST_PLANT_SOUND_ID,
  GENOCIDE_SUCCESS_SOUND_ID,
  PRAYER_SOUND_ID,
  TAMING_SUCCESS_SOUND_ID,
  THROW_SOUND_ID,
  SPELL_CAST_SOUND_EVENTS,
  TRAP_SOUND_BY_TYPE,
  URN_BROKEN_SOUND_ID,
  WEAPON_RACK_DROPPED_SOUND_ID,
  craftingMenuLoopKey,
  computeSearchRevealDelayMs,
  computeZoomAudibilityGain,
  gemValueToDropDetuneCents,
  resolveCraftingResultSoundId,
  resolveAudioPlayKey,
  resolveInteractionSoundId,
  resolveStatusSoundId,
  isSfxDebugEnabled,
  isPlantHarvestKind,
  reportSfxDebugInvocation,
  setSfxDebugEnabled,
  setSfxDebugLogger,
  shouldPlayElectrocutionSound,
  shouldPlayDungeonOmen,
  shouldPlayCreatureAlertSound,
  shouldPlayTeleportSound,
} from "../src/display/audio/audioWiring.js";
import {
  AUDIO_INTERACTION_ROUTES,
  createAudioWiringExtension,
  resolveAudioRoutePlan,
} from "../src/display/audio/audioWiringExtension.js";

Deno.test("audio wiring includes spider spell cast events", () => {
  assert(SPELL_CAST_SOUND_EVENTS.includes("spell:web_spit"));
  assert(SPELL_CAST_SOUND_EVENTS.includes("spell:spider_lunge"));
});

Deno.test("audio wiring exposes a clean channeling loop contract", () => {
  assert(CHANNELING_LOOP_SOUND_ID === "spell:channeling");
  assert(CHANNELING_LOOP_OPTIONS.bus === "spells");
  assert(CHANNELING_LOOP_OPTIONS.crossfade > 0);
  assert(CHANNELING_LOOP_OPTIONS.fadeOut > 0);
});

Deno.test("audio wiring exposes a persistent dungeon loop contract", () => {
  assert(DUNGEON_LOOP_SOUND_ID === "ambient:dungeon");
  assert(DUNGEON_LOOP_OPTIONS.bus === "ambient:loop");
  assert(DUNGEON_LOOP_OPTIONS.volume > 0);
  assert(DUNGEON_LOOP_OPTIONS.crossfade > 0);
  assert(DUNGEON_LOOP_OPTIONS.fadeOut > 0);
});

Deno.test("audio wiring exposes crafting menu ambience and result sound contracts", () => {
  assert(CRAFTING_MENU_LOOP_BY_KIND.cooking === "ambient:cooking_fire");
  assert(CRAFTING_MENU_LOOP_BY_KIND.alchemy === "ambient:bubbles");
  assert(CRAFTING_MENU_LOOP_BY_KIND.smithing === "ambient:smithy");
  assert(CRAFTING_MENU_LOOP_OPTIONS.bus === "ambient:loop");
  assert(CRAFTING_MENU_LOOP_OPTIONS.crossfade > 0);
  assert(CRAFTING_MENU_LOOP_OPTIONS.fadeOut > 0);
  assert(CRAFTING_RESULT_SOUND_BY_KIND.cooking === "craft:cooking:result");
  assert(CRAFTING_RESULT_SOUND_BY_KIND.alchemy === "item:pickup:potion");
  assert(CRAFTING_RESULT_SOUND_BY_KIND.smithing === "item:pickup:weapon");
  assert(craftingMenuLoopKey("alchemy") === "ui:crafting:alchemy");
  assert(resolveCraftingResultSoundId("unknown") === "item:pickup:generic");
});

Deno.test("audio wiring exposes familiar fire ready and cast sound aliases", () => {
  assert(FAMILIAR_FIRE_READY_SOUND_ID === "torch:ignite");
  assert(FAMILIAR_FIRE_CAST_SOUND_ID === "spell:fireball");
});

Deno.test("audio wiring exposes the prayer sound alias", () => {
  assert(PRAYER_SOUND_ID === "holy_chime");
});

Deno.test("audio wiring exposes food and stone push sound aliases", () => {
  assert(FOOD_EAT_SOUND_ID === "item:consume:food");
  assert(PUSH_STONE_SOUND_ID === "action:move_boulder");
});

Deno.test("audio wiring exposes portal lifecycle sound aliases", () => {
  assert(PORTAL_CREATED_SOUND_ID === "portal:created");
  assert(PORTAL_DESTROYED_SOUND_ID === "portal:destroyed");
});

Deno.test("audio wiring maps new authored event sounds", () => {
  assert(DEATH_SOUND_BY_IDENTITY.skeleton === "creature:skeleton:died");
  assert(DEATH_SOUND_BY_IDENTITY.skeleton_archer === "creature:skeleton:died");
  assert(DEATH_SOUND_BY_IDENTITY.skeleton_sharpshooter === "creature:skeleton:died");
  assert(TRAP_SOUND_BY_TYPE.snake === "trap:snake");
  assert(TRAP_SOUND_BY_TYPE.spike === "trap:spike");
  assert(URN_BROKEN_SOUND_ID === "urn:broken");
  assert(WEAPON_RACK_DROPPED_SOUND_ID === "rack:weapon:dropped");
  assert(SEARCH_PING_SOUND_ID === "action:search_ping");
  assert(SEARCH_FOUND_SOUND_ID === "action:search_found");
  assert(SECRET_FOUND_SOUND_ID === "action:secret_found");
  assert(HARVEST_PLANT_SOUND_ID === "action:harvest_plant");
  assert(BONE_CHIME_SOUND_ID === "ambient:bone_chime");
  assert(TAMING_SUCCESS_SOUND_ID === "magic:taming");
  assert(GENOCIDE_SUCCESS_SOUND_ID === "item:scroll:genocide");
  assert(THROW_SOUND_ID === "action:throw");
});

Deno.test("audio wiring identifies plant harvests without claiming mining, chopping, or fishing", () => {
  for (const kind of ["berries", "herbs", "mushrooms", "wheat", "carrot", "corn", "thorn_bramble", "venom_fern", "moonleaf", "ember_root"]) {
    assert(isPlantHarvestKind(kind), `${kind} should use the plant harvest sound`);
  }
  for (const kind of ["tree", "iron_ore", "coal_ore", "stone", "fishing_spot"]) {
    assert(!isPlantHarvestKind(kind), `${kind} should keep its non-plant sound path`);
  }
});

Deno.test("audio wiring delays search reveal sound along the pulse radius", () => {
  assert(computeSearchRevealDelayMs({ x: 0, y: 0 }, { x: 1, y: 0 }, 6) === 63);
  assert(computeSearchRevealDelayMs({ x: 0, y: 0 }, { x: 3, y: 0 }, 6) === 190);
  assert(computeSearchRevealDelayMs({ x: 0, y: 0 }, { x: 6, y: 0 }, 6) === 380);
  assert(computeSearchRevealDelayMs(null, { x: 6, y: 0 }, 6) === 120);
});

Deno.test("audio wiring zoom gain follows camera scale with clamps", () => {
  assertAlmostEquals(computeZoomAudibilityGain(64, 64), 1, 1e-10);
  assertAlmostEquals(computeZoomAudibilityGain(16, 64), 0.65, 1e-10);
  assertAlmostEquals(computeZoomAudibilityGain(256, 64), 1.35, 1e-10);
  assertAlmostEquals(computeZoomAudibilityGain(81, 64), 1.125, 1e-10);
});

Deno.test("audio wiring maps gem value to subtle drop pitch detune", () => {
  assertAlmostEquals(gemValueToDropDetuneCents(0), 0, 1e-10);
  assertAlmostEquals(gemValueToDropDetuneCents(2500), 22.5, 1e-10);
  assertAlmostEquals(gemValueToDropDetuneCents(5000), 45, 1e-10);
  assertAlmostEquals(gemValueToDropDetuneCents(999999), 45, 1e-10);
  assertAlmostEquals(gemValueToDropDetuneCents(-10), 0, 1e-10);
});

Deno.test("audio wiring accepts all authored generic audio payload keys", () => {
  assert(resolveAudioPlayKey({ key: "shop:enter" }) === "shop:enter");
  assert(resolveAudioPlayKey({ id: "holy_chime" }) === "holy_chime");
  assert(resolveAudioPlayKey({ sound: "status:frozen" }) === "status:frozen");
});

Deno.test("shop chime is wired to accepted UI open, not raw shop open", async () => {
  const source = await Deno.readTextFile("src/display/audio/audioWiring.js");
  assert(source.includes('addEventListener("ui:openShop"'), "accepted UI open should trigger shop chime");
  assert(!source.includes("world.on('shop:open'"), "raw shop:open should not trigger shop chime");
  assert(!source.includes('world.on("shop:open"'), "raw shop:open should not trigger shop chime");
});

Deno.test("audio wiring maps interaction outcomes to door and lantern sounds", () => {
  assert(resolveInteractionSoundId({ action: "toggleDoor", result: "opened" }) === "door:open");
  assert(resolveInteractionSoundId({ action: "toggleDoor", result: "closed" }) === "door:close");
  assert(resolveInteractionSoundId({ action: "toggleLantern", result: "lit" }) === "action:switch_on");
  assert(resolveInteractionSoundId({ action: "toggleLantern", result: "extinguished" }) === "action:switch_off");
  assert(resolveInteractionSoundId({ action: "restAtBed", result: "ok" }) === null);
});

Deno.test("audio wiring interaction routes resolve playback plans", () => {
  const ctx = { getPosition: (id) => ({ x: id, y: 2 }) };
  const plan = resolveAudioRoutePlan(AUDIO_INTERACTION_ROUTES, "interaction", {
    action: "toggleDoor",
    result: "opened",
    targetId: 7,
  }, ctx);

  assert(plan.soundId === "door:open");
  assert(plan.position.x === 7);
  assert(plan.position.y === 2);
  assert(plan.options.volume === 1.25);
  assert(resolveAudioRoutePlan(AUDIO_INTERACTION_ROUTES, "interaction", { action: "restAtBed" }, ctx) === null);
});

Deno.test("audio wiring extension installs interaction routes", () => {
  const world = new World({ seed: 1 });
  const played = [];
  const extension = createAudioWiringExtension({
    getPosition: (id) => ({ x: id, y: 3 }),
    getPlayerPosition: () => ({ x: 1, y: 1 }),
    getZoomGain: () => 1.2,
    playAt: (soundId, position, playerPosition, options, zoomGain) => {
      played.push({ soundId, position, playerPosition, options, zoomGain });
    },
  });

  world.install(extension);
  world.install(extension);
  world.emit("interaction", { action: "toggleLantern", result: "lit", targetId: 4 });

  assert(played.length === 1);
  assert(played[0].soundId === "action:switch_on");
  assert(played[0].position.x === 4);
  assert(played[0].playerPosition.x === 1);
  assert(played[0].options.priority === 1);
  assert(played[0].zoomGain === 1.2);

  assert(world.uninstall(extension));
  world.emit("interaction", { action: "toggleDoor", result: "opened", targetId: 5 });
  assert(played.length === 1);
});

Deno.test("audio wiring maps semantic status events to status sounds", () => {
  assert(resolveStatusSoundId({ kind: "frozen" }) === "status:frozen");
  assert(resolveStatusSoundId({ effect: "slimed" }) === "status:slimed");
  assert(resolveStatusSoundId({ status: "deafened" }) === "status:deafened");
  assert(resolveStatusSoundId({ type: "electrocuted" }) === "status:electrocuted");
});

Deno.test("audio wiring plays electrocution for non-spell electric damage", () => {
  assert(shouldPlayElectrocutionSound({ type: "electric", cause: "grid_bug" }));
  assert(shouldPlayElectrocutionSound({ type: "lightning", cause: "trap" }));
  assert(!shouldPlayElectrocutionSound({ type: "fire", cause: "spell" }));
});

Deno.test("audio wiring keeps housekeeping teleports silent", () => {
  const isPlayer = (id) => id === 7;

  assert(shouldPlayTeleportSound({ id: 7, source: "scroll:teleportation" }, isPlayer));
  assert(!shouldPlayTeleportSound({ id: 7, source: "dungeon:teleport-depth" }, isPlayer));
  assert(!shouldPlayTeleportSound({ id: 8, source: "scroll:teleportation" }, isPlayer));
  assert(shouldPlayTeleportSound({ id: 8, source: "ratatoskr" }, isPlayer));
});

Deno.test("audio wiring gates dungeon omens to rare real dungeon events", () => {
  assert(!shouldPlayDungeonOmen({ kind: "fire", at: { x: 1, y: 2 } }, {}, 0));
  assert(!shouldPlayDungeonOmen({ kind: "fire" }, {}, 1));

  const state = {};
  let played = 0;
  for (let i = 0; i < 240; i++) {
    if (shouldPlayDungeonOmen({
      kind: "fire",
      medium: "floor",
      cause: "spell:fireball",
      sourceKind: "player",
      at: { x: i, y: 7 },
    }, state, 1)) {
      played++;
    }
  }

  assert(played > 0, "real dungeon events should occasionally produce an omen");
  assert(played < 20, "omens should stay rare even during many hazard events");
});

Deno.test("audio wiring gates repeated creature alert bursts by sound", () => {
  const state = new Map();

  assert(shouldPlayCreatureAlertSound("creature:alert:large_beast", state, 1000, 1200));
  assert(!shouldPlayCreatureAlertSound("creature:alert:large_beast", state, 1500, 1200));
  assert(shouldPlayCreatureAlertSound("creature:alert:large_beast", state, 2200, 1200));
  assert(shouldPlayCreatureAlertSound("rat:alert", state, 2300, 1200));
});

Deno.test("kitty happy vocalizations use a per-kitty cooldown", async () => {
  const { shouldPlayKittyHappySound } = await import("../src/display/audio/audioWiring.js");
  const state = new Map();

  assert(shouldPlayKittyHappySound(42, state, 1000, 8000));
  assert(!shouldPlayKittyHappySound(42, state, 5000, 8000));
  assert(shouldPlayKittyHappySound(42, state, 9000, 8000));
  assert(shouldPlayKittyHappySound(43, state, 9000, 8000));
});

Deno.test("audio wiring only emits sfx debug events when enabled", () => {
  const events = [];
  setSfxDebugLogger((event) => events.push(event));
  setSfxDebugEnabled(false);

  reportSfxDebugInvocation({ id: "spell:fireball", bus: "spells" });
  assert(events.length === 0);

  setSfxDebugEnabled(true);
  assert(isSfxDebugEnabled());
  reportSfxDebugInvocation({ id: "spell:fireball", bus: "spells", volume: 0.8 });
  assert(events.length === 1);
  assert(events[0].id === "spell:fireball");
  assert(events[0].bus === "spells");

  setSfxDebugEnabled(false);
  assert(!isSfxDebugEnabled());
  setSfxDebugLogger(null);
  reportSfxDebugInvocation({ id: "spell:heal", bus: "spells", volume: 0.5 });
  assert(events.length === 1);

  setSfxDebugEnabled(false);
  setSfxDebugLogger(null);
});
