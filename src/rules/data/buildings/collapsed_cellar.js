export default {
  "name": "collapsed_cellar",
  "displayName": "The Buried Hearth",
  "keystone": { "x": 0, "y": 0 },
  "width": 7,
  "height": 7,
  "tiles": [
    { "dx": -2, "dy": -2, "tile": "wall" }, { "dx": -1, "dy": -2, "tile": "wall" }, { "dx": 0, "dy": -2, "tile": "wall" }, { "dx": 1, "dy": -2, "tile": "wall" }, { "dx": 2, "dy": -2, "tile": "wall" },
    { "dx": -2, "dy": -1, "tile": "wall" }, { "dx": -1, "dy": -1, "tile": "floor" }, { "dx": 0, "dy": -1, "tile": "floor" }, { "dx": 1, "dy": -1, "tile": "floor" }, { "dx": 2, "dy": -1, "tile": "wall" },
    { "dx": -2, "dy": 0, "tile": "wall" }, { "dx": -1, "dy": 0, "tile": "floor" }, { "dx": 0, "dy": 0, "tile": "stair_down" }, { "dx": 1, "dy": 0, "tile": "floor" }, { "dx": 2, "dy": 0, "tile": "wall" },
    { "dx": -2, "dy": 1, "tile": "wall" }, { "dx": -1, "dy": 1, "tile": "floor" }, { "dx": 0, "dy": 1, "tile": "floor" }, { "dx": 1, "dy": 1, "tile": "floor" }, { "dx": 2, "dy": 1, "tile": "wall" },
    { "dx": -2, "dy": 2, "tile": "wall" }, { "dx": -1, "dy": 2, "tile": "wall" }, { "dx": 0, "dy": 2, "tile": "door" }, { "dx": 1, "dy": 2, "tile": "wall" }, { "dx": 2, "dy": 2, "tile": "wall" }
  ],
  "spawns": [
    { "dx": 0, "dy": 0, "kind": "stair_down", "params": { "landmark": "collapsed_cellar", "entranceTemplateId": "collapsed_cellar" } },
    { "dx": -1, "dy": 1, "kind": "crate", "params": { "landmark": "collapsed_cellar" } },
    { "dx": 1, "dy": 1, "kind": "barrel", "params": { "landmark": "collapsed_cellar" } }
  ]
};
