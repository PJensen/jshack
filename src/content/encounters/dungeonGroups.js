import { defineEncounter } from "../define.js";

const GROUPS = [
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
];

for (let i = 0; i < GROUPS.length; i++) {
  defineEncounter(`dungeon:group:${i + 1}`, {
    kind: "dungeon_group",
    ...GROUPS[i],
  });
}
