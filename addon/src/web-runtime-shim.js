(function () {
    const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function';
    const params = new URLSearchParams(window.location.search);
    const isWebAdminUi = params.get('web') === '1';

    if (!hasChromeRuntime) {
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {};
        window.chrome.runtime.getURL = function (path) {
            const normalized = String(path || '').replace(/^\//, '');
            return `/addon/${normalized}`;
        };
    }

    window.__TEAMDB_WEB_UI__ = isWebAdminUi;

    if (isWebAdminUi) {
        try {
            localStorage.setItem('server_url', window.location.origin);
        } catch (e) {
            console.warn('Failed to initialize server_url for web admin UI:', e);
        }
    }
})();
