import { showPeopleTab } from './people-ui.js';
import { showTeamTab } from './team-ui.js';
import { showAbsenceTab } from './absence-ui.js';

async function render() {
    const mode = window.__TEAMDB_ADMIN_MODE__ || new URLSearchParams(window.location.search).get('mode') || 'people';
    const root = document.getElementById('admin-view-root');

    if (!root) return;

    const handlers = {
        people: async () => {
            root.innerHTML = '<h2>People</h2><div id="people-tab">Loading...</div>';
            await showPeopleTab();
        },
        team: async () => {
            root.innerHTML = '<h2>Teams and Projects</h2><div id="team-tab">Loading...</div>';
            await showTeamTab();
        },
        absence: async () => {
            root.innerHTML = '<h2>Absence</h2><div id="absence-tab">Loading...</div>';
            await showAbsenceTab();
        },
    };

    const handler = handlers[mode];
    if (!handler) {
        root.innerHTML = `<div style="color:#b00020;background:#fff1f1;border:1px solid #ffcdd2;padding:12px;border-radius:8px"><strong>Unknown admin page:</strong> ${mode}</div>`;
        return;
    }

    try {
        await handler();
    } catch (error) {
        root.innerHTML = `<div style="color:#b00020;background:#fff1f1;border:1px solid #ffcdd2;padding:12px;border-radius:8px"><strong>Error loading ${mode}:</strong> ${error.message}</div>`;
    }
}

render();
