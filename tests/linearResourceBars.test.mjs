import { assertEquals } from "jsr:@std/assert";
import {
  clampResourceRatio,
  normalizeResourceValue,
  resolveResourceBarState,
} from "../src/display/ui/linearResourceBars.js";

Deno.test("linear resource bars clamp ratios and normalize invalid values", () => {
  assertEquals(clampResourceRatio(-1), 0);
  assertEquals(clampResourceRatio(0.45), 0.45);
  assertEquals(clampResourceRatio(2), 1);
  assertEquals(clampResourceRatio("not-a-number"), 0);
  assertEquals(normalizeResourceValue(12.9), 12);
  assertEquals(normalizeResourceValue(-4), 0);
  assertEquals(normalizeResourceValue("bad", 7), 7);
});

Deno.test("linear resource bar state preserves readable edge cases", () => {
  assertEquals(resolveResourceBarState(148, 148), { value: 148, max: 148, ratio: 1, state: "full" });
  assertEquals(resolveResourceBarState(0, 80), { value: 0, max: 80, ratio: 0, state: "empty" });
  assertEquals(resolveResourceBarState(12, 120), { value: 12, max: 120, ratio: 0.1, state: "critical" });
  assertEquals(resolveResourceBarState(62, 80), { value: 62, max: 80, ratio: 0.775, state: "partial" });
  assertEquals(resolveResourceBarState(999, 80), { value: 80, max: 80, ratio: 1, state: "full" });
});
