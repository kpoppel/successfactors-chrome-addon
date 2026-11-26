import { loadSettings, DEFAULTS } from './settings.js';

const form = document.getElementById('form');

function toggleModeFields() {
    const fixed = form.date_mode.value === 'fixed';
    document.getElementById('fixed').hidden = !fixed;
    document.getElementById('rolling').hidden = fixed;
}

const settings = await loadSettings();
for (const key of Object.keys(DEFAULTS)) form.elements[key].value = settings[key];
toggleModeFields();
form.date_mode.addEventListener('change', toggleModeFields);

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = {};
    for (const key of Object.keys(DEFAULTS)) values[key] = form.elements[key].value.trim();
    values.sf_host = values.sf_host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    await chrome.storage.local.set(values);
    document.getElementById('status').textContent = 'Saved';
});
