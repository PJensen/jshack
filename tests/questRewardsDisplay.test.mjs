import { assert } from "jsr:@std/assert";
import "../src/content/items/scrolls.js";
import { describeQuestRewardItem } from "../src/main/ui/questRewards.js";

Deno.test("quest reward gem tooltips expose canonical socket mechanics", () => {
  const reward = describeQuestRewardItem("gem_ruby");
  assert(reward.tooltip.mechanics.some((entry) => entry.context === "Socket" && entry.text.includes("fire resist")));
  assert(reward.tooltip.mechanics.some((entry) => entry.context === "On hit" && entry.text.includes("ignite")));
});

Deno.test("quest reward enchantment scroll tooltips expose canonical enchant mechanics", () => {
  const reward = describeQuestRewardItem("scroll_enchant_fire");
  assert(reward.tooltip.mechanics.some((entry) =>
    entry.context === "Enchant"
      && entry.text.includes("lingering fire damage")
      && entry.iconId === "scroll_enchant_fire",
  ));
});
