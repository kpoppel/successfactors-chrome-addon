// ui-main.js
import { showPeopleTab } from './people-ui.js';
import { showTeamTab } from './team-ui.js';
import { showOrgChartTab } from './orgchart-ui.js';
import { showCalendarTab } from './calendar-ui.js';
import { showAbsenceTab } from './absence-ui.js';

console.log('ui-main.js loaded');

document.addEventListener('DOMContentLoaded', () => {
    const tabHandlers = [
        () => showPeopleTab(),
        () => showTeamTab(),
        () => showCalendarTab(),
        () => showAbsenceTab(),
        () => showOrgChartTab()
    ];

    const switcherElement = document.querySelector('ul.uk-switcher');
    // const tabList = document.querySelector('ul[uk-tab]');

    switcherElement.addEventListener('shown', (e) => {
        // const selectedTabIndex = Array.from(tabList.children).findIndex(li => li.classList.contains('uk-active'));
        // const selectedTabText = tabList.children[selectedTabIndex].textContent.trim();
        // console.log('Tab changed:', { selectedTabIndex, selectedTabText });
        // if (tabHandlers[selectedTabIndex]) {
        //     tabHandlers[selectedTabIndex]();
        // }

        const UIkitSwitcherIndex = UIkit.switcher(switcherElement).index();
        tabHandlers[UIkitSwitcherIndex]();
    });

    // Initial render for the default tab
    const UIkitSwitcherIndex = UIkit.switcher(switcherElement).index();
    if (tabHandlers[UIkitSwitcherIndex]) {
        tabHandlers[UIkitSwitcherIndex]();
    }
});
