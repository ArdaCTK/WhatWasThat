const $ = (id) => document.getElementById(id);

let isOnline = false;
let settings = null;

document.addEventListener('DOMContentLoaded', async () => {
  settings = await getSettings();
  await checkConnection();
  setupButtons();
  loadVersion();
});

async function getSettings() {
  return chrome.storage.sync.get({
    wwt_port: 27484,
    show_badge: true,
    capture_quality: 90,
    api_token: ''
  });
}

async function checkConnection() {
  const resp = await sendBg({ type: 'PING_WWT' });
  isOnline = resp?.alive ?? false;

  const dot = $('status-dot');
  const text = $('status-text');

  if (isOnline) {
    dot.className = 'status-dot online';
    text.textContent = 'Connected';
    $('btn-capture').disabled = false;
    $('btn-capture-sel').disabled = false;
  } else {
    dot.className = 'status-dot offline';
    text.textContent = settings.api_token ? 'App offline or unauthorized' : 'API token missing';
  }
}

function setupButtons() {
  $('btn-capture').addEventListener('click', async () => {
    setLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const resp = await sendBg({ type: 'CAPTURE_TAB', tabId: tab.id });
      if (resp?.ok) showResult('Saved to archive.', 'success');
      else showResult('Error: ' + (resp?.error ?? 'Unknown'), 'error');
    } catch (err) {
      showResult('Error: ' + (err.message || String(err)), 'error');
    } finally {
      setLoading(false);
    }
  });

  $('btn-capture-sel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: triggerSelectionCapture });
      window.close();
    } catch (err) {
      showResult('Error: ' + (err.message || String(err)), 'error');
    }
  });

  $('btn-options-open').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btn-options').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
}

function sendBg(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (resp) => resolve(resp)));
}

function setLoading(loading) {
  $('btn-capture').disabled = loading || !isOnline;
  $('btn-capture').querySelector('span:last-child').textContent = loading ? 'Saving...' : 'Save This Page';
}

function showResult(msg, type) {
  const el = $('result-msg');
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function loadVersion() {
  $('version-text').textContent = `v${chrome.runtime.getManifest().version}`;
}

function triggerSelectionCapture() {
  const sel = window.getSelection()?.toString();
  if (!sel || !sel.trim()) {
    alert('Select text first.');
    return;
  }
  document.dispatchEvent(new CustomEvent('__wwt_capture_selection', { detail: { text: sel } }));
}
