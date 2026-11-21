import { assert, assertStringIncludes } from "jsr:@std/assert";

Deno.test("character creation does not select the starter name on open", async () => {
  const source = await Deno.readTextFile("src/display/ui/charCreation.js");

  assertStringIncludes(source, "nameInput.value = fallbackName;");
  assert(!source.includes("nameInput.select();"));
});

Deno.test("character creation keeps its soundscape through world entry", async () => {
  const source = await Deno.readTextFile("src/display/ui/charCreation.js");
  const confirmStart = source.indexOf("  function doConfirm() {");
  const confirmEnd = source.indexOf("  confirmBtn.addEventListener", confirmStart);
  const disposeStart = source.indexOf("  function dispose(opts = {}) {");
  const confirmSource = source.slice(confirmStart, confirmEnd);
  const disposeSource = source.slice(disposeStart);

  assert(!confirmSource.includes("stopLoop('./assets/audio/soundscape.mp3'"));
  assertStringIncludes(disposeSource, "stopLoop('./assets/audio/soundscape.mp3', { fadeOut: 1.0 });");
});
