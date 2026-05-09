import { createSidepanelController } from "./src/review/sidepanel/sidepanel-controller.js";

const controller = createSidepanelController({
  document,
  window
});

controller.init().catch((error) => {
  console.error("Olho side panel failed to initialize", error);
});
