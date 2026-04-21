import { bootstrapApp } from "./bootstrap.js";
import { APP_VERSION } from "../config/constants.js";

bootstrapApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`);
    } catch (error) {
      console.error("Service worker registration failed.", error);
    }
  });
}
