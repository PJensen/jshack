import { adaptEnchantingState } from "./craftingAdapters.js";
import { renderCraftingScreen } from "./craftingScreen.js";

/** Backward-compatible entry point for callers outside the overlay coordinator. */
export function renderEnchantingBench(panel, state) {
  renderCraftingScreen(panel, adaptEnchantingState(state));
}
