import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { measureAppViewportHeight } from "./lib/viewport-height";

function syncAppViewportHeight() {
  const viewportHeight = measureAppViewportHeight();
  if (viewportHeight <= 0) {
    return;
  }

  document.documentElement.style.setProperty(
    "--app-height",
    `${Math.round(viewportHeight)}px`,
  );
}

function syncAppViewportHeightDeferred() {
  syncAppViewportHeight();
  window.requestAnimationFrame(syncAppViewportHeight);
  window.setTimeout(syncAppViewportHeight, 120);
}

syncAppViewportHeight();
window.addEventListener("resize", syncAppViewportHeight);
window.addEventListener("orientationchange", syncAppViewportHeight);
window.addEventListener("fullscreenchange", syncAppViewportHeightDeferred);
window.visualViewport?.addEventListener("resize", syncAppViewportHeight);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
