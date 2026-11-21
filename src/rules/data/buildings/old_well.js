export default {
  "name": "old_well",
  "displayName": "Blackwater Well",
  "keystone": { "x": 0, "y": 0 },
  "width": 5,
  "height": 5,
  "tiles": [
    { "dx": 0, "dy": -2, "tile": "grass" },
    { "dx": -1, "dy": -1, "tile": "cobblestone" }, { "dx": 0, "dy": -1, "tile": "cobblestone" }, { "dx": 1, "dy": -1, "tile": "cobblestone" },
    { "dx": -2, "dy": 0, "tile": "grass" }, { "dx": -1, "dy": 0, "tile": "cobblestone" }, { "dx": 0, "dy": 0, "tile": "stair_down" }, { "dx": 1, "dy": 0, "tile": "cobblestone" }, { "dx": 2, "dy": 0, "tile": "grass" },
    { "dx": -1, "dy": 1, "tile": "cobblestone" }, { "dx": 0, "dy": 1, "tile": "cobblestone" }, { "dx": 1, "dy": 1, "tile": "cobblestone" },
    { "dx": 0, "dy": 2, "tile": "grass" }
  ],
  "spawns": [
    { "dx": 0, "dy": 0, "kind": "stair_down", "params": { "landmark": "old_well", "entranceTemplateId": "old_well" } },
    { "dx": -1, "dy": 0, "kind": "cattail", "params": { "landmark": "old_well" } },
    { "dx": 1, "dy": 0, "kind": "rain_barrel", "params": { "landmark": "old_well" } }
  ]
};
