import { adaptAlchemyState } from "./craftingAdapters.js";
import { renderCraftingScreen } from "./craftingScreen.js";

export function renderAlchemyBench(panel, state) {
  renderCraftingScreen(panel, adaptAlchemyState(state));
}
