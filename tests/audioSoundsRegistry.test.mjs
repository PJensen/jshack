import "./helpers/installContentCatalog.mjs";
import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { allUrls, resolve, resolveUrls } from "../src/display/audio/sounds.js";

Deno.test("sounds registry only references audio files present on disk", () => {
  const filenames = new Set();
  function collect(dir, prefix = "") {
    for (const entry of Deno.readDirSync(dir)) {
      const path = `${dir}/${entry.name}`;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory) collect(path, name);
      else if (entry.isFile) filenames.add(name);
    }
  }
  collect("assets/audio");

  for (const url of allUrls()) {
    const file = String(url).replace("./assets/audio/", "");
    assert(filenames.has(file), `missing audio file referenced by registry: ${url}`);
  }
});

Deno.test("sounds registry exposes thrown potion impact sound", () => {
  const sound = resolve("item:impact:potion");
  const throwSound = resolve("action:throw");

  assertExists(sound);
  assertEquals(sound.bus, "items");
  assertExists(throwSound);
  assertEquals(throwSound.file, "action_throw.mp3");
  assertEquals(throwSound.bus, "items");
});

Deno.test("sounds registry exposes taming and genocide success sounds", () => {
  const taming = resolve("magic:taming");
  const spiritSurge = resolve("magic:spirit-surge");
  const genocide = resolve("item:scroll:genocide");
  assertExists(taming);
  assertExists(genocide);
  assertEquals(taming.file, "fairy_glow.mp3");
  assertEquals(taming.bus, "spells");
  assertEquals(spiritSurge?.file, "fairy_glow.mp3");
  assertEquals(spiritSurge?.bus, "spells");
  assertEquals(genocide.file, "use_scroll_geno.mp3");
  assertEquals(genocide.bus, "items");
});

Deno.test("sounds registry exposes spirit, spectral, kitty, and shop sounds", () => {
  const spirit = resolve("spirit:collect");
  const spectral = resolve("spectral:alert");
  const spectralSnake = resolve("spectral:snake:alert");
  const kitty = resolve("creature:kitty:happy");
  const purchase = resolve("shop:purchase");

  assertEquals(spirit?.file, "sound_click.mp3");
  assertEquals(spirit?.maxVoices, 16);
  assertEquals(spectral?.file, "ghost_alerted.mp3");
  assertEquals(spectralSnake?.file, "spectral_snake_alerted.mp3");
  assertEquals(kitty?.file, "pet_meow_2.mp3");
  assertEquals(purchase?.file, "ambient_cash_register.mp3");
});

Deno.test("sounds registry exposes fountain ambient loop as mp3", () => {
  const sound = resolve("fountain");
  assertExists(sound);
  assertEquals(sound.file, "ambient_fountain.mp3");
  assertEquals(sound.bus, "ambient");
});

Deno.test("sounds registry exposes portal lifecycle and idle sounds", () => {
  const created = resolve("portal:created");
  const destroyed = resolve("portal:destroyed");
  const idle = resolve("ambient:portal_idle");

  assertExists(created);
  assertExists(destroyed);
  assertExists(idle);
  assertEquals(created.file, "action_portal_created.mp3");
  assertEquals(destroyed.file, "action_portal_destroyed.mp3");
  assertEquals(idle.file, "ambient_portal_idle.mp3");
  assertEquals(created.bus, "ambient");
  assertEquals(destroyed.bus, "ambient");
  assertEquals(idle.bus, "ambient");
  assertEquals(idle.volume, 0.6);
});

Deno.test("sounds registry exposes both dungeon loop beds and keeps omen separate", () => {
  const dungeonUrls = resolveUrls("ambient:dungeon");
  const omen = resolve("ambient:omen");

  assertEquals(dungeonUrls, [
    "./assets/audio/ambient_dungeon_1.mp3",
    "./assets/audio/ambient_dungeon_2.mp3",
  ]);
  assertExists(omen);
  assertEquals(omen.file, "ambient_dungeon_omen.mp3");
});

Deno.test("sounds registry adopts descriptive weather filenames", () => {
  const stairAscend = resolve("stair:ascend");
  const stairDescend = resolve("stair:descend");
  const thunder = resolve("thunder");
  const distantThunder = resolve("thunder:distant");
  const rain = resolve("rain:loop");
  const church = resolve("ambient:church");
  const churchBell = resolve("church:bell");
  const bubbles = resolve("ambient:bubbles");
  const cookingFire = resolve("ambient:cooking_fire");
  const cookingResult = resolve("craft:cooking:result");
  const holySite = resolve("ambient:holy_site");
  const smithy = resolve("ambient:smithy");
  const torchFlames = resolve("ambient:torch_flames");
  const woodChop = resolve("action:wood_chop");
  const harvestPlant = resolve("action:harvest_plant");
  const millstoneGrind = resolve("action:millstone_grind");
  assertEquals(harvestPlant?.file, "action_harvest_plant.mp3");
  const woodcutter = resolve("ambient:woodcutter");
  const ringing = resolve("ears:ringing");
  const metalDrop = resolve("item:drop:weapon:metal");
  const meteorImpact = resolve("spell:impact:meteor");
  const town = resolve("ambient:town");
  const tavern = resolve("ambient:tavern");
  const snakeAlert = resolve("snake:alert");
  const spiderAlert = resolve("spider:alert");
  const caveBearAlert = resolve("cave_bear:alert");
  const ratAlert = resolve("rat:alert");
  const boneDrop = resolve("item:drop:bone");
  const searchPing = resolve("action:search_ping");
  const searchFound = resolve("action:search_found");
  const secretFound = resolve("action:secret_found");
  const boneChime = resolve("ambient:bone_chime");
  const roar = resolve("ambient:roar");
  const whisper = resolve("ambient:whisper");
  const shieldBlocked = resolve("shield:blocked");
  const caveBearAttack = resolve("cave_bear:attack");
  const gemSocket = resolve("item:socket:gem");
  const ratAttack = resolve("rat:attack");
  const squirrel = resolve("ambient:squirrel");
  assertExists(stairAscend);
  assertExists(stairDescend);
  assertExists(thunder);
  assertExists(distantThunder);
  assertExists(rain);
  assertExists(church);
  assertExists(churchBell);
  assertExists(bubbles);
  assertExists(cookingFire);
  assertExists(holySite);
  assertExists(smithy);
  assertExists(torchFlames);
  assertExists(woodChop);
  assertExists(woodcutter);
  assertExists(ringing);
  assertExists(metalDrop);
  assertExists(meteorImpact);
  assertExists(town);
  assertExists(tavern);
  assertExists(snakeAlert);
  assertExists(spiderAlert);
  assertExists(caveBearAlert);
  assertExists(ratAlert);
  assertExists(boneDrop);
  assertExists(secretFound);
  assertExists(boneChime);
  assertExists(roar);
  assertExists(whisper);
  assertExists(shieldBlocked);
  assertExists(caveBearAttack);
  assertExists(ratAttack);
  assertExists(squirrel);
  assertEquals(stairAscend.file, "transition_coating.mp3");
  assertEquals(stairDescend.file, "transition_coating.mp3");
  assertEquals(thunder.file, "weather_lightning_strike.mp3");
  assertEquals(distantThunder.file, "weather_lightning_strike_distant.mp3");
  assertEquals(rain.file, "weather_rain.mp3");
  assertEquals(church.file, "ambient_church_inside.mp3");
  assertEquals(churchBell.file, "ambient_church_bells.mp3");
  assertEquals(bubbles.file, "ambient_bubbles.mp3");
  assertEquals(cookingFire.file, "ambient_cooking_fire.mp3");
  assertEquals(cookingResult.file, "ambient_cooking_fire.mp3");
  assertEquals(cookingResult.bus, "items");
  assertEquals(holySite.file, "ambient_holy_site.mp3");
  assertEquals(smithy.file, "ambient_smithy.mp3");
  assertEquals(torchFlames.file, "ambient_torch_flames.mp3");
  assertEquals(woodChop.file, "action_wood_chop.mp3");
  assertEquals(woodChop.bus, "ambient");
  assert(woodChop.randomPitch > 0);
  assertEquals(millstoneGrind.file, "action_millstone_grind.mp3");
  assertEquals(millstoneGrind.bus, "ambient");
  assert(millstoneGrind.randomPitch > 0);
  assertEquals(woodcutter.file, "ambient_woodcutter.mp3");
  assertEquals(woodcutter.bus, "ambient");
  assert(ringing.files?.includes("status_deafened.mp3"));
  assert(ringing.files?.includes("status_deafened_2.mp3"));
  assertEquals(metalDrop.file, "drop_weapon_metal.mp3");
  assert(meteorImpact.files?.includes("spell_meteor_impact.mp3"));
  assert(meteorImpact.files?.includes("spell_meteor_impact_2.mp3"));
  assertEquals(town.file, "ambient_town.mp3");
  assertEquals(tavern.file, "ambient_tavern.mp3");
  assertEquals(snakeAlert.file, "snake_alerted.mp3");
  assertEquals(spiderAlert.file, "insect_alerted.mp3");
  assertEquals(caveBearAlert.file, "cave_bear_alerted.mp3");
  assertEquals(caveBearAttack.maxVoices, 1);
  assertEquals(gemSocket.file, "drop_gem.mp3");
  assertEquals(ratAlert.file, "rat_alerted_1.mp3");
  assertEquals(squirrel.file, "ambient_squirrel.mp3");
  assertEquals(squirrel.bus, "ambient");
  assertEquals(squirrel.volume, 1.0);
  assertEquals(boneDrop.file, "bone_dropped.mp3");
  assertEquals(searchPing.file, "action_search_ping.mp3");
  assertEquals(searchPing.maxVoices, 2);
  assertEquals(searchFound.file, "action_search_found.mp3");
  assertEquals(searchFound.maxVoices, 2);
  assertEquals(secretFound.file, "action_secret_found.mp3");
  assertEquals(boneChime.file, "ambient_bone_chime.mp3");
  assertEquals(roar.file, "ambient_roar.mp3");
  assert(whisper.files?.includes("ambient_whisper_1.mp3"));
  assert(whisper.files?.includes("ambient_whisper_2.mp3"));
  assert(shieldBlocked.files && shieldBlocked.files.length === 12);
  assert(shieldBlocked.files.includes("combat/SHIELD METAL/SHIELD METAL-Deflect-01.mp3"));
  assert(shieldBlocked.files.includes("combat/SHIELD WOOD/SHIELD WOOD-Deflect-01.mp3"));
});

Deno.test("sounds registry exposes spider spell variant pools", () => {
  const seenLunge = new Set();
  const seenWeb = new Set();

  for (let i = 0; i < 40; i++) {
    const lunge = resolve("spell:spider_lunge");
    const web = resolve("spell:web_spit");
    assertExists(lunge);
    assertExists(web);
    seenLunge.add(lunge.file);
    seenWeb.add(web.file);
    assertEquals(lunge.bus, "spells");
    assertEquals(web.bus, "spells");
  }

  assertEquals(seenLunge, new Set(["spider_attack_1.mp3", "spider_attack_2.mp3", "spider_attack_3.mp3"]));
  assertEquals(seenWeb, new Set(["spider_attack_web_1.mp3", "spider_attack_web_2.mp3"]));
});

Deno.test("sounds registry wires quiet spell assets with usable defaults", () => {
  const agony = resolve("spell:agony");
  const cleave = resolve("spell:cleave");
  const channeling = resolve("spell:channeling");

  assertExists(agony);
  assertExists(cleave);
  assertExists(channeling);
  assertEquals(agony.file, "spell_agony.mp3");
  assertEquals(agony.bus, "spells");
  assert(agony.volume > 1, "quiet agony source should be boosted by registry volume");
  assertEquals(cleave.file, "spell_cleave.mp3");
  assertEquals(cleave.bus, "spells");
  assertEquals(channeling.file, "spell_channeling.mp3");
  assertEquals(channeling.bus, "spells");
});

Deno.test("sounds registry caps deafened playback with a short fade", () => {
  const deafened = resolve("status:deafened");

  assertExists(deafened);
  assertEquals(deafened.file, "status_deafened_2.mp3");
  assertEquals(deafened.bus, "ui");
  assert(deafened.stopAfter <= 2.5, "deafened should not linger past a couple seconds before fading");
  assert(deafened.fadeOut > 0, "deafened should fade instead of cutting hard");
});

Deno.test("sounds registry leaves consecrate silent until a better file exists", () => {
  assertEquals(resolve("spell:consecrate"), null);
});

Deno.test("sounds registry exposes eating and boulder move sounds", () => {
  const eating = resolve("item:consume:food");
  const pushStone = resolve("action:move_boulder");
  const switchOn = resolve("action:switch_on");
  const switchOff = resolve("action:switch_off");
  const npcHmm = resolve("npc_hmm");

  assertExists(eating);
  assertExists(pushStone);
  assertExists(switchOn);
  assertExists(switchOff);
  assertExists(npcHmm);
  assertEquals(eating.file, "action_eat.mp3");
  assertEquals(eating.bus, "items");
  assertEquals(pushStone.file, "action_move_boulder.mp3");
  assertEquals(pushStone.bus, "ambient");
  assertEquals(switchOn.file, "action_switch_on.mp3");
  assertEquals(switchOn.bus, "ambient");
  assertEquals(switchOff.file, "action_switch_off.mp3");
  assertEquals(switchOff.bus, "ambient");
  assertEquals(npcHmm.file, "npc_hmm.mp3");
  assertEquals(npcHmm.bus, "ui");
});

Deno.test("sounds registry exposes trap, skeleton, and weapon rack sounds", () => {
  const skeletonDied = resolve("creature:skeleton:died");
  const snakeTrap = resolve("trap:snake");
  const spikeTrap = resolve("trap:spike");
  const rackDrop = resolve("rack:weapon:dropped");

  assertExists(skeletonDied);
  assertExists(snakeTrap);
  assertExists(spikeTrap);
  assertExists(rackDrop);
  assertEquals(skeletonDied.file, "skeleton_died.mp3");
  assertEquals(skeletonDied.bus, "combat");
  assertEquals(snakeTrap.file, "trap_snake.mp3");
  assertEquals(snakeTrap.bus, "ambient");
  assertEquals(snakeTrap.segment, 2);
  assertEquals(spikeTrap.file, "trap_spike.mp3");
  assertEquals(spikeTrap.bus, "combat");
  assertEquals(rackDrop.file, "weapon_rack_dropped.mp3");
  assertEquals(rackDrop.bus, "items");
});

Deno.test("sounds registry exposes authored pottery, chest, and equip sounds", () => {
  const urnBreak = resolve("urn:broken");
  const chestOpen = resolve("chest:open");
  const rangedEquip = resolve("item:equip:ranged");
  const armorEquip = resolve("item:equip:armor");
  const genericEquip = resolve("item:equip:generic");

  assertExists(urnBreak);
  assertExists(chestOpen);
  assertExists(rangedEquip);
  assertExists(armorEquip);
  assertExists(genericEquip);
  assertEquals(urnBreak.bus, "items");
  assertEquals(chestOpen.bus, "items");
  assertEquals(rangedEquip.bus, "items");
  assertEquals(armorEquip.bus, "items");
  assertEquals(genericEquip.bus, "items");
});

Deno.test("sounds registry exposes nighttime town owl ambience", () => {
  const owl = resolve("ambient:town:night");

  assertExists(owl);
  assertEquals(owl.file, "ambient_nighttime_owl.mp3");
  assertEquals(owl.bus, "ambient");
});

Deno.test("sounds registry does not reference missing cleave wav", () => {
  const urls = allUrls();

  assert(urls.includes("./assets/audio/spell_cleave.mp3"));
  assert(!urls.includes("./assets/audio/spell_cleave.wav"));
});

Deno.test("sounds registry exposes shield block variant pools", () => {
  const seenShieldBlock = new Set();

  for (let i = 0; i < 40; i++) {
    const blocked = resolve("shield:blocked");
    assertExists(blocked);
    seenShieldBlock.add(blocked.file);
    assertEquals(blocked.bus, "combat");
  }

  for (const file of seenShieldBlock) {
    assert(String(file).startsWith("combat/SHIELD "), `shield block should use combat pack file, got ${file}`);
  }
  assert(seenShieldBlock.size >= 6, "shield block should expose multiple combat-pack variants");
});

Deno.test("sounds registry preloads every spider variant url", () => {
  const urls = allUrls();

  assert(urls.includes("./assets/audio/spider_attack_1.mp3"));
  assert(urls.includes("./assets/audio/spider_attack_2.mp3"));
  assert(urls.includes("./assets/audio/spider_attack_3.mp3"));
  assert(urls.includes("./assets/audio/spider_attack_web_1.mp3"));
  assert(urls.includes("./assets/audio/spider_attack_web_2.mp3"));
  assert(urls.includes("./assets/audio/snake_alerted.mp3"));
  assert(urls.includes("./assets/audio/insect_alerted.mp3"));
  assert(urls.includes("./assets/audio/cave_bear_alerted.mp3"));
  assert(urls.includes("./assets/audio/cave_bear_attack_1.mp3"));
  assert(urls.includes("./assets/audio/cave_bear_attack_2.mp3"));
  assert(urls.includes("./assets/audio/rat_alerted_1.mp3"));
  assert(urls.includes("./assets/audio/rat_attack_1.mp3"));
  assert(urls.includes("./assets/audio/insect_attack.mp3"));
  assert(urls.includes("./assets/audio/combat/SHIELD METAL/SHIELD METAL-Deflect-01.mp3"));
  assert(urls.includes("./assets/audio/combat/SHIELD WOOD/SHIELD WOOD-Deflect-01.mp3"));
  assert(urls.includes("./assets/audio/bone_dropped.mp3"));
});

Deno.test("sounds registry wires every spell mp3 asset", () => {
  const urls = new Set(allUrls());
  const spellMp3s = Array.from(Deno.readDirSync("assets/audio"))
    .filter((entry) => entry.isFile && /^spell.*\.mp3$/i.test(entry.name))
    .map((entry) => `./assets/audio/${entry.name}`)
    .sort();

  assert(spellMp3s.length > 0, "expected spell mp3 assets");
  for (const url of spellMp3s) {
    assert(urls.has(url), `missing sound registry entry for ${url}`);
  }
});

Deno.test("sounds registry covers content-authored sound aliases", () => {
  const authored = [
    "blade_ignite",
    "frost_explosion",
    "frost_surge",
    "glass_crack",
    "glass_shatter",
    "holy_beam",
    "holy_chime",
    "holy_sear",
    "poison_bloom",
    "wight_shriek",
  ];

  for (const id of authored) {
    assertExists(resolve(id), `missing content-authored sound alias: ${id}`);
  }
});

Deno.test("sounds registry uses the dedicated holy healing prayer sound", () => {
  const sound = resolve("spell:holy_healing");
  assertExists(sound);
  assertEquals(sound.file, "spell_holy_healing.mp3");
  assertEquals(sound.bus, "spells");
});
