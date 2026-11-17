import { applyAtlasIcon, resolveIconReference } from "./atlasIcons.js";

const FALLBACK_ICON = "◆";

function safeCount(value) {
  return Math.max(0, Number(value || 0) | 0);
}

function labelFor(value) {
  return String(value || "ingredient")
    .replace(/^material_/, "")
    .replace(/^reagent_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function itemPresentation(item, fallbackName = "Item") {
  const identity = String(item?.identity || item?.outputIdentity || "");
  return {
    name: String(item?.name || item?.outputName || fallbackName),
    description: String(item?.description || ""),
    icon: { identity, type: String(item?.type || "item"), glyph: String(item?.glyph || FALLBACK_ICON) },
  };
}

function renderIcon(parent, item, size, className = "crafting-icon") {
  const icon = document.createElement("span");
  icon.className = className;
  const presentation = itemPresentation(item);
  const ref = resolveIconReference(presentation.icon);
  applyAtlasIcon(icon, ref, presentation.icon.glyph || FALLBACK_ICON, size);
  Object.assign(icon.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${size}px`,
    height: `${size}px`,
    flex: `0 0 ${size}px`,
    fontSize: `${Math.max(14, Math.floor(size * 0.7))}px`,
  });
  parent.appendChild(icon);
  return icon;
}

function requirementText(req) {
  const available = safeCount(req.available);
  const required = safeCount(req.required);
  return `${available} / ${required}`;
}

function renderRequirement(parent, req) {
  const available = safeCount(req.available);
  const required = safeCount(req.required);
  const satisfied = available >= required;
  const row = document.createElement("div");
  row.setAttribute("data-requirement", String(req.key || ""));
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: "20px 28px minmax(0, 1fr) auto",
    gap: "7px",
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: "6px",
    background: satisfied ? "rgba(55, 108, 69, 0.22)" : "rgba(125, 52, 52, 0.22)",
    color: satisfied ? "#b9e7bd" : "#f0b2b2",
  });
  const mark = document.createElement("span");
  mark.textContent = satisfied ? "✓" : "✗";
  mark.setAttribute("aria-label", satisfied ? "Satisfied" : "Missing");
  row.appendChild(mark);
  renderIcon(row, { identity: req.identity || req.key, name: req.label, type: req.type || "item" }, 24);
  const label = document.createElement("span");
  label.textContent = String(req.label || labelFor(req.key));
  row.appendChild(label);
  const quantity = document.createElement("strong");
  quantity.textContent = requirementText(req);
  quantity.title = `${available} available, ${required} required`;
  row.appendChild(quantity);
  parent.appendChild(row);
}

function recipeOutput(recipe) {
  return itemPresentation({
    identity: recipe.outputIdentity,
    name: recipe.outputName || recipe.name,
    description: recipe.description,
    glyph: recipe.outputGlyph,
  }, "Crafted item");
}

function renderRecipeRow(parent, recipe, selected, onSelect) {
  const row = document.createElement("div");
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  row.setAttribute("aria-selected", selected ? "true" : "false");
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr) auto",
    gap: "8px",
    alignItems: "center",
    padding: "8px 9px",
    border: selected ? "1px solid #d7b45e" : "1px solid rgba(140, 162, 186, 0.25)",
    borderRadius: "7px",
    background: selected ? "rgba(100, 75, 25, 0.46)" : "rgba(25, 34, 45, 0.72)",
    color: recipe.canCraft ? "#e8edf5" : "#9ca7b5",
    cursor: "pointer",
    opacity: recipe.canCraft ? "1" : "0.72",
  });
  renderIcon(row, recipeOutput(recipe), 28);
  const text = document.createElement("div");
  const name = document.createElement("div");
  name.textContent = String(recipe.name || recipe.outputName || "Recipe");
  name.style.fontWeight = "700";
  text.appendChild(name);
  const hint = document.createElement("div");
  hint.textContent = recipe.canCraft ? "Ready" : String(recipe.missingText || "Missing requirements");
  hint.style.fontSize = "11px";
  hint.style.opacity = "0.76";
  text.appendChild(hint);
  row.appendChild(text);
  const indicator = document.createElement("span");
  indicator.textContent = recipe.canCraft ? "✓" : "·";
  indicator.title = recipe.canCraft ? "Available to craft" : "Unavailable; select to inspect";
  row.appendChild(indicator);
  const select = () => onSelect(recipe.key);
  row.addEventListener("click", select);
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select();
  });
  parent.appendChild(row);
}

export function renderCraftingScreen(panel, model = {}) {
  const el = /** @type {HTMLDivElement} */ (/** @type {any} */ (panel)._inner);
  const discipline = String(model.discipline || "crafting");
  const recipes = Array.isArray(model.recipes) ? model.recipes : [];
  const previousKey = String((/** @type {any} */ (panel))._craftingSelection?.[discipline] || "");
  const requestedKey = String(model.selectedKey || previousKey || recipes[0]?.key || "");
  const selected = recipes.find((recipe) => String(recipe.key || "") === requestedKey) || recipes[0] || null;
  if (!(/** @type {any} */ (panel))._craftingSelection) (/** @type {any} */ (panel))._craftingSelection = {};
  if (selected) (/** @type {any} */ (panel))._craftingSelection[discipline] = selected.key;

  el.innerHTML = "";
  el.style.overflowY = "auto";
  el.style.overflowX = "hidden";
  el.style.width = "min(920px, 92vw)";
  el.style.maxHeight = "min(88vh, 760px)";
  el.style.boxSizing = "border-box";

  const header = document.createElement("div");
  Object.assign(header.style, { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" });
  const heading = document.createElement("div");
  const title = document.createElement("div");
  title.textContent = String(model.title || "Crafting");
  Object.assign(title.style, { fontSize: "19px", fontWeight: "800", color: "#f3e6b3" });
  heading.appendChild(title);
  const subtitle = document.createElement("div");
  subtitle.textContent = String(model.subtitle || "Choose a recipe to inspect its requirements.");
  Object.assign(subtitle.style, { marginTop: "3px", fontSize: "12px", color: "#b9c5d3", lineHeight: "1.4" });
  heading.appendChild(subtitle);
  header.appendChild(heading);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  Object.assign(close.style, { minHeight: "34px", padding: "6px 11px", borderRadius: "999px", border: "1px solid #59697b", background: "transparent", color: "#c6d0db", cursor: "pointer" });
  close.addEventListener("click", () => window.dispatchEvent(new CustomEvent(String(model.closeEvent || "ui:closeCrafting"))));
  header.appendChild(close);
  el.appendChild(header);

  const layout = document.createElement("div");
  const compact = Number(window.innerWidth || 1024) < 720;
  Object.assign(layout.style, { display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(220px, 0.78fr) minmax(0, 1.22fr)", gap: "12px", alignItems: "start" });
  el.appendChild(layout);
  const list = document.createElement("div");
  Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "5px", maxHeight: "52vh", overflowY: "auto", paddingRight: "2px" });
  if (!recipes.length) {
    const empty = document.createElement("div");
    empty.textContent = "No known recipes yet.";
    empty.style.opacity = "0.7";
    list.appendChild(empty);
  } else {
    for (const recipe of recipes) {
      renderRecipeRow(list, recipe, recipe === selected, (key) => {
        (/** @type {any} */ (panel))._craftingSelection[discipline] = key;
        renderCraftingScreen(panel, { ...model, selectedKey: key });
      });
    }
  }
  layout.appendChild(list);

  const details = document.createElement("div");
  Object.assign(details.style, { minWidth: "0", padding: "12px", border: "1px solid rgba(140, 162, 186, 0.28)", borderRadius: "9px", background: "rgba(16, 23, 34, 0.76)" });
  layout.appendChild(details);
  if (!selected) {
    details.textContent = "Select a recipe to inspect it.";
    details.style.opacity = "0.7";
    return;
  }
  const output = recipeOutput(selected);
  const outputHead = document.createElement("div");
  Object.assign(outputHead.style, { display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px" });
  renderIcon(outputHead, output, 54);
  const outputText = document.createElement("div");
  const outputName = document.createElement("div");
  outputName.textContent = String(selected.name || output.name || "Recipe");
  Object.assign(outputName.style, { fontSize: "17px", fontWeight: "800", color: "#f1e1ff" });
  outputText.appendChild(outputName);
  const owned = safeCount(selected.owned);
  if (selected.owned != null) {
    const ownedText = document.createElement("div");
    ownedText.textContent = `Owned: ${owned}`;
    ownedText.style.fontSize = "11px";
    ownedText.style.color = "#b9c5d3";
    outputText.appendChild(ownedText);
  }
  outputHead.appendChild(outputText);
  details.appendChild(outputHead);
  const description = document.createElement("div");
  description.textContent = String(selected.description || output.description || selected.effectSummary || selected.flavor || "");
  Object.assign(description.style, { color: "#d9e2ec", lineHeight: "1.45", fontSize: "13px", whiteSpace: "pre-wrap", marginBottom: "12px" });
  if (description.textContent) details.appendChild(description);
  if (String(selected.effectSummary || "").trim() && description.textContent !== String(selected.effectSummary)) {
    const effect = document.createElement("div");
    effect.textContent = String(selected.effectSummary);
    effect.style.color = "#d8b45a";
    effect.style.fontSize = "12px";
    effect.style.marginBottom = "12px";
    details.appendChild(effect);
  }
  const reqTitle = document.createElement("div");
  reqTitle.textContent = "Required materials";
  Object.assign(reqTitle.style, { textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "11px", color: "#ad9f8d", marginBottom: "6px" });
  details.appendChild(reqTitle);
  const requirements = document.createElement("div");
  Object.assign(requirements.style, { display: "flex", flexDirection: "column", gap: "4px" });
  for (const req of Array.isArray(selected.requirements) ? selected.requirements : []) renderRequirement(requirements, req);
  if (!requirements.childElementCount) {
    const none = document.createElement("div");
    none.textContent = "No material requirements.";
    none.style.opacity = "0.7";
    requirements.appendChild(none);
  }
  details.appendChild(requirements);
  const footer = document.createElement("div");
  Object.assign(footer.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "14px", paddingTop: "10px", borderTop: "1px solid rgba(140, 162, 186, 0.22)" });
  const status = document.createElement("div");
  status.textContent = selected.canCraft ? "Ready to craft." : String(selected.missingText || "Missing required materials.");
  Object.assign(status.style, { fontSize: "12px", color: selected.canCraft ? "#b9e7bd" : "#f0b2b2", lineHeight: "1.35" });
  footer.appendChild(status);
  const action = document.createElement("button");
  action.type = "button";
  action.textContent = `${String(model.actionLabel || "Craft")} — ${String(selected.name || "Recipe")}`;
  action.disabled = selected.canCraft !== true || !(Number(model.stationId || 0) > 0);
  Object.assign(action.style, { minHeight: "40px", padding: "8px 14px", borderRadius: "999px", border: "1px solid #c99d3c", background: action.disabled ? "rgba(60, 60, 60, 0.6)" : "rgba(125, 87, 24, 0.95)", color: action.disabled ? "#8994a0" : "#fff1b0", fontWeight: "800", cursor: action.disabled ? "default" : "pointer" });
  action.addEventListener("click", () => {
    if (action.disabled || !selected.action?.eventName) return;
    window.dispatchEvent(new CustomEvent(selected.action.eventName, { detail: selected.action.detail }));
  });
  footer.appendChild(action);
  details.appendChild(footer);
}
