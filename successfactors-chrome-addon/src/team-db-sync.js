// team-db-sync.js
import { storageManager } from './storage-manager.js';

const LS_KEY = 'teamdb_local_entry';
const CHANGES_KEY = 'teamdb_local_changes';

export async function loadLocal() {
    try {
        return await storageManager.get(LS_KEY, null);
    } catch (e) {
        console.error('loadLocal failed:', e);
        return null;
    }
}

export async function hasPending() {
    const e = await loadLocal();
    return e && e.pending === true;
}

export async function saveLocal(data) {
    const entry = {
        data,
        modified_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        pending: true
    };
    try {
        await storageManager.set(LS_KEY, entry);
        return entry;
    } catch (e) {
        console.error('saveLocal failed:', e);
        throw e;
    }
}

export async function clearLocal() {
    try {
        await storageManager.removeMultiple([LS_KEY, CHANGES_KEY]);
    } catch (e) {
        console.error('clearLocal failed:', e);
    }
}

export async function addPendingChange(kind, id) {
    // kind: 'people' | 'teams' | 'projects'
    try {
        const cur = await storageManager.get(CHANGES_KEY, { people: [], teams: [], projects: [] });
        if (!cur[kind]) cur[kind] = [];
        if (!cur[kind].includes(id)) {
            cur[kind].push(id);
            await storageManager.set(CHANGES_KEY, cur);
        }
    } catch (e) {
        console.error('addPendingChange failed:', e);
    }
}

export async function loadPendingChanges() {
    try {
        return await storageManager.get(CHANGES_KEY, { people: [], teams: [], projects: [] });
    } catch (e) {
        console.error('loadPendingChanges failed:', e);
        return { people: [], teams: [], projects: [] };
    }
}

export async function clearPendingChanges() {
    try {
        await storageManager.remove(CHANGES_KEY);
    } catch (e) {
        console.error('clearPendingChanges failed:', e);
    }
}

export async function saveToServer(localEntry, serverUrl, email, token, force=false) {
    const url = serverUrl.replace(/\/$/, '') + '/api/teamdb';
    const headers = { 'Content-Type': 'application/json' };
    if (email) headers['X-TeamDB-Email'] = email;
    if (token) headers['X-TeamDB-Token'] = token;
    if (localEntry && localEntry.modified_at && !force) {
        headers['X-Client-Modified-At'] = localEntry.modified_at;
    }

    const resp = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(localEntry.data) });
    if (resp.status === 412) {
        const err = new Error('Conflict');
        err.type = 'conflict';
        throw err;
    }
    if (!resp.ok) {
        const text = await resp.text().catch(() => resp.statusText);
        const err = new Error('Save failed: ' + text);
        err.type = 'save_error';
        throw err;
    }
    // success
    await clearLocal();
    // also clear the per-row pending changes list
    await clearPendingChanges();
    return resp.json().catch(() => ({}));
}
