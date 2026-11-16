// JS Hack UX sprite atlas. All coordinates are zero-based pixels.
// Original 30 sprites retain their exact pixels and coordinates.
// import manifest, { sprites } from "./manifest.js";
// const s = sprites.damagePower;
// ctx.imageSmoothingEnabled = false;
// ctx.drawImage(image, s.x, s.y, s.width, s.height, x, y, size, size);
const manifest = {
  "image": "sheet.webp",
  "width": 1536,
  "height": 1792,
  "columns": 6,
  "rows": 7,
  "cellWidth": 256,
  "cellHeight": 256,
  "sprites": {
    "character": {
      "x": 0,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 0
    },
    "inventory": {
      "x": 256,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 0
    },
    "equipment": {
      "x": 512,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 0
    },
    "quests": {
      "x": 768,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 0
    },
    "settings": {
      "x": 1024,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 0
    },
    "moonFull": {
      "x": 1280,
      "y": 0,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 0
    },
    "strength": {
      "x": 0,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 1
    },
    "dexterity": {
      "x": 256,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 1
    },
    "intelligence": {
      "x": 512,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 1
    },
    "vitality": {
      "x": 768,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 1
    },
    "health": {
      "x": 1024,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 1
    },
    "mana": {
      "x": 1280,
      "y": 256,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 1
    },
    "stamina": {
      "x": 0,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 2
    },
    "damage": {
      "x": 256,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 2
    },
    "accuracy": {
      "x": 512,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 2
    },
    "avoidance": {
      "x": 768,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 2
    },
    "criticalStrike": {
      "x": 1024,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 2
    },
    "spellPower": {
      "x": 1280,
      "y": 512,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 2
    },
    "moonNew": {
      "x": 0,
      "y": 768,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 3
    },
    "moonWaxingCrescent": {
      "x": 256,
      "y": 768,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 3
    },
    "moonFirstQuarter": {
      "x": 512,
      "y": 768,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 3
    },
    "moonWaxingGibbous": {
      "x": 768,
      "y": 768,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 3
    },
    "moonWaningGibbous": {
      "x": 1024,
      "y": 768,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 3
    },
    "moonLastQuarter": {
      "x": 1280,
      "y": 768,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 3
    },
    "moonWaningCrescent": {
      "x": 0,
      "y": 1024,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 4
    },
    "dawn": {
      "x": 256,
      "y": 1024,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 4
    },
    "day": {
      "x": 512,
      "y": 1024,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 4
    },
    "dusk": {
      "x": 768,
      "y": 1024,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 4
    },
    "night": {
      "x": 1024,
      "y": 1024,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 4
    },
    "midnight": {
      "x": 1280,
      "y": 1024,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 4
    },
    "damagePower": {
      "x": 0,
      "y": 1280,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 5
    },
    "mitigation": {
      "x": 256,
      "y": 1280,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 5
    },
    "luck": {
      "x": 512,
      "y": 1280,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 5
    },
    "critMultiplier": {
      "x": 768,
      "y": 1280,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 5
    },
    "damageBonus": {
      "x": 1024,
      "y": 1280,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 5
    },
    "carry": {
      "x": 1280,
      "y": 1280,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 5
    },
    "maxHpBonus": {
      "x": 0,
      "y": 1536,
      "width": 256,
      "height": 256,
      "column": 0,
      "row": 6
    },
    "speed": {
      "x": 256,
      "y": 1536,
      "width": 256,
      "height": 256,
      "column": 1,
      "row": 6
    },
    "gold": {
      "x": 512,
      "y": 1536,
      "width": 256,
      "height": 256,
      "column": 2,
      "row": 6
    },
    "hunger": {
      "x": 768,
      "y": 1536,
      "width": 256,
      "height": 256,
      "column": 3,
      "row": 6
    },
    "depth": {
      "x": 1024,
      "y": 1536,
      "width": 256,
      "height": 256,
      "column": 4,
      "row": 6
    },
    "turn": {
      "x": 1280,
      "y": 1536,
      "width": 256,
      "height": 256,
      "column": 5,
      "row": 6
    }
  },
  "aliases": {
    "armor": "equipment",
    "critMult": "critMultiplier",
    "dmgBonus": "damageBonus",
    "maxHPBonus": "maxHpBonus"
  },
  "lunarPhases": [
    "moonNew",
    "moonWaxingCrescent",
    "moonFirstQuarter",
    "moonWaxingGibbous",
    "moonFull",
    "moonWaningGibbous",
    "moonLastQuarter",
    "moonWaningCrescent"
  ],
  "dayCycle": [
    "dawn",
    "day",
    "dusk",
    "night",
    "midnight"
  ]
};
for (const [alias, name] of Object.entries(manifest.aliases)) {
  manifest.sprites[alias] = manifest.sprites[name];
}
export const sprites = manifest.sprites;
export const lunarPhases = manifest.lunarPhases;
export const dayCycle = manifest.dayCycle;
export default manifest;
