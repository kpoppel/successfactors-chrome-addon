// calendar-ui.js
export function showCalendarTab() {
    const tab = document.getElementById('calendar-tab');
    tab.innerHTML = '';
    tab.appendChild(document.createTextNode('Calendar UI goes here.'));
}
