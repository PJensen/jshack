import { adaptCookingState } from "./craftingAdapters.js";
import { renderCraftingScreen } from "./craftingScreen.js";

/** Backward-compatible entry point for callers outside the overlay coordinator. */
export function renderCookingFire(panel, state) {
  renderCraftingScreen(panel, adaptCookingState(state));
}
