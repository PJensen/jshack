import { assertEquals } from "jsr:@std/assert";
import { createPinnedSpellDock } from "../src/display/ui/spellDock.js";

class FakeElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.textContent = "";
    this.innerHTML = "";
    this.id = "";
    this.offsetWidth = 40;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  contains(target) {
    if (target === this) return true;
    return this.children.some((child) => child?.contains?.(target));
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 40, height: 40 };
  }
}

function mouseEvent(type) {
  const event = new Event(type);
  Object.defineProperty(event, "button", { value: 0 });
  return event;
}

Deno.test("pinned spell dock item actions emit ui:requestUse on tap", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const head = new FakeElement("head");

  globalThis.window = windowTarget;
  globalThis.document = Object.assign(documentTarget, {
    head,
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => head.children.find((child) => child.id === id) || null,
  });

  try {
    const requests = [];
    windowTarget.addEventListener("ui:requestUse", (event) => requests.push(event.detail));
    const dock = createPinnedSpellDock({
      addEventListener() {},
    });
    windowTarget.dispatchEvent(new CustomEvent("ui:updatePinnedSpellBar", {
      detail: {
        pinnedSlots: [{
          kind: "item-use",
          id: "item-use:fishing_rod:cast_line:42",
          itemId: 42,
          identity: "fishing_rod",
          abilityId: "cast_line",
          name: "Cast Line",
          symbol: "🎣",
        }],
      },
    }));

    const itemButton = dock.el.children[0];
    itemButton.dispatchEvent(mouseEvent("mousedown"));
    itemButton.dispatchEvent(mouseEvent("mouseup"));

    assertEquals(requests, [{ itemId: 42, abilityId: "cast_line" }]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
