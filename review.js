import { createReviewController } from "./src/review/ui/review-controller.js";

const controller = createReviewController({
  document,
  window,
  location
});

controller.init().catch((error) => {
  console.error(error);
  controller.showFatalError(error);
});
