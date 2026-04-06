(function () {
  'use strict';
  if (window.__wwt_injected) return;
  window.__wwt_injected = true;
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key === 'S') { e.preventDefault(); triggerCapture(); }
  });
  document.addEventListener('__wwt_capture_selection', (e) => {
    const text = e?.detail?.text || window.getSelection()?.toString() || '';
    if (!text.trim()) { showFlash('No selected text', 'error'); return; }
    chrome.runtime.sendMessage({ type: 'CAPTURE_SELECTION', selectionText: text, pageUrl: location.href, tabId: null }, (response) => {
      if (response?.ok) showFlash('Saved selection to WhatWasThat', 'success');
      else showFlash('Error: ' + (response?.error ?? 'Unknown'), 'error');
    });
  });
  function triggerCapture() {
    chrome.runtime.sendMessage({ type: 'CAPTURE_TAB', tabId: null }, (response) => {
      if (response?.ok) showFlash('Saved to WhatWasThat', 'success');
      else showFlash('Error: ' + (response?.error ?? 'Unknown'), 'error');
    });
  }
  function showFlash(message, type) {
    const existing = document.getElementById('__wwt_flash');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = '__wwt_flash';
    div.textContent = message;
    div.style.cssText = `position:fixed;top:20px;right:20px;z-index:2147483647;padding:10px 18px;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;color:white;background:${type === 'success' ? '#3fb950' : '#ef4444'};box-shadow:0 4px 16px rgba(0,0,0,0.3);opacity:1;pointer-events:none;`;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 2500);
  }
})();
