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

Deno.test("character creation hides hard mode and no-gore", async () => {
  const source = await Deno.readTextFile("src/display/ui/charCreation.js");

  assertStringIncludes(source, "hardInput.checked = false;");
  assertStringIncludes(source, "display: 'none', alignItems: 'center', gap: '5px'");
  assertStringIncludes(source, "hardInput.addEventListener('change', renderHard);\n\n  confirmBtn.appendChild(confirmText);");
  assertStringIncludes(source, "  }\n  renderHard();\n\n  confirmBtn.addEventListener('pointerenter'");
  assertStringIncludes(source, "display: 'none', alignItems: 'center', gap: '8px'");
  assertStringIncludes(source, "const disableGore = !!goreInput.checked;");
});

Deno.test("character creation uses dramatic shadow strength for class icons", async () => {
  const source = await Deno.readTextFile("src/display/ui/charCreation.js");

  assertStringIncludes(source, "const CLASS_LIGHT_SHADOW_STRENGTH = 0.8;");
  assertStringIncludes(source, "const CLASS_LIGHT_SHADOW_FLOOR = 0.04;");
  assertStringIncludes(source, "Math.max(0, -lightResponse) * CLASS_LIGHT_SHADOW_STRENGTH");
});
