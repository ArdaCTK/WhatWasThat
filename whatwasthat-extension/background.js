const DEFAULT_PORT = 27484;
const ICON_WARN = 'WARN';
const ICON_OK = 'OK';
const MAX_IMAGE_FETCH_BYTES = 20 * 1024 * 1024;

function defaultSettings() {
  return {
    wwt_port: DEFAULT_PORT,
    auto_capture: false,
    show_badge: true,
    capture_quality: 90,
    api_token: ''
  };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'wwt-save-page', title: 'WhatWasThat Save (Page)', contexts: ['page', 'frame'] });
    chrome.contextMenus.create({ id: 'wwt-save-image', title: 'WhatWasThat Save (Image)', contexts: ['image'] });
    chrome.contextMenus.create({ id: 'wwt-save-selection', title: 'WhatWasThat Save (Selection)', contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    switch (info.menuItemId) {
      case 'wwt-save-page':
        await captureAndSendTab(tab);
        break;
      case 'wwt-save-image':
        await sendImageUrl(tab, info.srcUrl ?? '');
        break;
      case 'wwt-save-selection':
        await sendSelection(tab, info.selectionText ?? '', info.pageUrl ?? tab.url ?? '');
        break;
    }
  } catch (err) {
    console.error('[WWT] Error:', err);
    showNotification('Error', normalizeError(err), 'failure');
  }
});

async function buildApiContext() {
  const s = await getSettings();
  const port = Number.isFinite(parseInt(s.wwt_port, 10)) ? parseInt(s.wwt_port, 10) : DEFAULT_PORT;
  return { settings: s, base: `http://127.0.0.1:${port}/api` };
}

function authHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.api_token && settings.api_token.trim()) {
    headers.Authorization = `Bearer ${settings.api_token.trim()}`;
    headers['X-API-Key'] = settings.api_token.trim();
  }
  return headers;
}

function assertTokenConfigured(settings) {
  if (!settings.api_token || !settings.api_token.trim()) {
    throw new Error('API token missing. Set token in extension options and app settings.');
  }
}

async function captureAndSendTab(tab) {
  const { settings } = await buildApiContext();
  assertTokenConfigured(settings);

  const quality = Math.max(50, Math.min(100, parseInt(settings.capture_quality, 10) || 90));
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality });

  const payload = {
    type: 'screenshot',
    source: 'browser_extension',
    url: tab.url,
    title: tab.title,
    data_url: dataUrl,
    captured_at: new Date().toISOString()
  };

  await sendToWWT(payload);
}

async function sendImageUrl(tab, srcUrl) {
  const { settings } = await buildApiContext();
  assertTokenConfigured(settings);

  const response = await fetch(srcUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);

  const lenHeader = parseInt(response.headers.get('content-length') || '0', 10);
  if (lenHeader > MAX_IMAGE_FETCH_BYTES) throw new Error('Image too large for extension transfer');

  const blob = await response.blob();
  if (blob.size > MAX_IMAGE_FETCH_BYTES) throw new Error('Image too large for extension transfer');

  const dataUrl = await blobToDataURL(blob);
  const payload = {
    type: 'image',
    source: 'browser_extension',
    url: tab.url,
    title: tab.title,
    src_url: srcUrl,
    data_url: dataUrl,
    captured_at: new Date().toISOString()
  };

  await sendToWWT(payload);
}

async function sendSelection(tab, selectionText, pageUrl) {
  const { settings } = await buildApiContext();
  assertTokenConfigured(settings);

  const quality = Math.max(50, Math.min(100, parseInt(settings.capture_quality, 10) || 85));
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality });

  const payload = {
    type: 'selection',
    source: 'browser_extension',
    url: pageUrl,
    title: tab.title,
    selection_text: selectionText,
    data_url: dataUrl,
    captured_at: new Date().toISOString()
  };

  await sendToWWT(payload);
}

async function sendToWWT(payload) {
  const { settings, base } = await buildApiContext();
  assertTokenConfigured(settings);

  const response = await fetch(`${base}/ingest`, {
    method: 'POST',
    headers: authHeaders(settings),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  }).catch((err) => {
    throw new Error(`Cannot reach WhatWasThat app (${err.message})`);
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WhatWasThat API error: HTTP ${response.status} ${text}`.trim());
  }

  const result = await response.json();
  const title = result?.title ?? payload.title ?? 'Page';
  showNotification(`${ICON_OK} Saved`, `"${title}" added to archive`);
  return result;
}

async function pingWWT() {
  const { settings, base } = await buildApiContext();
  try {
    const headers = settings.api_token ? { Authorization: `Bearer ${settings.api_token}`, 'X-API-Key': settings.api_token } : {};
    const response = await fetch(`${base}/ping`, { headers, signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'CAPTURE_TAB':
      (async () => {
        try {
          const tabId = msg.tabId ?? sender?.tab?.id;
          if (!tabId) throw new Error('Tab not found');
          const tab = await chrome.tabs.get(tabId);
          await captureAndSendTab(tab);
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: normalizeError(err) });
        }
      })();
      return true;

    case 'CAPTURE_SELECTION':
      (async () => {
        try {
          const tabId = msg.tabId ?? sender?.tab?.id;
          if (!tabId) throw new Error('Tab not found');
          const tab = await chrome.tabs.get(tabId);
          await sendSelection(tab, msg.selectionText ?? '', msg.pageUrl ?? tab.url ?? '');
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: normalizeError(err) });
        }
      })();
      return true;

    case 'PING_WWT':
      pingWWT().then((alive) => sendResponse({ alive }));
      return true;

    case 'GET_SETTINGS':
      getSettings().then((s) => sendResponse(s));
      return true;

    case 'SAVE_SETTINGS':
      saveSettings(msg.settings).then(() => sendResponse({ ok: true }));
      return true;
  }
});

async function getSettings() {
  return chrome.storage.sync.get(defaultSettings());
}

async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function normalizeError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title,
    message,
    priority: 0
  });
}

async function updateBadge() {
  const alive = await pingWWT();
  const settings = await getSettings();
  if (!settings.show_badge) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  chrome.action.setBadgeText({ text: alive ? '•' : '×' });
  chrome.action.setBadgeBackgroundColor({ color: alive ? '#3fb950' : '#ef4444' });
}

setInterval(updateBadge, 30_000);
updateBadge();
