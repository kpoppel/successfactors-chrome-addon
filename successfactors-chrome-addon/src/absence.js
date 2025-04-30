import { downloadFile } from './common.js';

const COLORS = {
    ABOVE: '#e6b3ff',  // purple - for negative balance
    CRIT: '#ffcccc',   // red - for >15 days
    WARN: '#ffcc99',   // orange - for 10-15 days
    NOTE: '#ffffcc',   // yellow - for 5-10 days
};

export async function generateAbsenceAndDownload(absenceData) {
    const teamsResponse = await fetch(chrome.runtime.getURL('config/teams.yaml'));
    const teams = jsyaml.load(await teamsResponse.text());

    // Calculate accrued time
    const today = new Date();
    const [accrued, extra] = calculateAccruedTime(today);
    console.log("Accrued time:", accrued, "Extra time:", extra);

    // Generate absence statistics HTML
    const statsHtml = await generateAbsenceStatsHtml(absenceData, teams.teams, accrued, extra, today);
    downloadFile(statsHtml, 'absence_stats.html', 'text/html');
}

function calculateAccruedTime(today) {
    const currentYear = today.getFullYear();
    const septFirst = new Date(currentYear, 8, 1); // September is month 8 (0-based)
    
    let referenceDate = today < septFirst ? 
        new Date(currentYear - 1, 8, 1) : 
        new Date(currentYear, 8, 1);
    
    const monthsPassed = (today.getFullYear() - referenceDate.getFullYear()) * 12 + 
                        (today.getMonth() - referenceDate.getMonth());
    
    const accrued = Math.min(25, Math.round(2.08 * monthsPassed * 100) / 100);
    const extra = 5;
    
    return [accrued, extra];
}

function calculateAbsences(teams, data) {
    const stats = {};
    const allTypesSet = new Set();
    
    teams.forEach(team => {
        team.members.forEach(member => {
            if (!member.name) return;
            
            const userData = data.find(item => item.username === member.name);
            if (!userData || !userData.employeeTimeNav) return;

            stats[member.name] = {
                team: team.name,
                types: {}
            };

            userData.employeeTimeNav.results.forEach(absence => {
                const timeType = absence.timeTypeName?.toLowerCase().replace(' ', '-') || 'Unknown';
                const daysSpent = parseFloat(absence.quantityInDays || 0);
                stats[member.name].types[timeType] = (stats[member.name].types[timeType] || 0) + daysSpent;
                allTypesSet.add(timeType);
            });
        });
    });
    
    return [stats, allTypesSet];
}

async function generateAbsenceStatsHtml(absenceData, teams, accrued, extra, today) {
    const [stats, allTypesSet] = calculateAbsences(teams, absenceData.d.results);
    
    const yearEnd = new Date(Date.UTC(today.getUTCFullYear(), 11, 31));
    const augEnd = new Date(Date.UTC(today.getUTCFullYear(), 7, 31));
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const predefinedOrder = ['time-off', 'holiday', 'extra-holiday', 'vacation', 'sickness', 'part-time-sick-(with-full-pay)', "child's-sick-day", 'day-off-with-pay'];
    // More fields could be defined:
    //  holiday, extera-holiday, sickness, child-sickness-paid, child-sickness-unpaid, child's-sick day, day-off-with-pay,
    //  flextime, parental-leave, sickness-with sick note, special-leave, tarif-regulated leave, time-deviation, vacation
    const allTypes = Array.from(allTypesSet).sort((a, b) => {
        const aIndex = predefinedOrder.indexOf(a);
        const bIndex = predefinedOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    // Load template
    const templateResponse = await fetch(chrome.runtime.getURL('templates/absence.html'));
    let template = await templateResponse.text();

    // Replace placeholders
    const replacements = {
        '{{date}}': today.toISOString().split('T')[0],
        '{{tableContent}}': generateAbsenceTableContent(stats, teams, allTypes, accrued, extra, utcToday, yearEnd, augEnd)
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(placeholder, value);
    }

    template = template.replace(':root {', `:root {
        --color-above: ${COLORS.ABOVE};
        --color-crit: ${COLORS.CRIT};
        --color-warn: ${COLORS.WARN};
        --color-note: ${COLORS.NOTE};`);

    return template;
}

function generateAbsenceTableContent(stats, teams, allTypes, accrued, extra, today, yearEnd, augEnd) {
    const tableHeader = generateTableHeader(teams, allTypes);
    const tableBody = generateTableBody(stats, allTypes, accrued, extra, today, yearEnd, augEnd);
    return tableHeader + tableBody;
}

function generateTableHeader(teams, allTypes) {
    return `
        <thead>
            <tr>
                <th><input type="text" id="nameSearch" onkeyup="searchNames()" placeholder="Search names..."></th>
                <th>
                    <select id="teamDropdown" onchange="filterTeam()">
                        <option value="all">All</option>
                        ${teams.map(team => 
                            `<option value="${team.name.replace(' ', '_')}">${team.name}</option>`
                        ).join('')}
                    </select>
                </th>
                <th class="sortable" onclick="sortTable(2)">
                    Available Days
                    <label style="float: left">
                        <input type="checkbox" id="showTotalDays" onclick="event.stopPropagation(); toggleDaysDisplay()">
                        Show Total
                    </label>
                </th>
                ${allTypes.map((type, i) => 
                    `<th class="sortable" onclick="sortTable(${i + 3})">${type}</th>`
                ).join('')}
            </tr>
        </thead>`;
}

function generateTableBody(stats, allTypes, accrued, extra, today, yearEnd, augEnd) {
    let bodyContent = '<tbody>';
    
    Object.entries(stats)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, data]) => {
            const row = generateTableRow(name, data, allTypes, accrued, extra, today, yearEnd, augEnd);
            bodyContent += row;
        });
    
    return bodyContent + '</tbody>';
}

function calculateRemainingDays(data, accrued, extra) {
    const types = data.types;
    const hasHoliday = types['holiday'] !== undefined || types['extra-holiday'] !== undefined;
    const hasVacation = types['vacation'] !== undefined;
    const hasTimeOff = types['time-off'] !== undefined;
    
    let remainingDays;
    if (hasHoliday) {    // DK fields
        const accruedRemaining = accrued - (types['holiday'] || 0);
        const extraRemaining = extra - (types['extra-holiday'] || 0);
        remainingDays = accruedRemaining + extraRemaining;
    } else if (hasVacation) { // DE fields
        remainingDays = accrued - (types['vacation'] || 0);
    } else if (hasTimeOff) { // fields for DK/DE where not direct report
        remainingDays = accrued - (types['time-off'] || 0);
    } else {
        remainingDays = accrued;
    }
    
    return remainingDays.toFixed(2);
}

function generateTableRow(name, data, allTypes, accrued, extra, today, yearEnd, augEnd) {
    const teamClass = data.team.replace(' ', '_');
    const remainingDays = calculateRemainingDays(data, accrued, extra);
    const totalDays = (accrued + extra).toFixed(2);
    return `
        <tr class='${teamClass}'>
            <td>${name}</td>
            <td>${data.team}</td>
            <td data-remaining="${remainingDays}" data-total="${totalDays}">${remainingDays}</td>
            ${generateTypeCells(data, allTypes, accrued, extra, today, yearEnd, augEnd)}
        </tr>`;
}

function getRegularHolidayColor(daysLeft) {
    if (daysLeft < 0) return COLORS.ABOVE;
    if (daysLeft <= 5) return '';
    if (daysLeft <= 10) return COLORS.NOTE;
    if (daysLeft <= 15) return COLORS.WARN;
    return COLORS.CRIT;
}

function getExtraHolidayColor(daysLeft, today, augEnd) {
    if (today.getUTCMonth() !== 7) return '';

    const daysUntilEnd = Math.floor((augEnd - today) / (1000 * 60 * 60 * 24));
    const weeksLeft = Math.floor(daysUntilEnd / 7);
    
    if (daysLeft === 0) return '';
    if (weeksLeft >= 3) return COLORS.NOTE;
    if (weeksLeft >= 2) return COLORS.WARN;
    if (weeksLeft >= 1) return COLORS.CRIT;
    return COLORS.ABOVE;
}

function getCellColor(daysLeft, today, deadline, isExtra = false) {
    return isExtra ? getExtraHolidayColor(daysLeft, today, deadline) : getRegularHolidayColor(daysLeft);
}

function generateTypeCells(data, allTypes, accrued, extra, today, yearEnd, augEnd) {
    return allTypes.map(absenceType => {
        let cellStyle = '';
        let count = data.types[absenceType];
        console.log("Absence type:", absenceType, "Count:", count, "Logic:", (absenceType === 'vacation' || absenceType === 'holiday' || absenceType === 'time-off' || absenceType === 'extra-holiday') && count !== undefined);
        if ((absenceType === 'vacation' || absenceType === 'holiday' || 
            absenceType === 'time-off' || absenceType === 'extra-holiday') &&
            count !== undefined) {
            count = data.types[absenceType] || 0;

            if (absenceType === 'extra-holiday') {
                const daysLeft = extra - count;
                const color = getCellColor(daysLeft, today, augEnd, true);
                cellStyle = color ? ` style="background-color: ${color}"` : '';
            } else {
                const daysLeft = accrued - count;
                const color = getCellColor(daysLeft, today, yearEnd);
                cellStyle = color ? ` style="background-color: ${color}"` : '';
            }
        } else {
            count = count || '-';
            if (count === '-') {
                cellStyle = ' class="disabled-cell"';
            }
        }

        return `<td${cellStyle}>${count}</td>`;
    }).join('');
}
