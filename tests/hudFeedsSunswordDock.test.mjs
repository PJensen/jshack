import { assert, assertEquals } from "jsr:@std/assert";
import { World } from "../src/lib/ecs-js/index.js";
import { createHudFeeds } from "../src/main/ui/hudFeeds.js";
import { Player } from "../src/rules/components/Player.js";
import { Position } from "../src/rules/components/Position.js";
import { Equipment } from "../src/rules/components/Equipment.js";
import { NamedIdentity } from "../src/rules/components/NamedIdentity.js";
import { ItemInfo } from "../src/rules/components/ItemInfo.js";
import { ItemCooldown } from "../src/rules/components/ItemCooldown.js";
import { Stamina } from "../src/rules/components/Stamina.js";
import { createItemById } from "../src/rules/utils/itemFactory.js";
import "../src/content/items/sunsword.js";
import "../src/content/items/fishingRod.js";
import "../src/content/items/lodbrokSerpentBoundBreeches.js";
import { installContent } from "../src/content/install.js";
installContent();

function installTestWindow() {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const prevWindow = globalThis.window;
  const target = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
    writable: true,
  });
  return () => {
    if (hadWindow) {
      Object.defineProperty(globalThis, "window", {
        value: prevWindow,
        configurable: true,
        writable: true,
      });
    } else {
      delete globalThis.window;
    }
  };
}

Deno.test("hudFeeds combat payload reports equipment defense as persistent bar defense", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 31 });
    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 0, y: 0 });
    world.add(player, Equipment, {});

    const armor = world.create();
    world.add(armor, NamedIdentity, { name: "Test Mail", identity: "test_mail" });
    world.add(armor, ItemInfo, {
      type: "equip",
      slot: "armor",
      count: 1,
      bonuses: { defense: 2 },
      rarity: 1,
      rarityName: "common",
      affixes: [],
    });
    world.get(player, Equipment).armor = armor;

    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 0, maxMana: 0 }),
      ensureActiveSpell: () => null,
      updateActiveSpellLabel: () => {},
    });

    /** @type {any[]} */
    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updateCombatHUD", onUpdate);
    hudFeeds.updateCombatHUD();
    window.removeEventListener("ui:updateCombatHUD", onUpdate);

    assert(payloads.length > 0, "expected combat HUD payload");
    const detail = payloads[payloads.length - 1];
    assertEquals(Number(detail?.defense || 0), 2);
    assertEquals(Number(detail?.avoidance || 0), 2);
    assertEquals(Number(detail?.armor || 0), 0);
    assertEquals(Number(detail?.armorClass || 0), 12);
  } finally {
    restoreWindow();
  }
});

Deno.test("hudFeeds prepends equipped Sunsword action into the mobile dock and carries cooldown", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 12 });
    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 0, y: 0 });
    world.add(player, Equipment, {});
    world.add(player, Stamina, { stamina: 9, maxStamina: 10, staminaRegen: 1, regenCooldown: 0 });

    const sunsword = world.create();
    world.add(sunsword, NamedIdentity, { name: "Sunsword", identity: "sunsword" });
    world.add(sunsword, ItemInfo, {
      type: "equip",
      slot: "weapon",
      count: 1,
      bonuses: {},
      rarity: 4,
      rarityName: "epic",
      affixes: [],
    });
    world.add(sunsword, ItemCooldown, { turnsRemaining: 7, turnsMax: 12, dueTurn: 7 });
    world.get(player, Equipment).weapon = sunsword;

    const pinnedSpellSlots = ["heal", "fireball", "arcane_bolt", "shadow_bolt"];
    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 10, maxMana: 10 }),
      ensureActiveSpell: () => "heal",
      updateActiveSpellLabel: () => {},
      knownSpellIds: () => pinnedSpellSlots.slice(),
      getActionBarSlots: () => [],
      getPinnedSpellSlots: () => pinnedSpellSlots.slice(),
      autoAssignSlot: () => -1,
      autoAssignPinnedSlot: () => -1,
    });

    /** @type {any[]} */
    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updatePinnedSpellBar", onUpdate);
    hudFeeds.updateActiveSpellHUD();
    window.removeEventListener("ui:updatePinnedSpellBar", onUpdate);

    assert(payloads.length > 0, "expected pinned dock payload");
    const detail = payloads[payloads.length - 1];
    const slots = Array.isArray(detail?.pinnedSlots) ? detail.pinnedSlots : [];
    assertEquals(slots.length, 4);
    assertEquals(slots[0]?.kind, "item-use");
    assertEquals(slots[0]?.identity, "sunsword");
    assertEquals(Number(slots[0]?.itemId || 0), sunsword);
    assertEquals(Number(slots[0]?.cdRemaining || 0), 7);
    assertEquals(String(slots[1]?.id || ""), "heal");
    assertEquals(String(slots[3]?.id || ""), "arcane_bolt");
    assert(!slots.some((entry) => String(entry?.id || "") === "shadow_bolt"), "expected last spell to be spliced out when Sunsword occupies the dock");
  } finally {
    restoreWindow();
  }
});

Deno.test("hudFeeds prepends equipped Sunsword action into the desktop spell dock", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 13 });
    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 0, y: 0 });
    world.add(player, Equipment, {});
    world.add(player, Stamina, { stamina: 9, maxStamina: 10, staminaRegen: 1, regenCooldown: 0 });

    const sunsword = world.create();
    world.add(sunsword, NamedIdentity, { name: "Sunsword", identity: "sunsword" });
    world.add(sunsword, ItemInfo, {
      type: "equip",
      slot: "weapon",
      count: 1,
      bonuses: {},
      rarity: 4,
      rarityName: "epic",
      affixes: [],
    });
    world.add(sunsword, ItemCooldown, { turnsRemaining: 5, turnsMax: 12, dueTurn: 5 });
    world.get(player, Equipment).weapon = sunsword;

    const actionBarSlots = ["heal", "fireball", "arcane_bolt", "shadow_bolt", "lightning", "smite"];
    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 10, maxMana: 10 }),
      ensureActiveSpell: () => "heal",
      updateActiveSpellLabel: () => {},
      knownSpellIds: () => actionBarSlots.slice(),
      getActionBarSlots: () => actionBarSlots.slice(),
      getPinnedSpellSlots: () => [],
      autoAssignSlot: () => -1,
      autoAssignPinnedSlot: () => -1,
    });

    /** @type {any[]} */
    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updateSpellBar", onUpdate);
    hudFeeds.updateActiveSpellHUD();
    window.removeEventListener("ui:updateSpellBar", onUpdate);

    assert(payloads.length > 0, "expected desktop spell dock payload");
    const detail = payloads[payloads.length - 1];
    const slots = Array.isArray(detail?.slots) ? detail.slots : [];
    assertEquals(slots.length, 6);
    assertEquals(slots[0]?.kind, "item-use");
    assertEquals(slots[0]?.identity, "sunsword");
    assertEquals(Number(slots[0]?.itemId || 0), sunsword);
    assertEquals(Number(slots[0]?.cdRemaining || 0), 5);
    assertEquals(String(slots[1]?.id || ""), "heal");
    assertEquals(String(slots[5]?.id || ""), "lightning");
    assert(!slots.some((entry) => String(entry?.id || "") === "smite"), "expected last action bar spell to be spliced out when Sunsword occupies the dock");
  } finally {
    restoreWindow();
  }
});

Deno.test("hudFeeds prepends equipped leg-slot content abilities into the spell dock", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 14 });
    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 0, y: 0 });
    world.add(player, Equipment, {});
    world.add(player, Stamina, { stamina: 10, maxStamina: 10, staminaRegen: 1, regenCooldown: 0 });

    const breeches = world.create();
    world.add(breeches, NamedIdentity, { name: "Loðbrók's Serpent-Bound Breeches", identity: "lodbrok_serpent_bound_breeches" });
    world.add(breeches, ItemInfo, {
      type: "equip",
      slot: "legs",
      count: 1,
      bonuses: {},
      rarity: 4,
      rarityName: "epic",
      affixes: [],
    });
    world.add(breeches, ItemCooldown, { turnsRemaining: 9, turnsMax: 100, dueTurn: 9 });
    world.get(player, Equipment).legs = breeches;

    const actionBarSlots = ["heal", "fireball", "arcane_bolt", "shadow_bolt", "lightning", "smite"];
    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 10, maxMana: 10 }),
      ensureActiveSpell: () => "heal",
      updateActiveSpellLabel: () => {},
      knownSpellIds: () => actionBarSlots.slice(),
      getActionBarSlots: () => actionBarSlots.slice(),
      getPinnedSpellSlots: () => [],
      autoAssignSlot: () => -1,
      autoAssignPinnedSlot: () => -1,
    });

    /** @type {any[]} */
    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updateSpellBar", onUpdate);
    hudFeeds.updateActiveSpellHUD();
    window.removeEventListener("ui:updateSpellBar", onUpdate);

    assert(payloads.length > 0, "expected desktop spell dock payload");
    const detail = payloads[payloads.length - 1];
    const slots = Array.isArray(detail?.slots) ? detail.slots : [];
    assertEquals(slots.length, 6);
    assertEquals(slots[0]?.kind, "item-use");
    assertEquals(slots[0]?.identity, "lodbrok_serpent_bound_breeches");
    assertEquals(String(slots[0]?.abilityId || ""), "laugh_at_the_pit");
    assertEquals(Number(slots[0]?.itemId || 0), breeches);
    assertEquals(Number(slots[0]?.cdRemaining || 0), 9);
    assertEquals(String(slots[1]?.id || ""), "heal");
    assert(!slots.some((entry) => String(entry?.id || "") === "smite"), "expected last action bar spell to be spliced out when breeches occupy the dock");
  } finally {
    restoreWindow();
  }
});

Deno.test("hudFeeds prepends equipped fishing_rod content ability into the spell dock", () => {
  const restoreWindow = installTestWindow();

  try {
    const world = new World({ seed: 15 });
    const player = world.create();
    world.add(player, Player, {});
    world.add(player, Position, { x: 0, y: 0 });
    world.add(player, Equipment, {});
    world.add(player, Stamina, { stamina: 10, maxStamina: 10, staminaRegen: 1, regenCooldown: 0 });

    const rod = createItemById(world, "fishing_rod");
    assert(rod > 0, "expected fishing_rod to be creatable");
    world.get(player, Equipment).weapon = rod;

    const actionBarSlots = ["heal", "fireball", "arcane_bolt", "shadow_bolt", "lightning", "smite"];
    const hudFeeds = createHudFeeds(world, {
      getPlayerMana: () => ({ mana: 10, maxMana: 10 }),
      ensureActiveSpell: () => "heal",
      updateActiveSpellLabel: () => {},
      knownSpellIds: () => actionBarSlots.slice(),
      getActionBarSlots: () => actionBarSlots.slice(),
      getPinnedSpellSlots: () => [],
      autoAssignSlot: () => -1,
      autoAssignPinnedSlot: () => -1,
    });

    /** @type {any[]} */
    const payloads = [];
    const onUpdate = (ev) => payloads.push(ev?.detail || null);
    window.addEventListener("ui:updateSpellBar", onUpdate);
    hudFeeds.updateActiveSpellHUD();
    window.removeEventListener("ui:updateSpellBar", onUpdate);

    assert(payloads.length > 0, "expected desktop spell dock payload");
    const detail = payloads[payloads.length - 1];
    const slots = Array.isArray(detail?.slots) ? detail.slots : [];
    assertEquals(slots.length, 6);
    assertEquals(slots[0]?.kind, "item-use");
    assertEquals(slots[0]?.identity, "fishing_rod");
    assertEquals(String(slots[0]?.abilityId || ""), "cast_line");
    assertEquals(Number(slots[0]?.itemId || 0), rod);
    assertEquals(String(slots[1]?.id || ""), "heal");
    assert(!slots.some((entry) => String(entry?.id || "") === "smite"), "expected last action bar spell to be spliced out when fishing rod occupies the dock");
  } finally {
    restoreWindow();
  }
});
