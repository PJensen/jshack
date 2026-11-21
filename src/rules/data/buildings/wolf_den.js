export default {
  "name": "wolf_den",
  "displayName": "Wolf Den",
  "keystone": { "x": 0, "y": 0 },
  "width": 7,
  "height": 7,
  "roofed": false,
  "tiles": [
    { "dx": 0, "dy": -3, "tile": "tree" },
    { "dx": -2, "dy": -2, "tile": "tree" }, { "dx": -1, "dy": -2, "tile": "grass" }, { "dx": 0, "dy": -2, "tile": "floor" }, { "dx": 1, "dy": -2, "tile": "grass" }, { "dx": 2, "dy": -2, "tile": "tree" },
    { "dx": -2, "dy": -1, "tile": "grass" }, { "dx": -1, "dy": -1, "tile": "floor" }, { "dx": 0, "dy": -1, "tile": "floor" }, { "dx": 1, "dy": -1, "tile": "floor" }, { "dx": 2, "dy": -1, "tile": "grass" },
    { "dx": -3, "dy": 0, "tile": "tree" }, { "dx": -2, "dy": 0, "tile": "floor" }, { "dx": -1, "dy": 0, "tile": "floor" }, { "dx": 0, "dy": 0, "tile": "stair_down" }, { "dx": 1, "dy": 0, "tile": "floor" }, { "dx": 2, "dy": 0, "tile": "floor" }, { "dx": 3, "dy": 0, "tile": "tree" },
    { "dx": -1, "dy": 1, "tile": "grass" }, { "dx": 0, "dy": 1, "tile": "floor" }, { "dx": 1, "dy": 1, "tile": "grass" }
  ],
  "spawns": [
    { "dx": 0, "dy": 0, "kind": "stair_down", "params": { "landmark": "wolf_den", "entranceTemplateId": "wolf_den" } },
    { "dx": -1, "dy": 0, "kind": "bone_chime_rack", "params": { "landmark": "wolf_den" } }
  ]
};
