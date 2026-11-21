export default {
  "name": "human_mine",
  "displayName": "Old Mine",
  "keystone": { "x": 0, "y": 0 },
  "width": 9,
  "height": 7,
  "roofed": false,
  "tiles": [
    { "dx": -4, "dy": -1, "tile": "mountain" }, { "dx": -3, "dy": -1, "tile": "mountain" }, { "dx": -2, "dy": -1, "tile": "floor" }, { "dx": -1, "dy": -1, "tile": "floor" }, { "dx": 0, "dy": -1, "tile": "floor" }, { "dx": 1, "dy": -1, "tile": "floor" }, { "dx": 2, "dy": -1, "tile": "floor" }, { "dx": 3, "dy": -1, "tile": "mountain" }, { "dx": 4, "dy": -1, "tile": "mountain" },
    { "dx": -4, "dy": 0, "tile": "mountain" }, { "dx": -3, "dy": 0, "tile": "floor" }, { "dx": -2, "dy": 0, "tile": "floor" }, { "dx": -1, "dy": 0, "tile": "floor" }, { "dx": 0, "dy": 0, "tile": "stair_down" }, { "dx": 1, "dy": 0, "tile": "floor" }, { "dx": 2, "dy": 0, "tile": "floor" }, { "dx": 3, "dy": 0, "tile": "floor" }, { "dx": 4, "dy": 0, "tile": "mountain" },
    { "dx": -4, "dy": 1, "tile": "mountain" }, { "dx": -3, "dy": 1, "tile": "mountain" }, { "dx": -2, "dy": 1, "tile": "floor" }, { "dx": -1, "dy": 1, "tile": "floor" }, { "dx": 0, "dy": 1, "tile": "floor" }, { "dx": 1, "dy": 1, "tile": "floor" }, { "dx": 2, "dy": 1, "tile": "floor" }, { "dx": 3, "dy": 1, "tile": "mountain" }, { "dx": 4, "dy": 1, "tile": "mountain" }
  ],
  "spawns": [
    { "dx": 0, "dy": 0, "kind": "stair_down", "params": { "landmark": "human_mine", "entranceTemplateId": "human_mine" } },
    { "dx": -2, "dy": 0, "kind": "lantern_post", "params": { "landmark": "human_mine" } },
    { "dx": 2, "dy": 0, "kind": "wheelbarrow", "params": { "landmark": "human_mine" } }
  ]
};
