export default {
  "name": "forgotten_shrine",
  "displayName": "Forgotten Shrine",
  "keystone": { "x": 0, "y": 0 },
  "width": 7,
  "height": 7,
  "roofed": false,
  "tiles": [
    { "dx": 0, "dy": -3, "tile": "grass" },
    { "dx": -2, "dy": -2, "tile": "cobblestone" }, { "dx": -1, "dy": -2, "tile": "cobblestone" }, { "dx": 0, "dy": -2, "tile": "cobblestone" }, { "dx": 1, "dy": -2, "tile": "cobblestone" }, { "dx": 2, "dy": -2, "tile": "cobblestone" },
    { "dx": -2, "dy": -1, "tile": "cobblestone" }, { "dx": -1, "dy": -1, "tile": "floor" }, { "dx": 0, "dy": -1, "tile": "floor" }, { "dx": 1, "dy": -1, "tile": "floor" }, { "dx": 2, "dy": -1, "tile": "cobblestone" },
    { "dx": -3, "dy": 0, "tile": "cobblestone" }, { "dx": -2, "dy": 0, "tile": "floor" }, { "dx": -1, "dy": 0, "tile": "floor" }, { "dx": 0, "dy": 0, "tile": "stair_down" }, { "dx": 1, "dy": 0, "tile": "floor" }, { "dx": 2, "dy": 0, "tile": "floor" }, { "dx": 3, "dy": 0, "tile": "cobblestone" },
    { "dx": -2, "dy": 1, "tile": "cobblestone" }, { "dx": -1, "dy": 1, "tile": "floor" }, { "dx": 0, "dy": 1, "tile": "floor" }, { "dx": 1, "dy": 1, "tile": "floor" }, { "dx": 2, "dy": 1, "tile": "cobblestone" },
    { "dx": -2, "dy": 2, "tile": "cobblestone" }, { "dx": -1, "dy": 2, "tile": "cobblestone" }, { "dx": 0, "dy": 2, "tile": "cobblestone" }, { "dx": 1, "dy": 2, "tile": "cobblestone" }, { "dx": 2, "dy": 2, "tile": "cobblestone" }
  ],
  "spawns": [
    { "dx": 0, "dy": 0, "kind": "stair_down", "params": { "landmark": "forgotten_shrine", "entranceTemplateId": "forgotten_shrine" } },
    { "dx": 0, "dy": -1, "kind": "runestone", "params": { "landmark": "forgotten_shrine" } },
    { "dx": -1, "dy": 0, "kind": "statue", "params": { "landmark": "forgotten_shrine" } },
    { "dx": 1, "dy": 0, "kind": "statue", "params": { "landmark": "forgotten_shrine" } }
  ]
};
