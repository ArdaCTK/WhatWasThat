const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  wwt_port: 27484,
  show_badge: true,
  capture_quality: 90,
  api_token: ''
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
  const s = await chrome.storage.sync.get(DEFAULTS);
  $('wwt_port').value = s.wwt_port;
  $('show_badge').checked = s.show_badge;
  $('capture_quality').value = s.capture_quality;
  $('api_token').value = s.api_token || '';
}

async function saveSettings() {
  const settings = {
    wwt_port: parseInt($('wwt_port').value, 10) || DEFAULTS.wwt_port,
    show_badge: $('show_badge').checked,
    capture_quality: parseInt($('capture_quality').value, 10) || DEFAULTS.capture_quality,
    api_token: ($('api_token').value || '').trim()
  };
  await chrome.storage.sync.set(settings);
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
}

async function checkConnection() {
  const dot = $('conn-dot');
  const text = $('conn-text');
  const port = parseInt($('wwt_port').value, 10) || DEFAULTS.wwt_port;
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
