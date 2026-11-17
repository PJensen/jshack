import { adaptSmithingState } from "./craftingAdapters.js";
import { renderCraftingScreen } from "./craftingScreen.js";

/** Backward-compatible entry point for callers outside the overlay coordinator. */
export function renderAnvil(panel, state) {
  renderCraftingScreen(panel, adaptSmithingState(state));
}
