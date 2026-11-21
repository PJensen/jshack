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
  assertStringIncludes(confirmSource, "}, fadeSoundscape);");
  assertStringIncludes(confirmSource, "dispose({ fade: true, soundscapeHandedOff });");
  assertStringIncludes(disposeSource, "if (!opts.soundscapeHandedOff) fadeSoundscape();");
  assertStringIncludes(source, "stopLoop('./assets/audio/soundscape.mp3', { fadeOut: 1.0 });");

  const main = await Deno.readTextFile("src/main.js");
  assertStringIncludes(main, "if (openingLandscape) openingSoundscapeFade = fadeCreatorSoundscape;");
  assertStringIncludes(main, 'setInputLock("opening-flyover", false);\n      openingSoundscapeFade?.();');
});

Deno.test("character creation defaults to hard mode and hides no-gore", async () => {
  const source = await Deno.readTextFile("src/display/ui/charCreation.js");

  assertStringIncludes(source, "hardInput.checked = true;");
  assertStringIncludes(source, "display: 'none', alignItems: 'center', gap: '8px'");
  assertStringIncludes(source, "const disableGore = !!goreInput.checked;");
});
