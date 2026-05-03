import { installRuntimeGuard } from "./src/shared/runtime-guard.js";

installRuntimeGuard({
  onError(message) {
    console.error("Olho privacy page error", message);
  }
});
