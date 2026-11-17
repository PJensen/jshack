import { DEFAULT_PROFILE } from "./profiles/default.js";
import { CATACOMB_PROFILE } from "./profiles/catacombs.js";
import { CAVE_PROFILE } from "./profiles/caves.js";
import { GROTTO_PROFILE } from "./profiles/grottos.js";
import { ARENA_PROFILE } from "./profiles/arenas.js";
import { RAT_CELLAR_LOCK_ID } from "../../data/questLocks.js";

export const UNDERWORLD_REGION_TEMPLATES = {
  tavern_basement: {
    templateId: "tavern_basement",
    label: "Tavern Basement",
    type: "basement",
    floors: 1,
    biome: "cellar",
    monsterTier: 0,
    lootTier: 0,
    questId: "starter.rat_infestation",
    lockId: RAT_CELLAR_LOCK_ID,
    lockDifficulty: "very_hard",
    targetDepth: 1,
    roomTarget: 5,
    content: {
      monsters: [{ count: 12, pool: ["rat"] }],
      spawners: [{ count: 1, pool: [ "rat" ] }],
      traps: [],
      features: [ "torch", "barrel", "crate", "pillar" ],
      chests: [{ lootTable: "chest:epic" }],
    },
    profile: {
      ...DEFAULT_PROFILE,
      id: "basement",
      theme: "cellar",
      bspMaxDepth: 4,
      minLeafSize: 8,
      minRoomSize: 3,
      maxRoomSize: 6,
      roomSparsity: 0.35,
      doorChance: 0.35,
      shopChance: 0,
      hallwayMonsterCap: 1,
      monsterFilter: (def) => String(def?.id || "") === "rat",
    },
  },
  graveyard_crypt: {
    templateId: "graveyard_crypt",
    label: "Graveyard Crypt",
    type: "crypt",
    floors: 3,
    biome: "crypt",
    monsterTier: 0,
    lootTier: 1,
    questId: "starter.priest_fetch",
    targetDepth: 1,
    roomTarget: 6,
    content: {
      monsters: [{ id: "skeleton", count: 12 }, { id: "gelatinous_cube", count: 2 }, { id: "gas_spore", count: 1 }],
      traps: ["spike_trap", "arrow_trap"],
      features: ["urn", "urn", "sarcophagus"],
      chests: [{ lootTable: "chest:basic" }],
      books: ["book_dead"],
    },
    profile: {
      ...CATACOMB_PROFILE,
      id: "crypt",
      theme: "crypt",
      bspMaxDepth: 5,
      roomSparsity: 0.05,
      shopChance: 0,
      hallwayMonsterCap: 2,
      monsterFilter: (def) => {
        const id = String(def?.id || "");
        const tags = Array.isArray(def?.tags) ? def.tags : [];
        return id === "gas_spore" || id === "skeleton" || tags.includes("undead") || tags.includes("skeletal") || tags.includes("aberration");
      },
    },
  },
  priest_rift_crypt: {
    templateId: "priest_rift_crypt",
    label: "Rift Crypt",
    type: "crypt",
    floors: 3,
    biome: "crypt",
    monsterTier: 1,
    lootTier: 2,
    questId: "starter.priest_rift",
    targetDepth: 1,
    roomTarget: 7,
    content: {
      monsters: [{ count: 18, pool: [(def) => !!def] }],
      spawners: [{ count: 2, pool: [(def) => !!def] }],
      traps: ["spike_trap", "arrow_trap", "siphon_trap"],
      features: ["urn", "sarcophagus", "bone_chime_rack", "candle_cluster", "dark_reliquary"],
      chests: [{ lootTable: "chest:epic" }],
    },
    profile: {
      ...CATACOMB_PROFILE,
      id: "rift_crypt",
      theme: "crypt",
      bspMaxDepth: 5,
      minLeafSize: 7,
      minRoomSize: 3,
      maxRoomSize: 6,
      roomSparsity: 0,
      roomSizeBias: 0.65,
      shopChance: 0,
      hallwayMonsterCap: 5,
      doorChance: 0.72,
      corridorWidth: 1,
    },
  },
  bear_cave: {
    templateId: "bear_cave",
    label: "Bear Cave",
    type: "cave",
    floors: 1,
    biome: "mushroom_cave",
    monsterTier: 1,
    lootTier: 1,
    questId: "",
    targetDepth: 1,
    roomTarget: 1,
    content: {
      monsters: [{ id: "cave_bear", count: 1 }],
      traps: [],
      features: ["glowcap_patch", "mushrooms", "mushrooms"],
      chests: [{ lootTable: "chest:basic", fixedDrops: ["food_mushrooms"] }],
    },
    profile: {
      ...CAVE_PROFILE,
      id: "bear_cave",
      theme: "cave",
      bspMaxDepth: 2,
      minRoomSize: 7,
      maxRoomSize: 11,
      roomSparsity: 0.15,
      hallwayMonsterCap: 0,
      monsterFilter: (def) => String(def?.id || "") === "cave_bear",
    },
  },
  bat_cave: {
    templateId: "bat_cave",
    label: "Bat Cave",
    type: "cave",
    floors: 4,
    biome: "cavern",
    monsterTier: 0,
    lootTier: 1,
    questId: "",
    targetDepth: 1,
    roomTarget: 4,
    content: {
      monsters: [{ id: "bat", count: 9 }, { id: "flaming_bat", count: 1 }],
      traps: [],
      features: ["mushrooms", "glowcap_patch", "web_mote_cluster", "web_mote_cluster"],
      chests: [{ lootTable: "chest:basic" }],
    },
    profile: {
      ...GROTTO_PROFILE,
      id: "bat_cave",
      theme: "cave",
      hallwayMonsterCap: 4,
      monsterFilter: (def) => {
        const id = String(def?.id || "");
        return id === "bat" || id === "flaming_bat";
      },
    },
  },
  human_mine: {
    templateId: "human_mine",
    label: "Human Mine",
    type: "mine",
    floors: 5,
    biome: "mine",
    monsterTier: 0,
    lootTier: 1,
    questId: "",
    targetDepth: 1,
    roomTarget: 5,
    content: {
      monsters: [{ id: "cave_spider", count: 4 }],
      npcs: [{ townfolkId: "miner", count: 2 }],
      traps: [],
      features: ["torch", "torch", "crate", "barrel", "harvest_iron_ore", "harvest_coal_ore", "harvest_stone"],
      chests: [{ lootTable: "chest:basic", fixedDrops: ["ore_iron", "ore_coal"] }],
    },
    profile: {
      ...DEFAULT_PROFILE,
      id: "mine",
      theme: "mine",
      minRoomSize: 4,
      maxRoomSize: 8,
      roomSparsity: 0.25,
      doorChance: 0.1,
      hallwayMonsterCap: 1,
    },
  },
  bandit_hideout: {
    templateId: "bandit_hideout",
    label: "Bandit Hideout",
    type: "hideout",
    floors: 4,
    biome: "hideout",
    monsterTier: 1,
    lootTier: 2,
    questId: "",
    targetDepth: 1,
    roomTarget: 4,
    content: {
      monsters: [{ id: "bandit", count: 3 }, { id: "bandit_archer", count: 2 }, { id: "bandit_captain", count: 1 }],
      traps: [{ type: "arrow" }, { type: "spike" }],
      features: ["torch", "crate", "barrel", "weapon_rack"],
      chests: [{ lootTable: "chest:epic" }],
    },
    profile: {
      ...DEFAULT_PROFILE,
      id: "bandit_hideout",
      theme: "bandit",
      roomSparsity: 0.2,
      hallwayMonsterCap: 2,
      monsterFilter: (def) => {
        const id = String(def?.id || "");
        return id === "bandit" || id === "bandit_archer" || id === "bandit_captain";
      },
    },
  },
  old_well: {
    templateId: "old_well",
    label: "Old Well",
    type: "well",
    floors: 2,
    biome: "wet_stone",
    monsterTier: 0,
    lootTier: 0,
    questId: "",
    targetDepth: 1,
    roomTarget: 2,
    content: {
      monsters: [{
        count: 6,
        pool: [
          "rat",
          (def) => {
            const id = String(def?.id || "");
            const tags = Array.isArray(def?.tags) ? def.tags : [];
            if (tags.includes("fire") || tags.includes("bird") || tags.includes("herbivore")) return false;
            return id === "giant_frog"
              || id === "cave_snake"
              || id === "snake"
              || id === "cave_spider"
              || id === "spider"
              || id === "rot_grub"
              || id === "lichen"
              || id === "pit_viper";
          },
        ],
      }],
      traps: [],
      features: ["mushrooms", "urn", "drain_throat"],
      chests: [{ lootTable: "chest:basic" }],
    },
    profile: {
      ...DEFAULT_PROFILE,
      id: "old_well",
      theme: "sewer",
      minRoomSize: 3,
      maxRoomSize: 6,
      roomSparsity: 0.35,
      hallwayMonsterCap: 1,
      hazardBias: "water",
      monsterFilter: (def) => {
        const id = String(def?.id || "");
        return id === "rat" || id === "giant_frog" || id === "cave_snake";
      },
    },
  },
  collapsed_cellar: {
    templateId: "collapsed_cellar",
    label: "Collapsed Cellar",
    type: "basement",
    floors: 2,
    biome: "cellar",
    monsterTier: 0,
    lootTier: 0,
    questId: "",
    targetDepth: 1,
    roomTarget: 2,
    content: {
      monsters: [{ id: "rat", count: 5 }],
      traps: [],
      features: ["torch", "barrel", "crate", "boulder"],
      chests: [{ lootTable: "chest:basic" }],
    },
    profile: {
      ...DEFAULT_PROFILE,
      id: "collapsed_cellar",
      theme: "cellar",
      minRoomSize: 3,
      maxRoomSize: 6,
      roomSparsity: 0.45,
      doorChance: 0.25,
      hallwayMonsterCap: 1,
      monsterFilter: (def) => String(def?.id || "") === "rat",
    },
  },
  wolf_den: {
    templateId: "wolf_den",
    label: "Wolf Den",
    type: "den",
    floors: 3,
    biome: "cave",
    monsterTier: 1,
    lootTier: 1,
    questId: "",
    targetDepth: 1,
    roomTarget: 3,
    content: {
      monsters: [{ id: "dire_wolf", count: 3 }],
      traps: [],
      features: ["bone_chime_rack", "mushrooms", "crate"],
      chests: [{ lootTable: "chest:basic" }],
    },
    profile: {
      ...CAVE_PROFILE,
      id: "wolf_den",
      theme: "cave",
      roomSparsity: 0.25,
      hallwayMonsterCap: 1,
      monsterFilter: (def) => String(def?.id || "") === "dire_wolf",
    },
  },
  forgotten_shrine: {
    templateId: "forgotten_shrine",
    label: "Forgotten Shrine",
    type: "shrine",
    floors: 2,
    biome: "shrine",
    monsterTier: 1,
    lootTier: 2,
    questId: "",
    targetDepth: 1,
    roomTarget: 2,
    content: {
      monsters: [{ id: "skeleton", count: 3 }, { id: "dark_acolyte", count: 1 }],
      traps: [],
      features: ["altar", "shrine", "statue", "candle_cluster"],
      chests: [{ lootTable: "chest:epic" }],
    },
    profile: {
      ...ARENA_PROFILE,
      id: "forgotten_shrine",
      theme: "temple",
      minRoomSize: 5,
      maxRoomSize: 9,
      roomSparsity: 0.2,
      hallwayMonsterCap: 1,
      monsterFilter: (def) => {
        const id = String(def?.id || "");
        const tags = Array.isArray(def?.tags) ? def.tags : [];
        return id === "skeleton" || id === "dark_acolyte" || tags.includes("undead");
      },
    },
  },
  rootbound_grotto: {
    templateId: "rootbound_grotto",
    label: "Rootbound Grotto",
    type: "grotto",
    floors: 3,
    biome: "mushroom_cave",
    monsterTier: 1,
    lootTier: 2,
    questId: "side.rootbound_grotto",
    targetDepth: 1,
    roomTarget: 6,
    content: {
      monsters: [
        { id: "goblin_mosscaller", count: 4 },
        { id: "kobold_cairnkeeper", count: 3 },
        { id: "orc_bloodspeaker", count: 1 },
        { id: "druid", count: 1 },
      ],
      traps: [],
      features: ["mushrooms", "mushrooms", "glowcap_patch", "statue", "fountain", "runestone"],
      chests: [{ lootTable: "chest:epic" }],
    },
    profile: {
      ...CAVE_PROFILE,
      id: "rootbound_grotto",
      theme: "grotto",
      minLeafSize: 7,
      minRoomSize: 3,
      maxRoomSize: 8,
      roomSparsity: 0.08,
      hallwayMonsterCap: 3,
      monsterFilter: (def) => [
        "goblin_mosscaller",
        "kobold_cairnkeeper",
        "orc_bloodspeaker",
        "druid",
      ].includes(String(def?.id || "")),
    },
  },
};

export function getUnderworldRegionTemplate(templateId) {
  return UNDERWORLD_REGION_TEMPLATES[String(templateId || "")] || null;
}

export function floorRegionKey(depth, anchorX = 0, anchorY = 0, templateId = "") {
  const d = Math.max(0, Number(depth || 0) | 0);
  if (d === 0) return "z0:overworld";
  const ax = Number(anchorX || 0) | 0;
  const ay = Number(anchorY || 0) | 0;
  const tid = String(templateId || "generic");
  return `z${d}:${ax},${ay}:${tid}`;
}
