const fields = [
  'auto_transmit',
  'server_url',
  'teamdb_email',
  'teamdb_token',
  'from_date',
  'to_date',
  'default_userid',
];

const statusEl = document.getElementById('status');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#b00020' : '#1b5e20';
}

async function loadSettings() {
  const data = await chrome.storage.local.get(fields);
  document.getElementById('auto_transmit').checked = Boolean(data.auto_transmit);
  document.getElementById('server_url').value = data.server_url || 'http://127.0.0.1:8765';
  document.getElementById('teamdb_email').value = data.teamdb_email || '';
  document.getElementById('teamdb_token').value = data.teamdb_token || '';
  document.getElementById('from_date').value = data.from_date || '';
  document.getElementById('to_date').value = data.to_date || '';
  document.getElementById('default_userid').value = data.default_userid || '';
}

async function saveSettings() {
  const payload = {
    auto_transmit: document.getElementById('auto_transmit').checked,
    server_url: document.getElementById('server_url').value.trim(),
    teamdb_email: document.getElementById('teamdb_email').value.trim(),
    teamdb_token: document.getElementById('teamdb_token').value.trim(),
    from_date: document.getElementById('from_date').value.trim(),
    to_date: document.getElementById('to_date').value.trim(),
    default_userid: document.getElementById('default_userid').value.trim(),
  };
  await chrome.storage.local.set(payload);
  setStatus('Settings saved');
}

async function triggerSync() {
  setStatus('Transmitting...');
  try {
    const response = await chrome.runtime.sendMessage({ message: 'triggerTransmitNow' });
    if (!response || !response.ok) {
      setStatus(`Transmit failed: ${(response && response.error) || 'unknown error'}`, true);
      return;
    }
    setStatus(`Transmit succeeded.\nUploaded: ${response.resultsCount} records`);
  } catch (error) {
    setStatus(`Transmit failed: ${error.message}`, true);
  }
}

document.getElementById('save_button').addEventListener('click', async () => {
  await saveSettings();
});

document.getElementById('sync_button').addEventListener('click', async () => {
  await saveSettings();
  await triggerSync();
});

await loadSettings();
