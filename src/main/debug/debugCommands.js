// src/main/debug/debugCommands.js
// Process ?give, ?effects, and ?audio URL param debug commands at boot.

import { playerEntity } from "../../rules/utils/queries.js";
import { Inventory } from "../../rules/components/Inventory.js";
import { ActiveEffects } from "../../rules/components/ActiveEffects.js";
import { createItemById } from "../../rules/utils/itemFactory.js";
import { addToInventory } from "../../rules/utils/inventoryFacade.js";
import { inventoryItems } from "../../rules/utils/inventoryFacade.js";
import { Brain } from "../../rules/components/Brain.js";
import { Position } from "../../rules/components/Position.js";
import { NamedIdentity } from "../../rules/components/NamedIdentity.js";
import { setTile } from "../../rules/environment/dungeon/tileMap.js";
import { TILE_VOID, TILE_GRASS, CHUNK_SIZE } from "../../rules/environment/dungeon/constants.js";
import { spawnMonsterEntity } from "../../rules/utils/spawnMonsterEntity.js";
import { getMonster } from "../../rules/data/monsters.js";
import { materializeSpawn } from "../../rules/environment/dungeon/populate.js";
import { Collider } from "../../rules/components/Collider.js";
import { Interactable } from "../../rules/components/Interactable.js";
import { Material } from "../../rules/components/Material.js";
import { AggroState } from "../../rules/components/AggroState.js";
import { applyStatusEffect } from "../../rules/utils/effects.js";

// All player-castable spells (from SPELL_DEFS) granted instantly in ?audio mode.
const AUDIO_SPELLS = [
  "agony", "arcane_bolt", "barkskin", "blastwave", "blind", "blink",
  "blizzard", "bloodthirst", "cheap_shot", "cleave", "consecrate",
  "corpses", "dead", "divine_shield", "drain_life", "earthshatter",
  "entangle", "evocation", "fear", "fireball", "firestorm", "flash_heal", "frost", "frost_nova",
  "gridbugs", "harmony_ward", "heal", "hearthstone", "homecoming",
  "holy_strike", "ignite_weapons", "iron_flesh", "kitty", "leech_spores",
  "lifetap", "lightning", "mark_of_death", "meteor", "natures_touch",
  "phase_strike", "plague_swarm", "poison_blade", "primal_roar", "purify",
  "quicken", "rampage", "savage_strike", "scorch", "shadow_bolt",
  "shadow_veil", "smite", "smoke_bomb", "snakes", "spikes", "summon_skeleton",
  "thorn_burst", "touchstone", "verdant_ward", "war_cry",
];

// Sections for the ?audio layout.
// Each section occupies its own row(s) with a labeled sign at the left.
// Items are 2 tiles apart horizontally; SECTION_COLS items per row.
// 2 blank rows separate sections.
// Each entry: string = count 1, { id, count } = explicit count.
const SECTION_COLS = 10;
const ITEM_STRIDE  = 2; // horizontal tiles between item centers

const AUDIO_SECTIONS = [
  {
    label: "GEMS: PRECIOUS",
    items: [
      "gem_dilithium", "gem_diamond",   "gem_ruby",       "gem_jacinth",   "gem_sapphire",
      "gem_black_opal","gem_emerald",   "gem_turquoise",  "gem_citrine",   "gem_aquamarine",
      "gem_amber",     "gem_topaz",     "gem_jet",        "gem_opal",      "gem_chrysoberyl",
      "gem_garnet",    "gem_amethyst",  "gem_jasper",     "gem_fluorite",  "gem_jade",
      "gem_obsidian",  "gem_voidstone", "gem_agate",
    ],
  },
  {
    label: "GEMS: GLASS + STONES",
    items: [
      "glass_white",  "glass_blue",   "glass_red",    "glass_brown",  "glass_orange",
      "glass_yellow", "glass_black",  "glass_green",  "glass_violet",
      "stone_luckstone", "stone_loadstone", "stone_touchstone", "stone_flint", "stone_rock",
    ],
  },
  {
    label: "LIGHTS",
    items: ["lantern", "lantern", "lantern", "torch", "torch", "torch"],
  },
  {
    label: "WEAPONS: NAMED",
    items: ["sunsword", "dawnbreaker", "sun_vessel"],
  },
  {
    label: "WEAPONS: LEGENDARY + EPIC",
    items: [
      "stormcaller_blade",    "soulreaver_axe",     "blade_of_echoes",  "tolling_blade",
      "debtbringer",          "hollow_greatsword",  "soul_ascendant_scythe", "thundergod_maul",
      "cataclysm_axe",        "eclipse_maul",       "howling_maul",     "doom_crossbow",
      "predator_stakebow",    "wardkeeper_shield",  "aegis_of_the_ancient",
    ],
  },
  {
    label: "WEAPONS: COMMON + MAGIC",
    items: [
      "staff_oak", "longsword",  "sword_plain", "dagger_quick", "axe_heavy",
      "iron_mace", "morningstar","bow_short",   "bow_recurve",  "bow_long",
      "warhammer", "flail",      "iron_pickaxe",
    ],
  },
  {
    label: "POTIONS: BENEFICIAL",
    items: [
      "potion_health",       "potion_water",        "potion_holy_water",   "potion_stoneskin",
      "potion_vigor",        "potion_adrenaline",   "potion_mana",         "potion_endurance",
      "potion_second_wind",  "potion_resist_fire",  "potion_resist_poison","potion_anti_venom",
      "potion_resist_electric","potion_resist_acid","potion_radiance",
    ],
  },
  {
    label: "POTIONS: CURSED",
    items: [
      "potion_poison",  "potion_sickness",    "potion_paralysis",   "potion_hallucination",
      "potion_blindness","potion_weakness",   "potion_mana_surge",  "potion_keen_edge",
      "potion_lethargy","potion_confusion",
    ],
  },
  {
    label: "SCROLLS",
    items: [
      "scroll_mapping",     "scroll_blastwave",   "scroll_homecoming",  "scroll_heal",
      "scroll_summon_skeleton","scroll_taming",   "scroll_identify",    "scroll_remove_curse",
      "scroll_amnesia",     "scroll_fire",         "scroll_aggravation", "scroll_genocide",
      "scroll_teleportation","scroll_polymorph",  "scroll_cursing",     "scroll_summoning",
      "scroll_decay",
    ],
  },
  {
    label: "AMMO",
    items: [
      { id: "ammo_arrows",          count: 20 },
      { id: "ammo_fire_arrows",     count: 20 },
      { id: "ammo_piercing_arrows", count: 20 },
      { id: "ammo_bodkin_arrows",   count: 20 },
      { id: "ammo_blunt_arrows",    count: 20 },
    ],
  },
  {
    label: "SPELLBOOKS",
    items: [
      "book_agony",       "book_arcane_bolt", "book_barkskin",    "book_blastwave",  "book_blind",
      "book_blink",       "book_blizzard",    "book_bloodthirst", "book_cheap_shot", "book_cleave",
      "book_consecrate",  "book_corpses",     "book_dead",        "book_divine_shield","book_drain_life",
      "book_earthshatter","book_entangle",    "book_evocation",   "book_fireball",   "book_firestorm",
      "book_flash_heal",  "book_frost",       "book_gridbugs",    "book_harmony_ward","book_heal",
      "book_hearthstone", "book_homecoming",  "book_holy_strike", "book_ignite_weapons","book_iron_flesh",
      "book_kitty",       "book_leech_spores","book_lightning",   "book_mark_of_death","book_meteor",
      "book_natures_touch","book_phase_strike","book_plague_swarm","book_poison_blade","book_primal_roar",
      "book_purify",      "book_quicken",     "book_rampage",     "book_savage_strike","book_scorch",
      "book_shadow_bolt", "book_shadow_veil", "book_smite",       "book_smoke_bomb", "book_snakes",
      "book_spikes",      "book_summon_skeleton","book_thorn_burst","book_touchstone","book_verdant_ward",
      "book_war_cry",
    ],
  },
];

// All monster IDs — spawned frozen (stasis) in a dedicated row.
const AUDIO_MONSTERS = [
  "rat",           "goblin",          "goblin_archer",    "loot_goblin",
  "bandit",        "bandit_archer",   "boar",             "bat",
  "flaming_bat",   "grid_bug",        "cave_snake",       "cave_spider",
  "snake",         "pit_viper",       "cave_bear",        "dragon_whelp",
  "skeleton_archer","skeletal_shadow_caster","floating_eye","kobold_shaman",
  "bone_bowman",   "dire_wolf",       "bandit_captain",   "acid_spitter",
  "skeletal_agony_warlock","orc",     "skeleton",         "orc_shaman",
  "hobgoblin",     "phase_spider",    "wight",            "spider",
  "druid",         "skeletal_marksman","skeleton_sharpshooter","troll",
  "wraith",        "ogre",            "carrion_shade",    "dark_acolyte",
  "orc_warchief",  "death_archer",    "demon",            "dragon",
  "lich",          "stone_taunter",   "killer_bee",       "gelatinous_cube",
  "cockatrice",    "shrieker",        "rot_grub",         "gas_spore",
  "lichen",        "nymph",           "rust_monster",     "centipede",
];

// Dungeon decorations / features / traps spawned via materializeSpawn.
// Each entry: { label (section heading), items: [{ kind, params? }] }
// Traps rendered first (top row) before items/monsters.
const AUDIO_TRAPS = [
  { kind: "trap", params: { type: "spike"  } },
  { kind: "trap", params: { type: "shock"  } },
  { kind: "trap", params: { type: "pit"    } },
  { kind: "trap", params: { type: "siphon" } },
  { kind: "trap", params: { type: "rust"   } },
  { kind: "trap", params: { type: "swarm"  } },
  { kind: "trap", params: { type: "snake"  } },
];

const AUDIO_DECOR_SECTIONS = [
  {
    label: "DUNGEON FEATURES",
    items: [
      { kind: "fountain" },
      { kind: "altar" },
      { kind: "shrine" },
      { kind: "statue" },
      { kind: "pillar" },
      { kind: "urn" },
      { kind: "web" },
      { kind: "mushrooms" },
      { kind: "torch" },
      { kind: "sarcophagus", params: { depth: 5 } },
      { kind: "weapon_rack",  params: { depth: 5 } },
      { kind: "bone_chime_rack" },
      { kind: "flayed_man" },
      { kind: "hanging_chains" },
      { kind: "drain_throat" },
      { kind: "steam_vent",     params: { periodTurns: 4, activeTurns: 2, range: 3, dirX: 0, dirY: 1, pushForce: 1, damage: 2 } },
      { kind: "pressure_plinth",params: { linkId: "audio_link_1" } },
      { kind: "chain_winch",    params: { linkId: "audio_link_1", togglesTo: "raised" } },
      { kind: "portcullis",     params: { linkId: "audio_link_1" } },
      { kind: "flood_gate_wheel", params: { floodRadius: 3 } },
    ],
  },
  {
    label: "CHESTS",
    items: [
      { kind: "chest", params: { lootTable: "chest:basic",     depth: 1 } },
      { kind: "chest", params: { lootTable: "chest:magic",     depth: 5 } },
      { kind: "chest", params: { lootTable: "chest:epic",      depth: 8 } },
      { kind: "chest", params: { lootTable: "chest:legendary", depth: 12 } },
    ],
  },
];

/**
 * Apply URL-param debug commands (?give, ?effects) to the player.
 * @param {{ world: import('../../lib/ecs-js/index.js').World, runtimeConfig: { giveParam?: string, effectsParam?: string } }} deps
 */
export function applyDebugCommands({ world, runtimeConfig }) {
  // Process ?give query string parameter to spawn items in player inventory
  // Format: ?give=item_id*count,item_id*count
  // Example: ?give=gold*1000,potion_health*5,sword_plain*1
  {
    const giveParam = runtimeConfig.giveParam;
    if (giveParam) {
      const pe = playerEntity(world);
      if (pe) {
        const inv = world.get(pe.id, Inventory);
        if (inv) {
          // Parse comma-separated item specs
          const specs = giveParam.split(',').map(s => s.trim()).filter(Boolean);

          for (const spec of specs) {
            // Parse "item_id*count" format
            const match = spec.match(/^([a-z_]+)(?:\*(\d+))?$/i);
            if (!match) {
              console.warn(`[?give] Invalid format: "${spec}" (expected: item_id*count)`);
              continue;
            }

            const itemId = match[1];
            const count = parseInt(match[2] || '1', 10);

            if (!Number.isFinite(count) || count < 1) {
              console.warn(`[?give] Invalid count for "${itemId}": ${match[2]}`);
              continue;
            }

            try {
              // Use centralized item factory
              const createdItemId = createItemById(world, itemId, { count });

              if (createdItemId !== null) {
                addToInventory(world, pe.id, createdItemId);
                console.debug(`[?give] Created ${count}x ${itemId}`);
              } else {
                console.warn(`[?give] Unknown item: "${itemId}"`);
              }
            } catch (err) {
              console.error(`[?give] Error creating item "${itemId}":`, err);
            }
          }
        }
      }
    }
  }

  // Process ?effects query string parameter to apply status effects to the player.
  // Format: ?effects=key*turns,key*turns   (turns defaults to 5 if omitted)
  // Example: ?effects=bleed*2,poison*10,burning,confused*3
  {
    const effectsParam = runtimeConfig.effectsParam;
    if (effectsParam) {
      const pe = playerEntity(world);
      if (pe) {
        const ae = world.get(pe.id, ActiveEffects);
        const specs = effectsParam.split(',').map(s => s.trim()).filter(Boolean);
        for (const spec of specs) {
          const match = spec.match(/^([a-z_]+)(?:\*(\d+))?$/i);
          if (!match) {
            console.warn(`[?effects] Invalid format: "${spec}" (expected: key or key*turns)`);
            continue;
          }
          const key = match[1].toLowerCase();
          const turnsLeft = parseInt(match[2] || '5', 10);
          if (!Number.isFinite(turnsLeft) || turnsLeft < 1) {
            console.warn(`[?effects] Invalid turns for "${key}": ${match[2]}`);
            continue;
          }
          const effect = { key, turnsLeft, potency: 1, stacks: 1 };
          if (ae && Array.isArray(ae.effects)) {
            ae.effects.push(effect);
          } else {
            world.add(pe.id, ActiveEffects, { effects: [effect] });
          }
          console.debug(`[?effects] Applied ${key} for ${turnsLeft} turn(s)`);
        }
      }
    }
  }

  // Process ?audio: nuke overworld to void, carve a grass stage, grant all spells,
  // and lay out audio-relevant items by section (each section = its own labeled rows).
  if (runtimeConfig.audioMode) {
    const pe = playerEntity(world);
    if (!pe) return;

    const pos = world.get(pe.id, Position);
    if (!pos) return;

    // Item grid origin: 4 tiles east of player, signs 2 tiles left of items.
    const itemsX  = pos.x + 4;
    const signX   = itemsX - 2;

    // Helper: place a labeled sign entity at (signX, y).
    // "audio_sign" identity is in the palette (yellow !). Falls through to
    // the inter?.name fallback in environmentMessages so we see the label.
    function placeSign(label, y) {
      const eid = world.create();
      world.add(eid, Position,      { x: signX, y });
      world.add(eid, NamedIdentity, { name: label, identity: "audio_sign" });
      world.add(eid, Material,      { kind: "wood" });
      world.add(eid, Collider,      { solid: true, blocksSight: false });
      world.add(eid, Interactable,  { action: "readText", params: { textId: "audio_sign" } });
    }

    // Helper: place one item on the floor.
    function placeItem(entry, x, y) {
      const itemId = typeof entry === "string" ? entry : entry.id;
      const count  = typeof entry === "string" ? 1     : (entry.count ?? 1);
      try {
        const eid = createItemById(world, itemId, { count });
        if (eid !== null) {
          world.add(eid, Position, { x, y });
          return true;
        }
        console.warn(`[?audio] Unknown item: "${itemId}"`);
      } catch (err) {
        console.warn(`[?audio] Failed to create "${itemId}":`, err);
      }
      return false;
    }

    // 1. Destroy every entity except the player (buildings, NPCs, spawns, etc.).
    for (const id of Array.from(world.alive)) {
      if (id !== pe.id) world.destroy(id);
    }

    // 2. Lay out sections; track the furthest row used.
    let curRow = pos.y - 2; // start 2 rows above player
    let maxX   = itemsX;
    let placed = 0;

    // 2a. Traps — top row.
    placeSign("TRAPS", curRow);
    let trapCol = 0;
    for (const entry of AUDIO_TRAPS) {
      const x = itemsX + trapCol * ITEM_STRIDE;
      maxX = Math.max(maxX, x);
      try {
        materializeSpawn(world, { kind: entry.kind, x, y: curRow, params: entry.params || {} });
      } catch (err) {
        console.warn(`[?audio] Failed to spawn "${entry.kind}":`, err);
      }
      trapCol++;
      if (trapCol >= SECTION_COLS) { trapCol = 0; curRow++; }
    }
    curRow += 2;

    // 2b. Decor sections — features, chests.
    for (const section of AUDIO_DECOR_SECTIONS) {
      curRow++;
      placeSign(section.label, curRow);
      let col = 0;
      for (const entry of section.items) {
        const x = itemsX + col * ITEM_STRIDE;
        maxX = Math.max(maxX, x);
        try {
          materializeSpawn(world, { kind: entry.kind, x, y: curRow, params: entry.params || {} });
        } catch (err) {
          console.warn(`[?audio] Failed to spawn "${entry.kind}":`, err);
        }
        col++;
        if (col >= SECTION_COLS) { col = 0; curRow++; }
      }
      curRow += 2;
    }

    // 2c. Item sections (gems, potions, weapons, etc.).
    for (const section of AUDIO_SECTIONS) {
      placeSign(section.label, curRow);
      let col = 0;
      for (const entry of section.items) {
        const x = itemsX + col * ITEM_STRIDE;
        if (placeItem(entry, x, curRow)) placed++;
        maxX = Math.max(maxX, x);
        col++;
        if (col >= SECTION_COLS) { col = 0; curRow++; }
      }
      curRow += 2;
    }

    // 3. Monster row — last, label + all monsters frozen in stasis, 2 apart.
    curRow++;
    placeSign("MONSTERS (STASIS)", curRow);
    for (let i = 0; i < AUDIO_MONSTERS.length; i++) {
      const col = i % SECTION_COLS;
      const row = Math.floor(i / SECTION_COLS);
      const x   = itemsX + col * ITEM_STRIDE;
      const y   = curRow + row;
      maxX = Math.max(maxX, x);
      try {
        const def = getMonster(AUDIO_MONSTERS[i]);
        if (!def) { console.warn(`[?audio] Unknown monster: "${AUDIO_MONSTERS[i]}"`); continue; }
        const mid = spawnMonsterEntity(world, { ...def, identity: def.id, x, y });
        if (mid > 0) {
          // Lock aggro to unaware so AI never chases.
          const aggro = world.get(mid, AggroState);
          if (aggro) world.mutate(mid, AggroState, r => { r.alertLevel = "unaware"; });

          // Apply permanent stasis through the topology-only status path.
          applyStatusEffect(world, mid, {
            key: "stasis",
            turnsLeft: Infinity,
            potency: 1,
            stacks: 1,
          });
        }
      } catch (err) {
        console.warn(`[?audio] Failed to spawn monster "${AUDIO_MONSTERS[i]}":`, err);
      }
    }
    curRow += Math.ceil(AUDIO_MONSTERS.length / SECTION_COLS) + 2;

    // 6. Nuke all overworld tiles to TILE_VOID.
    const mapMin = -2 * CHUNK_SIZE;
    const mapMax =  3 * CHUNK_SIZE;
    for (let wx = mapMin; wx < mapMax; wx++) {
      for (let wy = mapMin; wy < mapMax; wy++) {
        setTile(wx, wy, TILE_VOID);
      }
    }

    // 7. Carve walkable grass stage — covers player, signs, full item + monster grid.
    const stageLeft   = pos.x - 3;
    const stageRight  = maxX + 3;
    const stageTop    = pos.y - 5;
    const stageBottom = curRow + 1;
    for (let wx = stageLeft; wx <= stageRight; wx++) {
      for (let wy = stageTop; wy <= stageBottom; wy++) {
        setTile(wx, wy, TILE_GRASS);
      }
    }

    // 8. Learn every player-castable spell directly (mirrors mutations.js learnSpell).
    let brain = world.get(pe.id, Brain);
    if (!brain) {
      try { world.add(pe.id, Brain, {}); } catch {}
      brain = world.get(pe.id, Brain);
    }
    if (brain) {
      if (!Array.isArray(brain.learnedSpellIds)) brain.learnedSpellIds = [];
      for (const spellId of AUDIO_SPELLS) {
        if (!brain.learnedSpellIds.includes(spellId)) brain.learnedSpellIds.push(spellId);
      }
      console.debug(`[?audio] Learned ${AUDIO_SPELLS.length} spells.`);
    }

    console.debug(`[?audio] Placed ${placed} items across ${AUDIO_SECTIONS.length} sections.`);
  }
}
