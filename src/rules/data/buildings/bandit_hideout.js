export default {
  "name": "bandit_hideout",
  "displayName": "Bandit Camp",
  "keystone": { "x": 0, "y": 0 },
  "width": 7,
  "height": 7,
  "roofed": false,
  "tiles": [
    { "dx": -2, "dy": -2, "tile": "tree" }, { "dx": -1, "dy": -2, "tile": "grass" }, { "dx": 0, "dy": -2, "tile": "grass" }, { "dx": 1, "dy": -2, "tile": "grass" }, { "dx": 2, "dy": -2, "tile": "tree" },
    { "dx": -2, "dy": -1, "tile": "grass" }, { "dx": -1, "dy": -1, "tile": "floor" }, { "dx": 0, "dy": -1, "tile": "floor" }, { "dx": 1, "dy": -1, "tile": "floor" }, { "dx": 2, "dy": -1, "tile": "grass" },
    { "dx": -2, "dy": 0, "tile": "grass" }, { "dx": -1, "dy": 0, "tile": "floor" }, { "dx": 0, "dy": 0, "tile": "stair_down" }, { "dx": 1, "dy": 0, "tile": "floor" }, { "dx": 2, "dy": 0, "tile": "grass" },
    { "dx": -2, "dy": 1, "tile": "grass" }, { "dx": -1, "dy": 1, "tile": "floor" }, { "dx": 0, "dy": 1, "tile": "floor" }, { "dx": 1, "dy": 1, "tile": "floor" }, { "dx": 2, "dy": 1, "tile": "grass" },
    { "dx": -2, "dy": 2, "tile": "tree" }, { "dx": -1, "dy": 2, "tile": "grass" }, { "dx": 0, "dy": 2, "tile": "grass" }, { "dx": 1, "dy": 2, "tile": "grass" }, { "dx": 2, "dy": 2, "tile": "tree" }
  ],
  "spawns": [
    { "dx": 0, "dy": 0, "kind": "stair_down", "params": { "landmark": "bandit_hideout", "entranceTemplateId": "bandit_hideout" } },
    { "dx": -1, "dy": 1, "kind": "crate", "params": { "landmark": "bandit_hideout" } },
    { "dx": 1, "dy": 1, "kind": "barrel", "params": { "landmark": "bandit_hideout" } },
    { "dx": 0, "dy": -2, "kind": "monster", "params": { "monsterId": "bandit", "depth": 1, "landmark": "bandit_hideout" } }
  ]
};
