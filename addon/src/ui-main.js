// ui-main.js
import { showPeopleTab } from './people-ui.js';
import { showTeamTab } from './team-ui.js';
import { showOrgChartTab } from './orgchart-ui.js';
import { showCalendarTab } from './calendar-ui.js';
import { showAbsenceTab } from './absence-ui.js';

console.log('ui-main.js loaded');

document.addEventListener('DOMContentLoaded', () => {
    // NOTE: Sequence is important here. If there is added tabs or they are switched in sequence, update here too.
    const tabHandlers = [
        () => showCalendarTab(),
        () => showOrgChartTab(),
        () => showPeopleTab(),
        () => showTeamTab(),
        () => showAbsenceTab()
    ];

    const switcherElement = document.querySelector('ul.uk-switcher');
    switcherElement.addEventListener('shown', (e) => {
        const UIkitSwitcherIndex = UIkit.switcher(switcherElement).index();
        tabHandlers[UIkitSwitcherIndex]();
    });

    // Initial render for the default tab
    const UIkitSwitcherIndex = UIkit.switcher(switcherElement).index();
    if (tabHandlers[UIkitSwitcherIndex]) {
        requestAnimationFrame(() => {
            tabHandlers[UIkitSwitcherIndex]();
    });
}    
});
