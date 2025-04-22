import { downloadFile } from './common.js';

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

    const predefinedOrder = ['time-off', 'vacation', 'holiday', 'extra-holiday', 'sickness', 'part-time-sick-(with-full-pay)', "child's-sick-day", 'day-off-with-pay'];
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
    
    if (hasHoliday) {
        const remainingAccrued = accrued - (types['holiday'] || 0);
        const remainingExtra = extra - (types['extra-holiday'] || 0);
        return `${remainingAccrued.toFixed(2)}/${remainingExtra.toFixed(2)}`;
    } else {
        const timeOff = types['time-off'] || 0;
        const remainingAccrued = accrued - timeOff;
        return `${remainingAccrued.toFixed(2)}/${extra.toFixed(2)}`;
    }
}

function generateTableRow(name, data, allTypes, accrued, extra, today, yearEnd, augEnd) {
    const teamClass = data.team.replace(' ', '_');
    const hasHoliday = data.types['holiday'] !== undefined || data.types['extra-holiday'] !== undefined;
    
    const remainingDays = calculateRemainingDays(data, accrued, extra, hasHoliday);
    const totalDays = `${accrued}/${extra}`;
    
    return `
        <tr class='${teamClass}'>
            <td>${name}</td>
            <td>${data.team}</td>
            <td data-remaining="${remainingDays}" data-total="${totalDays}">${remainingDays}</td>
            ${generateTypeCells(data, allTypes, hasHoliday, accrued, extra, today, yearEnd, augEnd)}
        </tr>`;
}

function getRegularHolidayColor(daysLeft) {
    if (daysLeft < 0) return '#e6b3ff';  // purple
    if (daysLeft <= 5) return '';  // no color
    if (daysLeft <= 10) return '#ffffcc';  // yellow
    if (daysLeft <= 15) return '#ffcc99';  // orange
    return '#ffcccc';  // red
}

function getExtraHolidayColor(daysLeft, today, augEnd) {
    if (today.getUTCMonth() !== 7) return ''; // August is month 7 in UTC
    
    const daysUntilEnd = Math.floor((augEnd - today) / (1000 * 60 * 60 * 24));
    const weeksLeft = Math.floor(daysUntilEnd / 7);
    
    if (daysLeft === 0) return '';  // no color if days are spent
    if (weeksLeft >= 3) return '#ffffcc';  // yellow - first week
    if (weeksLeft >= 2) return '#ffcc99';  // orange - second week
    if (weeksLeft >= 1) return '#ffcccc';  // red - third week
    return '#e6b3ff';  // purple - fourth week
}

function getCellColor(daysLeft, today, deadline, isExtra = false) {
    return isExtra ? getExtraHolidayColor(daysLeft, today, deadline) : getRegularHolidayColor(daysLeft);
}

function generateTypeCells(data, allTypes, hasHoliday, accrued, extra, today, yearEnd, augEnd) {
    return allTypes.map(absenceType => {
        const count = data.types[absenceType] || 0;
        let cellStyle = '';
        
        if ((absenceType === 'time-off' && hasHoliday) || 
            ((absenceType === 'holiday' || absenceType === 'extra-holiday') && !hasHoliday)) {
            return `<td class="disabled-cell">-</td>`;
        }
        
        if (absenceType === 'time-off' && !hasHoliday) {
            const daysLeft = accrued + extra - count;
            const color = getCellColor(daysLeft, today, yearEnd);
            cellStyle = color ? ` style="background-color: ${color}"` : '';
        } else if (absenceType === 'holiday') {
            const daysLeft = accrued - count;
            const color = getCellColor(daysLeft, today, yearEnd);
            cellStyle = color ? ` style="background-color: ${color}"` : '';
        } else if (absenceType === 'extra-holiday') {
            const daysLeft = extra - count;
            const color = getCellColor(daysLeft, today, augEnd, true);
            cellStyle = color ? ` style="background-color: ${color}"` : '';
        }
        
        return `<td${cellStyle}>${count}</td>`;
    }).join('');
}
