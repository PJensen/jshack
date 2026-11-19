export default {
  "name": "well_plaza",
  "keystone": { "x": 0, "y": 0 },
  "width": 5,
  "height": 5,
  "tiles": [
    // dy=-2: north flower row
    { "dx": -2, "dy": -2, "tile": "grass" },
    { "dx": -1, "dy": -2, "tile": "grass" },
    { "dx": 0, "dy": -2, "tile": "grass" },
    { "dx": 1, "dy": -2, "tile": "grass" },
    { "dx": 2, "dy": -2, "tile": "grass" },
    // dy=-1: north cobblestone edge
    { "dx": -1, "dy": -1, "tile": "cobblestone" },
    { "dx": 0, "dy": -1, "tile": "cobblestone" },
    { "dx": 1, "dy": -1, "tile": "cobblestone" },
    { "dx": 2, "dy": -1, "tile": "grass" },
    // dy=0: center with east flower
    { "dx": -1, "dy": 0, "tile": "cobblestone" },
    { "dx": 0, "dy": 0, "tile": "cobblestone" },
    { "dx": 1, "dy": 0, "tile": "cobblestone" },
    { "dx": 2, "dy": 0, "tile": "grass" },
    // dy=1: south cobblestone edge
    { "dx": -1, "dy": 1, "tile": "cobblestone" },
    { "dx": 0, "dy": 1, "tile": "cobblestone" },
    { "dx": 1, "dy": 1, "tile": "cobblestone" },
    { "dx": 2, "dy": 1, "tile": "grass" },
    // dy=2: south flower row
    { "dx": -2, "dy": 2, "tile": "grass" },
    { "dx": -1, "dy": 2, "tile": "grass" },
    { "dx": 0, "dy": 2, "tile": "grass" },
    { "dx": 1, "dy": 2, "tile": "grass" },
    { "dx": 2, "dy": 2, "tile": "grass" }
  ],
  "spawns": [
    { "dx": -1, "dy": -2, "kind": "flower_rose" },
    { "dx": 0, "dy": -2, "kind": "flower_bluebell" },
    { "dx": 1, "dy": -2, "kind": "flower_rose" },
    { "dx": -1, "dy": 2, "kind": "flower_tulip" },
    { "dx": 0, "dy": 2, "kind": "flower_daisy" },
    { "dx": 1, "dy": 2, "kind": "flower_tulip" },
    { "dx": 2, "dy": -1, "kind": "flower_sunflower" },
    { "dx": 2, "dy": 1, "kind": "flower_sunflower" },
    { "dx": 0, "dy": 0, "kind": "fountain" },
    { "dx": 1, "dy": 0, "kind": "catalog_item", "params": { "itemId": "stone_flint" } }
  ]
};
