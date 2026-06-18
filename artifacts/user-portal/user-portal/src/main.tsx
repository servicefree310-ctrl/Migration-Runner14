import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global safety net: capture any unhandled promise rejections and surface them
// in the console with full detail. This does NOT suppress them — the Replit
// runtime-error-modal will still see real application errors via window.onerror
// — but it ensures we always have a traceable stack in DevTools when debugging.
if (import.meta.env.DEV) {
  window.addEventListener("unhandledrejection", (evt) => {
    const reason = evt.reason;
    if (!reason) return;
    // Suppress benign WebSocket / network noise that is not a code bug.
    const msg: string =
      typeof reason === "string"
        ? reason
        : reason?.message ?? String(reason);
    if (
      msg.includes("ECONNRESET") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("WebSocket") ||
      msg.includes("NetworkError") ||
      msg.includes("Failed to fetch")
    ) {
      evt.preventDefault(); // stop the modal from showing for network errors
      return;
    }
    console.error("[unhandledrejection]", reason);
  });
}

createRoot(document.getElementById("root")!).render(<App />);

// PWA service worker registration (production only — Vite HMR breaks under SW in dev)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/user/sw.js", { scope: "/user/" })
      .catch((err) => console.warn("[pwa] sw register failed", err));
  });
}
