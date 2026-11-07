// shared/data/spiritGuidance.js
// Tutorial tip definitions for the spirit wisp guide.
// Each tip fires once per player lifetime (tracked in localStorage).
// Triggers are evaluated by spiritGuideWiring.js against world events.

/**
 * @typedef {object} GuidanceTip
 * @property {string}  id          — unique localStorage key suffix
 * @property {string}  text        — what the spirit says
 * @property {number}  [durationSec] — bubble display time (default 5)
 * @property {number}  [delaySec]  — pause before showing (default 0.6)
 * @property {string}  [flyTo]     — "item"|"stair"|"altar"|"npc"|"enemy" — wisp flies to relevant entity first
 * @property {string}  [pointTo]   — CSS selector of a UI button the wisp orb flies to in screen-space
 */

/**
 * True when the device looks like a touch-first / mobile device.
 * Evaluated once at module load — fine because the device class won't
 * change mid-session.
 */
const _touch = (() => {
  if (typeof window === "undefined") return false;
  try {
    const coarse = typeof window.matchMedia === "function"
      && window.matchMedia("(pointer: coarse)").matches;
    const touchPoints = Number(window.navigator?.maxTouchPoints || 0);
    return coarse || touchPoints > 0;
  } catch { return false; }
})();

/** @type {GuidanceTip[]} */
export const GUIDANCE_TIPS = [
  // ── Early game (overworld, first steps) ───────────────────────────
  {
    id: "welcome",
    text: "I am your spirit guide — the eye of your deity, watching over you.",
    durationSec: 4,
    delaySec: 1.8,
  },
  {
    id: "movement",
    text: _touch
      ? "Tap where you want to go."
      : "Tap, arrow keys, or WASD to move.",
    durationSec: 3,
    delaySec: 0.6,
  },
  {
    id: "seek_barkeep",
    text: "The barkeep may know what ails this village \u2014 look, one approaches.",
    durationSec: 5,
    delaySec: 0.6,
    flyTo: "npc",
  },
  {
    id: "doors",
    text: "Walk into doors to open them.",
    durationSec: 3,
    delaySec: 0.6,
  },

  // ── Equipment glyphs ──────────────────────────────────────────────
  {
    id: "glyph_weapon",
    text: "The small icon at your bottom-right is your wielded weapon. Equip something from your inventory to see it change.",
    durationSec: 6,
    delaySec: 0.5,
  },
  {
    id: "glyph_shield",
    text: "A shield badge appeared at your top-left \u2014 it shows your off-hand defense at a glance.",
    durationSec: 5.5,
    delaySec: 0.5,
  },
  {
    id: "glyph_ranged",
    text: "A ranged weapon badge appeared at your bottom-left. Press \u201cf\u201d or tap Fire to shoot.",
    durationSec: 5.5,
    delaySec: 0.5,
    pointTo: "#btn-fire",
  },
  {
    id: "glyph_dual_wield",
    text: "Both weapon badges are stacked on your right \u2014 you\u2019re dual-wielding! Off-hand strikes hit with a penalty.",
    durationSec: 6,
    delaySec: 0.5,
  },

  {
    id: "pet_companion",
    text: "Your companion follows you and fetches nearby items. Tap the Pet button to give commands.",
    durationSec: 5.5,
    delaySec: 0.6,
    pointTo: "#btn-pet",
  },
  {
    id: "quick_items",
    text: "A Quick Chip pops up immediately after pickup. Tap it to use fast, or pin it so it stays in your quick slots.",
    durationSec: 5.5,
    delaySec: 0.5,
    pointTo: "#hud-pinned-items",
  },

  // ── Items & inventory ─────────────────────────────────────────────
  {
    id: "item_ground",
    text: "Something on the ground! Double-tap it or press \u201c,\u201d to pick it up.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "item",
  },
  {
    id: "first_pickup",
    text: "Swipe right or press \u201cI\u201d to open your inventory. Equip weapons and armor from there.",
    durationSec: 5.5,
    delaySec: 0.6,
    pointTo: "#btn-bag",
  },
  {
    id: "first_equip",
    text: "You equipped something! Open your character sheet to see your stats and gear.",
    durationSec: 5,
    delaySec: 0.5,
    pointTo: "#btn-character-sheet",
  },

  // ── Gems & spellbooks ─────────────────────────────────────────────
  {
    id: "first_gem",
    text: "A gemstone! Socket it into a weapon from your inventory for bonus effects.",
    durationSec: 5.5,
    delaySec: 0.6,
    pointTo: "#btn-bag",
  },
  {
    id: "first_spellbook",
    text: "A spellbook! Use it from your inventory to learn the spell permanently.",
    durationSec: 5.5,
    delaySec: 0.6,
    pointTo: "#btn-bag",
  },

  // ── Combat ────────────────────────────────────────────────────────
  {
    id: "first_combat",
    text: "An enemy! Walk into it to attack. Watch your health in the largest top-right vitals bar.",
    durationSec: 5,
    delaySec: 0.3,
    flyTo: "enemy",
    pointTo: "#hud-vitals",
  },
  {
    id: "low_hp",
    text: "You're wounded! Use a potion from your Quick Chips, or retreat to safety.",
    durationSec: 5,
    delaySec: 0.3,
    pointTo: "#hud-pinned-items",
  },
  {
    id: "first_bat",
    text: "Bat ahead! Shoot with Fire, then tap ammo and potions in your Quick Chips.",
    durationSec: 5.5,
    delaySec: 0.3,
    pointTo: "#btn-fire",
  },
  {
    id: "wait_action",
    text: "Press \u201c.\u201d or tap Wait to skip a turn. Useful for resting or letting enemies come to you.",
    durationSec: 5,
    delaySec: 0.8,
    pointTo: "#btn-wait",
  },

  // ── Exploration ───────────────────────────────────────────────────
  {
    id: "first_stair_down",
    text: "Stairs leading down. Darker things await below.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "stair",
  },
  {
    id: "first_stair_up",
    text: "Stairs leading up. A way back to safer ground.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "stair",
  },
  {
    id: "first_npc",
    text: "A villager! Walk into them to talk. They know things about the town and its needs.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "npc",
  },

  // ── Deity & magic ─────────────────────────────────────────────────
  {
    id: "first_altar",
    text: "A sacred altar. Pray here or offer items to earn your deity's favor.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "altar",
    pointTo: "#btn-pray",
  },
  {
    id: "first_spell",
    text: "A new spell! Tap the spell button or press \u201cF\u201d to cast your active spell.",
    durationSec: 5,
    delaySec: 0.6,
    pointTo: "#active-spell",
  },
  {
    id: "spell_select",
    text: "You know multiple spells now. Tap Spells to choose which one is active.",
    durationSec: 5,
    delaySec: 0.6,
    pointTo: "#btn-spell-select",
  },

  // ── Interactables ─────────────────────────────────────────────────
  {
    id: "first_fountain",
    text: "A fountain! Drink to restore health or mana \u2014 but beware, some sips carry a sting.",
    durationSec: 5.5,
    delaySec: 0.5,
    flyTo: "fountain",
  },
  {
    id: "first_door",
    text: "Some doors are locked. You'll need to find the key.",
    durationSec: 4,
    delaySec: 0.5,
    flyTo: "door",
  },
  {
    id: "first_trap",
    text: "A trap! Watch for hidden dangers on the floor. Tread carefully in the dark.",
    durationSec: 5,
    delaySec: 0.3,
    flyTo: "trap",
  },
  {
    id: "first_chest",
    text: "A chest! Open it for treasure \u2014 but not every chest is what it seems.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "chest",
  },
  {
    id: "first_shop",
    text: "A shop! Browse wares to buy, or sell what you no longer need.",
    durationSec: 5,
    delaySec: 0.5,
  },
  {
    id: "first_harvest",
    text: "You harvested a resource! Some nodes need tools and regrow over time.",
    durationSec: 5,
    delaySec: 0.5,
  },
  {
    id: "first_craft",
    text: "A crafting station! Combine materials to forge weapons, brew potions, or cook meals.",
    durationSec: 5.5,
    delaySec: 0.5,
    flyTo: "craft",
  },
  {
    id: "first_shrine",
    text: "A shrine channels your deity\u2019s presence. Touch it to commune with the divine.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "shrine",
  },
  {
    id: "first_weapon_rack",
    text: "A weapon rack! Browse the arms on display and take what suits you.",
    durationSec: 5,
    delaySec: 0.5,
    flyTo: "rack",
  },
  {
    id: "first_sarcophagus",
    text: "A sarcophagus. Disturbing the dead may yield treasure \u2014 or unleash something terrible.",
    durationSec: 5.5,
    delaySec: 0.5,
    flyTo: "sarcophagus",
  },
  {
    id: "first_weather",
    text: "Rain! It douses flames and waters crops. Heavy storms darken the sky.",
    durationSec: 5,
    delaySec: 0.6,
  },
];

/** localStorage key prefix for tracking shown tips. */
export const GUIDE_STORAGE_KEY = "jshack:spiritGuide:seen:v1";

/**
 * Read the set of already-shown tip IDs from localStorage.
 * @returns {Set<string>}
 */
export function readSeenTips() {
  try {
    if (typeof localStorage === "undefined") return new Set();
    const raw = localStorage.getItem(GUIDE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Mark a tip ID as seen and persist.
 * @param {Set<string>} seen
 * @param {string} id
 */
export function markTipSeen(seen, id) {
  seen.add(id);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify([...seen]));
    }
  } catch { /* quota / private mode */ }
}
