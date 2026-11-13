import { assert, assertStringIncludes } from "jsr:@std/assert";

Deno.test("character creation does not select the starter name on open", async () => {
  const source = await Deno.readTextFile("src/display/ui/charCreation.js");

  assertStringIncludes(source, "nameInput.value = fallbackName;");
  assert(!source.includes("nameInput.select();"));
});
