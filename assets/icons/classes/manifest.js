// JS Hack class emblems — icons/classes/manifest.js
// Color atlas with alpha. No normal map is included.
// Keys match CLASS_DEFS; coordinates are zero-based pixels.
// import manifest, { sprites } from "./icons/classes/manifest.js";
// Load icons/classes/sheet.webp, then draw the chosen sprite:
// const s = sprites.warden;
// ctx.imageSmoothingEnabled = false;
// ctx.drawImage(image, s.x, s.y, s.width, s.height, x, y, size, size);
const manifest = {
  "image": "sheet.webp",
  "width": 1024,
  "height": 768,
  "columns": 4,
  "rows": 3,
  "cellWidth": 256,
  "cellHeight": 256,
  "sprites": {
    "warden": {
      "x": 0,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 0
    },
    "druid": {
      "x": 256,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 0
    },
    "shaman": {
      "x": 768,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 2
    },
    "outlaw": {
      "x": 512,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 0
    },
    "archeologist": {
      "x": 768,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 0
    },
    "warlock": {
      "x": 0,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 1
    },
    "necromancer": {
      "x": 256,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 1
    },
    "mage": {
      "x": 512,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 1
    },
    "mireborn": {
      "x": 768,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 1
    },
    "pilgrim": {
      "x": 0,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 2
    },
    "cleric": {
      "x": 256,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 2
    },
    "valkyrie": {
      "x": 512,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 2
    }
  }
};
export const sprites = manifest.sprites;
export default manifest;
