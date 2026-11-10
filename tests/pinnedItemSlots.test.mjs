import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { createPinnedItemSlots } from "../src/display/ui/pinnedItemSlots.js";

class FakeElement extends EventTarget {
  constructor(tagName = "div") {
    super();
    this.tagName = tagName.toUpperCase();
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
    this.attributes = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  contains(target) {
    return target === this || this.children.some((child) => child?.contains?.(target));
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 44, bottom: 44, width: 44, height: 44 };
  }
}

Deno.test("pinned item slots render item atlas icons with glyph fallback", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const body = new FakeElement("body");
  const root = new FakeElement("div");

  globalThis.window = windowTarget;
  globalThis.document = Object.assign(documentTarget, {
    body,
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => {
      const element = new FakeElement(tagName);
      if (tagName === "path") element.getTotalLength = () => 100;
      return element;
    },
    getElementById: (id) => id === "ui-root" ? root : null,
  });

  try {
    const slots = createPinnedItemSlots();
    windowTarget.dispatchEvent(new CustomEvent("ui:requestPinQuickItem", {
      detail: {
        item: {
          id: 42,
          identity: "potion_health",
          name: "Health Potion",
          count: 2,
          glyph: "🧪",
        },
      },
    }));

    const icon = slots.el.children[0].children.find((child) => child.style.backgroundImage);
    assertEquals(icon.textContent, "");
    assertStringIncludes(icon.style.backgroundImage, "/assets/icons/items/sheet.webp");
    assertEquals(icon.style.width, "28px");
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
