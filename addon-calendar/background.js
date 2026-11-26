// Captures the x-ajax-token SuccessFactors itself sends, as a fallback if cookies alone are rejected.
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (details.tabId === -1) return;
        const header = details.requestHeaders.find(h => h.name.toLowerCase() === 'x-ajax-token');
        if (header) chrome.storage.local.set({ x_ajax_token: header.value });
    },
    { urls: ['https://*.successfactors.eu/odata/v2/*', 'https://*.successfactors.com/odata/v2/*'] },
    ['requestHeaders']
);

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('calendar.html') });
});
