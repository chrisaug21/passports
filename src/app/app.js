import { bootstrapApp } from "./bootstrap.js";

bootstrapApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (error) {
      console.error("Service worker registration failed.", error);
    }
  });
}
