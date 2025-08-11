// calendar-ui.js
export function showTeamTab() {
    const tab = document.getElementById('team-tab');
    tab.innerHTML = '';
    tab.appendChild(document.createTextNode('Team UI goes here.'));
}
