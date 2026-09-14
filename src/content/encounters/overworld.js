import { defineEncounter } from "../define.js";

// Overworld population is authored content rather than terrain-generator
// policy. The generator consumes these entries deterministically.
const OVERWORLD_POPULATION = [
  { id: "rat", biomes: ["GRASSLAND", "WETLAND"], count: 8, clusterR: 6 },
  { id: "cave_bear", biomes: ["MOUNTAIN", "FOREST"], count: 4, clusterR: 8 },
  { id: "snake", biomes: ["WETLAND", "COASTAL", "GRASSLAND"], count: 6, clusterR: 5 },
  { id: "boar", biomes: ["FOREST", "GRASSLAND"], count: 5, clusterR: 6 },
  { id: "wild_elk", biomes: ["GRASSLAND", "FOREST"], count: 4, clusterR: 7 },
  { id: "giant_frog", biomes: ["WETLAND"], count: 6, clusterR: 5 },
  { id: "mountain_goat", biomes: ["MOUNTAIN"], count: 3, clusterR: 6 },
  { id: "stag_beetle", biomes: ["FOREST"], count: 5, clusterR: 4 },
  { id: "heron", biomes: ["COASTAL", "WETLAND"], count: 2, clusterR: 8 },
  { id: "sand_crab", biomes: ["COASTAL"], count: 5, clusterR: 4 },
  { id: "marsh_witch", biomes: ["WETLAND"], count: 1, clusterR: 3 },
];

for (const entry of OVERWORLD_POPULATION) {
  defineEncounter(`overworld:${entry.id}`, {
    kind: "overworld_population",
    creatureId: entry.id,
    biomes: entry.biomes,
    count: entry.count,
    clusterR: entry.clusterR,
  });
}

defineEncounter("norse:ratatoskr", {
  kind: "singleton",
  creatureId: "ratatoskr",
  uniqueness: "run",
  activation: {
    any: [
      { type: "questCompleted", questId: "starter.rat_infestation" },
      { type: "questCompleted", questId: "starter.priest_fetch" },
    ],
  },
  placement: {
    plane: "overworld",
    biomes: ["FOREST", "GRASSLAND", "WETLAND"],
  },
  lifecycle: "roaming_messenger",
});

defineEncounter("norse:draugr", {
  kind: "singleton",
  creatureId: "draugr",
  uniqueness: "run",
  activation: {
    type: "questCompleted",
    questId: "starter.priest_fetch",
  },
  placement: {
    plane: "underworld",
    minDepth: 4,
  },
  materialization: "near_player",
  lifecycle: "territorial_guardian",
});
