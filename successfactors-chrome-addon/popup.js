// popup.js
import { fetchRawData, saveRawData } from './src/api.js';
import { generateCalendarAndDownload } from './src/calendar.js';
import { generateAbsenceAndDownload } from './src/absence.js';
import { generateIcsAndDownload } from './src/ics.js';
import { generateOrgChartAndDownload } from './src/orgchart.js';
import { setupUI } from './src/ui.js';
import { showNotification, loadConfig, getConfig } from './src/common.js';

// Initialise configuration
await loadConfig();

// Initialise UI
setupUI();

// Configure button handlers
const buttonHandlers = {
    'fetch-raw-data-button': async (response) => {
        if (response) {
            showNotification(false, "Please wait while loading data...", 7000);
            console.log("Response from background.js:", response);
            const config = getConfig();
            await fetchRawData(
                config.initial_userid,
                config.more_userids,
                response.from_date,
                response.to_date,
                response.token,
                response.jsessionid
            );
            showNotification(true, "Data load completed");
        }
    },
    'fetch-data-button': async (response) => {
        if (response) {
            console.log("Response from background.js:", response);
            saveRawData(response.absence_data);
            showNotification(true, "Raw data download completed.");
        }
    },
    'fetch-calendar-button': async (response) => {
        if (response) {
            console.log("Response from background.js:", response);
            generateCalendarAndDownload(response.absence_data);
            showNotification(true, "Calendar download completed.");
        }
    },
    'fetch-ics-button': async (response) => {
        if (response) {
            console.log("Response from background.js:", response);
            generateIcsAndDownload(response.absence_data);
            showNotification(true, "ICS download completed.");
        }
    },
    'fetch-absence-button': async (response) => {
        if (response) {
            console.log("Response from background.js:", response);
            generateAbsenceAndDownload(response.absence_data);
            showNotification(true, "Absence Statistics download completed.");
        }
    },
    'fetch-org-chart-button': async (response) => {
        if (response) {
            console.log("Response from background.js:", response);
            generateOrgChartAndDownload(response.absence_data);
            showNotification(true, "OrgChart download completed.");
        }
    }
};

function setupEventListeners(buttonHandlers) {
    for (const [buttonId, handler] of Object.entries(buttonHandlers)) {
        document.getElementById(buttonId).addEventListener('click', () => {
            console.log(`${buttonId} clicked`);
            const message = buttonId === 'fetch-raw-data-button' ? "getToken" : "getAbsences";
            chrome.runtime.sendMessage({ message }, handler);
        });
    }
}

// Initialize event listeners
setupEventListeners(buttonHandlers);
