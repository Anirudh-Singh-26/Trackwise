// Bridge explicit Trackwise work-session lifecycle signals to the extension.
// This bridge does not read page contents, keystrokes, clicks, or browsing history.
(() => {
  const allowedOrigin = window.location.origin;

  function sendRuntimeMessage(message) {
    // A tab can retain an old content-script instance after an extension reload.
    // In that case chrome.runtime may be missing or sendMessage may reject. Convert
    // both cases into a normal result so the webpage never gets an uncaught error.
    try {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime || typeof runtime.sendMessage !== "function") {
        return Promise.resolve({ ok: false, reason: "extension-context-unavailable" });
      }
      return runtime.sendMessage(message).catch(() => ({ ok: false, reason: "extension-context-unavailable" }));
    } catch {
      return Promise.resolve({ ok: false, reason: "extension-context-unavailable" });
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== allowedOrigin) return;
    const message = event.data;
    if (!message || message.source !== "trackwise-app") return;

    if (message.type === "PREPARE_WORK_SESSION_END" && typeof message.requestId === "string") {
      const result = await sendRuntimeMessage({
        type: "TRACKWISE_PREPARE_SESSION_END",
        origin: event.origin,
        requestId: message.requestId
      });
      window.postMessage({
        source: "trackwise-extension",
        type: "WORK_SESSION_END_PREPARED",
        requestId: message.requestId,
        result: result || { ok: false, reason: "empty-response" }
      }, allowedOrigin);
      return;
    }

    if (message.type === "WORK_SESSION_STARTED") {
      const result = await sendRuntimeMessage({ type: "TRACKWISE_SESSION_STARTED", origin: event.origin });
      window.postMessage({
        source: "trackwise-extension",
        type: "WORK_SESSION_TRACKING_STATUS",
        result: result || { ok: false, reason: "empty-response" }
      }, allowedOrigin);
      return;
    }

    if (message.type === "WORK_SESSION_ENDED") {
      await sendRuntimeMessage({ type: "TRACKWISE_SESSION_ENDED", origin: event.origin });
    }
  });
})();
