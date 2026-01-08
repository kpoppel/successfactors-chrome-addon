import Database from './database.js';
import { loadLocal, saveLocal, clearLocal, saveToServer, hasPending, clearPendingChanges } from './team-db-sync.js';
import { storageManager } from './storage-manager.js';

let config = null;

export async function loadConfig() {
    if (!config) {
        try {
            const response = await fetch(chrome.runtime.getURL('config/config.yaml'));
            config = jsyaml.load(await response.text());
            console.log("Configuration loaded:", config);
        } catch (error) {
            console.error("Failed to load configuration:", error);
            throw error;
        }
    }
    return config;
}

// Export the config variable for direct use after initialization
export function getConfig() {
    if (!config) {
        throw new Error("Configuration has not been loaded yet. Call loadConfig() first.");
    }
    return config;
}

// Load database configuration on startup
let databaseInstance = null;
let databaseInitialized = false;
let initializationPromise = null;

export async function loadDatabase() {
    console.log('loadDatabase() called - databaseInitialized:', databaseInitialized, 'initializationPromise:', !!initializationPromise);
    
    if (initializationPromise) {
        console.log('Returning existing initialization promise');
        return initializationPromise;
    }

    console.log('Starting fresh database initialization');
    initializationPromise = (async () => {
        const db = new Database();

        // Check if server is configured
        const serverConfig = await storageManager.getMultiple(['server_url', 'teamdb_email', 'teamdb_token']);
        
        const serverUrl = (serverConfig.server_url || '').trim();
        const hasServer = serverUrl.length > 0;
        
        let serverData = null;
        if (hasServer) {
            console.log('Server configured, attempting to load database from server:', serverUrl);
            try {
                const url = serverUrl.replace(/\/$/, '') + '/api/teamdb';
                const headers = {};
                if (serverConfig.teamdb_email) headers['X-TeamDB-Email'] = serverConfig.teamdb_email;
                if (serverConfig.teamdb_token) headers['X-TeamDB-Token'] = serverConfig.teamdb_token;
                
                const resp = await fetch(url, { method: 'GET', headers });
                if (resp.ok) {
                    // Expect JSON { database: <object>, last_modified: <timestamp> }
                    const j = await resp.json().catch(() => null);
                    if (j) {
                        // Prefer the full document if it contains top-level 'database'
                        if (j.database && (j.database.people || j.database.teams || j.database.projects)) {
                            // j is the full document { version, database: { people, teams, projects } }
                            serverData = j;
                        } else if (j.people || j.teams || j.projects) {
                            // j appears to be the inner database mapping; wrap it
                            serverData = { version: j.version || '', database: j };
                        } else {
                            // Unknown JSON shape — pass through
                            serverData = j;
                        }
                        console.log('Server response keys:', Object.keys(j));
                        console.log('Server last_modified:', j.last_modified);
                    } else {
                        serverData = await resp.text();
                    }
                    console.log('Successfully loaded database from server');
                } else {
                    console.warn('Server returned error:', resp.status, resp.statusText, '- falling back to local data');
                }
            } catch (err) {
                console.warn('Failed to load from server:', err.message, '- falling back to local data');
            }
        }

        // Load both disk and storage YAML for version comparison
        // Try to fetch local file, but don't fail if it doesn't exist (server-only mode)
        let yamlContent = null;
        try {
            yamlContent = await fetch('config/database.yaml').then(r => r.text());
        } catch (err) {
            console.log('Local database file not found (server-only mode)');
        }
        
        const storedDatabase = await storageManager.get('database_yaml');

        // Helper to extract version from YAML (expects 'version: ...' at top level)
        function extractVersion(yamlStr) {
            if (!yamlStr) return null;
            try {
                const doc = jsyaml.load(yamlStr);
                return doc && doc.version ? doc.version : null;
            } catch (e) {
                return null;
            }
        }

        // Priority: server > local pending > storage > disk
        let selectedSource = 'disk';
        let selectedData = yamlContent;

        // If there is a pending local entry, prefer it over server/storage
        const localEntry = await loadLocal();
        if (localEntry && localEntry.pending) {
            // If server also provided data, check whether local pending equals server — if so, clear pending marks
            if (serverData) {
                try {
                    const serverYaml = typeof serverData === 'string' ? serverData : jsyaml.dump(serverData, { quotingType: '"', lineWidth: -1 });
                    const localYaml = jsyaml.dump(localEntry.data, { quotingType: '"', lineWidth: -1 });
                    if (serverYaml === localYaml) {
                        console.log('Local pending matches server; clearing local pending marks');
                        try { await clearLocal(); } catch (e) { console.warn('clearLocal failed:', e); }
                        try { await clearPendingChanges(); } catch (e) { console.warn('clearPendingChanges failed:', e); }
                        selectedSource = 'server';
                        selectedData = serverData;
                    } else {
                        selectedSource = 'local';
                        selectedData = jsyaml.dump(localEntry.data);
                        console.log('Using pending local database changes');
                    }
                } catch (e) {
                    console.warn('Failed to compare local pending with server data:', e);
                    selectedSource = 'local';
                    selectedData = jsyaml.dump(localEntry.data);
                }
            } else {
                selectedSource = 'local';
                selectedData = jsyaml.dump(localEntry.data);
                console.log('Using pending local database changes');
            }
        } else if (serverData) {
            selectedSource = 'server';
            selectedData = serverData;
            console.log('Using database from server');
        } else {
            // No server data and no local pending - check disk and storage
            const diskVersion = extractVersion(yamlContent);
            const cacheVersion = extractVersion(storedDatabase);
            console.log('Disk version:', diskVersion, 'Cache version:', cacheVersion);

            let useDisk = false;
            // If cache is missing or cache version is null, try disk
            if (!storedDatabase || cacheVersion === null) {
                useDisk = yamlContent !== null;
            } else if (diskVersion && cacheVersion && yamlContent) {
                // If disk version is newer (assume numeric or ISO string comparison)
                if (diskVersion > cacheVersion) {
                    useDisk = true;
                }
            }

            if (useDisk && yamlContent) {
                selectedSource = 'disk';
                selectedData = yamlContent;
                console.log('Using database from disk (fresh, disk version newer, or cache missing/invalid)');
            } else if (storedDatabase) {
                selectedSource = 'storage';
                selectedData = storedDatabase;
                console.log('Using database from storage (contains updates, cache version >= disk)');
            } else {
                // No data available from any source
                throw new Error('No database available: no server, no local file, and no cached data. Please configure server URL or provide a local database file.');
            }
        }

        // Defensive check: selectedData may be null or an unexpected type
        try {
            console.log('Selected data source:', selectedSource);
            if (selectedData === null || selectedData === undefined) {
                throw new Error('Selected database data is null/undefined');
            }
            // If selectedData is a string, ensure it's non-empty
            if (typeof selectedData === 'string' && selectedData.trim().length === 0) {
                throw new Error('Selected database data is empty string');
            }

            // Log a short preview for debugging
            try {
                const preview = typeof selectedData === 'string' ? selectedData.substring(0, 200) : JSON.stringify(Object.keys(selectedData || {}).slice(0,10));
                console.log('Selected data preview:', preview);
            } catch (e) {
                console.log('Selected data preview unavailable:', e.message);
            }

            db.loadYamlData(selectedData);
        } catch (e) {
            console.error('Failed to initialize database from selectedData:', e);
            throw e;
        }
        db._loadedFrom = selectedSource;
        
        // Save to cache if loaded from server or disk
        if (selectedSource === 'server' || selectedSource === 'disk') {
            await storageManager.set('database_yaml', selectedData);
        }

        // Get holiday data from storage
        const storageData = await storageManager.get('absence_data');

        if (storageData) {
            db.loadHolidayData(storageData);
        }

        databaseInstance = db;
        databaseInitialized = true;

        // Set up auto-save callback: persist edits in localStorage and storage cache
        db.setOnUpdateCallback(async () => {
            console.log('Database updated, saving to local pending and storage...');
            // Persist pending local entry
            try {
                const yaml = db.exportToYaml();
                console.log('Exported YAML length:', yaml ? yaml.length : 0);
                const parsed = jsyaml.load(yaml);
                console.log('Parsed DB keys before saveLocal:', parsed ? Object.keys(parsed) : parsed);
                const entry = await saveLocal(parsed);
                console.log('Saved local pending entry to storage; modified_at=', entry.modified_at);
            } catch (err) {
                console.error('Failed to save local pending entry:', err);
            }

            // Also save to storage cache for quick reload
            try {
                await saveDatabaseToStorage();
                console.log('Saved database to storage cache');
            } catch (e) {
                console.error('Failed to save database to storage cache:', e);
            }
        });

        // Expose a helper to attempt save of pending local changes to server
        window.attemptSavePendingToServer = async function(force=false) {
            const local = await loadLocal();
            if (!local || !local.pending) return { ok: false, reason: 'no_pending' };
            const srv = await storageManager.getMultiple(['server_url','teamdb_email','teamdb_token']);
            const serverUrl = (srv.server_url || '').trim();
            if (!serverUrl) return { ok: false, reason: 'no_server' };
            try {
                const result = await saveToServer(local, serverUrl, srv.teamdb_email, srv.teamdb_token, force);
                return { ok: true, result };
            } catch (err) {
                if (err.type === 'conflict') return { ok: false, reason: 'conflict' };
                return { ok: false, reason: 'save_error', error: err };
            }
        };

        // Expose helpers globally for UI access
        window.hasPending = hasPending;
        window.clearLocal = clearLocal;

        // Debug helper to inspect the raw pending entry
        window.debugLocalPending = async function() {
            try {
                return await loadLocal();
            } catch (e) {
                console.error('debugLocalPending failed:', e);
                return null;
            }
        };

        console.log('Database initialized with', db.people.size, 'people from', selectedSource);
        return db;
    })();

    return initializationPromise;
}

// Force reload of the database by clearing cached instance and re-running initialization
export async function reloadDatabase() {
    databaseInstance = null;
    databaseInitialized = false;
    initializationPromise = null;
    return await loadDatabase();
}

// Export the database variable for direct use after initialization
export async function getDatabase() {
    console.log('getDatabase() called - databaseInitialized:', databaseInitialized);
    
    if (!databaseInitialized) {
        console.log('Database not initialized, calling loadDatabase()');
        await loadDatabase();
    } else {
        console.log('Returning existing database instance with', databaseInstance.people.size, 'people');
    }
    return databaseInstance;
}

// Function to save database changes to Chrome storage
export async function saveDatabaseToStorage() {
    if (!databaseInstance) {
        console.warn('No database instance to save');
        return;
    }
    
    try {
        console.log('Saving database to storage with', databaseInstance.people.size, 'people');
        const yamlData = databaseInstance.exportToYaml();
        await storageManager.set('database_yaml', yamlData);
        console.log('Database saved to storage');
    } catch (error) {
        console.error('Error saving database to storage:', error);
        throw error;
    }
}

// Function to clear stored database (force reload from disk)
export async function clearStoredDatabase() {
    console.log('Clearing stored database');
    try {
        await storageManager.remove('database_yaml');
        console.log('Stored database cleared');
        // Reset the database state to force reload
        databaseInstance = null;
        databaseInitialized = false;
        initializationPromise = null;
    } catch (error) {
        console.error('Error clearing stored database:', error);
        throw error;
    }
}

// Debug functions for testing (available in console)
if (typeof window !== 'undefined') {
    window.debugDatabase = {
        clearStoredDatabase,
        saveDatabaseToStorage,
        getDatabase,
        async showStoredDatabase() {
            const result = await storageManager.get('database_yaml');
            console.log('Stored database YAML:', result ? 'exists' : 'not found');
            if (result) {
                console.log('First 500 chars:', result.substring(0, 500));
            }
            return result;
        }
    };
}

export function toggleText(condition, elementId, text) {
    document.getElementById(elementId).innerText = condition ? text : "";
}

export function showNotification(success, message, timeout=3000) {
    const notificationContainer = document.getElementById("notification-container");
    if (!notificationContainer) {
        console.warn("Notification container not found, logging message:", message);
        return;
    }
    notificationContainer.style.display = 'block';
    notificationContainer.classList = success ? "uk-text-success" : "uk-text-warning";
    notificationContainer.innerHTML = message;
    setTimeout(() => {
        notificationContainer.innerHTML = "";
        notificationContainer.style.display = 'none';
        notificationContainer.classList = "uk-text-success";
    }, timeout);
}

export async function imageToBase64(imagePath) {
    try {
        const imageUrl = chrome.runtime.getURL(imagePath);
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const reader = new FileReader();
        const base64Data = await new Promise(resolve => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        return base64Data;
    } catch (error) {
        // TODO: Actually keep the printout when debugging
        //console.error("Error converting image to Base64:", error);
        return null;
    }
}

export function parseDate(dateStr) {
    const match = /\/Date\((\d+)\)\//.exec(dateStr);
    return match ? new Date(parseInt(match[1])) : null;
}

export function getDateRange(data) {
    const dates = [];
    data.forEach(item => {
        const nonWorkingDates = JSON.parse(item.nonWorkingDates);
        dates.push(...nonWorkingDates.map(date => new Date(date.date)));
    });
    return {
        startDate: new Date(Math.min(...dates)),
        endDate: new Date(Math.max(...dates))
    };
}

export function downloadFile(content, filename, type) {
    // Download a file to the Downloads directory.
    // TODO: Could add download location options based on extension settings.
    //       This would utilise the showSaveFilePicker API if available.
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
