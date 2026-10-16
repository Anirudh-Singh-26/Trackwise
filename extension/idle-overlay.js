(() => {
  if (window.top !== window) return;

  const controllerKey = '__trackwiseIdleOverlayController';
  const existing = window[controllerKey];

  // Reuse the live controller on repeat injections, but never trust a bare DOM
  // host: it may have been left behind by an invalidated/reloaded extension.
  if (existing && typeof existing.apply === 'function') {
    if (existing.runtimeListener && !chrome.runtime.onMessage.hasListener(existing.runtimeListener)) {
      chrome.runtime.onMessage.addListener(existing.runtimeListener);
    }
    if (existing.storageListener && !chrome.storage.onChanged.hasListener(existing.storageListener)) {
      chrome.storage.onChanged.addListener(existing.storageListener);
    }
    existing.syncFromStorage?.();
    return;
  }
  document.getElementById('trackwise-idle-overlay-host')?.remove();

  let state = 'active';
  let locallyDismissed = false;
  const host = document.createElement('div');
  host.id = 'trackwise-idle-overlay-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:18px;bottom:18px;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial} .card{font:14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;background:#991b1b;border:1px solid #fca5a5;border-radius:12px;padding:14px 18px;box-shadow:0 8px 28px #0005;min-width:190px;display:flex;gap:10px;align-items:center}.card[hidden]{display:none!important}.dot{width:9px;height:9px;border-radius:50%;background:#fff;flex:none}.title{font-weight:700;font-size:14px}.sub{font-size:11px;opacity:.92}`;
  const card = document.createElement('div');
  card.className = 'card';
  card.hidden = true;
  const dot = document.createElement('span'); dot.className = 'dot';
  const content = document.createElement('div');
  const title = document.createElement('div'); title.className = 'title'; title.textContent = 'You are idle';
  const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = 'Move your mouse or use your keyboard to resume activity.';
  content.append(title, sub);
  card.append(dot, content);
  shadow.append(style, card);
  (document.documentElement || document).appendChild(host);

  function apply(message, fromBackground = true) {
    const nextState = message?.state || 'active';
    // A local mouse/keyboard event hides the warning immediately. Ignore stale
    // idle snapshots until the background confirms that Chrome is active again.
    if (locallyDismissed && (nextState === 'idle' || nextState === 'locked')) return;
    if (nextState === 'active') locallyDismissed = false;
    state = nextState;
    card.hidden = !(state === 'idle' || state === 'locked');
  }

  function syncFromStorage() {
    chrome.storage.local.get(['idleUiState', 'extensionToken', 'sessionId', 'breakActive'])
      .then(s => {
        if (!s.extensionToken || !s.sessionId || s.breakActive) {
          apply({ state: 'active' });
          return;
        }
        apply({ state: s.idleUiState || 'active' }, false);
      })
      .catch(() => apply({ state: 'active' }));
  }

  const runtimeListener = message => {
    if (message?.type !== 'TRACKWISE_IDLE_STATE' && message?.type !== 'TRACKWISE_OVERLAY_STATE') return;
    apply(message);
  };
  const storageListener = (changes, areaName) => {
    if (areaName !== 'local' || !['idleUiState', 'extensionToken', 'sessionId', 'breakActive'].some(key => key in changes)) return;
    syncFromStorage();
  };
  const dismissOnActivity = () => {
    if (card.hidden) return;
    locallyDismissed = true;
    state = 'active';
    card.hidden = true;
  };

  // Hide immediately on the actual page interaction instead of waiting for the
  // Chrome idle event/message round trip. No timer or elapsed-time display.
  const activityEvents = ['mousemove', 'pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, dismissOnActivity, { capture: true, passive: true });
  }

  chrome.runtime.onMessage.addListener(runtimeListener);
  chrome.storage.onChanged.addListener(storageListener);
  window[controllerKey] = { apply, runtimeListener, storageListener, syncFromStorage };
  syncFromStorage();
})();
