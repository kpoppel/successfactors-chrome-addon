const optionsForm = document.getElementById("optionsForm");
const setupForm = document.getElementById("setupForm");

// First input form with the checkbox for hiding the setup options
optionsForm.setup_toggle.addEventListener("change", (event) => {
    chrome.storage.local.set({ "setup_toggle": event.target.checked });

    // Toggle forms between setup and token detection
    const setupContainer = document.getElementById("setup-container");
    const outputContainer = document.getElementById("output-container");

    // Show/hide setup and output containers
    if (event.target.checked) {
        toggleDisplay(true, outputContainer);
        toggleDisplay(false, setupContainer);
    } else {
        toggleDisplay(false, outputContainer);
        toggleDisplay(true, setupContainer);
    }
    console.log("Setup toggle updated to " + event.target.checked);
});

// Next input form with the setup options
// Immediately persist options changes
setupForm.from_date.addEventListener("change", (event) => {
    chrome.storage.local.set({ "from_date": event.target.value });
    console.log("From Date updated to " + event.target.value);
});

setupForm.to_date.addEventListener("change", (event) => {
    chrome.storage.local.set({ "to_date": event.target.value });
    console.log("To Date updated to " + event.target.value);
});

function initOptions() {
    chrome.runtime.sendMessage({ message: "getOptions" }, function (response) {
        // Run every time the popup is shown.
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        // Initialize the form with the user's option settings and update global options variable.
        optionsForm.setup_toggle.checked = Boolean(response.setup_toggle);
        setupForm.from_date.value = response.from_date || '';
        setupForm.to_date.value = response.to_date || '';
    });
}

function toggleDisplay(condition, ...elements) {
    elements.forEach(element => {
        element.style.display = condition ? 'block' : 'none';
    });
}

function toggleText(condition, elementId, text) {
    document.getElementById(elementId).innerText = condition ? text : "";
}

initOptions();
console.log("InitOptions completed");
