import Database from './database.js';

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
        
        // First, try to load from chrome storage (in-memory updates)
        const storedDatabase = await new Promise(resolve => {
            chrome.storage.local.get(['database_yaml'], function(result) {
                resolve(result.database_yaml);
            });
        });
        
        if (storedDatabase) {
            console.log('Loading database from storage (contains updates)');
            db.loadYamlData(storedDatabase);
            db._loadedFrom = 'storage'; // Debug flag
        } else {
            console.log('Loading database from disk (fresh)');
            const yamlContent = await fetch('config/database.yaml').then(r => r.text());
            db.loadYamlData(yamlContent);
            db._loadedFrom = 'disk'; // Debug flag
        }
        
        // Get holiday data from storage
        const storageData = await new Promise(resolve => {
            chrome.storage.local.get(['absence_data'], function(result) {
                resolve(result.absence_data);
            });
        });
        
        if (storageData) {
            db.loadHolidayData(storageData);
        }
        
        databaseInstance = db;
        databaseInitialized = true;
        
        // Set up auto-save callback
        db.setOnUpdateCallback(async () => {
            console.log('Database updated, saving to storage...');
            await saveDatabaseToStorage();
        });
        
        console.log('Database initialized with', db.people.size, 'people from', db._loadedFrom);
        return db;
    })();

    return initializationPromise;
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
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ database_yaml: yamlData }, function() {
                if (chrome.runtime.lastError) {
                    console.error('Error saving database to storage:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    console.log('Database saved to storage');
                    resolve();
                }
            });
        });
    } catch (error) {
        console.error('Error preparing database for storage:', error);
        throw error;
    }
}

// Function to clear stored database (force reload from disk)
export async function clearStoredDatabase() {
    console.log('Clearing stored database');
    return new Promise((resolve, reject) => {
        chrome.storage.local.remove(['database_yaml'], function() {
            if (chrome.runtime.lastError) {
                console.error('Error clearing stored database:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                console.log('Stored database cleared');
                // Reset the database state to force reload
                databaseInstance = null;
                databaseInitialized = false;
                initializationPromise = null;
                resolve();
            }
        });
    });
}

// Debug functions for testing (available in console)
if (typeof window !== 'undefined') {
    window.debugDatabase = {
        clearStoredDatabase,
        saveDatabaseToStorage,
        getDatabase,
        async showStoredDatabase() {
            return new Promise(resolve => {
                chrome.storage.local.get(['database_yaml'], function(result) {
                    console.log('Stored database YAML:', result.database_yaml ? 'exists' : 'not found');
                    if (result.database_yaml) {
                        console.log('First 500 chars:', result.database_yaml.substring(0, 500));
                    }
                    resolve(result.database_yaml);
                });
            });
        }
    };
}

export function toggleText(condition, elementId, text) {
    document.getElementById(elementId).innerText = condition ? text : "";
}

export function showNotification(success, message, timeout=3000) {
    const notificationContainer = document.getElementById("notification-container");
    notificationContainer.classList = success ? "uk-text-success" : "uk-text-warning";
    notificationContainer.innerHTML = message;
    setTimeout(() => {
        notificationContainer.innerHTML = "";
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
        console.error("Error converting image to Base64:", error);
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
