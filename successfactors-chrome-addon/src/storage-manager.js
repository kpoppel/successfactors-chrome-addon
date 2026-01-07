// storage-manager.js
// Unified storage abstraction layer to eliminate fragmentation across chrome.storage.local and localStorage

/**
 * StorageManager provides a consistent async interface for all extension storage operations.
 * 
 * Benefits:
 * - Centralized error handling
 * - Consistent async API (no mixing sync localStorage with async chrome.storage)
 * - Easy mock injection for testing
 * - Future-proof for storage backend changes (e.g., IndexedDB migration)
 * 
 * Usage:
 * ```javascript
 * import { storageManager } from './storage-manager.js';
 * 
 * // Get value
 * const value = await storageManager.get('key');
 * 
 * // Set value
 * await storageManager.set('key', { data: 'value' });
 * 
 * // Remove value
 * await storageManager.remove('key');
 * 
 * // Get multiple keys
 * const result = await storageManager.getMultiple(['key1', 'key2']);
 * ```
 */

class StorageManager {
    constructor() {
        // Storage backend can be swapped for testing or migration
        this.backend = 'auto'; // 'auto', 'chrome', 'localStorage', 'indexedDB'
        this.errorHandler = null;
    }

    /**
     * Sets a custom error handler for storage operations
     * @param {Function} handler - Function that receives (error, operation, key, context)
     */
    setErrorHandler(handler) {
        this.errorHandler = handler;
    }

    /**
     * Internal error handling wrapper
     */
    _handleError(error, operation, key, context = {}) {
        const enrichedError = new Error(`StorageManager.${operation} failed for key "${key}": ${error.message}`);
        enrichedError.originalError = error;
        enrichedError.operation = operation;
        enrichedError.key = key;
        enrichedError.context = context;
        enrichedError.timestamp = Date.now();

        if (this.errorHandler) {
            this.errorHandler(enrichedError, operation, key, context);
        } else {
            console.error(enrichedError);
        }

        throw enrichedError;
    }

    /**
     * Determines which storage backend to use based on environment
     */
    _getBackend() {
        if (this.backend !== 'auto') return this.backend;
        
        // Prefer chrome.storage.local if available (extension context)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return 'chrome';
        }
        
        // Fall back to localStorage
        if (typeof localStorage !== 'undefined') {
            return 'localStorage';
        }
        
        throw new Error('No storage backend available');
    }

    /**
     * Get a single value from storage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {Promise<*>} The stored value or defaultValue
     */
    async get(key, defaultValue = null) {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.get([key], (result) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(result[key] !== undefined ? result[key] : defaultValue);
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                const raw = localStorage.getItem(key);
                if (raw === null) return defaultValue;
                try {
                    return JSON.parse(raw);
                } catch (e) {
                    // Return raw string if not valid JSON
                    return raw;
                }
            }
        } catch (error) {
            this._handleError(error, 'get', key);
        }
    }

    /**
     * Get multiple values from storage
     * @param {string[]} keys - Array of storage keys
     * @returns {Promise<Object>} Object with key-value pairs
     */
    async getMultiple(keys) {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.get(keys, (result) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(result);
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                const result = {};
                for (const key of keys) {
                    const raw = localStorage.getItem(key);
                    if (raw !== null) {
                        try {
                            result[key] = JSON.parse(raw);
                        } catch (e) {
                            result[key] = raw;
                        }
                    }
                }
                return result;
            }
        } catch (error) {
            this._handleError(error, 'getMultiple', keys.join(', '));
        }
    }

    /**
     * Set a single value in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store (will be JSON serialized)
     * @returns {Promise<void>}
     */
    async set(key, value) {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.set({ [key]: value }, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(key, serialized);
            }
        } catch (error) {
            this._handleError(error, 'set', key, { valueType: typeof value });
        }
    }

    /**
     * Set multiple values in storage
     * @param {Object} items - Object with key-value pairs
     * @returns {Promise<void>}
     */
    async setMultiple(items) {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.set(items, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                for (const [key, value] of Object.entries(items)) {
                    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                    localStorage.setItem(key, serialized);
                }
            }
        } catch (error) {
            this._handleError(error, 'setMultiple', Object.keys(items).join(', '));
        }
    }

    /**
     * Remove a single value from storage
     * @param {string} key - Storage key
     * @returns {Promise<void>}
     */
    async remove(key) {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.remove([key], () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                localStorage.removeItem(key);
            }
        } catch (error) {
            this._handleError(error, 'remove', key);
        }
    }

    /**
     * Remove multiple values from storage
     * @param {string[]} keys - Array of storage keys
     * @returns {Promise<void>}
     */
    async removeMultiple(keys) {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.remove(keys, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                for (const key of keys) {
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            this._handleError(error, 'removeMultiple', keys.join(', '));
        }
    }

    /**
     * Clear all storage (use with caution!)
     * @returns {Promise<void>}
     */
    async clear() {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.clear(() => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                localStorage.clear();
            }
        } catch (error) {
            this._handleError(error, 'clear', 'all');
        }
    }

    /**
     * Get all keys in storage
     * @returns {Promise<string[]>} Array of all storage keys
     */
    async getAllKeys() {
        const backend = this._getBackend();
        
        try {
            if (backend === 'chrome') {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.get(null, (items) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(Object.keys(items));
                        }
                    });
                });
            } else if (backend === 'localStorage') {
                return Object.keys(localStorage);
            }
        } catch (error) {
            this._handleError(error, 'getAllKeys', 'all');
        }
    }

    /**
     * Check if a key exists in storage
     * @param {string} key - Storage key
     * @returns {Promise<boolean>}
     */
    async has(key) {
        const value = await this.get(key, undefined);
        return value !== undefined;
    }

    /**
     * Get storage usage information (chrome.storage only)
     * @returns {Promise<{bytesInUse: number, quota: number}|null>}
     */
    async getStorageInfo() {
        const backend = this._getBackend();
        
        if (backend === 'chrome') {
            try {
                return new Promise((resolve, reject) => {
                    chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve({
                                bytesInUse,
                                quota: chrome.storage.local.QUOTA_BYTES || null
                            });
                        }
                    });
                });
            } catch (error) {
                console.warn('Could not get storage info:', error);
                return null;
            }
        }
        
        return null; // localStorage doesn't provide quota info
    }
}

// Export singleton instance
export const storageManager = new StorageManager();

// Export class for testing/mocking
export { StorageManager };
