import "./helpers/installContentMonsters.mjs";
import { assertEquals } from "jsr:@std/assert";
import { getEncounter, getEncountersByKind } from "../src/rules/data/encounters.js";

Deno.test("all legacy wild overworld encounters remain authored", () => {
  const entries = getEncountersByKind("overworld_population");
  assertEquals(entries.map((entry) => ({
    creatureId: entry.creatureId,
    biomes: entry.biomes,
    count: entry.count,
    clusterR: entry.clusterR,
  })), [
    { creatureId: "rat", biomes: ["GRASSLAND", "WETLAND"], count: 8, clusterR: 6 },
    { creatureId: "cave_bear", biomes: ["MOUNTAIN", "FOREST"], count: 4, clusterR: 8 },
    { creatureId: "snake", biomes: ["WETLAND", "COASTAL", "GRASSLAND"], count: 6, clusterR: 5 },
    { creatureId: "boar", biomes: ["FOREST", "GRASSLAND"], count: 5, clusterR: 6 },
    { creatureId: "wild_elk", biomes: ["GRASSLAND", "FOREST"], count: 4, clusterR: 7 },
    { creatureId: "giant_frog", biomes: ["WETLAND"], count: 6, clusterR: 5 },
    { creatureId: "mountain_goat", biomes: ["MOUNTAIN"], count: 3, clusterR: 6 },
    { creatureId: "stag_beetle", biomes: ["FOREST"], count: 5, clusterR: 4 },
    { creatureId: "heron", biomes: ["COASTAL", "WETLAND"], count: 2, clusterR: 8 },
    { creatureId: "sand_crab", biomes: ["COASTAL"], count: 5, clusterR: 4 },
    { creatureId: "marsh_witch", biomes: ["WETLAND"], count: 1, clusterR: 3 },
  ]);

  assertEquals(getEncounter("norse:ratatoskr")?.kind, "singleton");
  assertEquals(getEncounter("norse:ratatoskr")?.creatureId, "ratatoskr");
});

Deno.test("all legacy dungeon encounter groups remain authored", () => {
  const groups = getEncountersByKind("dungeon_group");
  assertEquals(groups.length, 16);
  assertEquals(groups.map((group) => ({
    tier: group.tier,
    leader: group.leader,
    followers: group.followers,
    minBudget: group.minBudget,
  })), [
    { tier: 0, leader: "kobold_shaman", followers: [{ id: "goblin", count: 2 }], minBudget: 3 },
    { tier: 0, leader: "skeleton_archer", followers: [{ id: "rat", count: 2 }], minBudget: 3 },
    { tier: 0, leader: "goblin_archer", followers: [{ id: "goblin", count: 2 }], minBudget: 3 },
    { tier: 0, leader: "skeletal_shadow_caster", followers: [{ id: "skeleton_archer", count: 1 }], minBudget: 2 },
    { tier: 0, leader: null, followers: [{ id: "cave_spider", count: 3 }], minBudget: 3 },
    { tier: 0, leader: null, followers: [{ id: "centipede", count: 2 }], minBudget: 2 },
    { tier: 1, leader: "orc_shaman", followers: [{ id: "orc", count: 1 }, { id: "bone_bowman", count: 1 }], minBudget: 3 },
    { tier: 1, leader: "wight", followers: [{ id: "skeleton", count: 1 }, { id: "bone_bowman", count: 1 }], minBudget: 3 },
    { tier: 1, leader: "hobgoblin", followers: [{ id: "orc_shaman", count: 1 }, { id: "bone_bowman", count: 1 }], minBudget: 3 },
    { tier: 1, leader: "phase_spider", followers: [{ id: "bone_bowman", count: 1 }, { id: "orc", count: 1 }], minBudget: 3 },
    { tier: 2, leader: "orc_warchief", followers: [{ id: "dark_acolyte", count: 1 }, { id: "skeletal_marksman", count: 1 }], minBudget: 3 },
    { tier: 2, leader: "dark_acolyte", followers: [{ id: "wraith", count: 1 }, { id: "skeletal_marksman", count: 1 }], minBudget: 3 },
    { tier: 2, leader: "troll", followers: [{ id: "dark_acolyte", count: 1 }, { id: "ogre", count: 1 }], minBudget: 3 },
    { tier: 2, leader: "carrion_shade", followers: [{ id: "skeletal_marksman", count: 1 }, { id: "wight", count: 1 }], minBudget: 3 },
    { tier: 3, leader: "lich", followers: [{ id: "wraith", count: 1 }, { id: "death_archer", count: 1 }], minBudget: 3 },
    { tier: 3, leader: "demon", followers: [{ id: "death_archer", count: 1 }, { id: "lich", count: 1 }], minBudget: 3 },
  ]);
});
