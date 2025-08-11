// orgchart-ui.js
export function showOrgChartTab() {
    const tab = document.getElementById('orgchart-tab');
    tab.innerHTML = '';
    tab.appendChild(document.createTextNode('Org Chart UI goes here.'));
}
