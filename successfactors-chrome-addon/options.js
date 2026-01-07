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

// TeamDB / server settings
setupForm.server_url.addEventListener("change", (event) => {
    chrome.storage.local.set({ "server_url": event.target.value });
    console.log("Server URL updated to " + event.target.value);
});

setupForm.teamdb_email.addEventListener("change", (event) => {
    chrome.storage.local.set({ "teamdb_email": event.target.value });
    console.log("TeamDB email updated to " + event.target.value);
});

setupForm.teamdb_token.addEventListener("change", (event) => {
    chrome.storage.local.set({ "teamdb_token": event.target.value });
    console.log("TeamDB token updated to " + event.target.value);
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
        
        // Load TeamDB/server settings (defaults to local server URL)
        const defaultServerUrl = 'http://127.0.0.1:8765';
        const serverUrl = response.server_url || defaultServerUrl;
        setupForm.server_url.value = serverUrl;
        
        // Save default server_url to storage if not already set
        if (!response.server_url) {
            chrome.storage.local.set({ "server_url": defaultServerUrl });
            console.log("Initialized server_url with default:", defaultServerUrl);
        }
        
        setupForm.teamdb_email.value = response.teamdb_email || '';
        setupForm.teamdb_token.value = response.teamdb_token || '';
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

// Test server button: perform GET to /api/health and display status
const testButton = document.getElementById('test-server-button');
const testResult = document.getElementById('test-server-result');
if (testButton) {
    testButton.addEventListener('click', async (e) => {
        e.preventDefault();
        // Read stored values (prefer current form values)
        const serverUrl = setupForm.server_url.value || (await new Promise(res => chrome.storage.local.get(['server_url'], r => res(r.server_url)))) || 'http://127.0.0.1:8765';
        const email = setupForm.teamdb_email.value || '';
        const token = setupForm.teamdb_token.value || '';

        testResult.innerText = 'Testing...';
        try {
            const url = serverUrl.replace(/\/$/, '') + '/api/health';
            const headers = {};
            if (email) headers['X-TeamDB-Email'] = email;
            if (token) headers['X-TeamDB-Token'] = token;

            const resp = await fetch(url, { method: 'GET', headers });
            if (!resp.ok) {
                testResult.innerText = `Error: ${resp.status} ${resp.statusText}`;
            } else {
                const data = await resp.json().catch(() => null);
                testResult.innerText = data && data.status ? `OK: ${data.status}` : 'OK';
            }
        } catch (err) {
            testResult.innerText = `Failed: ${err.message}`;
        }
        setTimeout(() => { testResult.innerText = ''; }, 5000);
    });
}
