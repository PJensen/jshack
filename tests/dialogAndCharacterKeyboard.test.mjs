import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { createBubbleDialogController } from "../src/display/ui/bubbleDialog.js";
import { renderDialog } from "../src/display/ui/dialogOverlay.js";
import { DIALOG_LAYER_Z_INDEX } from "../src/display/ui/overlayUtils.js";

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.style = {};
    this.children = [];
    this.textContent = "";
    this.innerHTML = "";
    this.offsetWidth = 280;
    this.offsetHeight = 120;
  }

  appendChild(child) { this.children.push(child); }
}

function keyboardEvent(key, code = key) {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperties(event, {
    key: { value: key },
    code: { value: code },
  });
  return event;
}

Deno.test("NPC bubble keyboard closes on Escape and accepts the first choice on Enter", async () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    addEventListener: globalThis.addEventListener,
  };
  const events = new EventTarget();
  const body = new FakeElement();
  globalThis.window = events;
  globalThis.document = {
    createElement: () => new FakeElement(),
    body,
  };
  globalThis.addEventListener = events.addEventListener.bind(events);

  try {
    const requested = [];
    events.addEventListener("ui:requestDialogChoice", (event) => requested.push(event.detail));
    events.addEventListener("ui:requestDialogClose", (event) => requested.push({ close: event.detail }));
    const controller = createBubbleDialogController({
      getPosition: () => ({ x: 1, y: 1 }),
      playerEntity: () => ({ id: 1, pos: { x: 1, y: 1 } }),
      canvas: new FakeElement(),
      getCam: () => ({ scale: 16 }),
      worldToScreen: () => [100, 100],
      getCanvasSetup: () => ({ cssW: 320, cssH: 240 }),
    });
    controller.open({
      sessionId: 7,
      choices: [{ id: "accept", label: "Accept" }, { id: "decline", label: "Decline" }],
    });

    events.dispatchEvent(keyboardEvent("Enter"));
    events.dispatchEvent(keyboardEvent("Escape"));

    assertEquals(requested, [
      { sessionId: 7, choiceId: "accept" },
      { close: { sessionId: 7 } },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 260));
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.addEventListener = previous.addEventListener;
  }
});

Deno.test("NPC bubble ignores immediate choice clicks after opening", async () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    addEventListener: globalThis.addEventListener,
  };
  const events = new EventTarget();
  const body = new FakeElement();
  globalThis.window = events;
  globalThis.document = {
    createElement: () => new FakeElement(),
    body,
  };
  globalThis.addEventListener = events.addEventListener.bind(events);

  try {
    const requested = [];
    events.addEventListener("ui:requestDialogChoice", (event) => requested.push(event.detail));
    const controller = createBubbleDialogController({
      getPosition: () => ({ x: 1, y: 1 }),
      playerEntity: () => ({ id: 1, pos: { x: 1, y: 1 } }),
      canvas: new FakeElement(),
      getCam: () => ({ scale: 16 }),
      worldToScreen: () => [100, 100],
      getCanvasSetup: () => ({ cssW: 320, cssH: 240 }),
    });
    controller.open({
      sessionId: 8,
      choices: [{ id: "accept", label: "Accept" }],
    });

    const bubble = body.children.find((child) => child.id === "speech-bubble-dialog");
    assertEquals(bubble.style.zIndex, String(DIALOG_LAYER_Z_INDEX + 2));
    assertEquals(body.children[0].style.zIndex, String(DIALOG_LAYER_Z_INDEX));
    assertEquals(body.children[1].style.zIndex, String(DIALOG_LAYER_Z_INDEX + 1));
    const choiceButton = bubble.children[2].children[0];
    choiceButton.dispatchEvent(new Event("click"));

    assertEquals(requested, []);
    await new Promise((resolve) => setTimeout(resolve, 260));
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.addEventListener = previous.addEventListener;
  }
});

Deno.test("dialog Enter defaults are visually highlighted in both presentations", async () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    addEventListener: globalThis.addEventListener,
  };
  const events = new EventTarget();
  const body = new FakeElement();
  globalThis.window = events;
  globalThis.HTMLElement = FakeElement;
  globalThis.document = {
    createElement: () => new FakeElement(),
    body,
  };
  globalThis.addEventListener = events.addEventListener.bind(events);

  try {
    const controller = createBubbleDialogController({
      getPosition: () => ({ x: 1, y: 1 }),
      playerEntity: () => ({ id: 1, pos: { x: 1, y: 1 } }),
      canvas: new FakeElement(),
      getCam: () => ({ scale: 16 }),
      worldToScreen: () => [100, 100],
      getCanvasSetup: () => ({ cssW: 320, cssH: 240 }),
    });
    controller.open({
      sessionId: 9,
      choices: [{ id: "accept", label: "Accept" }, { id: "decline", label: "Decline" }],
    });
    const bubble = body.children.find((child) => child.id === "speech-bubble-dialog");
    const bubbleChoices = bubble.children[2].children;
    assertEquals(bubbleChoices[0].style.outline, "2px solid rgba(186,145,63,0.72)");
    assertEquals(bubbleChoices[0].style.background, "rgba(255,235,177,0.98)");
    assertEquals(bubbleChoices[1].style.outline, undefined);

    const panel = new FakeElement();
    renderDialog(panel, {
      sessionId: 10,
      choices: [{ id: "accept", label: "Accept" }, { id: "decline", label: "Decline" }],
    });
    const overlayChoices = panel.children[2].children;
    assertEquals(overlayChoices[0].style.outline, "2px solid rgba(140,164,188,0.85)");
    assertEquals(overlayChoices[0].style.background, "rgba(43,60,78,0.96)");
    assertEquals(overlayChoices[1].style.outline, undefined);
    await new Promise((resolve) => setTimeout(resolve, 260));
  } finally {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.addEventListener = previous.addEventListener;
  }
});

Deno.test("character menu remembers its active tab and Escape closes visible panels", async () => {
  const overlay = await Deno.readTextFile("src/display/ui/overlay.js");
  const main = await Deno.readTextFile("src/main.js");

  assertStringIncludes(overlay, "let lastCharacterMenuTab = 'character';");
  assertStringIncludes(overlay, "detail: { restoreLastTab: true }");
  assertStringIncludes(overlay, "document.body.appendChild(dialog);");
  assertStringIncludes(overlay, "dialog.style.zIndex = String(DIALOG_LAYER_Z_INDEX);");
  assertStringIncludes(overlay, "if (e.key === 'Escape')");
  assertStringIncludes(overlay, "for (const p of document.querySelectorAll('.ui-panel'))");
  assertStringIncludes(main, "detail: { restoreLastTab: true }");
});
