// Sound registry — maps sound IDs to audio file paths, bus routing, and playback defaults.
//
// Buses:       combat | spells | items | ambient | ui
// maxVoices:   how many of this sound can play at once (default 3)
// randomPitch: cents of random detune jitter per play — opt-in, set after hearing the files

import { COMBAT_PACK, COMBAT_SOUNDS } from "./combatPack.js";

const BASE = "./assets/audio/";

function combatAlias(files, opts = {}) {
  return {
    files,
    bus: "combat",
    maxVoices: 5,
    randomPitch: 35,
    ...opts,
  };
}

/**
 * Each entry:  id → { file|files, bus, maxVoices?, volume?, rate?, detune?, randomPitch?, stopAfter?, fadeOut?, segment? }
 */
const SOUNDS = {
  // ── Combat ──────────────────────────────────────
  "melee:hit":        combatAlias([...COMBAT_PACK.sword_small.impact_soft, ...COMBAT_PACK.mace.impact_soft], { volume: 0.92 }),
  "shield:blocked":   combatAlias([...COMBAT_PACK.shield_metal.deflect, ...COMBAT_PACK.shield_wood.deflect], { volume: 0.95 }),
  "melee:crit":       combatAlias([...COMBAT_PACK.sword_large.impact_hard, ...COMBAT_PACK.axe_large.impact_hard, ...COMBAT_PACK.hammer_large.impact_hard], { volume: 1.05 }),
  "melee:miss":       combatAlias([...COMBAT_PACK.dagger.whoosh_short, ...COMBAT_PACK.sword_small.whoosh_short], { volume: 0.74 }),
  "ranged:shot":      { file: "ranged_shot.mp3",   bus: "combat", randomPitch: 35, volume: 1.35 },
  "ranged:bomb-impact": { file: "spell_meteor_impact.mp3", bus: "combat", maxVoices: 3, volume: 0.9 },
  "death":            combatAlias([...COMBAT_PACK.gore.impact_medium, ...COMBAT_PACK.gore.slice_medium, ...COMBAT_PACK.gore.stab_medium], { maxVoices: 3, volume: 0.85 }),
  "creature:boar:died": { file: "boar_died.mp3",      bus: "combat", maxVoices: 1 },
  "creature:skeleton:died": { file: "skeleton_died.mp3", bus: "combat", maxVoices: 2, randomPitch: 18 },
  "player:death":     { file: "player_death.mp3",   bus: "combat", maxVoices: 1 },
  "player:death:heavy": { file: "player_death_2.mp3", bus: "combat", maxVoices: 1 },
  "player:near_death": { file: "player_near_death.mp3", bus: "combat", maxVoices: 1 },

  // ── Items (by type) ─────────────────────────────
  "item:pickup:weapon":    { file: "pickup_weapon.mp3",   bus: "items" },
  "item:pickup:armor":     { file: "pickup_armor.mp3",    bus: "items" },
  "item:pickup:potion":    { file: "pickup_potion.mp3",   bus: "items" },
  "item:pickup:paper":     { files: ["paper_collect_1.mp3", "paper_collect_2.mp3"], bus: "items", randomPitch: 12 },
  "item:pickup:scroll":    { file: "pickup_scroll.mp3",   bus: "items" },
  "item:pickup:gold":      { file: "pickup_gold.mp3",     bus: "items" },
  "item:pickup:food":      { file: "pickup_food.mp3",     bus: "items" },
  "item:pickup:gem":       { file: "pickup_gem.mp3",      bus: "items" },
  "item:pickup:generic":   { file: "pickup_generic.mp3",  bus: "items" },

  "item:drop:weapon":      { file: "drop_weapon.mp3",     bus: "items" },
  "item:drop:weapon:metal": { file: "drop_weapon_metal.mp3", bus: "items" },
  "item:drop:armor":       { file: "drop_generic.mp3",    bus: "items" },
  "item:drop:potion":      { file: "drop_potion.mp3",     bus: "items" },
  "item:impact:potion":    { file: "impact_potion.mp3",   bus: "items", maxVoices: 4 },
  "action:throw":          { file: "action_throw.mp3",    bus: "items", maxVoices: 3, rate: 0.9, randomPitch: 80, volume: 0.85 },
  "item:drop:gem":         { file: "drop_gem.mp3",        bus: "items" },
  "item:drop:bone":        { file: "bone_dropped.mp3",    bus: "items", maxVoices: 3 },
  "item:drop:gem:glass":   { file: "drop_gem_lesser.mp3", bus: "items" },
  "item:drop:generic":     { file: "drop_generic.mp3",    bus: "items" },

  "item:equip:weapon":     { files: [...COMBAT_PACK.sword_small.equip, ...COMBAT_PACK.dagger.equip, ...COMBAT_PACK.mace.equip], bus: "items", maxVoices: 3, randomPitch: 24, volume: 1.15 },
  "item:equip:ranged":     { file: "equip_ranged.mp3", bus: "items", randomPitch: 18 },
  "item:equip:armor":      { file: "equip_armor.mp3", bus: "items", randomPitch: 18 },
  "item:equip:generic":    { file: "equip_generic.mp3", bus: "items", randomPitch: 18 },
  "item:socket:gem":       { file: "drop_gem.mp3", bus: "items", maxVoices: 2, randomPitch: 18, volume: 0.85 },
  "item:scroll:genocide":  { file: "use_scroll_geno.mp3", bus: "items", maxVoices: 1, volume: 1.0 },
  "magic:taming":          { file: "fairy_glow.mp3",      bus: "spells", maxVoices: 2, volume: 0.9 },
  "magic:spirit-surge":    { file: "fairy_glow.mp3",      bus: "spells", maxVoices: 2, volume: 0.9 },

  "chest:open":            { file: "chest_open.mp3",      bus: "items", randomPitch: 12 },
  "item:chest:opened":     { file: "chest_open.mp3",      bus: "items", randomPitch: 12 },
  "urn:broken":            { file: "break_pottery.mp3",   bus: "items", randomPitch: 30 },

  // ── Environment ─────────────────────────────────
  "stair:descend":    { file: "transition_coating.mp3", bus: "ambient" },
  "stair:ascend":     { file: "transition_coating.mp3", bus: "ambient" },
  "door:open":        { file: "door_open.mp3",     bus: "ambient" },
  "door:close":       { file: "door_close.mp3",    bus: "ambient" },
  "portal:created":   { file: "action_portal_created.mp3", bus: "ambient", maxVoices: 2, volume: 0.95 },
  "portal:destroyed": { file: "action_portal_destroyed.mp3", bus: "ambient", maxVoices: 2, volume: 0.95 },
  "action:search_ping": { file: "action_search_ping.mp3", bus: "ambient", maxVoices: 2, volume: 0.9 },
  "action:search_found": { file: "action_search_found.mp3", bus: "ambient", maxVoices: 2, randomPitch: 8, volume: 0.95 },
  "action:secret_found": { file: "action_secret_found.mp3", bus: "ambient", maxVoices: 1, randomPitch: 8, volume: 0.95 },
  "action:harvest_plant": { file: "action_harvest_plant.mp3", bus: "ambient", maxVoices: 3, randomPitch: 18, volume: 0.9 },
  "action:wood_chop": { file: "action_wood_chop.mp3", bus: "ambient", maxVoices: 3, randomPitch: 55, volume: 0.95 },
  "action:millstone_grind": { file: "action_millstone_grind.mp3", bus: "ambient", maxVoices: 3, randomPitch: 18, volume: 0.9 },
  "millstone_grind": { file: "action_millstone_grind.mp3", bus: "ambient", maxVoices: 3, randomPitch: 18, volume: 0.9 },
  "fountain":         { file: "ambient_fountain.mp3",      bus: "ambient" },
  "ambient:bone_chime": { file: "ambient_bone_chime.mp3",  bus: "ambient", maxVoices: 2, randomPitch: 10 },
  "church:bell":      { file: "ambient_church_bells.mp3",  bus: "ambient", maxVoices: 1 },
  "ambient:church":   { file: "ambient_church_inside.mp3", bus: "ambient" },
  "ambient:bubbles":  { file: "ambient_bubbles.mp3",       bus: "ambient" },
  "ambient:cooking_fire": { file: "ambient_cooking_fire.mp3", bus: "ambient" },
  "craft:cooking:result": { file: "ambient_cooking_fire.mp3", bus: "items", maxVoices: 1, randomPitch: 6, volume: 0.55 },
  "ambient:holy_site": { file: "ambient_holy_site.mp3",    bus: "ambient" },
  "ambient:smithy":   { file: "ambient_smithy.mp3",        bus: "ambient" },
  "ambient:torch_flames": { file: "ambient_torch_flames.mp3", bus: "ambient" },
  "ambient:woodcutter": { file: "ambient_woodcutter.mp3", bus: "ambient" },
  "ambient:portal_idle": { file: "ambient_portal_idle.mp3", bus: "ambient", volume: 0.6 },
  "ambient:town":     { file: "ambient_town.mp3",          bus: "ambient", volume: 0.7 },
  "ambient:town:night": { file: "ambient_nighttime_owl.mp3", bus: "ambient", volume: 0.7 },
  "ambient:nighttime": { file: "ambient_nighttime.mp3", bus: "ambient", volume: 0.75 },
  "ambient:tavern":   { file: "ambient_tavern.mp3",        bus: "ambient" },
  "ambient:ocean":    { file: "biome_ocean_loop.mp3",      bus: "ambient" },
  "ambient:swamp":    { files: ["biome_swamp_loop.mp3", "ambient_swamp.mp3"], bus: "ambient" },
  "ambient:forest":   { files: ["ambient_forest_1.mp3", "ambient_forest_2.mp3"], bus: "ambient" },
  "ambient:meadow":   { file: "ambient_meadow_1.mp3",      bus: "ambient" },
  "ambient:dungeon":  { files: ["ambient_dungeon_1.mp3", "ambient_dungeon_2.mp3"], bus: "ambient" },
  "ambient:omen":     { file: "ambient_dungeon_omen.mp3",  bus: "ambient", maxVoices: 1 },
  "ambient:chick":    { file: "chick.mp3",                 bus: "ambient", maxVoices: 4, volume: 0.35 },
  "ambient:chicken":  { file: "chicken.mp3",               bus: "ambient", maxVoices: 4, volume: 0.35 },
  "ambient:squirrel": { file: "ambient_squirrel.mp3",      bus: "ambient", maxVoices: 1, volume: 1.0 },
  "character:select":  { file: "character_select.mp3",      bus: "ui", maxVoices: 1 },
  "enter:world":       { file: "enter_world.mp3",           bus: "ui", maxVoices: 1 },
  "snake:alert":      { file: "snake_alerted.mp3",         bus: "combat", maxVoices: 2, randomPitch: 18 },
  "spider:alert":     { file: "insect_alerted.mp3",       bus: "combat", maxVoices: 2, randomPitch: 20 },
  "insect:alert":     { file: "insect_alerted.mp3",        bus: "combat", maxVoices: 3, randomPitch: 24 },
  "grid_bug:alert":     { file: "grid_bug_alerted.mp3",        bus: "combat", maxVoices: 3, randomPitch: 24 },
  "gelatinous_cube:alert": { file: "gelatinous_cube_alerted.mp3", bus: "combat", maxVoices: 1, randomPitch: 8 },
  "cave_bear:alert":  { file: "cave_bear_alerted.mp3",     bus: "combat", maxVoices: 2, randomPitch: 15 },
  "rat:alert":        { file: "rat_alerted_1.mp3",         bus: "combat", maxVoices: 3, randomPitch: 25 },
  "spectral:alert":   { file: "ghost_alerted.mp3",         bus: "combat", maxVoices: 3, randomPitch: 18 },
  "spectral:snake:alert": { file: "spectral_snake_alerted.mp3", bus: "combat", maxVoices: 3, randomPitch: 18 },
  "creature:alert:large_beast": { file: "creature_alerted_large_beast.mp3", bus: "combat", maxVoices: 2, randomPitch: 15 },
  "deity:omen":       { file: "harp_reverb.mp3",   bus: "ambient", maxVoices: 2 },

  // ── Spells (cast / launch) ─────────────────────
  "spell:bolt":          { file: "spell_buff.mp3",          bus: "spells" },
  "spell:agony":         { file: "spell_agony.mp3",         bus: "spells", volume: 1.25 },
  "spell:frost":         { file: "spell_frost.mp3",         bus: "spells" },
  "spell:frost_nova":    { file: "spell_frost.mp3",         bus: "spells" },
  "spell:shadow_bolt":   { file: "spell_agony.mp3",         bus: "spells" },
  "spell:fireball":      { files: ["spell_fire.mp3", "spell_fireball.mp3"], bus: "spells" },
  "spell:meteor":        { file: "spell_meteor_impact.mp3", bus: "spells" },
  "spell:blizzard":      { file: "spell_frost.mp3",         bus: "spells" },
  "spell:firestorm":     { file: "spell_fire.mp3",          bus: "spells" },
  "spell:blastwave":     { file: "spell_earthshatter_1.mp3", bus: "spells" },
  "spell:heal":          { file: "healing_magic_1.mp3",     bus: "spells", maxVoices: 2 },
  "spell:flash_heal":    { file: "healing_magic_1.mp3",     bus: "spells", maxVoices: 2 },
  "spell:smite":         { file: "spell_smite_1.mp3",         bus: "spells", maxVoices: 1 },
  "spell:death_volley":  { file: "spell_agony.mp3",         bus: "spells" },
  "spell:blink":         { file: "spell_blink.mp3",          bus: "spells" },
  "spell:plague_swarm":  { file: "spell_plague_swarm.mp3",  bus: "spells" },
  "spell:earthshatter":  { file: "spell_earthshatter_1.mp3", bus: "spells" },
  "spell:war_cry":       { file: "boar_charge.mp3",         bus: "spells" },
  "spell:cleave":        { file: "spell_cleave.mp3",        bus: "spells" },
  "spell:rampage":       { file: "spell_lifetap.mp3",       bus: "spells" },
  "spell:phase_strike":  { file: "spell_phase_strike.mp3",          bus: "spells" },
  "spell:shield_bash":   { files: COMBAT_PACK.shield_metal.impact_hard,  bus: "spells", randomPitch: 24 },
  "spell:wolf_howl":     { file: "spell_wolf_howl.mp3",     bus: "spells" },
  "spell:boar_charge":   { file: "boar_charge.mp3",         bus: "spells" },
  "spell:consecrate":    { file: null,                      bus: "spells" },
  "spell:divine_shield": { file: "spell_buff.mp3",          bus: "spells" },
  "spell:purify":        { file: "water_magic_1.mp3",       bus: "spells" },
  "spell:bloodthirst":   { file: "spell_lifetap.mp3",       bus: "spells" },
  "spell:verdant_ward":  { file: "spell_buff.mp3",          bus: "spells" },
  "spell:harmony_ward":  { file: "spell_buff.mp3",          bus: "spells" },
  "spell:shadow_veil":   { file: "spell_smoke_bomb.mp3",    bus: "spells" },
  "spell:smoke_bomb":    { files: ["spell_smoke_bomb.mp3"], bus: "spells" },
  "spell:poison_blade":  { file: "status_slimed.mp3",       bus: "spells" },
  "spell:lifetap":       { file: "spell_lifetap.mp3",       bus: "spells" },
  "spell:acid_spit":     { file: "spell_acid_spit.mp3",     bus: "spells" },
  "spell:web_spit":      { files: ["spider_attack_web_1.mp3", "spider_attack_web_2.mp3"], bus: "spells", randomPitch: 20 },
  "spell:spider_lunge":  { files: ["spider_attack_1.mp3", "spider_attack_2.mp3", "spider_attack_3.mp3"], bus: "spells", randomPitch: 25 },
  "spell:entangle":      { file: "spell_entangle.mp3",      bus: "spells" },
  "cave_bear:attack":   { files: ["cave_bear_attack_1.mp3", "cave_bear_attack_2.mp3"], bus: "combat", maxVoices: 1, randomPitch: 18, volume: 0.9 },
  "rat:attack":         { file: "rat_attack_1.mp3", bus: "combat", maxVoices: 4, randomPitch: 35 },
  "insect:attack":      { file: "insect_attack.mp3", bus: "combat", maxVoices: 4, randomPitch: 35 },
  "spider:attack":      { files: ["spider_attack_1.mp3", "spider_attack_2.mp3", "spider_attack_3.mp3", "insect_attack.mp3"], bus: "combat", maxVoices: 4, randomPitch: 30 },
  "spell:fizzle":        { file: "status_deafened.mp3",     bus: "spells" },

  // ── Spell travel (in-flight projectile) ────────
  "travel:fire":       { file: "spell_fire.mp3",             bus: "spells" },
  "travel:ice":        { file: "spell_frost.mp3",            bus: "spells" },
  "travel:lightning":  { file: "weather_lightning_strike.mp3", bus: "spells" },
  "travel:shadow":     { file: "spell_agony.mp3",            bus: "spells" },
  "travel:holy":       { file: "harp_reverb.mp3",            bus: "spells" },
  "travel:poison":     { file: "status_slimed.mp3",          bus: "spells" },
  "travel:arrow":      { file: "ranged_shot.mp3",            bus: "combat" },

  // ── Spell impacts (hit after travel) ───────────
  "spell:impact:fire":      { file: "spell_fireball.mp3",   bus: "spells", maxVoices: 4 },
  "spell:impact:meteor":    { files: ["spell_meteor_impact.mp3", "spell_meteor_impact_2.mp3"], bus: "spells", maxVoices: 3 },
  "spell:impact:ice":       { file: "impact_ice.mp3",       bus: "spells", maxVoices: 4 },
  "spell:impact:lightning":  { file: "weather_lightning_strike.mp3", bus: "spells", maxVoices: 4 },
  "spell:impact:shadow":    { file: "spell_agony.mp3",     bus: "spells", maxVoices: 4 },
  "spell:impact:holy":      { file: "harp_reverb.mp3",     bus: "spells", maxVoices: 4 },
  "spell:impact:poison":    { file: "status_slimed.mp3",   bus: "spells", maxVoices: 4 },
  "spell:impact:physical":  { files: [...COMBAT_PACK.sword_small.impact_soft, ...COMBAT_PACK.mace.impact_soft], bus: "spells", maxVoices: 4, randomPitch: 28 },

  // ── Weather ─────────────────────────────────────
  "thunder":          { file: "weather_lightning_strike.mp3",          bus: "ambient", maxVoices: 2 },
  "thunder:distant":  { file: "weather_lightning_strike_distant.mp3",  bus: "ambient", maxVoices: 2 },
  "rain:loop":        { file: "weather_rain.mp3",                      bus: "ambient" },

  // ── Crafting / Smithy ───────────────────────────
  "smithy:anvil:hit": { files: ["anvil_hit_1.mp3", "anvil_hit_2.mp3"], bus: "ambient", maxVoices: 3, randomPitch: 40 },

  // ── Status Effects ──────────────────────────────
  "status:electrocuted": { file: "status_electrocuted.mp3", bus: "combat", maxVoices: 1 },
  "status:slimed":       { file: "status_slimed.mp3",       bus: "combat", maxVoices: 1 },
  "status:deafened":     { file: "status_deafened_2.mp3", bus: "ui", maxVoices: 1, stopAfter: 2.0, fadeOut: 0.55 },
  "ears:ringing":         { files: ["status_deafened.mp3", "status_deafened_2.mp3"], bus: "ui", maxVoices: 1, stopAfter: 2.0, fadeOut: 0.55 },
  "status:frozen":       { files: ["status_frozen_1.mp3", "status_frozen_2.mp3", "status_frozen_3.mp3", "status_frozen_4.mp3", "status_frozen_5.mp3"], bus: "combat", maxVoices: 1 },

  // ── Interactions ────────────────────────────────
  "fountain:sip":     { file: "fountain_sip.mp3",    bus: "items" },
  "water:magic":      { file: "water_magic_1.mp3",   bus: "spells", maxVoices: 2 },
  "teleported":       { file: "teleported.mp3",      bus: "spells", maxVoices: 2 },
  "item:consume:food": { file: "action_eat.mp3",     bus: "items" },
  "action:move_boulder": { file: "action_move_boulder.mp3", bus: "ambient", maxVoices: 2, randomPitch: 18, volume: 0.9 },
  "action:switch_on": { file: "action_switch_on.mp3", bus: "ambient", maxVoices: 2, randomPitch: 8 },
  "action:switch_off": { file: "action_switch_off.mp3", bus: "ambient", maxVoices: 2, randomPitch: 8 },
  "trap:snake":       { file: "trap_snake.mp3",      bus: "ambient", maxVoices: 1, segment: 2 },
  "trap:spike":       { file: "trap_spike.mp3",      bus: "combat", maxVoices: 3, randomPitch: 12 },
  "rack:weapon:dropped": { file: "weapon_rack_dropped.mp3", bus: "items", maxVoices: 2, randomPitch: 16 },
  "torch:ignite":     { file: "light_fire.mp3",      bus: "ambient" },
  "shop:enter":       { file: "shop_door_chime.mp3", bus: "ui", maxVoices: 1 },
  "shop:purchase":    { file: "ambient_cash_register.mp3", bus: "ui", maxVoices: 2 },
  "spirit:collect":   { file: "sound_click.mp3",      bus: "ui", maxVoices: 16, randomPitch: 10 },
  "npc_hmm":          { file: "npc_hmm.mp3",         bus: "ui", maxVoices: 2, randomPitch: 10 },
  "quest:completed":  { file: "quest_complete.mp3",  bus: "ui", maxVoices: 1 },
  "blade_ignite":     { file: "light_fire.mp3",      bus: "items" },
  "frost_explosion":  { file: "spell_frost.mp3",     bus: "spells" },
  "frost_surge":      { file: "spell_frost.mp3",     bus: "spells" },
  "glass_crack":      { file: "drop_gem_lesser.mp3", bus: "items" },
  "glass_shatter":    { file: "impact_potion.mp3",   bus: "items" },
  "holy_beam":        { file: "spell_smite_1.mp3",   bus: "spells" },
  "holy_chime":       { file: "harp_reverb.mp3",     bus: "ui" },
  "holy_sear":        { file: "spell_smite_1.mp3",   bus: "spells" },
  "poison_bloom":     { file: "status_slimed.mp3",   bus: "spells" },
  "wight_shriek":     { file: "spell_agony.mp3",     bus: "combat" },

  // ── Creatures (vocalizations) ───────────────────
  "creature:pet:meow":    { file: "pet_meow_1.mp3",          bus: "ambient", maxVoices: 2 },
  "creature:kitty:happy":  { file: "pet_meow_2.mp3",          bus: "ambient", maxVoices: 1 },
  "creature:pet:eating":  { file: "pet_feline_eating.mp3",   bus: "ambient", maxVoices: 2, segment: 2 },

  // ── Soundscapes ─────────────────────────────────
  "soundscape":       { file: "soundscape.mp3",      bus: "ambient" },
  "ambient:roar": { file: "ambient_roar.mp3", bus: "ambient", maxVoices: 1 },
  "ambient:whisper": { files: ["ambient_whisper_1.mp3", "ambient_whisper_2.mp3"], bus: "ambient", maxVoices: 1, volume: 0.85 },

  // ── Additional Spell Variants ───────────────────
  "c":      { file: "spell_agony.mp3",     bus: "spells" },
  "spell:channeling": { file: "spell_channeling.mp3", bus: "spells" },

  // ── UI / Misc ───────────────────────────────────
  "level:up":         { file: "quest_complete.mp3",   bus: "ui", maxVoices: 1 },

  // ── Purchased Medieval Combat Pack ──────────────
  ...COMBAT_SOUNDS,
};

/**
 * Resolve a sound ID to its full URL and default options.
 * @param {string} id
 * @returns {{ url: string, file: string, files?: string[], bus?: string, maxVoices?: number, randomPitch?: number, volume?: number, rate?: number, detune?: number, stopAfter?: number, fadeOut?: number, segment?: number } | null}
 */
export function resolve(id) {
  const entry = SOUNDS[id];
  if (!entry) return null;
  const files = Array.isArray(entry.files)
    ? entry.files.filter((file) => typeof file === "string" && file.length > 0)
    : [];
  const file = files.length > 0
    ? files[(Math.random() * files.length) | 0]
    : entry.file;
  if (typeof file !== "string" || file.length <= 0) return null;
  return { ...entry, file, files: files.length > 0 ? files : undefined, url: BASE + file };
}

export function resolveUrls(id) {
  const entry = SOUNDS[id];
  if (!entry) return [];
  if (Array.isArray(entry.files) && entry.files.length > 0) {
    return entry.files
      .filter((file) => typeof file === "string" && file.length > 0)
      .map((file) => BASE + file);
  }
  return typeof entry.file === "string" && entry.file.length > 0 ? [BASE + entry.file] : [];
}

/** All registered file URLs — for preloading. */
export function allUrls() {
  return Object.values(SOUNDS).flatMap((entry) => {
    if (Array.isArray(entry.files) && entry.files.length > 0) {
      return entry.files.map((file) => BASE + file);
    }
    return entry.file ? [BASE + entry.file] : [];
  });
}

/** All registered sound IDs. */
export function allIds() {
  return Object.keys(SOUNDS);
}
