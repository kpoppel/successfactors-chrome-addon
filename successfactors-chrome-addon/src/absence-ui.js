// absence-ui.js
export function showAbsenceTab() {
    const tab = document.getElementById('absence-tab');
    tab.innerHTML = '';
    tab.appendChild(document.createTextNode('Absence UI goes here.'));
}
