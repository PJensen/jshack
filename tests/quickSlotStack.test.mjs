import { assertEquals } from "jsr:@std/assert";
import {
  canQuickChipIdentify,
  peekStackTop,
  popUntilActionableTop,
  getQuickChipPrimaryAction,
  getQuickChipPrimaryActionLabel,
  isQuickChipPotion,
  getQuickChipDetailLine,
  isQuickChipActionable,
} from "../src/display/ui/hud.js";
import { rarityStyle } from "../src/display/ui/overlayUtils.js";

Deno.test("quick-slot stack peeks newest pickup first", () => {
  const stack = [];
  stack.push({ id: 10, type: "potion", name: "Health Potion" });
  stack.push({ id: 11, type: "scroll", name: "Scroll of Light" });

  assertEquals(peekStackTop(stack)?.id, 11);
  stack.pop();
  assertEquals(peekStackTop(stack)?.id, 10);
});

Deno.test("quick-slot stack pops non-actionable top before peek", () => {
  const stack = [
    { id: 20, type: "potion", name: "Health Potion", count: 1 },
    { id: 21, type: "quest", name: "Quest Relic", count: 1 },
  ];

  const actionable = (it) => {
    return isQuickChipActionable(it);
  };

  popUntilActionableTop(stack, actionable);
  assertEquals(stack.map((it) => it.id), [20]);
  assertEquals(peekStackTop(stack)?.id, 20);
});

Deno.test("quick-chip unidentified pickup remains usable", () => {
  const item = {
    id: 30,
    type: "scroll",
    identity: "scroll_light",
    hasScrollOfIdentify: true,
    details: { identified: false },
  };
  assertEquals(getQuickChipPrimaryAction(item), "use");
  assertEquals(getQuickChipPrimaryActionLabel(item), "Use");
  assertEquals(canQuickChipIdentify(item), true);
});

Deno.test("quick-chip primary action uses apply for scroll of identify", () => {
  const item = { id: 31, type: "scroll", identity: "scroll_identify", details: { identified: true } };
  assertEquals(getQuickChipPrimaryAction(item), "apply");
  assertEquals(getQuickChipPrimaryActionLabel(item), "Apply");
});

Deno.test("quick-chip gives every potion identity a Drink affordance", () => {
  for (const identity of ["potion_paralysis", "potion_lethargy"]) {
    const item = { id: 32, identity, type: "item", count: 1 };
    assertEquals(isQuickChipPotion(item), true);
    assertEquals(getQuickChipPrimaryAction(item), "drink");
    assertEquals(getQuickChipPrimaryActionLabel(item), "Drink");
    assertEquals(isQuickChipActionable(item), true);
  }
});

Deno.test("quick-chip treats gems as actionable stack items", () => {
  assertEquals(isQuickChipActionable({ type: "gem", count: 1 }), true);
  assertEquals(isQuickChipActionable({ type: "gem", count: 0 }), false);
});

Deno.test("quick-chip rarity style maps epic to purple", () => {
  assertEquals(rarityStyle("epic"), { color: "#c47bff", fontWeight: "bold" });
});

Deno.test("quick-chip detail line highlights immediate pickup and pin affordance", () => {
  const item = { type: "potion", count: 2, justPickedUp: true };
  assertEquals(getQuickChipDetailLine(item), "x2 • just picked up • tap for details/pin");
});

Deno.test("quick-chip detail line falls back to existing actionable/non-actionable copy", () => {
  assertEquals(getQuickChipDetailLine({ type: "scroll", count: 1 }), "x1 • tap for details");
  assertEquals(getQuickChipDetailLine({ type: "quest", count: 1 }), "x1 • picked up");
  assertEquals(getQuickChipDetailLine({ type: "scroll", count: 1 }, { expanded: true }), "x1 • details open");
});
