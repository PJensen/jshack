import "../src/main/debug/spawnDebugMonster.js";
import { assert } from "jsr:@std/assert";
import { getMonster } from "../src/rules/data/monsters.js";

Deno.test("debug spawning loads authored aura monsters without a separate content import", () => {
  for (const id of [
    "plaguebearer",
    "war_drummer",
    "dread_warden",
    "void_priest",
    "blood_herald",
  ]) {
    assert(getMonster(id), `${id} should be available to debug spawning`);
  }
});
