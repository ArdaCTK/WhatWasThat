const $ = (id) => document.getElementById(id);

// FIX: mirror background.js storage split — non-sensitive settings in sync,
// api_token in local storage only.
const SYNC_DEFAULTS = {
  wwt_port: 27484,
  show_badge: true,
  capture_quality: 90,
};
const LOCAL_DEFAULTS = {
  api_token: '',
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkConnection();

  $('btn-save').addEventListener('click', async () => {
    await saveSettings();
    $('save-msg').style.display = 'inline';
    setTimeout(() => { $('save-msg').style.display = 'none'; }, 2000);
  });

  $('btn-test').addEventListener('click', checkConnection);
});

async function loadSettings() {
  const [syncPart, localPart] = await Promise.all([
    chrome.storage.sync.get(SYNC_DEFAULTS),
    chrome.storage.local.get(LOCAL_DEFAULTS),
  ]);
  $('wwt_port').value = syncPart.wwt_port;
  $('show_badge').checked = syncPart.show_badge;
  $('capture_quality').value = syncPart.capture_quality;
  $('api_token').value = localPart.api_token || '';
}

async function saveSettings() {
  const api_token = ($('api_token').value || '').trim();
  const syncable = {
    wwt_port: parseInt($('wwt_port').value, 10) || SYNC_DEFAULTS.wwt_port,
    show_badge: $('show_badge').checked,
    capture_quality: parseInt($('capture_quality').value, 10) || SYNC_DEFAULTS.capture_quality,
  };
  await Promise.all([
    chrome.storage.sync.set(syncable),
    chrome.storage.local.set({ api_token }),
  ]);
  // Notify background script so its cached settings are refreshed
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { ...syncable, api_token } });
}

async function checkConnection() {
  const dot = $('conn-dot');
  const text = $('conn-text');
  const port = parseInt($('wwt_port').value, 10) || SYNC_DEFAULTS.wwt_port;
  const token = ($('api_token').value || '').trim();

  try {
    const headers = token ? { Authorization: `Bearer ${token}`, 'X-API-Key': token } : {};
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { headers, signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const data = await r.json().catch(() => ({}));
    dot.className = 'dot green';
    text.textContent = `Connected - v${data.version ?? '?'}`;
  } catch (err) {
    dot.className = 'dot red';
    text.textContent = `Connection failed (${err.message})`;
  }
}
