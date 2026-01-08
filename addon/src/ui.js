// This file contains the UI setup for the Chrome extension popup.
export function setupUI() {
    console.log("Popup UI setup begin");
    const setupContainer = document.getElementById("setup-container");
    const outputContainer = document.getElementById("output-container");

    chrome.runtime.sendMessage({ message: "getOptions" }, function (options) {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        console.log("Options:", options);

        if (options.setup_toggle) {
            toggleDisplay(true, outputContainer);
            toggleDisplay(false, setupContainer);
        } else {
            toggleDisplay(false, outputContainer);
            toggleDisplay(true, setupContainer);
        }
    });
    console.log("Popup UI setup end");
}

function toggleDisplay(condition, ...elements) {
    elements.forEach(element => {
        element.style.display = condition ? 'block' : 'none';
    });
}
